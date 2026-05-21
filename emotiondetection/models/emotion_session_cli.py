"""
Incremental interview monitoring — same detectors as interview_monitor.py.
Processes webcam frames uploaded from the candidate browser during the interview.
"""
import argparse
import json
import os
import sys
from datetime import datetime

import cv2
import numpy as np

from interview_monitor import GazeDetector, PhoneDetector, face_cascade, predict_face

_gaze = None
_phone = None


def _detectors():
    global _gaze, _phone
    if _gaze is None:
        _gaze = GazeDetector()
        _phone = PhoneDetector()
    return _gaze, _phone


def _stats_path(session_dir: str) -> str:
    return os.path.join(session_dir, "stats.json")


def _default_stats() -> dict:
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
    }


def load_stats(session_dir: str) -> dict:
    path = _stats_path(session_dir)
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fp:
            return json.load(fp)
    return _default_stats()


def save_stats(session_dir: str, stats: dict) -> None:
    os.makedirs(session_dir, exist_ok=True)
    with open(_stats_path(session_dir), "w", encoding="utf-8") as fp:
        json.dump(stats, fp, indent=2)


def cmd_init(session_dir: str) -> None:
    os.makedirs(os.path.join(session_dir, "pending"), exist_ok=True)
    save_stats(session_dir, _default_stats())


def _calibrate_gaze(gaze: GazeDetector, frame_bgr, stats: dict) -> None:
    if stats.get("calibrated"):
        return
    lm, w_px, h_px = gaze._detect(frame_bgr)
    if lm is None:
        return
    h, v = gaze._ratios(lm, w_px, h_px)
    if "calib_h" not in stats:
        stats["calib_h"] = []
        stats["calib_v"] = []
    stats["calib_h"].append(h)
    stats["calib_v"].append(v)
    stats["calibrationFrames"] = len(stats["calib_h"])
    if stats["calibrationFrames"] >= 25:
        stats["gaze_h_off"] = float(np.mean(stats["calib_h"])) - 0.5
        stats["gaze_v_off"] = float(np.mean(stats["calib_v"])) - 0.5
        gaze._h_off = stats["gaze_h_off"]
        gaze._v_off = stats["gaze_v_off"]
        gaze.calibrated = True
        stats["calibrated"] = True
        del stats["calib_h"]
        del stats["calib_v"]


def _process_one_frame(frame_bgr, stats: dict) -> None:
    gaze, phone = _detectors()

    phone_boxes = phone.process(frame_bgr)
    if phone_boxes:
        stats["phoneDetections"] = int(stats.get("phoneDetections", 0)) + 1
        stats["lastPhoneAt"] = datetime.utcnow().isoformat()

    if not stats.get("calibrated"):
        _calibrate_gaze(gaze, frame_bgr, stats)
        if not stats.get("calibrated"):
            return

    stats["framesAnalyzed"] = int(stats.get("framesAnalyzed", 0)) + 1
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(
        gray, scaleFactor=1.1, minNeighbors=5, minSize=(48, 48)
    )
    if len(faces) > 0:
        x, y, w, h = faces[0]
        label, _, _ = predict_face(gray[y : y + h, x : x + w])
        stats["lastDominantEmotion"] = label
        if label == "NEUTRAL":
            stats["neutralCount"] = int(stats.get("neutralCount", 0)) + 1
        else:
            stats["irritatedCount"] = int(stats.get("irritatedCount", 0)) + 1

    gaze_result = gaze.process(frame_bgr)
    if gaze_result.get("alert"):
        stats["gazeAlerts"] = int(stats.get("gazeAlerts", 0)) + 1


def cmd_process_pending(session_dir: str) -> int:
    pending_dir = os.path.join(session_dir, "pending")
    if not os.path.isdir(pending_dir):
        return 0
    files = sorted(
        f for f in os.listdir(pending_dir) if f.lower().endswith((".jpg", ".jpeg", ".png"))
    )
    if not files:
        return 0

    stats = load_stats(session_dir)
    processed = 0
    for name in files:
        path = os.path.join(pending_dir, name)
        frame = cv2.imread(path)
        if frame is None:
            os.remove(path)
            continue
        _process_one_frame(frame, stats)
        os.remove(path)
        processed += 1

    save_stats(session_dir, stats)
    return processed


def cmd_finalize(session_dir: str, output_path: str) -> None:
    cmd_process_pending(session_dir)
    stats = load_stats(session_dir)

    emotion_total = max(
        1, int(stats.get("neutralCount", 0)) + int(stats.get("irritatedCount", 0))
    )
    neutral_ratio = int(stats.get("neutralCount", 0)) / emotion_total
    irritated_ratio = int(stats.get("irritatedCount", 0)) / emotion_total
    dominant = stats.get("lastDominantEmotion") or (
        "NEUTRAL" if neutral_ratio >= irritated_ratio else "IRRITATED"
    )

    phone_frames = int(stats.get("phoneDetections", 0))
    gaze_alerts = int(stats.get("gazeAlerts", 0))
    frames = int(stats.get("framesAnalyzed", 0))

    risk_level = "low"
    if irritated_ratio > 0.45 or gaze_alerts > 5 or phone_frames > 3:
        risk_level = "high"
    elif irritated_ratio > 0.25 or gaze_alerts > 2 or phone_frames > 0:
        risk_level = "medium"

    payload = {
        "generatedAt": datetime.utcnow().isoformat(),
        "source": "python_interview_monitor",
        "framesAnalyzed": frames,
        "dominantEmotion": dominant,
        "neutralRatio": round(neutral_ratio, 3),
        "irritatedRatio": round(irritated_ratio, 3),
        "gazeAlerts": gaze_alerts,
        "phoneDetections": phone_frames,
        "riskLevel": risk_level,
        "calibrated": bool(stats.get("calibrated")),
    }
    if frames < 5:
        payload["warning"] = "Few frames analyzed — keep the camera visible while answering."

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as fp:
        json.dump(payload, fp, indent=2)


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)

    p_init = sub.add_parser("init")
    p_init.add_argument("--session-dir", required=True)

    p_proc = sub.add_parser("process")
    p_proc.add_argument("--session-dir", required=True)

    p_fin = sub.add_parser("finalize")
    p_fin.add_argument("--session-dir", required=True)
    p_fin.add_argument("--output", required=True)

    args = parser.parse_args()
    if args.command == "init":
        cmd_init(args.session_dir)
    elif args.command == "process":
        n = cmd_process_pending(args.session_dir)
        print(json.dumps({"processed": n}))
    elif args.command == "finalize":
        cmd_finalize(args.session_dir, args.output)
        print(args.output)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
