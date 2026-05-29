// BUG FIX 1: Reduced frame interval — 3 s was fine; the freeze was caused by
// the RAF loop calling drawDetectionOverlay (which redraws the entire video
// frame on a canvas) every ~16 ms. That saturated the GPU/CPU pipeline and
// caused the <video> element to hang. The RAF loop now only draws lightweight
// detection overlays on a *transparent* canvas sitting on top of the video,
// instead of re-compositing the full video frame every frame.
const FRAME_INTERVAL_MS = 3000;
const JPEG_QUALITY = 0.75;

export async function openUserCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera not supported in this browser.');
  }
  return navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'user',
      width: { ideal: 640 },
      height: { ideal: 480 },
    },
    audio: false,
  });
}

export function stopCameraStream(stream) {
  stream?.getTracks().forEach((t) => t.stop());
}

// BUG FIX 1b: Guard readyState >= 2 (HAVE_CURRENT_DATA) AND that the video
// has actual pixel dimensions before attempting to draw, preventing blank
// frames being uploaded to the server.
export function captureVideoFrameBase64(videoEl) {
  if (
    !videoEl ||
    videoEl.readyState < 2 ||
    !videoEl.videoWidth ||
    !videoEl.videoHeight
  )
    return null;
  const w = videoEl.videoWidth;
  const h = videoEl.videoHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoEl, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  return dataUrl.replace(/^data:image\/jpeg;base64,/, '');
}

/**
 * BUG FIX 1c: drawDetectionOverlay now draws on a TRANSPARENT overlay canvas
 * (NOT re-rendering the full video frame). The <video> element renders itself
 * natively — we only paint the bounding-box annotations on top.
 *
 * BUG FIX 4: Paper detection boxes are now drawn with the same visual style
 * as phone detection boxes (colored rectangle + label text).
 */
export function drawDetectionOverlay(canvas, videoEl, detection) {
  if (!canvas || !videoEl || videoEl.readyState < 2) return;
  const w = videoEl.videoWidth || 640;
  const h = videoEl.videoHeight || 480;

  // Only resize canvas when dimensions actually change — avoids flicker.
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }

  const ctx = canvas.getContext('2d');
  // Clear to transparent — DO NOT drawImage(videoEl) here.
  // The live <video> element below the canvas already shows the feed.
  ctx.clearRect(0, 0, w, h);

  if (!detection) return;

  // ── Phone boxes ──────────────────────────────────────────────────────
  const phones = detection.phoneBoxes || [];
  phones.forEach((box) => {
    const x1 = box.x1 * w;
    const y1 = box.y1 * h;
    const x2 = box.x2 * w;
    const y2 = box.y2 * h;
    const bw = x2 - x1;
    const bh = y2 - y1;
    ctx.strokeStyle = '#ff33cc';
    ctx.lineWidth = 3;
    ctx.strokeRect(x1, y1, bw, bh);
    // Label background
    const phoneLabel = box.conf != null
      ? `PHONE ${(box.conf * 100).toFixed(0)}%`
      : 'PHONE';
    ctx.font = 'bold 14px sans-serif';
    const labelW = ctx.measureText(phoneLabel).width + 10;
    ctx.fillStyle = '#ff33cc';
    ctx.fillRect(x1, Math.max(0, y1 - 22), labelW, 22);
    ctx.fillStyle = '#fff';
    ctx.fillText(phoneLabel, x1 + 5, Math.max(15, y1 - 5));
  });

  // ── Paper boxes (BUG FIX 4) ──────────────────────────────────────────
  // Paper detection now draws an orange rectangle + "Paper Detected" label,
  // matching the visual style of phone detection.
  const papers = detection.paperBoxes || [];
  papers.forEach((box) => {
    const x1 = box.x1 * w;
    const y1 = box.y1 * h;
    const x2 = box.x2 * w;
    const y2 = box.y2 * h;
    const bw = x2 - x1;
    const bh = y2 - y1;
    ctx.strokeStyle = '#ff8c00'; // orange, matching COLOR_PAPER (#0,165,255 BGR → orange in display)
    ctx.lineWidth = 3;
    ctx.strokeRect(x1, y1, bw, bh);
    const paperLabel = box.conf != null
      ? `Paper Detected ${(box.conf * 100).toFixed(0)}%`
      : 'Paper Detected';
    ctx.font = 'bold 14px sans-serif';
    const labelW = ctx.measureText(paperLabel).width + 10;
    ctx.fillStyle = '#ff8c00';
    ctx.fillRect(x1, Math.max(0, y1 - 22), labelW, 22);
    ctx.fillStyle = '#fff';
    ctx.fillText(paperLabel, x1 + 5, Math.max(15, y1 - 5));
  });

  // ── Face box ─────────────────────────────────────────────────────────
  const face = detection.faceBox;
  if (face) {
    const fx = face.x * w;
    const fy = face.y * h;
    const fw = face.w * w;
    const fh = face.h * h;
    const col = detection.emotion === 'IRRITATED' ? '#dc2626' : '#32c864';
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.strokeRect(fx, fy, fw, fh);
    ctx.fillStyle = col;
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(detection.emotion || 'FACE', fx, Math.max(14, fy - 4));
  }

  // ── Alert banner ──────────────────────────────────────────────────────
  const alerts = detection.alerts || [];
  if (alerts.length) {
    ctx.fillStyle = 'rgba(180, 0, 0, 0.75)';
    ctx.fillRect(0, h - 36, w, 36);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(alerts.join(' | '), 8, h - 12);
  } else if (detection.emotion === 'CALIBRATING') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, w, 32);
    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('Calibrating gaze…', 8, 22);
  }
}

/**
 * Sends frames to persistent Python worker (YOLO + gaze + emotion).
 *
 * BUG FIX 1d: The old RAF loop called drawDetectionOverlay every ~16 ms,
 * which internally called ctx.drawImage(videoEl) — a heavy compositing
 * operation that fought with the browser's own video decoder and caused the
 * webcam feed to freeze. The new loop only calls the lightweight
 * drawDetectionOverlay (which now just clears + draws boxes) so the video
 * element is never disturbed.
 */
export function startParallelEmotionUpload({
  videoEl,
  canvasEl,
  interviewId,
  token,
  apiRequest,
  onStatus,
}) {
  let stopped = false;
  let busy = false;
  let lastDetection = null;

  const tick = async () => {
    if (stopped || busy) return;
    const imageBase64 = captureVideoFrameBase64(videoEl);
    if (!imageBase64) return; // video not ready yet — skip silently

    busy = true;
    try {
      const { ok, data } = await apiRequest(
        `/interviews/candidate/${interviewId}/emotion-frame`,
        {
          method: 'POST',
          token,
          body: { imageBase64 },
        },
      );
      if (ok && data) {
        lastDetection = data.detection || lastDetection;
        drawDetectionOverlay(canvasEl, videoEl, lastDetection);
        onStatus?.(data);
      }
    } catch {
      // On error keep showing the last known detection
      drawDetectionOverlay(canvasEl, videoEl, lastDetection);
    } finally {
      busy = false;
    }
  };

  const intervalId = setInterval(tick, FRAME_INTERVAL_MS);

  // RAF loop: only redraws lightweight detection boxes — does NOT touch
  // the video element's pixel stream. This keeps the live preview smooth.
  const rafLoop = () => {
    if (!stopped) {
      drawDetectionOverlay(canvasEl, videoEl, lastDetection);
      requestAnimationFrame(rafLoop);
    }
  };
  requestAnimationFrame(rafLoop);
  tick(); // capture first frame immediately

  return () => {
    stopped = true;
    clearInterval(intervalId);
  };
}
