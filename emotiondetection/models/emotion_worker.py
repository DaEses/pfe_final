"""
Persistent interview monitor worker — same detectors & drawing as interview_monitor.py.
"""
import json
import sys
from datetime import datetime

import cv2
import numpy as np

from interview_monitor import (
    PhoneDetector,
    GazeDetector,
    face_cascade,
    predict_face,
    draw_phone_boxes,
    draw_gaze_eye_icon,
    draw_confidence_bar,
    draw_status_bar,
)

_gaze = None
_phone = None
_stats = None

CALIBRATION_TARGET = 15
CALIBRATION_SECONDS_HINT = 5


def default_stats():
    return {
        "source": "python_interview_monitor",
        "framesAnalyzed": 0,
        "neutralCount": 0,
        "irritatedCount": 0,
        "gazeAlerts": 0,
        "phoneDetections": 0,
        "calibrationFrames": 0,
        "calibrated": False,
        "lastPhoneAt": None,
        "lastDominantEmotion": "NEUTRAL",
        "lastGazeDirection": "center",
    }


def reset_detectors():
    global _gaze, _phone, _stats
    _stats = default_stats()
    _gaze = GazeDetector()
    _phone = PhoneDetector()


def ensure_loaded():
    global _gaze, _phone, _stats
    if _stats is None:
        _stats = default_stats()
    if _gaze is None:
        _gaze = GazeDetector()
    if _phone is None:
        _phone = PhoneDetector()


def calibrate_step(frame_bgr):
    lm, w_px, h_px = _gaze._detect(frame_bgr)
    if lm is None:
        return False
    h, v = _gaze._ratios(lm, w_px, h_px)
    if "calib_h" not in _stats:
        _stats["calib_h"] = []
        _stats["calib_v"] = []
    _stats["calib_h"].append(float(h))
    _stats["calib_v"].append(float(v))
    _stats["calibrationFrames"] = len(_stats["calib_h"])
    if _stats["calibrationFrames"] >= CALIBRATION_TARGET:
        _stats["gaze_h_off"] = float(np.mean(_stats["calib_h"])) - 0.5
        _stats["gaze_v_off"] = float(np.mean(_stats["calib_v"])) - 0.5
        _gaze._h_off = _stats["gaze_h_off"]
        _gaze._v_off = _stats["gaze_v_off"]
        _gaze.calibrated = True
        _gaze._off_start = None
        _gaze._last_alert = 0.0
        _stats["calibrated"] = True
        if "calib_h" in _stats:
            del _stats["calib_h"]
            del _stats["calib_v"]
        return True
    return False


def process_frame_path(image_path: str, write_preview: str | None = None):
    ensure_loaded()
    frame = cv2.imread(image_path)
    if frame is None:
        return {"ok": False, "error": "Cannot read frame", "stats": _stats}

    frame = cv2.flip(frame, 1)
    h_img, w_img = frame.shape[:2]
    preview = frame.copy()
    alerts = []

    phone_boxes = _phone.process(frame)
    if phone_boxes:
        _stats["phoneDetections"] = int(_stats.get("phoneDetections", 0)) + 1
        _stats["lastPhoneAt"] = datetime.utcnow().isoformat()
        alerts.append("PHONE DETECTED")
        draw_phone_boxes(preview, phone_boxes)

    if not _stats.get("calibrated"):
        calibrate_step(frame)
        if not _stats.get("calibrated"):
            msg = (
                f"Calibrating gaze — look at the camera "
                f"({_stats.get('calibrationFrames', 0)}/{CALIBRATION_TARGET})"
            )
            cv2.rectangle(preview, (0, 0), (w_img, 56), (0, 120, 255), -1)
            cv2.putText(
                preview,
                msg,
                (12, 36),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.65,
                (255, 255, 255),
                2,
            )
            if write_preview:
                cv2.imwrite(write_preview, preview)
            return build_response(
                w_img,
                h_img,
                phone_boxes,
                None,
                "CALIBRATING",
                {"direction": "calibrating", "alert": False},
                alerts,
            )

    _stats["framesAnalyzed"] = int(_stats.get("framesAnalyzed", 0)) + 1
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(
        gray, scaleFactor=1.1, minNeighbors=5, minSize=(48, 48)
    )
    emotion_label = "NO_FACE"
    prob_neutral = 0.5
    face_box = None

    if len(faces) > 0:
        x, y, fw, fh = faces[0]
        face_box = {"x": int(x), "y": int(y), "w": int(fw), "h": int(fh)}
        emotion_label, prob_neutral, color = predict_face(gray[y : y + fh, x : x + fw])
        _stats["lastDominantEmotion"] = emotion_label
        if emotion_label == "NEUTRAL":
            _stats["neutralCount"] = int(_stats.get("neutralCount", 0)) + 1
        else:
            _stats["irritatedCount"] = int(_stats.get("irritatedCount", 0)) + 1
            alerts.append("IRRITATED")
        cv2.rectangle(preview, (x, y), (x + fw, y + fh), color, 2)
        cv2.putText(
            preview,
            emotion_label,
            (x, y - 8),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            color,
            2,
        )
        draw_confidence_bar(preview, prob_neutral, x, y, fw)

    gaze_result = _gaze.process(frame)
    _stats["lastGazeDirection"] = gaze_result.get("direction", "center")
    draw_gaze_eye_icon(preview, gaze_result)
    if gaze_result.get("alert"):
        _stats["gazeAlerts"] = int(_stats.get("gazeAlerts", 0)) + 1
        direction = gaze_result.get("direction", "").upper()
        alerts.append(f"GAZE AWAY ({direction})")

    draw_status_bar(preview, gaze_result, phone_boxes, emotion_label)

    if write_preview:
        cv2.imwrite(write_preview, preview)

    return build_response(
        w_img,
        h_img,
        phone_boxes,
        face_box,
        emotion_label,
        gaze_result,
        alerts,
    )


def build_response(w_img, h_img, phone_boxes, face_box, emotion_label, gaze_result, alerts):
    gaze_dir = "center"
    gaze_alert = False
    h_ratio = None
    v_ratio = None
    if isinstance(gaze_result, dict):
        gaze_dir = gaze_result.get("direction", "center")
        gaze_alert = bool(gaze_result.get("alert"))
        h_ratio = gaze_result.get("h_ratio")
        v_ratio = gaze_result.get("v_ratio")

    norm_phones = []
    for b in phone_boxes or []:
        norm_phones.append(
            {
                "x1": b["x1"] / w_img,
                "y1": b["y1"] / h_img,
                "x2": b["x2"] / w_img,
                "y2": b["y2"] / h_img,
                "conf": b.get("conf", 0),
            }
        )

    face_norm = None
    if face_box:
        face_norm = {
            "x": face_box["x"] / w_img,
            "y": face_box["y"] / h_img,
            "w": face_box["w"] / w_img,
            "h": face_box["h"] / w_img,
        }

    return {
        "ok": True,
        "stats": dict(_stats),
        "detection": {
            "emotion": emotion_label,
            "gaze": gaze_dir,
            "gazeAlert": gaze_alert,
            "gazeH": h_ratio,
            "gazeV": v_ratio,
            "phoneBoxes": norm_phones,
            "faceBox": face_norm,
            "alerts": alerts,
        },
    }


def finalize_summary():
    ensure_loaded()
    emotion_total = max(
        1, int(_stats.get("neutralCount", 0)) + int(_stats.get("irritatedCount", 0))
    )
    neutral_ratio = int(_stats.get("neutralCount", 0)) / emotion_total
    irritated_ratio = int(_stats.get("irritatedCount", 0)) / emotion_total
    dominant = _stats.get("lastDominantEmotion") or "NEUTRAL"
    phone_frames = int(_stats.get("phoneDetections", 0))
    gaze_alerts = int(_stats.get("gazeAlerts", 0))
    frames = int(_stats.get("framesAnalyzed", 0))

    risk_level = "low"
    if irritated_ratio > 0.45 or gaze_alerts > 5 or phone_frames > 3:
        risk_level = "high"
    elif irritated_ratio > 0.25 or gaze_alerts > 2 or phone_frames > 0:
        risk_level = "medium"

    return {
        "generatedAt": datetime.utcnow().isoformat(),
        "source": "python_interview_monitor",
        "framesAnalyzed": frames,
        "dominantEmotion": dominant,
        "neutralRatio": round(neutral_ratio, 3),
        "irritatedRatio": round(irritated_ratio, 3),
        "gazeAlerts": gaze_alerts,
        "phoneDetections": phone_frames,
        "lastGazeDirection": _stats.get("lastGazeDirection", "center"),
        "riskLevel": risk_level,
        "calibrated": bool(_stats.get("calibrated")),
    }


def main():
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.write("emotion_worker ready\n")
    sys.stderr.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            cmd = json.loads(line)
        except json.JSONDecodeError as exc:
            print(json.dumps({"ok": False, "error": str(exc)}))
            sys.stdout.flush()
            continue

        op = cmd.get("op")
        try:
            if op == "ping":
                out = {"ok": True, "pong": True}
            elif op == "reset":
                reset_detectors()
                out = {"ok": True, "stats": _stats}
            elif op == "frame":
                out = process_frame_path(cmd["path"], cmd.get("preview"))
            elif op == "finalize":
                out = {"ok": True, "summary": finalize_summary()}
            else:
                out = {"ok": False, "error": f"unknown op {op}"}
        except Exception as exc:
            out = {"ok": False, "error": str(exc)}

        print(json.dumps(out))
        sys.stdout.flush()


if __name__ == "__main__":
    main()
