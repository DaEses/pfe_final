import requests
import json
import os
import tempfile
import threading
import wave
import whisper
import sounddevice as sd
import numpy as np
import argparse
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

def remove_silence_and_noise(audio_data, sample_rate=SAMPLE_RATE, threshold=0.02):
    """
    Aggressively remove leading/trailing silence and reduce background noise.
    Keep only the main speech content.
    """
    # Normalize audio
    max_val = np.max(np.abs(audio_data))
    if max_val == 0:
        return audio_data
    
    audio_normalized = audio_data.astype(np.float32) / max_val
    
    # Calculate energy with smoothing
    frame_size = sample_rate // 100  # 10ms frames
    energy = []
    for i in range(0, len(audio_normalized) - frame_size, frame_size):
        frame = audio_normalized[i:i + frame_size]
        energy.append(np.sqrt(np.mean(frame ** 2)))
    
    energy = np.array(energy)
    
    # Adaptive threshold - use 20% of max energy
    threshold_val = threshold * np.max(energy) if len(energy) > 0 else 0.01
    
    # Find regions with speech
    speech_frames = np.where(energy > threshold_val)[0]
    
    if len(speech_frames) == 0:
        return audio_data
    
    # Convert frame indices back to sample indices with generous buffers
    start_frame = max(0, speech_frames[0] - 5)  # ~50ms before speech
    end_frame = min(len(energy), speech_frames[-1] + 5)  # ~50ms after speech
    
    start_idx = start_frame * frame_size
    end_idx = end_frame * frame_size
    
    trimmed = audio_data[start_idx:end_idx]
    
    # Normalize the trimmed audio
    max_trimmed = np.max(np.abs(trimmed))
    if max_trimmed > 0:
        trimmed = (trimmed.astype(np.float32) / max_trimmed * 32767).astype(np.int16)
    
    return trimmed


def clean_repeated_text(text):
    """
    Aggressively remove all types of repetitive patterns from Whisper output.
    Handles progressive word-building (I -> I am -> I am an -> I am an applied...)
    and exact duplicates.
    """
    if not text:
        return text
    
    words = text.split()
    if len(words) < 2:
        return text
    
    # First pass: Remove exact duplicate consecutive words
    deduped = []
    for word in words:
        if not deduped or word.lower() != deduped[-1].lower():
            deduped.append(word)
    
    words = deduped
    
    # Second pass: Detect and remove progressive sequences
    # Example: ["I", "I", "am", "I", "am", "an", "I", "am", "an", "applied"]
    # Should become: ["I", "am", "an", "applied"]
    
    cleaned = []
    skip_until = 0
    
    for i in range(len(words)):
        if i < skip_until:
            continue
        
        # Check if this word starts a progressive repetition pattern
        # by looking for repeated prefixes
        is_progressive_repeat = False
        
        # Build a potential sequence from current position
        for end_pos in range(i + 1, min(i + 10, len(words) + 1)):
            current_seq = words[i:end_pos]
            seq_str = " ".join(current_seq)
            
            # Check if this exact sequence appears again later
            for future_start in range(end_pos, min(end_pos + 15, len(words))):
                future_seq = words[future_start:future_start + len(current_seq)]
                if future_seq and future_seq == current_seq:
                    # Found a repetition - skip the current and keep the later one
                    is_progressive_repeat = True
                    skip_until = end_pos + 1
                    break
            
            if is_progressive_repeat:
                break
        
        if not is_progressive_repeat:
            cleaned.append(words[i])
    
    # Third pass: If still very repetitive, extract only the longest unique subsequence
    result = " ".join(cleaned)
    
    # Count word diversity - if low, likely still hallucinating
    unique_words = len(set(w.lower() for w in cleaned))
    total_words = len(cleaned)
    
    if total_words > 0 and unique_words / total_words < 0.3:  # Less than 30% unique
        # Extract the longest increasing subsequence of words
        longest = []
        for i in range(len(words)):
            current = []
            last_pos = -1
            for j in range(i, len(words)):
                # Try to build a sequence without repeating words too much
                if words[j].lower() not in [w.lower() for w in current[-3:]]:
                    current.append(words[j])
                    last_pos = j
            
            if len(current) > len(longest):
                longest = current
        
        if longest:
            result = " ".join(longest)
    
    return result.strip()


def record_audio():
    """
    Record audio from the microphone using sounddevice.
    Press Enter to stop recording, or type 'quit' + Enter to exit mid-interview.
    Returns (tmp_wav_path, quit_requested).
    
    KEY FIX: Records into a single clean buffer only once, avoiding interim/partial captures.
    """
    print("\n🎤 Recording... Press Enter to stop  |  type 'quit' + Enter to end interview.")

    audio_data = []
    stop_event = threading.Event()

    def _record():
        """Record audio in a single pass - no interim captures."""
        try:
            with sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype="int16", blocksize=1024) as stream:
                while not stop_event.is_set():
                    chunk, overflowed = stream.read(1024)
                    if overflowed:
                        print("⚠️ Audio buffer overflow - some data may be lost")
                    # Only append complete chunks
                    if chunk is not None and len(chunk) == 1024:
                        audio_data.append(chunk.copy())
        except Exception as e:
            print(f"Recording error: {e}")

    rec_thread = threading.Thread(target=_record, daemon=True)
    rec_thread.start()

    user_input = input().strip().lower()
    stop_event.set()
    rec_thread.join(timeout=2)

    if user_input == "quit":
        return None, True

    if not audio_data:
        return None, False

    # Single concatenation - no re-processing of chunks
    final_audio = np.concatenate(audio_data, axis=0).astype(np.int16)
    
    # Trim silence from edges only (one pass)
    final_audio = trim_silence_edges(final_audio)

    # Write to file once
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp_path = tmp.name
    tmp.close()

    with wave.open(tmp_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(final_audio.tobytes())

    return tmp_path, False


def trim_silence_edges(audio_data, threshold_db=-40):
    """
    Trim only the leading and trailing silence (edges).
    Leave middle content intact - no re-processing.
    Apply gentle normalization to reduce noise artifacts.
    """
    if len(audio_data) == 0:
        return audio_data
    
    # Convert to float for calculation
    audio_float = audio_data.astype(np.float32) / 32768.0
    
    # Calculate power in dB
    power = np.abs(audio_float) ** 2
    power_db = 10 * np.log10(power + 1e-10)
    
    # Find first and last frames above threshold
    loud_frames = np.where(power_db > threshold_db)[0]
    
    if len(loud_frames) == 0:
        return audio_data
    
    # Trim only edges, keep all middle content
    start = max(0, loud_frames[0] - SAMPLE_RATE // 20)  # 50ms buffer
    end = min(len(audio_data), loud_frames[-1] + SAMPLE_RATE // 20)
    
    trimmed = audio_data[start:end]
    
    # Apply gentle noise gate to reduce low-volume artifacts
    # that can cause Whisper to hallucinate
    trimmed_float = trimmed.astype(np.float32) / 32768.0
    max_abs = np.max(np.abs(trimmed_float))
    
    if max_abs > 0:
        # Find RMS level
        rms = np.sqrt(np.mean(trimmed_float ** 2))
        # Apply gentle gate: if below 5% of max, reduce it
        noise_gate = 0.05 * max_abs
        mask = np.abs(trimmed_float) < noise_gate
        trimmed_float[mask] *= 0.1  # Reduce noise floor
        
        # Normalize to full range
        trimmed_float = trimmed_float / (max_abs * 1.1) * 0.95
        trimmed = (trimmed_float * 32767).astype(np.int16)
    
    return trimmed


def remove_progressive_repeats(text):
    """
    Remove progressive repetition patterns like:
    "I I am I am an I am an I am an app I am unemployed..."
    
    Strategy: Find progressively longer versions of the same prefix
    and keep only the longest version, removing all shorter intermediate builds.
    """
    if not text:
        return text
    
    words = text.split()
    
    if len(words) < 2:
        return text
    
    # Find all positions where each word appears
    # Then detect progressive patterns where word sequences keep extending
    
    result_indices = list(range(len(words)))
    indices_to_remove = set()
    
    # Detect when a sequence repeats but longer
    i = 0
    while i < len(words):
        # Try sequences of increasing length starting at position i
        for seq_len in range(1, min(6, len(words) - i + 1)):
            current_seq = words[i:i + seq_len]
            
            # Look for this sequence appearing again (same starting words)
            for future_i in range(i + 1, len(words)):
                # Check if words starting at future_i match our current sequence
                if future_i + seq_len <= len(words):
                    future_seq = words[future_i:future_i + seq_len]
                    
                    if current_seq == future_seq:
                        # Found a repeat - mark words from i to i+seq_len-1 for removal
                        # UNLESS we're at the beginning
                        if i > 0:
                            for idx in range(i, i + seq_len):
                                indices_to_remove.add(idx)
                        break
        i += 1
    
    # Build result excluding marked indices
    result_words = [words[i] for i in range(len(words)) if i not in indices_to_remove]
    
    if not result_words:
        return text
    
    result = " ".join(result_words)
    
    # Secondary pass: if result still seems repetitive, find longest increasing chain
    result_words = result.split()
    
    if len(result_words) > 15:  # Only for long results
        # Find longest chain that doesn't repeat too much
        unique_ratios = []
        for end_idx in range(len(result_words), len(result_words)//2, -1):
            candidate = result_words[:end_idx]
            unique = len(set(w.lower() for w in candidate))
            ratio = unique / len(candidate) if candidate else 0
            unique_ratios.append((end_idx, ratio))
        
        # Find the longest chunk with reasonable uniqueness (>40%)
        best_end = len(result_words)
        for end_idx, ratio in unique_ratios:
            if ratio > 0.4:
                best_end = end_idx
                break
        
        result = " ".join(result_words[:best_end])
    
    return result.strip()


def transcribe_audio(audio_path):
    """
    Transcribe audio ONCE with final result only.
    No interim/partial processing that causes repetition.
    """
    try:
        # Single transcription pass - get final result only
        result = whisper_model.transcribe(
            audio_path, 
            language="en", 
            fp16=False,
            temperature=0.0,
            verbose=False
        )
        
        # Extract only the final transcription text
        final_text = result["text"].strip()
        
        # Remove progressive repeats that Whisper generates
        final_text = remove_progressive_repeats(final_text)
        
        return final_text
        
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
    attempt = 0
    while True:
        attempt += 1
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
        print("\n--- Re-recording ---")


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
- Generate unique and thoughtful questions based on the job role, NOT just default questions.
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


def generate_interview_questions(job_role, resume_text=None):
    """
    Generate 6-8 interview questions using Ollama LLM.
    Returns a list of questions.
    """
    log_file = os.path.join(SCRIPT_DIR, 'debug.log')
    
    def log(msg):
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"{datetime.now().isoformat()} - {msg}\n")
    
    resume_section = ""
    if resume_text:
        resume_section = f"""

CANDIDATE'S RESUME:
\"\"\"
{resume_text[:3000]}
\"\"\"

- Reference their specific experience, skills, and projects when formulating questions.
"""

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
        log(f"[QUESTIONS] Sending request to Ollama at {OLLAMA_URL}, model={OLLAMA_MODEL}")
        resp = requests.post(OLLAMA_URL, json=payload, timeout=60)
        resp.raise_for_status()
        response_text = resp.json()["message"]["content"].strip()
        log(f"[QUESTIONS] Ollama response: {response_text[:200]}...")
        
        # Extract JSON array from response
        try:
            # Try to find JSON array in the response
            start = response_text.find('[')
            end = response_text.rfind(']') + 1
            if start != -1 and end > start:
                log(f"[QUESTIONS] Found JSON at positions {start}-{end}")
                questions = json.loads(response_text[start:end])
                if isinstance(questions, list):
                    log(f"[QUESTIONS] Successfully parsed {len(questions)} questions from Ollama")
                    return questions[:8]  # Limit to 8 questions
        except json.JSONDecodeError as je:
            log(f"[QUESTIONS] JSON parsing failed: {je}")
        
        log("[QUESTIONS] Falling back to default questions")
        # Fallback to default questions if parsing fails
        return [
            f"Please introduce yourself for the {job_role} role.",
            "Tell us about a project you are proud of.",
            "How do you handle deadlines and pressure?",
            "Describe a challenge you solved with your team.",
            "Why do you want to join this company?",
            f"What are your key strengths for a {job_role} position?",
            "How do you stay updated with industry trends?",
        ]
    except Exception as e:
        log(f"[QUESTIONS] Error generating questions: {e}")
        log("[QUESTIONS] Falling back to default questions")
        return [
            f"Please introduce yourself for the {job_role} role.",
            "Tell us about a project you are proud of.",
            "How do you handle deadlines and pressure?",
            "Describe a challenge you solved with your team.",
            "Why do you want to join this company?",
            f"What are your key strengths for a {job_role} position?",
            "How do you stay updated with industry trends?",
        ]


def save_transcript(job_role, transcript, output_path=None):
    """Save interview transcript to JSON file."""
    if output_path:
        filename = output_path
    else:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename  = f"{TRANSCRIPTS_DIR}/interview_{timestamp}.json"
    
    # Convert transcript to questions/answers format for backend compatibility
    qa_pairs = []
    current_question = None
    for entry in transcript:
        if entry["role"] == "HR Manager" and current_question is None:
            current_question = entry["content"]
        elif entry["role"] == "Candidate" and current_question:
            qa_pairs.append({
                "question": current_question,
                "answer": entry["content"]
            })
            current_question = None
        elif entry["role"] == "HR Manager":
            current_question = entry["content"]
    
    data = {
        "job_role":       job_role,
        "date":           datetime.now().isoformat(),
        "transcript":     transcript,
        "questionsAnswers": qa_pairs
    }
    
    # Create directory if needed
    os.makedirs(os.path.dirname(filename) or '.', exist_ok=True)
    
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return filename


# ── Interview Session ──────────────────────────────────────────

# Parse command-line arguments
parser = argparse.ArgumentParser(description='HR Interview Chatbot')
parser.add_argument('--job-role', type=str, default='', help='Job role being interviewed for')
parser.add_argument('--resume', type=str, default='', help='Path to resume text file')
parser.add_argument('--output', type=str, default='', help='Output transcript file path (optional)')
args = parser.parse_args()

job_role = args.job_role.strip() if args.job_role else ''

# ── Non-interactive mode (backend calling) ────────────────────
if job_role and args.output:
    debug_info = []
    
    debug_info.append(f"SCRIPT_DIR: {SCRIPT_DIR}")
    debug_info.append(f"OLLAMA_URL: {OLLAMA_URL}")
    debug_info.append(f"OLLAMA_MODEL: {OLLAMA_MODEL}")
    
    resume_text = None
    if args.resume and os.path.exists(args.resume):
        try:
            with open(args.resume, 'r', encoding='utf-8') as f:
                resume_text = f.read().strip()
            debug_info.append(f"Resume loaded: {len(resume_text)} characters")
        except Exception as e:
            debug_info.append(f"Warning: Could not read resume: {e}")
    
    # Generate questions using Ollama
    debug_info.append(f"Calling generate_interview_questions({job_role})")
    try:
        questions = generate_interview_questions(job_role, resume_text)
        debug_info.append(f"SUCCESS: Generated {len(questions)} questions")
    except Exception as e:
        debug_info.append(f"ERROR in generate_interview_questions: {e}")
        questions = [
            f"Please introduce yourself for the {job_role} role.",
            "Tell us about a project you are proud of.",
            "How do you handle deadlines and pressure?",
            "Describe a challenge you solved with your team.",
            "Why do you want to join this company?",
        ]
        debug_info.append(f"Using fallback: {len(questions)} questions")
    
    # Build mock transcript for backend
    transcript = []
    transcript.append({"role": "HR Manager", "content": f"Welcome to the interview for {job_role}. Thank you for taking the time to meet with me today. Let's begin!"})
    
    qa_pairs = []
    for i, question in enumerate(questions, 1):
        transcript.append({"role": "HR Manager", "content": f"Question {i}: {question}"})
        mock_answer = "[Candidate answer will be provided during interview]"
        transcript.append({"role": "Candidate", "content": mock_answer})
        qa_pairs.append({"question": question, "answer": mock_answer})
    
    transcript.append({"role": "HR Manager", "content": "Thank you for your responses. We'll be in touch with you soon."})
    
    # Save transcript
    data = {
        "job_role": job_role,
        "date": datetime.now().isoformat(),
        "transcript": transcript,
        "questionsAnswers": qa_pairs,
        "debug": debug_info
    }
    
    os.makedirs(os.path.dirname(args.output) or '.', exist_ok=True)
    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    exit(0)

# ── Interactive mode (user running directly) ──────────────────

# If no job role provided via CLI, prompt interactively
if not job_role:
    job_role = input("Enter the job role you are applying for: ").strip()
    if not job_role:
        job_role = "Software Engineer"
        print(f"No role specified, defaulting to: {job_role}")

resume_text = None

# Load resume from file path if provided
if args.resume and os.path.exists(args.resume):
    try:
        with open(args.resume, 'r', encoding='utf-8') as f:
            resume_text = f.read().strip()
        if resume_text:
            print(f"Resume loaded from file ({len(resume_text)} characters).")
        else:
            print("Resume file is empty.")
    except Exception as e:
        print(f"Error reading resume file: {e}")
elif args.resume:
    print(f"Resume file not found: {args.resume}")

# If no resume loaded from CLI and PDF available, offer interactive upload
if not resume_text and PDF_AVAILABLE:
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
filename = save_transcript(job_role, transcript, args.output if args.output else None)
print(f"\nTranscript saved to: {filename}")