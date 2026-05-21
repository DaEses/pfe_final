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

export function captureVideoFrameBase64(videoEl) {
  if (!videoEl || videoEl.readyState < 2) return null;
  const w = videoEl.videoWidth || 640;
  const h = videoEl.videoHeight || 480;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoEl, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  return dataUrl.replace(/^data:image\/jpeg;base64,/, '');
}

/** Draw detection overlays on canvas (phone boxes, face, labels). */
export function drawDetectionOverlay(canvas, videoEl, detection) {
  if (!canvas || !videoEl || videoEl.readyState < 2) return;
  const w = videoEl.videoWidth || 640;
  const h = videoEl.videoHeight || 480;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoEl, 0, 0, w, h);

  if (!detection) return;

  const phones = detection.phoneBoxes || [];
  phones.forEach((box) => {
    const x1 = box.x1 * w;
    const y1 = box.y1 * h;
    const x2 = box.x2 * w;
    const y2 = box.y2 * h;
    ctx.strokeStyle = '#ff33cc';
    ctx.lineWidth = 3;
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    ctx.fillStyle = 'rgba(255, 51, 204, 0.85)';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('PHONE', x1 + 4, Math.max(18, y1 - 6));
  });

  const face = detection.faceBox;
  if (face) {
    const fx = face.x * w;
    const fy = face.y * h;
    const fw = face.w * w;
    const fh = face.h * h;
    const col =
      detection.emotion === 'IRRITATED' ? '#dc2626' : '#32c864';
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.strokeRect(fx, fy, fw, fh);
    ctx.fillStyle = col;
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(detection.emotion || 'FACE', fx, Math.max(14, fy - 4));
  }

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
    if (!imageBase64) return;

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
      drawDetectionOverlay(canvasEl, videoEl, lastDetection);
    } finally {
      busy = false;
    }
  };

  const intervalId = setInterval(tick, FRAME_INTERVAL_MS);
  const rafLoop = () => {
    if (!stopped) {
      drawDetectionOverlay(canvasEl, videoEl, lastDetection);
      requestAnimationFrame(rafLoop);
    }
  };
  requestAnimationFrame(rafLoop);
  tick();

  return () => {
    stopped = true;
    clearInterval(intervalId);
  };
}
