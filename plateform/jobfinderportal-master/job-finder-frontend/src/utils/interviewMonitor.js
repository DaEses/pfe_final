/**
 * Candidate interview camera + silent background proctoring upload.
 * Detection runs server-side only — no overlays or results in the candidate UI.
 */
const FRAME_INTERVAL_MS = 1800;
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

function captureVideoFrameBase64(videoEl) {
  if (
    !videoEl ||
    videoEl.readyState < 2 ||
    !videoEl.videoWidth ||
    !videoEl.videoHeight
  ) {
    return null;
  }
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
 * Uploads webcam frames for HR-only proctoring analysis.
 * Does not render detection overlays or does not expose API results to the UI.
 */
export function startBackgroundProctoringUpload({
  videoEl,
  interviewId,
  token,
  apiRequest,
}) {
  let stopped = false;
  let busy = false;

  const tick = async () => {
    if (stopped || busy) return;
    const imageBase64 = captureVideoFrameBase64(videoEl);
    if (!imageBase64) return;

    busy = true;
    try {
      await apiRequest(`/interviews/candidate/${interviewId}/emotion-frame`, {
        method: 'POST',
        token,
        body: { imageBase64 },
      });
    } catch {
      // Silent for candidate — HR pipeline logs server-side
    } finally {
      busy = false;
    }
  };

  const intervalId = setInterval(tick, FRAME_INTERVAL_MS);
  tick();

  return () => {
    stopped = true;
    clearInterval(intervalId);
  };
}

/** @deprecated Use startBackgroundProctoringUpload */
export const startParallelEmotionUpload = (opts) =>
  startBackgroundProctoringUpload(opts);

export function drawDetectionOverlay() {
  // Intentionally no-op — candidate must not see detection graphics
}
