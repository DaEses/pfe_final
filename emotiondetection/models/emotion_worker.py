"""
Persistent interview monitor worker — JSON line protocol on stdout ONLY.

Architecture:
  Browser webcam -> JPEG base64 -> NestJS -> temp file -> this worker
  One worker process per interview; models loaded once per session.
  All detectors run on each fresh frame copy (no stale global frame).
"""
import json
import os
import sys
import time
import traceback
from datetime import datetime

import cv2
import numpy as np

from interview_monitor import (
    PhoneDetector,
    PaperDetector,
    GazeDetector,
    face_cascade,
    predict_face,
    draw_phone_boxes,
    draw_paper_boxes,
    draw_gaze_eye_icon,
    draw_confidence_bar,
    draw_status_bar,
    _stderr,
)

_gaze = None
_phone = None
_paper = None
_stats = None
_pipeline_frames = 0
_pipeline_t0 = time.time()

CALIBRATION_TARGET = 8
CALIBRATION_MAX_WORKER_FRAMES = 10

PIPELINE_DEBUG = os.environ.get("PIPELINE_DEBUG", "0") == "1"


def _plog(msg: str) -> None:
    if PIPELINE_DEBUG:
        _stderr(msg)


def default_stats():
    return {
        "source": "python_interview_monitor",
        "framesAnalyzed": 0,
        "neutralCount": 0,
        "irritatedCount": 0,
        "gazeAlerts": 0,
        "phoneDetections": 0,
        "paperDetections": 0,
        "calibrationFrames": 0,
        "calibrated": False,
        "lastPhoneAt": None,
        "lastPaperAt": None,
        "phoneTimestamps": [],
        "paperTimestamps": [],
        "emotionTimeline": [],
        "lastDominantEmotion": "NEUTRAL",
        "lastGazeDirection": "center",
        "pipelineErrors": [],
    }


def _append_timestamp(stats: dict, key: str, max_items: int = 200):
    ts = datetime.utcnow().isoformat()
    items = list(stats.get(key) or [])
    items.append(ts)
    if len(items) > max_items:
        items = items[-max_items:]
    stats[key] = items
    return ts


def _record_pipeline_error(tag: str, exc: Exception) -> None:
    errs = list(_stats.get("pipelineErrors") or [])
    errs.append({"at": datetime.utcnow().isoformat(), "stage": tag, "error": str(exc)})
    _stats["pipelineErrors"] = errs[-20:]
    _stderr(f"[PIPELINE] {tag} FAILED: {exc}")


def reset_detectors():
    global _gaze, _phone, _paper, _stats
    _stats = default_stats()
    if _gaze is None:
        _gaze = GazeDetector()
    else:
        _gaze.reset_state()
    _phone = PhoneDetector()
    _paper = PaperDetector(_phone._model)


def ensure_loaded():
    global _gaze, _phone, _paper, _stats
    if _stats is None:
        _stats = default_stats()
    if _gaze is None:
        _gaze = GazeDetector()
    if _phone is None:
        _phone = PhoneDetector()
    if _paper is None:
        _paper = PaperDetector(_phone._model)


def _force_calibrated():
    """Unblock pipeline when calibration cannot get enough face samples."""
    _stats["calibrated"] = True
    _gaze.calibrated = True
    if _stats.get("calib_h"):
        _gaze._h_off = float(np.median(_stats["calib_h"])) - 0.5
        _gaze._v_off = float(np.median(_stats["calib_v"])) - 0.5
    else:
        _gaze._h_off = 0.0
        _gaze._v_off = 0.0
    if _stats.get("calib_diff"):
        _gaze._diff_off = float(np.median(_stats["calib_diff"]))
    else:
        _gaze._diff_off = 0.0
    _gaze._h_ema = None
    _gaze._diff_ema = None
    _gaze._v_ema = None
    _gaze._h_history.clear()
    _gaze._diff_history.clear()
    _gaze._v_history.clear()
    _gaze._direction = "center"
    _plog("[PIPELINE] calibration forced with defaults")


def calibrate_step(frame_bgr):
    lm, w_px, h_px = _gaze._detect(frame_bgr)
    if lm is None:
        return False
    h, d, v, _ = _gaze._compute_gaze_ratios(lm, w_px, h_px)
    if "calib_h" not in _stats:
        _stats["calib_h"] = []
        _stats["calib_diff"] = []
        _stats["calib_v"] = []
    _stats["calib_h"].append(float(h))
    _stats["calib_diff"].append(float(d))
    _stats["calib_v"].append(float(v))
    _stats["calibrationFrames"] = len(_stats["calib_h"])
    if _stats["calibrationFrames"] >= CALIBRATION_TARGET:
        _stats["gaze_h_off"] = float(np.median(_stats["calib_h"])) - 0.5
        _stats["gaze_diff_off"] = float(np.median(_stats["calib_diff"]))
        _stats["gaze_v_off"] = float(np.median(_stats["calib_v"])) - 0.5
        _gaze._h_off = _stats["gaze_h_off"]
        _gaze._diff_off = _stats["gaze_diff_off"]
        _gaze._v_off = _stats["gaze_v_off"]
        _gaze.calibrated = True
        _gaze._h_ema = None
        _gaze._diff_ema = None
        _gaze._v_ema = None
        _gaze._h_history.clear()
        _gaze._diff_history.clear()
        _gaze._v_history.clear()
        _gaze._direction = "center"
        _gaze._off_start = None
        _gaze._last_alert = 0.0
        _stats["calibrated"] = True
        if "calib_h" in _stats:
            del _stats["calib_h"]
            del _stats["calib_diff"]
            del _stats["calib_v"]
        return True
    return False


def _load_frame_bgr(image_path: str):
    """Load a valid BGR frame from disk — never reuse a global cached frame."""
    frame = cv2.imread(image_path, cv2.IMREAD_COLOR)
    if frame is None:
        return None, "Cannot read frame (cv2.imread returned None)"
    if frame.size == 0:
        return None, "Empty frame"
    if len(frame.shape) != 3 or frame.shape[2] != 3:
        return None, f"Invalid frame shape {frame.shape}"
    frame = cv2.flip(frame.copy(), 1)
    return frame, None


def _update_calibration(frame_bgr):
    if _stats.get("calibrated"):
        return
    _stats["calib_worker_frames"] = int(_stats.get("calib_worker_frames", 0)) + 1
    calibrate_step(frame_bgr)
    if _stats.get("calibrated"):
        return
    if int(_stats["calib_worker_frames"]) >= CALIBRATION_MAX_WORKER_FRAMES:
        _force_calibrated()


def process_frame_path(
    image_path: str,
    write_preview: str | None = None,
    silent: bool = True,
):
    """
    Full detection pipeline on one fresh frame.
    When silent=True (default for web worker), no overlays are drawn — HR-only analytics.
    """
    global _pipeline_frames, _pipeline_t0

    ensure_loaded()
    frame, err = _load_frame_bgr(image_path)
    if frame is None:
        return {"ok": False, "error": err, "stats": dict(_stats or default_stats())}

    h_img, w_img = frame.shape[:2]
    _pipeline_frames += 1
    elapsed = max(time.time() - _pipeline_t0, 1e-3)
    fps = _pipeline_frames / elapsed

    _plog(f"[FRAME] shape={frame.shape} path={image_path}")
    _plog("[PIPELINE] running detection on fresh frame copy...")

    preview = frame.copy() if (write_preview and not silent) else None
    alerts = []
    _update_calibration(frame)

    # ── Phone (same frame) ───────────────────────────────────────────────
    phone_boxes = []
    try:
        _plog("[PIPELINE] phone detection...")
        phone_boxes = list(_phone.process(frame) or [])
        _plog(f"[PIPELINE] phone hits={len(phone_boxes)}")
    except Exception as exc:
        _record_pipeline_error("phone", exc)

    if phone_boxes:
        _stats["phoneDetections"] = int(_stats.get("phoneDetections", 0)) + 1
        _stats["lastPhoneAt"] = _append_timestamp(_stats, "phoneTimestamps")
        alerts.append("PHONE DETECTED")
        if preview is not None:
            draw_phone_boxes(preview, phone_boxes)

    # ── Paper (same frame) ───────────────────────────────────────────────
    paper_boxes = []
    try:
        _plog("[PIPELINE] paper detection...")
        paper_boxes = list(_paper.process(frame) or [])
        _plog(f"[PIPELINE] paper hits={len(paper_boxes)}")
    except Exception as exc:
        _record_pipeline_error("paper", exc)

    if paper_boxes:
        _stats["paperDetections"] = int(_stats.get("paperDetections", 0)) + 1
        _stats["lastPaperAt"] = _append_timestamp(_stats, "paperTimestamps")
        alerts.append("PAPER DETECTED")
        if preview is not None:
            draw_paper_boxes(preview, paper_boxes)

    # ── Emotion (same frame) ─────────────────────────────────────────────
    _stats["framesAnalyzed"] = int(_stats.get("framesAnalyzed", 0)) + 1
    emotion_label = "NO_FACE"
    face_box = None
    try:
        _plog("[PIPELINE] emotion detection...")
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=5, minSize=(48, 48)
        )
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
            timeline = list(_stats.get("emotionTimeline") or [])
            timeline.append(
                {"at": datetime.utcnow().isoformat(), "emotion": emotion_label}
            )
            _stats["emotionTimeline"] = timeline[-300:]
            if preview is not None:
                cv2.rectangle(preview, (x, y), (x + fw, y + fh), color, 2)
                draw_confidence_bar(preview, prob_neutral, x, y, fw)
    except Exception as exc:
        _record_pipeline_error("emotion", exc)

    # ── Gaze (same frame) ────────────────────────────────────────────────
    gaze_result = {
        "direction": "center",
        "h_ratio": None,
        "v_ratio": None,
        "alert": False,
    }
    try:
        _plog("[PIPELINE] gaze detection...")
        gaze_result = _gaze.process(frame)
        _stats["lastGazeDirection"] = gaze_result.get("direction", "center")
        _plog(f"[PIPELINE] gaze={gaze_result.get('direction')} h={gaze_result.get('h_ratio')}")
        if preview is not None:
            draw_gaze_eye_icon(preview, gaze_result)
        if gaze_result.get("alert"):
            _stats["gazeAlerts"] = int(_stats.get("gazeAlerts", 0)) + 1
            direction = gaze_result.get("direction", "").upper()
            alerts.append(f"GAZE AWAY ({direction})")
    except Exception as exc:
        _record_pipeline_error("gaze", exc)

    if not _stats.get("calibrated"):
        emotion_label = "CALIBRATING"

    if preview is not None:
        draw_status_bar(preview, gaze_result, phone_boxes, paper_boxes, emotion_label)
        cv2.putText(
            preview,
            f"PIPE FPS~{fps:.1f}",
            (10, h_img - 10),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            (180, 255, 180),
            1,
        )
        cv2.imwrite(write_preview, preview)

    _stats["pipelineFps"] = round(fps, 2)
    _stats["lastFrameShape"] = [int(h_img), int(w_img), 3]

    return build_response(
        w_img,
        h_img,
        phone_boxes,
        paper_boxes,
        face_box,
        emotion_label,
        gaze_result,
        alerts,
    )


def gaze_direction_label(direction: str) -> str:
    mapping = {
        "left": "Looking Left",
        "right": "Looking Right",
        "center": "Looking Center",
        "up": "Looking Up",
        "no_face": "No Face",
        "calibrating": "Calibrating",
    }
    return mapping.get(direction or "center", direction or "Looking Center")


def build_response(w_img, h_img, phone_boxes, paper_boxes, face_box, emotion_label, gaze_result, alerts):
    gaze_dir = "center"
    gaze_alert = False
    h_ratio = None
    v_ratio = None
    h_raw = None
    v_raw = None
    gaze_debug = None
    if isinstance(gaze_result, dict):
        gaze_dir = gaze_result.get("direction", "center")
        gaze_alert = bool(gaze_result.get("alert"))
        h_ratio = gaze_result.get("h_ratio")
        v_ratio = gaze_result.get("v_ratio")
        h_raw = gaze_result.get("h_raw")
        v_raw = gaze_result.get("v_raw")
        gaze_debug = gaze_result.get("debug")

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

    norm_papers = []
    for b in paper_boxes or []:
        norm_papers.append(
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
            "gazeLabel": gaze_direction_label(gaze_dir),
            "gazeAlert": gaze_alert,
            "gazeH": h_ratio,
            "gazeV": v_ratio,
            "gazeHRaw": h_raw,
            "gazeVRaw": v_raw,
            "gazeDebug": gaze_debug,
            "phoneBoxes": norm_phones,
            "paperBoxes": norm_papers,
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
    paper_frames = int(_stats.get("paperDetections", 0))
    gaze_alerts = int(_stats.get("gazeAlerts", 0))
    frames = int(_stats.get("framesAnalyzed", 0))

    risk_level = "low"
    if irritated_ratio > 0.45 or gaze_alerts > 5 or phone_frames > 3:
        risk_level = "high"
    elif irritated_ratio > 0.25 or gaze_alerts > 2 or phone_frames > 0:
        risk_level = "medium"

    timeline = list(_stats.get("emotionTimeline") or [])
    emotion_counts = {
        "NEUTRAL": int(_stats.get("neutralCount", 0)),
        "IRRITATED": int(_stats.get("irritatedCount", 0)),
    }

    return {
        "generatedAt": datetime.utcnow().isoformat(),
        "source": "python_interview_monitor",
        "framesAnalyzed": frames,
        "dominantEmotion": dominant,
        "neutralRatio": round(neutral_ratio, 3),
        "irritatedRatio": round(irritated_ratio, 3),
        "emotionCounts": emotion_counts,
        "emotionTimeline": timeline[-120:],
        "gazeAlerts": gaze_alerts,
        "phoneDetections": phone_frames,
        "paperDetections": paper_frames,
        "lastPhoneAt": _stats.get("lastPhoneAt"),
        "lastPaperAt": _stats.get("lastPaperAt"),
        "phoneTimestamps": list(_stats.get("phoneTimestamps") or [])[-120:],
        "paperTimestamps": list(_stats.get("paperTimestamps") or [])[-120:],
        "lastGazeDirection": _stats.get("lastGazeDirection", "center"),
        "lastGazeLabel": gaze_direction_label(_stats.get("lastGazeDirection", "center")),
        "riskLevel": risk_level,
        "calibrated": bool(_stats.get("calibrated")),
    }


def main():
    sys.stdout.reconfigure(line_buffering=True)
    _stderr("emotion_worker ready")

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
                silent = bool(cmd.get("silent", True))
                preview_path = cmd.get("preview") if not silent else None
                out = process_frame_path(cmd["path"], preview_path, silent=silent)
            elif op == "finalize":
                out = {"ok": True, "summary": finalize_summary()}
            else:
                out = {"ok": False, "error": f"unknown op {op}"}
        except Exception as exc:
            traceback.print_exc(file=sys.stderr)
            out = {"ok": False, "error": str(exc)}

        print(json.dumps(out))
        sys.stdout.flush()


if __name__ == "__main__":
    main()
