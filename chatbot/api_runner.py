import argparse
import json
import os
from datetime import datetime

import numpy as np
import sounddevice as sd
import whisper
import requests

SAMPLE_RATE = 16000
WHISPER_MODEL = whisper.load_model("base")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434/api/chat")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3")


def generate_dynamic_questions(job_role: str, resume_text: str = "") -> list:
    """Generate 6-8 dynamic interview questions using Ollama LLM."""
    resume_section = ""
    if resume_text and resume_text.strip():
        resume_section = f"""

CANDIDATE'S RESUME:
\"\"\"
{resume_text[:3000]}
\"\"\"

Reference their specific experience, skills, and projects in your questions."""

    prompt = f"""You are an experienced HR manager. For a {job_role} position, generate 6-8 structured interview questions.{resume_section}

Return ONLY a JSON array with questions, like:
["Question 1?", "Question 2?", ...]

Generate questions that are:
- Behavioral (about past experiences)
- Technical (relevant to the role)
- Situational (how they handle challenges)
- Open-ended (not yes/no)

Output ONLY the JSON array, no other text."""

    messages = [{"role": "user", "content": prompt}]
    payload = {
        "model": OLLAMA_MODEL,
        "messages": messages,
        "stream": False
    }

    try:
        resp = requests.post(OLLAMA_URL, json=payload, timeout=60)
        resp.raise_for_status()
        response_text = resp.json()["message"]["content"].strip()
        
        # Extract JSON array
        start = response_text.find('[')
        end = response_text.rfind(']') + 1
        if start != -1 and end > start:
            questions = json.loads(response_text[start:end])
            if isinstance(questions, list) and len(questions) > 0:
                return questions[:8]
    except Exception as e:
        print(f"Warning: Could not generate questions with Ollama: {e}")
    
    # Fallback to default questions if Ollama fails
    return [
        f"Please introduce yourself for the {job_role} role.",
        f"What motivated you to apply for this {job_role} position?",
        "Tell us about a significant project or achievement you're proud of.",
        "How do you handle deadlines and pressure in a fast-paced environment?",
        "Describe a challenging situation you overcame and what you learned.",
        f"What are your key technical skills for a {job_role}?",
        "Why would you be a good fit for our team?",
    ]


def build_default_questions(job_role: str):
    """Legacy function - now uses dynamic generation."""
    return generate_dynamic_questions(job_role)


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


def run_interview(candidate_name: str, job_role: str, answer_seconds: int, resume_text: str = ""):
    questions = generate_dynamic_questions(job_role, resume_text)
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
    parser.add_argument("--candidate-name", required=False, default="Candidate")
    parser.add_argument("--job-role", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--answer-seconds", type=int, default=10)
    parser.add_argument("--resume", type=str, default="", help="Path to resume file")
    args = parser.parse_args()

    resume_text = ""
    if args.resume and os.path.exists(args.resume):
        try:
            with open(args.resume, 'r', encoding='utf-8') as f:
                resume_text = f.read()
        except Exception as e:
            print(f"Warning: Could not read resume: {e}")

    payload = run_interview(
        args.candidate_name,
        args.job_role,
        max(5, args.answer_seconds),
        resume_text,
    )
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as fp:
        json.dump(payload, fp, indent=2)

    print(args.output)


if __name__ == "__main__":
    main()
