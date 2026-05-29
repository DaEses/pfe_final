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
COLOR_PAPER     = (0, 165, 255)
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
    # ── MediaPipe landmark indices ──────────────────────────────────────────
    L_IRIS       = 468
    R_IRIS       = 473
    L_EYE_OUTER  = 33
    L_EYE_INNER  = 133
    R_EYE_OUTER  = 263
    R_EYE_INNER  = 362
    L_EYE_TOP    = 159
    L_EYE_BOT    = 145

    # Calibrated horizontal ratio near 0.5 = center. Narrow band so left/right register.
    LEFT_THR  = 0.44   # below → looking LEFT (subject's left)
    RIGHT_THR = 0.56   # above → looking RIGHT
    UP_THR    = 0.38   # below → looking UP
    ALERT_SEC = 2.0
    COOLDOWN  = 5.0
    GAZE_SKIP = 2      # Process gaze every 2 frames

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
        self._frame_n    = 0
        self._last_gaze  = {'direction': 'center', 'h_ratio': None, 'v_ratio': None, 'alert': False}

    def _pt(self, lm, idx, w, h):
        p = lm[idx]
        return np.array([p.x * w, p.y * h])

    def _ratios(self, lm, w, h):
        """Iris position within each eye (0=outer corner, 1=inner corner)."""
        l_out = self._pt(lm, self.L_EYE_OUTER, w, h)
        l_in  = self._pt(lm, self.L_EYE_INNER, w, h)
        r_out = self._pt(lm, self.R_EYE_OUTER, w, h)
        r_in  = self._pt(lm, self.R_EYE_INNER, w, h)
        l_iris = self._pt(lm, self.L_IRIS, w, h)
        r_iris = self._pt(lm, self.R_IRIS, w, h)

        l_span = max(abs(l_in[0] - l_out[0]), 1e-6)
        r_span = max(abs(r_in[0] - r_out[0]), 1e-6)
        l_h = float(np.clip((l_iris[0] - l_out[0]) / l_span, 0.0, 1.0))
        r_h = float(np.clip((r_iris[0] - r_out[0]) / r_span, 0.0, 1.0))
        h_r = (l_h + r_h) / 2.0

        e_top = self._pt(lm, self.L_EYE_TOP, w, h)[1]
        e_bot = self._pt(lm, self.L_EYE_BOT, w, h)[1]
        v_r = float(np.clip(
            (l_iris[1] - e_top) / (max(abs(e_bot - e_top), 1e-6)),
            0.0, 1.0,
        ))
        debug = {
            "leftEyeOuter": l_out.tolist(),
            "leftEyeInner": l_in.tolist(),
            "rightEyeOuter": r_out.tolist(),
            "rightEyeInner": r_in.tolist(),
            "leftPupil": l_iris.tolist(),
            "rightPupil": r_iris.tolist(),
            "leftRatio": round(l_h, 3),
            "rightRatio": round(r_h, 3),
        }
        return h_r, v_r, debug

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
        print("[Press SPACE to skip calibration, ESC to abort]")
        hs, vs, t0 = [], [], time.time()
        frame_skip = 0

        while time.time() - t0 < 5.0:
            ok, frame = cap.read()
            if not ok:
                break
            
            # Only detect every 5 frames to speed up calibration
            frame_skip += 1
            if frame_skip % 5 == 0:
                lm, w_px, h_px = self._detect(frame)
                if lm is not None:
                    h, v, _ = self._ratios(lm, w_px, h_px)
                    hs.append(h)
                    vs.append(v)

            if display:
                rem = max(0, 5 - int(time.time() - t0))
                f2  = frame.copy()
                cv2.putText(f2, f"CALIBRATING — look at camera ({rem}s)",
                            (30, frame.shape[0] // 2), FONT, 0.9, (0, 220, 255), 2)
                cv2.imshow('Interview Monitor', f2)
                key = cv2.waitKey(1) & 0xFF
                if key == 32:  # SPACE key - skip calibration
                    print("[Gaze calibration] Skipped by user.")
                    return
                elif key == 27:  # ESC key - abort
                    print("[Gaze calibration] Aborted by user.")
                    return

        if hs:
            self._h_off     = np.mean(hs) - 0.5
            self._v_off     = np.mean(vs) - 0.5
            self.calibrated = True
            print(f"[Gaze calibration] Done  h_off={self._h_off:.3f}  v_off={self._v_off:.3f}\n")
        else:
            print("[Gaze calibration] No face found — using defaults.\n")

    def process(self, frame_bgr):
        self._frame_n += 1
        if self._frame_n % self.GAZE_SKIP != 0:
            return self._last_gaze

        lm, w_px, h_px = self._detect(frame_bgr)

        if lm is None:
            self._last_gaze = {'direction': 'no_face', 'h_ratio': None, 'v_ratio': None, 'alert': False}
            return self._last_gaze

        h_r, v_r, gaze_debug = self._ratios(lm, w_px, h_px)
        h_cal = h_r - self._h_off
        v_cal = v_r - self._v_off
        gaze_debug["gazeRatio"] = round(h_cal, 3)
        gaze_debug["gazeVertical"] = round(v_cal, 3)
        gaze_debug["gazeRawH"] = round(h_r, 3)
        gaze_debug["gazeRawV"] = round(v_r, 3)

        if os.environ.get("LOG_GAZE_DEBUG", "0") == "1":
            print(
                f"[GAZE] pupil L={gaze_debug['leftPupil']} R={gaze_debug['rightPupil']} | "
                f"ratio h={h_cal:.3f} (raw {h_r:.3f}) v={v_cal:.3f} | "
                f"thr L<{self.LEFT_THR} R>{self.RIGHT_THR}",
                flush=True,
            )

        if v_cal < self.UP_THR:
            direction = "up"
        elif h_cal < self.LEFT_THR:
            direction = "left"
        elif h_cal > self.RIGHT_THR:
            direction = "right"
        else:
            direction = "center"

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

        self._last_gaze = {
            "direction": direction,
            "h_ratio": h_cal,
            "v_ratio": v_cal,
            "h_raw": h_r,
            "v_raw": v_r,
            "alert": alert,
            "debug": gaze_debug,
        }
        return self._last_gaze


# ──────────────────────────────────────────────────────────
#  4.  PHONE DETECTION
# ──────────────────────────────────────────────────────────

class PhoneDetector:
    PHONE_CLASS = 67
    CONF_THR    = 0.40
    SKIP        = 6

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

        # Resize for faster inference
        h, w = frame_bgr.shape[:2]
        frame_resized = cv2.resize(frame_bgr, (w // 2, h // 2))
        results = self._model(frame_resized, verbose=False, classes=[self.PHONE_CLASS])[0]
        boxes   = []
        for box in results.boxes:
            conf = float(box.conf[0])
            if conf >= self.CONF_THR:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                # Scale back to original resolution
                x1, y1, x2, y2 = x1 * 2, y1 * 2, x2 * 2, y2 * 2
                boxes.append({'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2, 'conf': conf})
        self._last = boxes
        return boxes


# ──────────────────────────────────────────────────────────
#  4B. PAPER DETECTION  (BUG FIX 3 + 4)
# ──────────────────────────────────────────────────────────
# ROOT CAUSE of "paper detection not working":
#   1. YOLO yolov8n is a general object detector trained on COCO.  COCO has
#      no "paper" or "A4 sheet" class.  The closest proxy (class 73 = "book")
#      has very low recall for a flat sheet of paper on a desk.  YOLO alone
#      is not reliable for documents.
#   2. The SKIP=6 throttle means only 1 in 6 frames is evaluated — fine for
#      phones, but the probability of catching a briefly-held sheet is low.
#
# FIX: PaperDetector now uses a TWO-STAGE approach:
#   Stage 1 – YOLO classes 73 (book) + 84 (book/binder) at lower threshold.
#   Stage 2 – OpenCV contour / shape-based white-rectangle detector that
#              works reliably for A4/letter sheets at any confidence level.
# Both results are merged and returned as a unified box list.

class PaperDetector:
    DOC_CLASSES  = [73]       # COCO "book" — closest proxy for documents
    CONF_THR     = 0.22
    SKIP         = 3

    MIN_AREA_RATIO = 0.025
    MAX_AREA_RATIO = 0.85
    # Aspect ratio of A4 paper (portrait or landscape)
    MIN_ASPECT = 0.55
    MAX_ASPECT = 2.50
    # Rectangularity threshold: how close to a 4-sided polygon
    RECT_EPSILON = 0.04

    def __init__(self, yolo_model=None):
        from ultralytics import YOLO
        if yolo_model is None:
            print("Loading YOLOv8n for paper detection...")
            self._model = YOLO('yolov8n.pt')
        else:
            self._model = yolo_model
        self._frame_n = 0
        self._last    = []

    def _detect_yolo(self, frame_bgr):
        """YOLO-based detection (book/document classes)."""
        h, w = frame_bgr.shape[:2]
        small = cv2.resize(frame_bgr, (w // 2, h // 2))
        try:
            results = self._model(
                small, verbose=False, classes=self.DOC_CLASSES
            )[0]
        except Exception:
            return []
        boxes = []
        for box in results.boxes:
            conf = float(box.conf[0])
            if conf >= self.CONF_THR:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                # Scale back to original resolution
                x1, y1, x2, y2 = x1 * 2, y1 * 2, x2 * 2, y2 * 2
                boxes.append({'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2, 'conf': conf})
        return boxes

    def _quads_from_mask(self, mask, frame_area):
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        boxes = []
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < frame_area * self.MIN_AREA_RATIO or area > frame_area * self.MAX_AREA_RATIO:
                continue
            peri = cv2.arcLength(cnt, True)
            approx = cv2.approxPolyDP(cnt, self.RECT_EPSILON * peri, True)
            if len(approx) < 4 or len(approx) > 6:
                continue
            x, y, bw, bh = cv2.boundingRect(approx)
            if bw < 40 or bh < 40:
                continue
            aspect = bw / float(bh)
            if not (self.MIN_ASPECT <= aspect <= self.MAX_ASPECT):
                continue
            rect_area = bw * bh
            fill_ratio = area / max(rect_area, 1)
            conf = round(min(0.95, 0.45 + fill_ratio * 0.5), 2)
            boxes.append({"x1": x, "y1": y, "x2": x + bw, "y2": y + bh, "conf": conf})
        return boxes

    def _detect_contours(self, frame_bgr):
        """Edge + bright-region detectors for A4 / notebook sheets."""
        img_h, img_w = frame_bgr.shape[:2]
        frame_area = img_h * img_w
        boxes = []

        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        otsu_thr, _ = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        low = max(20, int(0.35 * otsu_thr))
        high = max(60, int(1.0 * otsu_thr))
        edges = cv2.Canny(blurred, low, high)
        edges = cv2.dilate(edges, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)), 1)
        boxes.extend(self._quads_from_mask(edges, frame_area))

        hsv = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2HSV)
        white_mask = cv2.inRange(hsv, (0, 0, 145), (180, 70, 255))
        boxes.extend(self._quads_from_mask(white_mask, frame_area))

        if os.environ.get("LOG_PAPER_DEBUG", "0") == "1":
            print(f"[PAPER] contour candidates: {len(boxes)}", flush=True)

        if boxes:
            boxes.sort(key=lambda b: (b["x2"] - b["x1"]) * (b["y2"] - b["y1"]), reverse=True)
            return [boxes[0]]
        return []

    def process(self, frame_bgr):
        self._frame_n += 1
        if self._frame_n % self.SKIP != 0:
            return self._last

        yolo_boxes    = self._detect_yolo(frame_bgr)
        contour_boxes = self._detect_contours(frame_bgr)

        # Merge: YOLO detections take priority; add contour-based ones that
        # don't overlap significantly with existing YOLO boxes.
        merged = list(yolo_boxes)
        for cb in contour_boxes:
            overlaps = False
            for yb in yolo_boxes:
                ix1 = max(cb['x1'], yb['x1'])
                iy1 = max(cb['y1'], yb['y1'])
                ix2 = min(cb['x2'], yb['x2'])
                iy2 = min(cb['y2'], yb['y2'])
                if ix2 > ix1 and iy2 > iy1:
                    inter = (ix2 - ix1) * (iy2 - iy1)
                    cb_area = (cb['x2'] - cb['x1']) * (cb['y2'] - cb['y1'])
                    if inter / max(cb_area, 1) > 0.5:
                        overlaps = True
                        break
            if not overlaps:
                merged.append(cb)

        self._last = merged
        return merged


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


def draw_paper_boxes(frame, paper_boxes):
    for b in paper_boxes:
        cv2.rectangle(frame, (b['x1'], b['y1']), (b['x2'], b['y2']), COLOR_PAPER, 3)
        label = f"Paper Detected {b['conf']*100:.0f}%"
        (tw, th), _ = cv2.getTextSize(label, FONT, 0.7, 2)
        cv2.rectangle(frame,
                      (b['x1'], b['y1'] - th - 10),
                      (b['x1'] + tw + 10, b['y1']),
                      COLOR_PAPER, -1)
        cv2.putText(frame, label, (b['x1'] + 5, b['y1'] - 5),
                    FONT, 0.7, (255, 255, 255), 2)


def draw_status_bar(frame, gaze, phone_boxes, paper_boxes, emotion_label):
    h, w = frame.shape[:2]
    ov   = frame.copy()
    cv2.rectangle(ov, (0, 0), (w, 140), (18, 18, 18), -1)
    cv2.addWeighted(ov, 0.6, frame, 0.4, 0, frame)

    em_col = COLOR_NEUTRAL if emotion_label == 'NEUTRAL' else COLOR_IRRITATED
    cv2.putText(frame, f"EMO: {emotion_label}", (14, 34), FONT, 0.65, em_col, 2)

    gaze_labels = {
        "left": "Looking Left",
        "right": "Looking Right",
        "center": "Looking Center",
        "up": "Looking Up",
        "no_face": "No Face",
    }
    gdir = gaze.get("direction", "center")
    g_lbl = gaze_labels.get(gdir, gdir.upper())
    g_col = COLOR_GAZE_OK if gdir == "center" else COLOR_GAZE_BAD
    g_lbl = f"GAZE: {g_lbl}" + ("  !!" if gaze["alert"] else "")
    (tw, _), _ = cv2.getTextSize(g_lbl, FONT, 0.65, 2)
    cv2.putText(frame, g_lbl, (w // 2 - tw // 2, 34), FONT, 0.65, g_col, 2)

    p_col = COLOR_PHONE if phone_boxes else (80, 200, 80)
    p_lbl = "PHONE: YES !!" if phone_boxes else "PHONE: none"
    (tw, _), _ = cv2.getTextSize(p_lbl, FONT, 0.65, 2)
    cv2.putText(frame, p_lbl, (w - tw - 14, 34), FONT, 0.65, p_col, 2)

    # Paper detection status
    paper_col = COLOR_PAPER if paper_boxes else (80, 200, 80)
    paper_lbl = "PAPER: YES !!" if paper_boxes else "PAPER: none"
    (tw, _), _ = cv2.getTextSize(paper_lbl, FONT, 0.65, 2)
    cv2.putText(frame, paper_lbl, (w - tw - 14, 58), FONT, 0.65, paper_col, 2)

    # Debug: show raw gaze ratios
    if gaze['h_ratio'] is not None:
        debug_text = f"h={gaze['h_ratio']:.2f} v={gaze['v_ratio']:.2f}"
        cv2.putText(frame, debug_text, (14, 80), FONT, 0.45, (150, 150, 255), 1)

    alerts = []
    if gaze['alert']:
        alerts.append(f"GAZE AWAY ({gdir})")
    if phone_boxes:
        alerts.append("PHONE DETECTED")
    if paper_boxes:
        alerts.append("PAPER DETECTED")
    if emotion_label == 'IRRITATED':
        alerts.append("IRRITATED")

    if alerts:
        banner = "  |  ".join(alerts)
        cv2.rectangle(frame, (0, 95), (w, 135), (0, 0, 160), -1)
        cv2.putText(frame, f"!! {banner}", (14, 122), FONT, 0.55, (255, 220, 60), 2)


# ──────────────────────────────────────────────────────────
#  6.  MAIN LOOP
# ──────────────────────────────────────────────────────────

def main():
    gaze_det  = GazeDetector()
    phone_det = PhoneDetector()
    paper_det = PaperDetector(phone_det._model)  # Share YOLO model for efficiency

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        raise RuntimeError("Cannot open webcam.")

    gaze_det.calibrate(cap, display=True)

    last_gaze    = {'direction': 'center', 'h_ratio': None, 'v_ratio': None, 'alert': False}
    last_phones  = []
    last_papers  = []
    last_emotion = 'NEUTRAL'
    
    # FPS monitoring
    frame_count = 0
    fps_timer = time.time()
    current_fps = 0

    print("Interview monitor running — Q to quit, C to re-calibrate")

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        # FPS monitoring
        frame_count += 1
        elapsed = time.time() - fps_timer
        if elapsed >= 1.0:
            current_fps = frame_count / elapsed
            frame_count = 0
            fps_timer = time.time()

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

        # (d) Paper
        last_papers = paper_det.process(frame)
        draw_paper_boxes(frame, last_papers)

        # (e) Your original legend
        fh = frame.shape[0]
        cv2.putText(frame, "[GREEN] NEUTRAL",  (10, fh - 40), FONT, 0.55, COLOR_NEUTRAL,   2)
        cv2.putText(frame, "[RED] IRRITATED",  (10, fh - 18), FONT, 0.55, COLOR_IRRITATED, 2)

        # (f) New overlays
        draw_status_bar(frame, last_gaze, last_phones, last_papers, last_emotion)
        draw_gaze_eye_icon(frame, last_gaze)
        
        # Display FPS
        cv2.putText(frame, f"FPS: {current_fps:.1f}", (frame.shape[1] - 150, 25), FONT, 0.6, (0, 255, 0), 2)

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