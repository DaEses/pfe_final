const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Capture webcam emotion metrics in the browser (candidate's machine).
 * Uses Face Detection API when available; otherwise engagement heuristics.
 */
export async function runEmotionCapture(videoEl, durationSeconds = 25, onProgress) {
  const durationMs = durationSeconds * 1000;
  const start = Date.now();
  let framesAnalyzed = 0;
  let neutralCount = 0;
  let irritatedCount = 0;
  let gazeAlerts = 0;
  let noFaceFrames = 0;

  const hasFaceDetector = typeof window !== 'undefined' && 'FaceDetector' in window;
  let detector = null;
  if (hasFaceDetector) {
    try {
      detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
    } catch {
      detector = null;
    }
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let prevCenter = null;

  while (Date.now() - start < durationMs) {
    if (!videoEl || videoEl.readyState < 2) {
      await sleep(200);
      continue;
    }

    const w = videoEl.videoWidth || 640;
    const h = videoEl.videoHeight || 480;
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(videoEl, 0, 0, w, h);
    framesAnalyzed += 1;

    if (detector) {
      try {
        const faces = await detector.detect(videoEl);
        if (!faces.length) {
          noFaceFrames += 1;
          gazeAlerts += 1;
        } else {
          const box = faces[0].boundingBox;
          const cx = box.x + box.width / 2;
          const cy = box.y + box.height / 2;
          const offX = Math.abs(cx - w / 2) / (w / 2);
          const offY = Math.abs(cy - h / 2) / (h / 2);
          if (offX > 0.35 || offY > 0.35) gazeAlerts += 1;
          else neutralCount += 1;

          if (prevCenter) {
            const jump =
              Math.hypot(cx - prevCenter.x, cy - prevCenter.y) / Math.max(w, h);
            if (jump > 0.12) irritatedCount += 1;
            else neutralCount += 1;
          }
          prevCenter = { x: cx, y: cy };
        }
      } catch {
        neutralCount += 1;
      }
    } else {
      const data = ctx.getImageData(Math.floor(w * 0.25), Math.floor(h * 0.2), Math.floor(w * 0.5), Math.floor(h * 0.55)).data;
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        sum += data[i] + data[i + 1] + data[i + 2];
      }
      const avg = sum / (data.length / 4);
      if (avg < 40) noFaceFrames += 1;
      else neutralCount += 1;
    }

    const pct = Math.min(100, Math.round(((Date.now() - start) / durationMs) * 100));
    onProgress?.(pct);
    await sleep(1000);
  }

  const emotionTotal = Math.max(1, neutralCount + irritatedCount);
  const neutralRatio = neutralCount / emotionTotal;
  const irritatedRatio = irritatedCount / emotionTotal;
  const dominant = neutralRatio >= irritatedRatio ? 'NEUTRAL' : 'IRRITATED';

  let riskLevel = 'low';
  if (irritatedRatio > 0.45 || gazeAlerts > 5 || noFaceFrames > durationSeconds * 0.6) {
    riskLevel = 'high';
  } else if (irritatedRatio > 0.25 || gazeAlerts > 2 || noFaceFrames > durationSeconds * 0.35) {
    riskLevel = 'medium';
  }

  return {
    source: 'browser_webcam',
    framesAnalyzed,
    dominantEmotion: dominant,
    neutralRatio: Math.round(neutralRatio * 1000) / 1000,
    irritatedRatio: Math.round(irritatedRatio * 1000) / 1000,
    gazeAlerts,
    noFaceFrames,
    phoneDetections: 0,
    riskLevel,
    faceDetectionApi: Boolean(detector),
  };
}

export async function openUserCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera not supported in this browser.');
  }
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
}

export function stopCameraStream(stream) {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
  }
}
