import cv2
import numpy as np
import time
import os
import sys
import urllib.request
from collections import deque
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

def _stderr(msg: str) -> None:
    """All diagnostic logs MUST use stderr — stdout is reserved for JSON worker protocol."""
    sys.stderr.write(msg + "\n")
    sys.stderr.flush()


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except ValueError:
        return default


if not os.path.exists(EMOTION_MODEL):
    _stderr(f"ERROR: emotion model not found at: {EMOTION_MODEL}")
    _stderr("Set EMOTION_MODEL_PATH or place the .h5 file next to this script.")
    sys.exit(1)

_stderr(f"Loading emotion model from: {EMOTION_MODEL}")
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
    """
    Stable gaze estimation from MediaPipe iris landmarks.

    Stability techniques:
      - Fresh landmarks every frame (no frame-skip stale reuse)
      - Eye-width-normalized iris position (scale invariant)
      - EMA + sliding-window median on horizontal ratio
      - Hysteresis on left/center/right to prevent boundary flicker
      - VIDEO running mode when processing sequential frames
    """

    # MediaPipe Face Landmarker indices
    L_IRIS      = 468
    R_IRIS      = 473
    L_EYE_OUTER = 33
    L_EYE_INNER = 133
    R_EYE_OUTER = 263
    R_EYE_INNER = 362
    L_EYE_TOP   = 159
    L_EYE_BOT   = 145
    R_EYE_TOP   = 386
    R_EYE_BOT   = 374

    # Hysteresis thresholds on *smoothed* calibrated ratio (~0.5 = center)
    LEFT_ENTER  = 0.40   # enter "left" below this
    LEFT_EXIT   = 0.46   # leave "left" above this
    RIGHT_ENTER = 0.60   # enter "right" above this
    RIGHT_EXIT  = 0.54   # leave "right" below this
    UP_ENTER    = 0.36
    UP_EXIT     = 0.42

    EMA_ALPHA       = 0.30   # lower = smoother (0.2–0.4 typical)
    SMOOTH_WINDOW   = 8      # median window over recent frames
    NO_FACE_HOLD    = 4      # keep last direction for brief dropout

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
            _stderr("Downloading face landmarker model (~30 MB) ...")
            url = (
                "https://storage.googleapis.com/mediapipe-models/"
                "face_landmarker/face_landmarker/float16/1/face_landmarker.task"
            )
            urllib.request.urlretrieve(url, model_path)
            _stderr("Download complete.")

        self._mp = mp
        self._mp_vision = mp_vision
        # Discrete JPEG frames from the web worker are not a continuous video stream.
        # IMAGE mode is the stable default; enable VIDEO only for local cv2.capture loops.
        use_video = os.environ.get("GAZE_VIDEO_MODE", "0") == "1"
        running_mode = (
            mp_vision.RunningMode.VIDEO if use_video else mp_vision.RunningMode.IMAGE
        )

        options = mp_vision.FaceLandmarkerOptions(
            base_options=mp_python.BaseOptions(model_asset_path=model_path),
            running_mode=running_mode,
            output_face_blendshapes=False,
            output_facial_transformation_matrixes=False,
            num_faces=1,
        )
        self._landmarker = mp_vision.FaceLandmarker.create_from_options(options)
        self._video_mode = use_video
        self._timestamp_ms = 0

        self.reset_state()

    def reset_state(self):
        """Clear smoothing buffers (call on session reset)."""
        self._h_off = 0.0
        self._v_off = 0.0
        self.calibrated = False
        self._off_start = None
        self._last_alert = 0.0
        self._frame_n = 0
        self._timestamp_ms = 0
        self._direction = "center"
        self._h_ema = None
        self._v_ema = None
        self._h_history = deque(maxlen=self.SMOOTH_WINDOW)
        self._v_history = deque(maxlen=self.SMOOTH_WINDOW)
        self._no_face_streak = 0
        self._last_gaze = {
            "direction": "center",
            "h_ratio": None,
            "v_ratio": None,
            "alert": False,
        }

    def _pt(self, lm, idx, w, h):
        p = lm[idx]
        return np.array([p.x * w, p.y * h], dtype=np.float64)

    @staticmethod
    def _iris_ratio_in_eye(iris, outer, inner, top, bottom):
        """
        Normalized iris position inside the eye socket (scale invariant).
        Horizontal: 0 = outer canthus, 1 = inner canthus.
        Vertical:   0 = top lid, 1 = bottom lid.
        """
        eye_w = inner - outer
        width = float(np.linalg.norm(eye_w)) + 1e-6
        h_ratio = float(np.dot(iris - outer, eye_w) / (width * width))
        h_ratio = float(np.clip(h_ratio, 0.0, 1.0))

        eye_h = bottom - top
        height = float(np.linalg.norm(eye_h)) + 1e-6
        v_ratio = float(np.dot(iris - top, eye_h) / (height * height))
        v_ratio = float(np.clip(v_ratio, 0.0, 1.0))
        return h_ratio, v_ratio, width

    def _compute_gaze_ratios(self, lm, w, h):
        """Per-frame pupil/iris ratios — never cached from prior frames."""
        l_out = self._pt(lm, self.L_EYE_OUTER, w, h)
        l_in  = self._pt(lm, self.L_EYE_INNER, w, h)
        l_top = self._pt(lm, self.L_EYE_TOP, w, h)
        l_bot = self._pt(lm, self.L_EYE_BOT, w, h)
        r_out = self._pt(lm, self.R_EYE_OUTER, w, h)
        r_in  = self._pt(lm, self.R_EYE_INNER, w, h)
        r_top = self._pt(lm, self.R_EYE_TOP, w, h)
        r_bot = self._pt(lm, self.R_EYE_BOT, w, h)
        l_iris = self._pt(lm, self.L_IRIS, w, h)
        r_iris = self._pt(lm, self.R_IRIS, w, h)

        l_center = (l_out + l_in + l_top + l_bot) / 4.0
        r_center = (r_out + r_in + r_top + r_bot) / 4.0

        l_h, l_v, l_w = self._iris_ratio_in_eye(l_iris, l_out, l_in, l_top, l_bot)
        r_h, r_v, r_w = self._iris_ratio_in_eye(r_iris, r_out, r_in, r_top, r_bot)

        total_w = l_w + r_w + 1e-6
        h_raw = (l_h * l_w + r_h * r_w) / total_w
        v_raw = (l_v * l_w + r_v * r_w) / total_w

        debug = {
            "leftEyeCenter": l_center.tolist(),
            "rightEyeCenter": r_center.tolist(),
            "leftPupil": l_iris.tolist(),
            "rightPupil": r_iris.tolist(),
            "leftRatio": round(l_h, 4),
            "rightRatio": round(r_h, 4),
            "leftEyeWidthPx": round(l_w, 1),
            "rightEyeWidthPx": round(r_w, 1),
        }
        return float(h_raw), float(v_raw), debug

    def _smooth_ratio(self, raw_h, raw_v):
        """EMA + median filter to suppress frame jitter."""
        if self._h_ema is None:
            self._h_ema = raw_h
            self._v_ema = raw_v
        else:
            a = self.EMA_ALPHA
            self._h_ema = a * raw_h + (1.0 - a) * self._h_ema
            self._v_ema = a * raw_v + (1.0 - a) * self._v_ema

        self._h_history.append(self._h_ema)
        self._v_history.append(self._v_ema)

        h_med = float(np.median(self._h_history))
        v_med = float(np.median(self._v_history))
        return h_med, v_med

    def _classify_with_hysteresis(self, h_smooth, v_smooth):
        """
        Stable left/center/right using hysteresis — avoids flicker at thresholds.
        """
        d = self._direction

        if d == "up":
            if v_smooth <= self.UP_EXIT:
                self._direction = "up"
                return "up"
            d = "center"
        elif v_smooth < self.UP_ENTER:
            self._direction = "up"
            return "up"

        if d == "left":
            if h_smooth > self.LEFT_EXIT:
                d = "center"
        elif d == "right":
            if h_smooth < self.RIGHT_EXIT:
                d = "center"
        else:
            d = "center"

        if d == "center":
            if h_smooth < self.LEFT_ENTER:
                d = "left"
            elif h_smooth > self.RIGHT_ENTER:
                d = "right"

        self._direction = d
        return d

    def _detect(self, frame_bgr):
        h_px, w_px = frame_bgr.shape[:2]
        rgb = np.ascontiguousarray(cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB))
        mp_image = self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=rgb)

        try:
            if self._video_mode:
                self._timestamp_ms += int(os.environ.get("GAZE_FRAME_MS", "33"))
                result = self._landmarker.detect_for_video(mp_image, self._timestamp_ms)
            else:
                result = self._landmarker.detect(mp_image)
        except Exception as exc:
            _stderr(f"[GAZE] landmark detection failed: {exc}")
            return None, w_px, h_px

        if not result.face_landmarks:
            return None, w_px, h_px
        return result.face_landmarks[0], w_px, h_px

    def calibrate(self, cap, display=True):
        print("\n[Gaze calibration] Look straight at the camera for 5 s ...")
        print("[Press SPACE to skip calibration, ESC to abort]")
        hs, vs, t0 = [], [], time.time()

        while time.time() - t0 < 5.0:
            ok, frame = cap.read()
            if not ok:
                break
            lm, w_px, h_px = self._detect(frame)
            if lm is not None:
                h, v, _ = self._compute_gaze_ratios(lm, w_px, h_px)
                hs.append(h)
                vs.append(v)

            if display:
                rem = max(0, 5 - int(time.time() - t0))
                f2 = frame.copy()
                cv2.putText(
                    f2,
                    f"CALIBRATING — look at camera ({rem}s)",
                    (30, frame.shape[0] // 2),
                    FONT,
                    0.9,
                    (0, 220, 255),
                    2,
                )
                cv2.imshow("Interview Monitor", f2)
                key = cv2.waitKey(1) & 0xFF
                if key == 32:
                    print("[Gaze calibration] Skipped by user.")
                    return
                if key == 27:
                    print("[Gaze calibration] Aborted by user.")
                    return

        if hs:
            self._h_off = float(np.median(hs)) - 0.5
            self._v_off = float(np.median(vs)) - 0.5
            self.calibrated = True
            self._h_ema = None
            self._v_ema = None
            self._h_history.clear()
            self._v_history.clear()
            print(
                f"[Gaze calibration] Done  h_off={self._h_off:.3f}  v_off={self._v_off:.3f}\n"
            )
        else:
            print("[Gaze calibration] No face found — using defaults.\n")

    def process(self, frame_bgr):
        """Run gaze on every call — fresh landmarks, smoothed output."""
        self._frame_n += 1
        lm, w_px, h_px = self._detect(frame_bgr)

        if lm is None:
            self._no_face_streak += 1
            if self._no_face_streak <= self.NO_FACE_HOLD and self._last_gaze.get("h_ratio") is not None:
                out = dict(self._last_gaze)
                out["direction"] = self._direction
                out["alert"] = False
                return out
            self._last_gaze = {
                "direction": "no_face",
                "h_ratio": self._last_gaze.get("h_ratio"),
                "v_ratio": self._last_gaze.get("v_ratio"),
                "alert": False,
            }
            return self._last_gaze

        self._no_face_streak = 0

        h_raw, v_raw, gaze_debug = self._compute_gaze_ratios(lm, w_px, h_px)
        h_cal_raw = h_raw - self._h_off
        v_cal_raw = v_raw - self._v_off

        h_smooth, v_smooth = self._smooth_ratio(h_cal_raw, v_cal_raw)
        direction = self._classify_with_hysteresis(h_smooth, v_smooth)

        gaze_debug.update(
            {
                "gazeRawH": round(h_raw, 4),
                "gazeRawV": round(v_raw, 4),
                "gazeRatio": round(h_smooth, 4),
                "gazeVertical": round(v_smooth, 4),
                "gazeInstantH": round(h_cal_raw, 4),
                "classification": direction,
            }
        )

        if os.environ.get("LOG_GAZE_DEBUG", "0") == "1":
            print(
                f"[GAZE] frame={self._frame_n} | "
                f"L_pupil={gaze_debug['leftPupil']} R_pupil={gaze_debug['rightPupil']} | "
                f"L_center={gaze_debug['leftEyeCenter']} R_center={gaze_debug['rightEyeCenter']} | "
                f"ratio instant={h_cal_raw:.3f} smooth={h_smooth:.3f} | "
                f"class={direction}",
                flush=True,
            )

        now = time.time()
        alert = False
        if direction not in ("center", "no_face"):
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
            "h_ratio": h_smooth,
            "v_ratio": v_smooth,
            "h_raw": h_raw,
            "v_raw": v_raw,
            "h_instant": h_cal_raw,
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
    SKIP        = _env_int("PHONE_SKIP", 1)

    def __init__(self):
        from ultralytics import YOLO
        _stderr("Loading YOLOv8n (downloads ~6 MB on first run) ...")
        self._model   = YOLO('yolov8n.pt')
        self._frame_n = 0
        self._last    = []

    def process(self, frame_bgr):
        self._frame_n += 1
        if self.SKIP > 1 and self._frame_n % self.SKIP != 0:
            return list(self._last)

        h, w = frame_bgr.shape[:2]
        scale = 2
        frame_resized = cv2.resize(frame_bgr, (max(w // scale, 1), max(h // scale, 1)))
        try:
            results = self._model(
                frame_resized, verbose=False, classes=[self.PHONE_CLASS]
            )[0]
        except Exception as exc:
            _stderr(f"[PHONE] YOLO failed: {exc}")
            return list(self._last)

        boxes = []
        for box in results.boxes:
            conf = float(box.conf[0])
            if conf >= self.CONF_THR:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                x1, y1, x2, y2 = x1 * scale, y1 * scale, x2 * scale, y2 * scale
                boxes.append({"x1": x1, "y1": y1, "x2": x2, "y2": y2, "conf": conf})
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
    SKIP         = _env_int("PAPER_SKIP", 1)

    # Contour filters — reject full-frame false positives
    MIN_AREA_PIXELS = 5000          # ignore tiny noise
    MAX_AREA_RATIO  = 0.60          # reject if contour/bbox > 60% of frame
    MIN_AREA_RATIO  = 0.025         # ignore specks (< ~2.5% of frame)
    MIN_ASPECT      = 0.50          # document-like width/height (portrait or landscape)
    MAX_ASPECT      = 1.80
    RECT_EPSILON    = 0.02          # tighter approx → fewer full-frame quads
    FRAME_EDGE_MARGIN = 12          # px inset — frame-border contours touch all edges

    def __init__(self, yolo_model=None):
        from ultralytics import YOLO
        if yolo_model is None:
            _stderr("Loading YOLOv8n for paper detection...")
            self._model = YOLO('yolov8n.pt')
        else:
            self._model = yolo_model
        self._frame_n = 0
        self._last    = []

    def _is_valid_document_shape(
        self, x, y, bw, bh, contour_area, frame_w, frame_h, frame_area
    ):
        """
        Reject full-screen / frame-border false positives.
        Only pass document-sized quadrilaterals with paper-like aspect ratio.
        """
        if bw <= 0 or bh <= 0:
            return False
        if contour_area < self.MIN_AREA_PIXELS:
            return False
        if contour_area > frame_area * self.MAX_AREA_RATIO:
            return False

        bbox_area = bw * bh
        if bbox_area < self.MIN_AREA_PIXELS:
            return False
        if bbox_area > frame_area * self.MAX_AREA_RATIO:
            return False

        aspect = bw / float(bh)
        if not (self.MIN_ASPECT <= aspect <= self.MAX_ASPECT):
            return False

        m = self.FRAME_EDGE_MARGIN
        touches_left   = x <= m
        touches_top    = y <= m
        touches_right  = (x + bw) >= (frame_w - m)
        touches_bottom = (y + bh) >= (frame_h - m)
        edge_count = sum([touches_left, touches_top, touches_right, touches_bottom])
        # Full-frame border contour touches all four edges
        if edge_count >= 4:
            return False
        if edge_count >= 3 and bbox_area > frame_area * 0.45:
            return False

        # Hard cap: never accept a box covering most of the frame
        if bw >= frame_w * 0.90 and bh >= frame_h * 0.90:
            return False

        return True

    def _detect_yolo(self, frame_bgr):
        """YOLO-based detection (book/document classes), same geometry filters."""
        h, w = frame_bgr.shape[:2]
        frame_area = h * w
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
            if conf < self.CONF_THR:
                continue
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            x1, y1, x2, y2 = x1 * 2, y1 * 2, x2 * 2, y2 * 2
            bw, bh = x2 - x1, y2 - y1
            area = bw * bh
            if not self._is_valid_document_shape(
                x1, y1, bw, bh, area, w, h, frame_area
            ):
                continue
            boxes.append({"x1": x1, "y1": y1, "x2": x2, "y2": y2, "conf": conf})
        return boxes

    def _quads_from_mask(self, mask, frame_w, frame_h, frame_area):
        """
        Extract document quads from a binary mask.
        Uses RETR_EXTERNAL only — no nested / full-frame child contours.
        """
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
        # Shrink mask slightly so frame edges are less likely to form one huge contour
        mask = cv2.erode(mask, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)), 1)

        contours, _ = cv2.findContours(
            mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )
        boxes = []
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < self.MIN_AREA_PIXELS:
                continue
            if area < frame_area * self.MIN_AREA_RATIO:
                continue
            if area > frame_area * self.MAX_AREA_RATIO:
                continue

            peri = cv2.arcLength(cnt, True)
            approx = cv2.approxPolyDP(cnt, self.RECT_EPSILON * peri, True)

            # Must be a quadrilateral (paper sheet), not 5–6 point frame polygon
            if len(approx) != 4:
                continue
            if not cv2.isContourConvex(approx):
                continue

            x, y, bw, bh = cv2.boundingRect(approx)
            if not self._is_valid_document_shape(
                x, y, bw, bh, area, frame_w, frame_h, frame_area
            ):
                continue

            rect_area = bw * bh
            fill_ratio = area / max(rect_area, 1)
            if fill_ratio < 0.55:
                continue
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
        boxes.extend(self._quads_from_mask(edges, img_w, img_h, frame_area))

        hsv = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2HSV)
        white_mask = cv2.inRange(hsv, (0, 0, 145), (180, 70, 255))
        boxes.extend(self._quads_from_mask(white_mask, img_w, img_h, frame_area))

        if os.environ.get("LOG_PAPER_DEBUG", "0") == "1":
            _stderr(f"[PAPER] valid contour candidates: {len(boxes)}")

        if boxes:
            boxes.sort(
                key=lambda b: (b["x2"] - b["x1"]) * (b["y2"] - b["y1"]),
                reverse=True,
            )
            return [boxes[0]]
        return []

    def process(self, frame_bgr):
        self._frame_n += 1
        if self.SKIP > 1 and self._frame_n % self.SKIP != 0:
            return list(self._last)

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

def run_detections_on_frame(frame_bgr, gaze_det, phone_det, paper_det):
    """
    Run phone, paper, gaze, and emotion on one BGR frame copy.
    Used by the local webcam loop and the HTTP worker (same code path).
    """
    frame = frame_bgr.copy()
    h_img, w_img = frame.shape[:2]
    alerts = []

    phone_boxes = phone_det.process(frame) or []
    paper_boxes = paper_det.process(frame) or []
    gaze_result = gaze_det.process(frame)

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(
        gray, scaleFactor=1.1, minNeighbors=5, minSize=(48, 48)
    )
    emotion_label = "NO_FACE"
    face_box = None
    if len(faces) > 0:
        x, y, fw, fh = faces[0]
        face_box = (x, y, fw, fh)
        emotion_label, prob_n, color = predict_face(gray[y : y + fh, x : x + fw])
        cv2.rectangle(frame, (x, y), (x + fw, y + fh), color, 2)
        draw_confidence_bar(frame, prob_n, x, y, fw)

    draw_phone_boxes(frame, phone_boxes)
    draw_paper_boxes(frame, paper_boxes)
    draw_gaze_eye_icon(frame, gaze_result)
    draw_status_bar(frame, gaze_result, phone_boxes, paper_boxes, emotion_label)

    return {
        "frame": frame,
        "phone_boxes": phone_boxes,
        "paper_boxes": paper_boxes,
        "gaze_result": gaze_result,
        "emotion_label": emotion_label,
        "face_box": face_box,
        "alerts": alerts,
        "size": (w_img, h_img),
    }


def main():
    gaze_det = GazeDetector()
    phone_det = PhoneDetector()
    paper_det = PaperDetector(phone_det._model)

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        raise RuntimeError("Cannot open webcam.")

    gaze_det.calibrate(cap, display=True)

    frame_count = 0
    fps_timer = time.time()
    current_fps = 0.0

    _stderr("Interview monitor running — Q to quit, C to re-calibrate")

    try:
        while True:
            ret, frame = cap.read()
            if not ret or frame is None:
                continue
            frame = frame.copy()

            frame_count += 1
            elapsed = time.time() - fps_timer
            if elapsed >= 1.0:
                current_fps = frame_count / elapsed
                frame_count = 0
                fps_timer = time.time()

            out = run_detections_on_frame(frame, gaze_det, phone_det, paper_det)
            display = out["frame"]
            cv2.putText(
                display,
                f"FPS: {current_fps:.1f}",
                (display.shape[1] - 150, 25),
                FONT,
                0.6,
                (0, 255, 0),
                2,
            )
            cv2.imshow("Interview Monitor — Q quit | C calibrate", display)

            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break
            if key == ord("c"):
                gaze_det.calibrate(cap, display=True)
    finally:
        cap.release()
        cv2.destroyAllWindows()
        _stderr("Interview monitor stopped.")


if __name__ == '__main__':
    main()