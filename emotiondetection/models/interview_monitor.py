import cv2
import numpy as np
import time
import os
import sys
import urllib.request
from keras.models import load_model
import os as _os

_HERE = _os.path.dirname(_os.path.abspath(__file__))
_PROJECT_ROOT = _os.path.dirname(_os.path.dirname(_HERE))
FACE_LANDMARKER_PATH = _os.environ.get(
    'FACE_LANDMARKER_PATH',
    _os.path.join(_PROJECT_ROOT, 'face_landmarker.task')
)

# ──────────────────────────────────────────────────────────
#  1.  SETUP
# ──────────────────────────────────────────────────────────

SCRIPT_DIR    = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT  = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
EMOTION_MODEL = os.environ.get(
    "EMOTION_MODEL_PATH",
    os.path.join(SCRIPT_DIR, "binary_emotion_model.h5"),
)

if not os.path.exists(EMOTION_MODEL):
    print(f"ERROR: emotion model not found at: {EMOTION_MODEL}")
    print("Set EMOTION_MODEL_PATH or place the .h5 file next to this script.")
    sys.exit(1)

print(f"Loading emotion model from: {EMOTION_MODEL}")
model = load_model(EMOTION_MODEL)

face_cascade = cv2.CascadeClassifier(
    cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
)

THRESHOLD       = 0.5
COLOR_NEUTRAL   = (50, 200, 100)
COLOR_IRRITATED = (50,  50, 220)
COLOR_GAZE_OK   = (220, 180,  50)
COLOR_GAZE_BAD  = (30,  30, 255)
COLOR_PHONE     = (255,  50, 220)
FONT            = cv2.FONT_HERSHEY_SIMPLEX


# ──────────────────────────────────────────────────────────
#  2.  YOUR ORIGINAL FUNCTIONS  (unchanged)
# ──────────────────────────────────────────────────────────

def predict_face(gray_roi):
    resized = cv2.resize(gray_roi, (48, 48))
    norm    = resized.astype('float32') / 255.0
    inp     = norm.reshape(1, 48, 48, 1)
    prob    = model.predict(inp, verbose=0)[0][0]
    if prob >= THRESHOLD:
        return 'NEUTRAL', prob, COLOR_NEUTRAL
    else:
        return 'IRRITATED', 1.0 - prob, COLOR_IRRITATED


def draw_confidence_bar(frame, prob_neutral, x, y, w):
    bar_y     = max(y - 38, 0)
    bar_h     = 14
    neutral_w = int(prob_neutral * w)
    cv2.rectangle(frame, (x, bar_y), (x + w, bar_y + bar_h), (35, 35, 35), -1)
    if neutral_w > 0:
        cv2.rectangle(frame, (x, bar_y), (x + neutral_w, bar_y + bar_h), COLOR_NEUTRAL, -1)
    if neutral_w < w:
        cv2.rectangle(frame, (x + neutral_w, bar_y), (x + w, bar_y + bar_h), COLOR_IRRITATED, -1)
    cv2.putText(frame,
                f"N:{prob_neutral*100:.0f}%  I:{(1-prob_neutral)*100:.0f}%",
                (x, bar_y - 5), FONT, 0.4, (220, 220, 220), 1)


# ──────────────────────────────────────────────────────────
#  3.  GAZE DETECTION  — MediaPipe Tasks API (0.10.x)
# ──────────────────────────────────────────────────────────

class GazeDetector:
    L_IRIS       = 468
    R_IRIS       = 473
    L_EYE_OUTER  = 33
    L_EYE_INNER  = 133
    R_EYE_OUTER  = 263
    R_EYE_INNER  = 362
    L_EYE_TOP    = 159
    L_EYE_BOT    = 145

    LEFT_THR  = 0.38
    RIGHT_THR = 0.62
    UP_THR    = 0.35
    ALERT_SEC = 2.0
    COOLDOWN  = 5.0

    def __init__(self):
        import mediapipe as mp
        from mediapipe.tasks.python import vision as mp_vision
        from mediapipe.tasks import python as mp_python

        model_path = os.environ.get(
            "FACE_LANDMARKER_PATH",
            FACE_LANDMARKER_PATH,
        )
        if not os.path.exists(model_path):
            print("Downloading face landmarker model (~30 MB) ...")
            url = ("https://storage.googleapis.com/mediapipe-models/"
                   "face_landmarker/face_landmarker/float16/1/face_landmarker.task")
            urllib.request.urlretrieve(url, model_path)
            print("Download complete.")

        options = mp_vision.FaceLandmarkerOptions(
            base_options=mp_python.BaseOptions(model_asset_path=model_path),
            output_face_blendshapes=False,
            output_facial_transformation_matrixes=False,
            num_faces=1,
        )
        self._landmarker = mp_vision.FaceLandmarker.create_from_options(options)
        self._mp         = mp
        self._h_off      = 0.0
        self._v_off      = 0.0
        self.calibrated  = False
        self._off_start  = None
        self._last_alert = 0.0

    def _pt(self, lm, idx, w, h):
        p = lm[idx]
        return np.array([p.x * w, p.y * h])

    def _ratios(self, lm, w, h):
        l_out = self._pt(lm, self.L_EYE_OUTER, w, h)[0]
        l_in  = self._pt(lm, self.L_EYE_INNER, w, h)[0]
        r_out = self._pt(lm, self.R_EYE_OUTER, w, h)[0]
        r_in  = self._pt(lm, self.R_EYE_INNER, w, h)[0]

        l_h = (self._pt(lm, self.L_IRIS, w, h)[0] - l_out) / (l_in - l_out + 1e-6)
        r_h = (self._pt(lm, self.R_IRIS, w, h)[0] - r_out) / (r_in - r_out + 1e-6)
        h_r = float(np.clip((l_h + r_h) / 2, 0, 1))

        e_top = self._pt(lm, self.L_EYE_TOP, w, h)[1]
        e_bot = self._pt(lm, self.L_EYE_BOT, w, h)[1]
        v_r   = float(np.clip(
            (self._pt(lm, self.L_IRIS, w, h)[1] - e_top) / (e_bot - e_top + 1e-6),
            0, 1
        ))
        return h_r, v_r

    def _detect(self, frame_bgr):
        h_px, w_px = frame_bgr.shape[:2]
        rgb      = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        mp_image = self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=rgb)
        result   = self._landmarker.detect(mp_image)
        if not result.face_landmarks:
            return None, w_px, h_px
        return result.face_landmarks[0], w_px, h_px

    def calibrate(self, cap, display=True):
        print("\n[Gaze calibration] Look straight at the camera for 5 s ...")
        hs, vs, t0 = [], [], time.time()

        while time.time() - t0 < 5.0:
            ok, frame = cap.read()
            if not ok:
                break
            lm, w_px, h_px = self._detect(frame)
            if lm is not None:
                h, v = self._ratios(lm, w_px, h_px)
                hs.append(h); vs.append(v)

            if display:
                rem = max(0, 5 - int(time.time() - t0))
                f2  = frame.copy()
                cv2.putText(f2, f"CALIBRATING — look at camera ({rem}s)",
                            (30, frame.shape[0] // 2), FONT, 0.9, (0, 220, 255), 2)
                cv2.imshow('Interview Monitor', f2)
                cv2.waitKey(1)

        if hs:
            self._h_off     = np.mean(hs) - 0.5
            self._v_off     = np.mean(vs) - 0.5
            self.calibrated = True
            print(f"[Gaze calibration] Done  h_off={self._h_off:.3f}  v_off={self._v_off:.3f}\n")
        else:
            print("[Gaze calibration] No face found — using defaults.\n")

    def process(self, frame_bgr):
        lm, w_px, h_px = self._detect(frame_bgr)

        if lm is None:
            return {'direction': 'no_face', 'h_ratio': None, 'v_ratio': None, 'alert': False}

        h, v = self._ratios(lm, w_px, h_px)
        h   -= self._h_off
        v   -= self._v_off

        if v < self.UP_THR:
            direction = 'up'
        elif h < self.LEFT_THR:
            direction = 'left'
        elif h > self.RIGHT_THR:
            direction = 'right'
        else:
            direction = 'center'

        now   = time.time()
        alert = False

        if direction != 'center':
            if self._off_start is None:
                self._off_start = now
            elif (now - self._off_start) >= self.ALERT_SEC:
                if (now - self._last_alert) >= self.COOLDOWN:
                    self._last_alert = now
                    alert = True
        else:
            self._off_start = None

        return {'direction': direction, 'h_ratio': h, 'v_ratio': v, 'alert': alert}


# ──────────────────────────────────────────────────────────
#  4.  PHONE DETECTION
# ──────────────────────────────────────────────────────────

class PhoneDetector:
    PHONE_CLASS = 67
    CONF_THR    = 0.40
    SKIP        = 3

    def __init__(self):
        from ultralytics import YOLO
        print("Loading YOLOv8n (downloads ~6 MB on first run) ...")
        self._model   = YOLO('yolov8n.pt')
        self._frame_n = 0
        self._last    = []

    def process(self, frame_bgr):
        self._frame_n += 1
        if self._frame_n % self.SKIP != 0:
            return self._last

        results = self._model(frame_bgr, verbose=False, classes=[self.PHONE_CLASS])[0]
        boxes   = []
        for box in results.boxes:
            conf = float(box.conf[0])
            if conf >= self.CONF_THR:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                boxes.append({'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2, 'conf': conf})
        self._last = boxes
        return boxes


# ──────────────────────────────────────────────────────────
#  5.  DRAWING HELPERS
# ──────────────────────────────────────────────────────────

def draw_gaze_eye_icon(frame, gaze):
    h, w   = frame.shape[:2]
    cx, cy = w - 52, h - 52
    r      = 28
    cv2.ellipse(frame, (cx, cy), (r, r // 2), 0, 0, 360, (50, 50, 50), -1)
    cv2.ellipse(frame, (cx, cy), (r, r // 2), 0, 0, 360, (130, 130, 130), 1)
    if gaze['h_ratio'] is not None:
        hr  = float(np.clip(gaze['h_ratio'] + 0.5, 0, 1))
        vr  = float(np.clip((gaze['v_ratio'] or 0.0) + 0.5, 0, 1))
        ix  = int(cx + (hr - 0.5) * r * 1.1)
        iy  = int(cy + (vr - 0.5) * (r // 2) * 1.1)
        col = COLOR_GAZE_OK if gaze['direction'] == 'center' else COLOR_GAZE_BAD
        cv2.circle(frame, (ix, iy), 9, col, -1)
        cv2.circle(frame, (ix, iy), 4, (255, 255, 255), -1)


def draw_phone_boxes(frame, phone_boxes):
    for b in phone_boxes:
        cv2.rectangle(frame, (b['x1'], b['y1']), (b['x2'], b['y2']), COLOR_PHONE, 3)
        label = f"PHONE {b['conf']*100:.0f}%"
        (tw, th), _ = cv2.getTextSize(label, FONT, 0.7, 2)
        cv2.rectangle(frame,
                      (b['x1'], b['y1'] - th - 10),
                      (b['x1'] + tw + 10, b['y1']),
                      COLOR_PHONE, -1)
        cv2.putText(frame, label, (b['x1'] + 5, b['y1'] - 5),
                    FONT, 0.7, (255, 255, 255), 2)


def draw_status_bar(frame, gaze, phone_boxes, emotion_label):
    h, w = frame.shape[:2]
    ov   = frame.copy()
    cv2.rectangle(ov, (0, 0), (w, 96), (18, 18, 18), -1)
    cv2.addWeighted(ov, 0.6, frame, 0.4, 0, frame)

    em_col = COLOR_NEUTRAL if emotion_label == 'NEUTRAL' else COLOR_IRRITATED
    cv2.putText(frame, f"EMO: {emotion_label}", (14, 34), FONT, 0.65, em_col, 2)

    gdir  = gaze['direction'].upper()
    g_col = COLOR_GAZE_OK if gdir == 'CENTER' else COLOR_GAZE_BAD
    g_lbl = f"GAZE: {gdir}" + ("  !!" if gaze['alert'] else "")
    (tw, _), _ = cv2.getTextSize(g_lbl, FONT, 0.65, 2)
    cv2.putText(frame, g_lbl, (w // 2 - tw // 2, 34), FONT, 0.65, g_col, 2)

    p_col = COLOR_PHONE if phone_boxes else (80, 200, 80)
    p_lbl = "PHONE: YES !!" if phone_boxes else "PHONE: none"
    (tw, _), _ = cv2.getTextSize(p_lbl, FONT, 0.65, 2)
    cv2.putText(frame, p_lbl, (w - tw - 14, 34), FONT, 0.65, p_col, 2)

    alerts = []
    if gaze['alert']:
        alerts.append(f"GAZE AWAY ({gdir})")
    if phone_boxes:
        alerts.append("PHONE DETECTED")
    if emotion_label == 'IRRITATED':
        alerts.append("IRRITATED")

    if alerts:
        banner = "  |  ".join(alerts)
        cv2.rectangle(frame, (0, 55), (w, 90), (0, 0, 160), -1)
        cv2.putText(frame, f"!! {banner}", (14, 78), FONT, 0.55, (255, 220, 60), 2)


# ──────────────────────────────────────────────────────────
#  6.  MAIN LOOP
# ──────────────────────────────────────────────────────────

def main():
    gaze_det  = GazeDetector()
    phone_det = PhoneDetector()

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        raise RuntimeError("Cannot open webcam.")

    gaze_det.calibrate(cap, display=True)

    last_gaze    = {'direction': 'center', 'h_ratio': None, 'v_ratio': None, 'alert': False}
    last_phones  = []
    last_emotion = 'NEUTRAL'

    print("Interview monitor running — Q to quit, C to re-calibrate")

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        # (a) Emotion — your original code
        faces = face_cascade.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=5, minSize=(48, 48)
        )
        for (x, y, w, h) in faces:
            face_roi = gray[y:y+h, x:x+w]
            label, conf, color = predict_face(face_roi)
            last_emotion = label

            cv2.rectangle(frame, (x, y), (x+w, y+h), color, 3)
            label_text = f"{label}  {conf*100:.1f}%"
            (tw, th), _ = cv2.getTextSize(label_text, FONT, 0.8, 2)
            lbl_y = y + h + 32 if y + h + 38 < frame.shape[0] else y - 12
            cv2.rectangle(frame, (x, lbl_y-th-9), (x+tw+12, lbl_y+6), color, -1)
            cv2.putText(frame, label_text, (x+6, lbl_y), FONT, 0.8, (255, 255, 255), 2)

            prob_n = model.predict(
                (cv2.resize(face_roi, (48, 48)).astype('float32') / 255.0).reshape(1, 48, 48, 1),
                verbose=0
            )[0][0]
            draw_confidence_bar(frame, prob_n, x, y, w)

        # (b) Gaze
        last_gaze = gaze_det.process(frame)

        # (c) Phone
        last_phones = phone_det.process(frame)
        draw_phone_boxes(frame, last_phones)

        # (d) Your original legend
        fh = frame.shape[0]
        cv2.putText(frame, "[GREEN] NEUTRAL",  (10, fh - 40), FONT, 0.55, COLOR_NEUTRAL,   2)
        cv2.putText(frame, "[RED] IRRITATED",  (10, fh - 18), FONT, 0.55, COLOR_IRRITATED, 2)

        # (e) New overlays
        draw_status_bar(frame, last_gaze, last_phones, last_emotion)
        draw_gaze_eye_icon(frame, last_gaze)

        cv2.imshow('Interview Monitor — Q quit | C calibrate', frame)

        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            break
        elif key == ord('c'):
            gaze_det.calibrate(cap, display=True)

    cap.release()
    cv2.destroyAllWindows()
    print("Interview monitor stopped.")


if __name__ == '__main__':
    main()