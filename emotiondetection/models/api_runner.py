import argparse
import json
import os
import time
from datetime import datetime

import cv2

from interview_monitor import PhoneDetector, PaperDetector, GazeDetector, face_cascade, predict_face


def capture_emotion_summary(duration_seconds: int):
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        return {
            "generatedAt": datetime.utcnow().isoformat(),
            "error": "Cannot open webcam.",
            "riskLevel": "unknown",
        }

    gaze = GazeDetector()
    phone = PhoneDetector()
    paper = PaperDetector(yolo_model=phone._model)  # Reuse YOLO model
    gaze.calibrate(cap, display=False)

    start = time.time()
    frames = 0
    neutral_count = 0
    irritated_count = 0
    gaze_alerts = 0
    phone_frames = 0
    paper_frames = 0

    try:
        while time.time() - start < duration_seconds:
            ok, frame = cap.read()
            if not ok:
                continue
            frames += 1
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = face_cascade.detectMultiScale(
                gray, scaleFactor=1.1, minNeighbors=5, minSize=(48, 48)
            )
            if len(faces) > 0:
                x, y, w, h = faces[0]
                label, _, _ = predict_face(gray[y : y + h, x : x + w])
                if label == "NEUTRAL":
                    neutral_count += 1
                else:
                    irritated_count += 1

            gaze_result = gaze.process(frame)
            if gaze_result.get("alert"):
                gaze_alerts += 1

            if len(phone.process(frame)) > 0:
                phone_frames += 1
            
            if len(paper.process(frame)) > 0:
                paper_frames += 1
    finally:
        cap.release()

    emotion_total = max(1, neutral_count + irritated_count)
    neutral_ratio = neutral_count / emotion_total
    irritated_ratio = irritated_count / emotion_total
    dominant = "NEUTRAL" if neutral_ratio >= irritated_ratio else "IRRITATED"

    risk_level = "low"
    if irritated_ratio > 0.45 or gaze_alerts > 5 or phone_frames > 10 or paper_frames > 15:
        risk_level = "high"
    elif irritated_ratio > 0.25 or gaze_alerts > 2 or phone_frames > 4 or paper_frames > 8:
        risk_level = "medium"

    return {
        "generatedAt": datetime.utcnow().isoformat(),
        "framesAnalyzed": frames,
        "dominantEmotion": dominant,
        "neutralRatio": round(neutral_ratio, 3),
        "irritatedRatio": round(irritated_ratio, 3),
        "gazeAlerts": gaze_alerts,
        "phoneDetections": phone_frames,
        "paperDetections": paper_frames,
        "riskLevel": risk_level,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--duration-seconds", type=int, default=20)
    args = parser.parse_args()

    payload = capture_emotion_summary(max(8, args.duration_seconds))
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as fp:
        json.dump(payload, fp, indent=2)

    # print(args.output)  # Suppressed to avoid JSON parse errors in backend


if __name__ == "__main__":
    main()
