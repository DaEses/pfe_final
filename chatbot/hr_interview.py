import requests
import json
import os
import tempfile
import threading
import wave
import whisper
import sounddevice as sd
import numpy as np
from datetime import datetime

try:
    import fitz  # pymupdf
    PDF_AVAILABLE = True
    print("PyMuPDF loaded — PDF resume upload enabled.")
except ImportError:
    PDF_AVAILABLE = False
    print("PyMuPDF not installed. Run: pip install pymupdf")
    print("Continuing without resume upload support.")

# ── Configuration ──────────────────────────────────────────────
SCRIPT_DIR     = os.path.dirname(os.path.abspath(__file__))
OLLAMA_URL     = os.environ.get("OLLAMA_URL", "http://localhost:11434/api/chat")
OLLAMA_MODEL   = os.environ.get("OLLAMA_MODEL", "llama3")
TRANSCRIPTS_DIR = os.path.join(SCRIPT_DIR, "transcripts")
SAMPLE_RATE    = 16000
os.makedirs(TRANSCRIPTS_DIR, exist_ok=True)

# ── Load Whisper Model ─────────────────────────────────────────
print("Loading Whisper model...")
whisper_model = whisper.load_model("base")
print("Whisper ready.")

# ── Resume Extraction ──────────────────────────────────────────

def extract_resume_text(pdf_path):
    """
    Extract raw text from a PDF with PyMuPDF, then send it to the LLM
    to produce a clean, structured summary for use in the interview prompt.
    """
    if not PDF_AVAILABLE:
        return None

    # ── Step 1: raw text extraction ───────────────────────────
    try:
        doc = fitz.open(pdf_path)
        raw = "\n".join(page.get_text() for page in doc).strip()
        doc.close()
    except Exception as e:
        print(f"WARNING: Could not read PDF: {e}")
        return None

    if not raw:
        print("WARNING: PDF appears to be empty or image-only.")
        return None

    print("(Processing resume with LLM...)")

    # ── Step 2: LLM structuring ───────────────────────────────
    prompt_messages = [
        {
            "role": "system",
            "content": (
                "You are a resume parser. Given raw text extracted from a PDF resume, "
                "output a clean, structured summary with these sections (skip any that are absent):\n"
                "- Full Name\n"
                "- Contact Info\n"
                "- Summary / Objective\n"
                "- Skills\n"
                "- Work Experience (role, company, dates, key achievements)\n"
                "- Education\n"
                "- Certifications / Courses\n"
                "- Projects\n"
                "Be concise. Do not invent information. Output plain text, no markdown."
            )
        },
        {
            "role": "user",
            "content": f"Here is the raw resume text:\n\n{raw[:6000]}"
        }
    ]

    payload = {
        "model":    OLLAMA_MODEL,
        "messages": prompt_messages,
        "stream":   False
    }

    try:
        resp = requests.post(OLLAMA_URL, json=payload, timeout=60)
        resp.raise_for_status()
        structured = resp.json()["message"]["content"].strip()
        return structured
    except Exception as e:
        print(f"WARNING: LLM resume parsing failed ({e}). Using raw text instead.")
        return raw[:3000]   # fallback to raw text if LLM call fails


# ── sounddevice Recording & Transcription ─────────────────────

def record_audio():
    """
    Record audio from the microphone using sounddevice.
    Press Enter to stop recording, or type 'quit' + Enter to exit mid-interview.
    Returns (tmp_wav_path, quit_requested).
    """
    print("\n🎤 Recording... Press Enter to stop  |  type 'quit' + Enter to end interview.")

    audio_chunks = []
    stop_event   = threading.Event()

    def _record():
        with sd.InputStream(samplerate=SAMPLE_RATE, channels=1,
                            dtype="int16") as stream:
            while not stop_event.is_set():
                chunk, _ = stream.read(1024)
                audio_chunks.append(chunk)

    rec_thread = threading.Thread(target=_record, daemon=True)
    rec_thread.start()

    user_input = input().strip().lower()   # blocks until Enter
    stop_event.set()
    rec_thread.join()

    if user_input == "quit":
        return None, True          # signal: user wants to quit

    if not audio_chunks:
        return None, False

    audio_data = np.concatenate(audio_chunks, axis=0)

    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp_path = tmp.name
    tmp.close()

    with wave.open(tmp_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)          # int16 → 2 bytes
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(audio_data.tobytes())

    return tmp_path, False


def transcribe_audio(audio_path):
    """Transcribe a WAV file with Whisper, then delete it."""
    try:
        result = whisper_model.transcribe(audio_path, language="en")
        return result["text"].strip()
    except Exception as e:
        print(f"WARNING: Transcription failed: {e}")
        return None
    finally:
        try:
            os.remove(audio_path)
        except OSError:
            pass


def get_candidate_answer():
    """
    Record → transcribe → confirm loop.
    Returns (answer_text, quit_requested).
    """
    while True:
        audio_path, quit_flag = record_audio()

        if quit_flag:
            return None, True           # propagate quit

        if audio_path is None:
            print("No audio captured. Please try again.")
            continue

        print("(Transcribing...)\n")
        text = transcribe_audio(audio_path)

        if not text:
            print("Could not transcribe. Please try again.")
            continue

        print(f"You (transcribed): {text}\n")
        confirm = input(
            "Send this answer? (Enter to confirm / r to re-record / quit to end): "
        ).strip().lower()

        if confirm == "quit":
            return None, True
        if confirm != "r":
            return text, False
        print("Re-recording...")


# ── Ollama Chat ────────────────────────────────────────────────

def build_system_prompt(job_role, resume_text=None):
    resume_section = ""
    if resume_text:
        resume_section = f"""

CANDIDATE'S RESUME:
\"\"\"
{resume_text[:3000]}
\"\"\"

- Use the resume to ask targeted follow-up questions about their specific experience.
- Reference their listed skills, projects, or past roles when relevant.
- Verify claims made in the resume through your questions."""

    return f"""You are an experienced, professional HR manager conducting a job interview.

ROLE BEING INTERVIEWED FOR: {job_role}
{resume_section}

INSTRUCTIONS:
- Conduct a structured interview with 6-8 questions relevant to the "{job_role}" position.
- Ask ONE question at a time, then wait for the candidate's response.
- Start with a warm greeting and ask the candidate to introduce themselves.
- Mix behavioral questions ("Tell me about a time..."), technical questions, and situational questions appropriate for the role.
- After each candidate answer, you MUST:
  1. Briefly acknowledge their answer.
  2. Then ask the next question.
- Keep track of which question number you are on (e.g., question 2 of 7).
- After the last question, provide a brief evaluation summary covering:
  - Communication skills
  - Relevant experience
  - Strengths observed
  - Areas for improvement
  - Overall recommendation (Strongly Recommend / Recommend / Consider / Do Not Recommend)
- When you give the final evaluation, end your message with the exact phrase: [INTERVIEW COMPLETE]"""


def chat_with_ollama(messages):
    payload = {
        "model": OLLAMA_MODEL,
        "messages": messages,
        "stream": True
    }
    try:
        resp = requests.post(OLLAMA_URL, json=payload, timeout=120, stream=True)
        resp.raise_for_status()
        full_response = ""
        for line in resp.iter_lines():
            if line:
                chunk = json.loads(line)
                token = chunk.get("message", {}).get("content", "")
                full_response += token
                if chunk.get("done"):
                    break
        return full_response
    except requests.ConnectionError:
        return "ERROR: Cannot connect to Ollama. Make sure it is running."
    except Exception as e:
        return f"ERROR: {e}"


def save_transcript(job_role, transcript):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename  = f"{TRANSCRIPTS_DIR}/interview_{timestamp}.json"
    data = {
        "job_role":   job_role,
        "date":       datetime.now().isoformat(),
        "transcript": transcript
    }
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return filename


# ── Interview Session ──────────────────────────────────────────

job_role = input("Enter the job role you are applying for: ").strip()
if not job_role:
    job_role = "Software Engineer"
    print(f"No role specified, defaulting to: {job_role}")

resume_text = None
if PDF_AVAILABLE:
    resume_path = input("Enter path to your resume PDF (or press Enter to skip): ").strip()
    if resume_path and os.path.exists(resume_path):
        resume_text = extract_resume_text(resume_path)
        if resume_text:
            print(f"Resume loaded ({len(resume_text)} characters extracted).")
        else:
            print("Could not extract text from resume. Continuing without it.")
    elif resume_path:
        print(f"File not found: {resume_path}. Continuing without resume.")

print(f"\n{'='*60}")
print(f"  HR INTERVIEW SESSION — {job_role.upper()}")
print(f"{'='*60}")
print("Speak your answers. Press Enter to stop recording.")
print("Type 'quit' at any prompt (or during recording) to end early.")
print(f"{'='*60}\n")

system_prompt = build_system_prompt(job_role, resume_text)
messages   = [{"role": "system", "content": system_prompt}]
transcript = []

# Opening greeting
messages.append({
    "role": "user",
    "content": "The candidate has just joined the interview. Please greet them and begin."
})

response = chat_with_ollama(messages)
messages.append({"role": "assistant", "content": response})
transcript.append({"role": "HR Manager", "content": response})
print(f"HR Manager: {response}\n")

# ── Main interview loop ────────────────────────────────────────
while True:
    if "[INTERVIEW COMPLETE]" in response:
        print("\n" + "=" * 60)
        print("  Interview complete. Thank you!")
        print("=" * 60)
        break

    answer, quit_requested = get_candidate_answer()

    if quit_requested:
        print("\n⚠  Interview ended early by candidate.")
        transcript.append({"role": "System", "content": "Interview ended early by candidate."})
        break

    messages.append({"role": "user", "content": answer})
    transcript.append({"role": "Candidate", "content": answer})

    print("(Thinking...)\n")
    response = chat_with_ollama(messages)
    messages.append({"role": "assistant", "content": response})
    transcript.append({"role": "HR Manager", "content": response})
    print(f"HR Manager: {response}\n")

# ── Save transcript ────────────────────────────────────────────
filename = save_transcript(job_role, transcript)
print(f"\nTranscript saved to: {filename}")