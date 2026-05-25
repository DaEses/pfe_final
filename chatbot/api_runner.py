import argparse
import json
import os
from datetime import datetime

import numpy as np
import sounddevice as sd
import whisper

from question_picker import pick_question_strings

SAMPLE_RATE = 16000
WHISPER_MODEL = whisper.load_model("base")


def record_answer(seconds: int) -> str:
    try:
        recording = sd.rec(
            int(seconds * SAMPLE_RATE),
            samplerate=SAMPLE_RATE,
            channels=1,
            dtype="int16",
        )
        sd.wait()
        audio = recording.flatten().astype(np.float32) / 32768.0
        if audio.size == 0:
            return "No clear vocal response captured."

        # Pass numpy audio directly — avoids ffmpeg dependency on Windows
        result = WHISPER_MODEL.transcribe(audio, language="en", fp16=False)
        text = (result.get("text") or "").strip()
        return text if text else "No clear vocal response captured."
    except Exception as exc:
        return (
            f"Microphone unavailable or transcription failed ({exc}). "
            "Please check mic permissions and try again."
        )


def run_interview(
    candidate_name: str,
    job_role: str,
    answer_seconds: int,
    exclude_texts: list[str] | None = None,
):
    questions = pick_question_strings(job_role, exclude_texts=exclude_texts)
    questions_answers = []
    empty_count = 0

    for question in questions:
        answer = record_answer(answer_seconds)
        if answer == "No clear vocal response captured.":
            empty_count += 1
        questions_answers.append({"question": question, "answer": answer})

    if empty_count >= 3:
        hint = "Interview had limited vocal clarity. Recommend a follow-up round."
    else:
        hint = "Candidate completed vocal interview. Recommend HR final review."

    return {
        "candidateName": candidate_name,
        "jobRole": job_role,
        "generatedAt": datetime.utcnow().isoformat(),
        "questionsAnswers": questions_answers,
        "finalDecisionHints": hint,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidate-name", required=True)
    parser.add_argument("--job-role", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--answer-seconds", type=int, default=10)
    parser.add_argument(
        "--exclude-texts-file",
        default="",
        help="JSON file: array of question strings already used",
    )
    args = parser.parse_args()

    exclude_texts: list[str] = []
    if args.exclude_texts_file and os.path.isfile(args.exclude_texts_file):
        with open(args.exclude_texts_file, "r", encoding="utf-8") as fp:
            data = json.load(fp)
            if isinstance(data, list):
                exclude_texts = [str(x) for x in data]

    payload = run_interview(
        args.candidate_name,
        args.job_role,
        max(5, args.answer_seconds),
        exclude_texts=exclude_texts,
    )
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as fp:
        json.dump(payload, fp, indent=2)

    print(args.output)


if __name__ == "__main__":
    main()
