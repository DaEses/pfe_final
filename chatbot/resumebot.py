import requests
import json
import os
import re
from datetime import datetime

try:
    from PyPDF2 import PdfReader
    PDF_AVAILABLE = True
except ImportError:
    PDF_AVAILABLE = False
    print("PyPDF2 not installed. Run: pip install PyPDF2")

# ── Configuration ──────────────────────────────────────────────
SCRIPT_DIR      = os.path.dirname(os.path.abspath(__file__))
OLLAMA_URL      = os.environ.get("OLLAMA_URL", "http://localhost:11434/api/chat")
OLLAMA_MODEL    = os.environ.get("OLLAMA_RESUME_MODEL", os.environ.get("OLLAMA_MODEL", "llama3"))
TRANSCRIPTS_DIR = os.path.join(SCRIPT_DIR, "transcripts")
RESUMES_DIR     = os.path.join(SCRIPT_DIR, "resumes")
os.makedirs(RESUMES_DIR, exist_ok=True)

# ── Load Most Recent Transcript ───────────────────────────────

def load_latest_transcript():
    if not os.path.exists(TRANSCRIPTS_DIR):
        return None, None
    files = [
        f for f in os.listdir(TRANSCRIPTS_DIR)
        if f.startswith("interview_") and f.endswith(".json")
    ]
    if not files:
        return None, None
    latest = sorted(files)[-1]
    path = os.path.join(TRANSCRIPTS_DIR, latest)
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return latest, data


def format_transcript_for_prompt(transcript_data):
    if not transcript_data:
        return ""
    lines = []
    for entry in transcript_data.get("transcript", []):
        lines.append(f"{entry['role']}: {entry['content']}")
    return "\n".join(lines)

# ── CV Extraction ─────────────────────────────────────────────

def extract_cv_text(pdf_path):
    if not PDF_AVAILABLE:
        print("PyPDF2 not available.")
        return None
    try:
        reader = PdfReader(pdf_path)
        text = ""
        for page in reader.pages:
            text += page.extract_text() or ""
        return text.strip()
    except Exception as e:
        print(f"WARNING: Could not read PDF: {e}")
        return None

# ── Ollama Chat ───────────────────────────────────────────────

def build_system_prompt(job_role, cv_text, transcript_summary):
    cv_section = f"""
CANDIDATE'S CV:
\"\"\"
{cv_text[:3000]}
\"\"\"
"""

    transcript_section = ""
    if transcript_summary:
        transcript_section = f"""
INTERVIEW TRANSCRIPT:
\"\"\"
{transcript_summary[:4000]}
\"\"\"
"""

    return f"""You are a professional resume-building assistant.

JOB ROLE APPLIED FOR: {job_role}

{cv_section}
{transcript_section}

YOUR GOAL:
Using ONLY the CV and interview transcript provided above, extract all relevant information and generate a complete professional resume JSON.

Do NOT ask the candidate any questions. Extract everything directly from the provided documents.

Output the final resume as a JSON object in this EXACT format:

[RESUME_JSON]
{{
  "candidate_name": "",
  "job_role_applied": "",
  "contact": {{
    "email": "",
    "phone": "",
    "location": ""
  }},
  "professional_summary": "",
  "education": [
    {{
      "degree": "",
      "institution": "",
      "graduation_year": ""
    }}
  ],
  "work_experience": [
    {{
      "job_title": "",
      "company": "",
      "duration": "",
      "responsibilities": []
    }}
  ],
  "skills": [],
  "interview_highlights": {{
    "job_role_interviewed_for": "",
    "key_answers": [],
    "strengths_observed": "",
    "recommendation": ""
  }}
}}
[/RESUME_JSON]

After the JSON, end your message with the exact phrase: [RESUME COMPLETE]"""


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
    
# ── Extract and Save Resume JSON ──────────────────────────────

def extract_resume_json(response_text):
    # Try with closing tag first
    match = re.search(r'\[RESUME_JSON\](.*?)\[/RESUME_JSON\]', response_text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError as e:
            print(f"WARNING: Could not parse resume JSON: {e}")

    # Fallback: extract from [RESUME_JSON] to [RESUME COMPLETE]
    match = re.search(r'\[RESUME_JSON\](.*?)\[RESUME COMPLETE\]', response_text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError as e:
            print(f"WARNING: Could not parse resume JSON (fallback): {e}")

    # Last resort: find the JSON object directly
    match = re.search(r'\[RESUME_JSON\](.*)', response_text, re.DOTALL)
    if match:
        raw = match.group(1).strip()
        # Remove any trailing tags
        raw = re.sub(r'\[.*?\]$', '', raw.strip()).strip()
        try:
            return json.loads(raw)
        except json.JSONDecodeError as e:
            print(f"WARNING: Could not parse resume JSON (last resort): {e}")

    return None


def save_resume(resume_data, candidate_name):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = candidate_name.replace(" ", "_").lower() if candidate_name else "unknown"
    filename = f"{RESUMES_DIR}/resume_{safe_name}_{timestamp}.json"
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(resume_data, f, indent=2, ensure_ascii=False)
    return filename

# ── Main ──────────────────────────────────────────────────────

# Load CV
if not PDF_AVAILABLE:
    print("ERROR: PyPDF2 is required. Run: pip install PyPDF2")
    exit()

cv_path = input("Enter path to your CV PDF: ").strip()
if not cv_path or not os.path.exists(cv_path):
    print(f"File not found: {cv_path}")
    exit()

cv_text = extract_cv_text(cv_path)
if not cv_text:
    print("Could not extract text from CV.")
    exit()

print(f"CV loaded ({len(cv_text)} characters extracted).")

# Load latest transcript
print("Loading latest interview transcript...")
transcript_filename, transcript_data = load_latest_transcript()

if transcript_data:
    job_role = transcript_data.get("job_role", "Unknown Role")
    print(f"Transcript loaded: {transcript_filename}")
    print(f"Job role detected: {job_role}")
else:
    print("No transcript found. Continuing without interview data.")
    job_role = input("Enter the job role the candidate applied for: ").strip() or "Unknown Role"

transcript_summary = format_transcript_for_prompt(transcript_data) if transcript_data else ""

print(f"\n{'='*60}")
print(f"  GENERATING RESUME — {job_role.upper()}")
print(f"{'='*60}")
print("(Thinking...)\n")

# Build and send single prompt
system_prompt = build_system_prompt(job_role, cv_text, transcript_summary)
messages = [
    {"role": "system", "content": system_prompt},
    {"role": "user", "content": "Please generate the resume JSON now."}
]

response = chat_with_ollama(messages)

# Extract and save
resume_data = extract_resume_json(response)
if resume_data:
    if transcript_data:
        highlights = resume_data.get("interview_highlights", {})
        highlights["job_role_interviewed_for"] = transcript_data.get("job_role", "")
        key_answers = []
        for entry in transcript_data.get("transcript", []):
            if entry["role"] == "Candidate" and len(entry["content"]) > 30:
                key_answers.append(entry["content"])
        highlights["key_answers"] = key_answers[:5]
        resume_data["interview_highlights"] = highlights

    candidate_name = resume_data.get("candidate_name", "unknown")
    filename = save_resume(resume_data, candidate_name)
    print(f"Resume saved to: {filename}")
    print("\n" + "=" * 60)
    print(json.dumps(resume_data, indent=2, ensure_ascii=False))
    print("=" * 60)
else:
    print("WARNING: Could not extract resume JSON.")
    print("\nRaw response:")
    print(response)

