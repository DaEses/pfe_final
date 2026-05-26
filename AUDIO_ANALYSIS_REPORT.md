# Audio Capture & Text Processing Analysis Report

## Overview
This report identifies all code related to audio capture, voice recording, speech-to-text, and text display during interviews in the chatbot and emotiondetection directories.

---

## 1. CHATBOT DIRECTORY - Audio Recording & Transcription

### File: `chatbot/api_runner.py`
**Purpose:** Standalone API for running interviews programmatically

**Audio Recording Function (Lines 76-106):**
```python
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
```

**Key Components:**
- Uses `sounddevice` library (`sd.rec()`) to capture audio
- Records at 16kHz sample rate
- Converts audio to numpy float32 format
- Uses Whisper model for speech-to-text transcription
- Returns transcribed text or error message

---

### File: `chatbot/hr_interview.py`
**Purpose:** Interactive CLI-based HR interview system with resume support

#### 1. Audio Recording Function (Lines 102-145):
```python
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
```

**Key Components:**
- Uses threading to record audio in background
- Saves audio to temporary WAV file
- Reads chunks of 1024 frames in real-time
- Allows user to quit during recording by typing "quit"

#### 2. Audio Transcription Function (Lines 147-157):
```python
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
```

**Key Components:**
- Uses Whisper model for transcription
- Deletes temporary WAV file after transcription
- Returns transcribed text

#### 3. **TEXT REPETITION/DISPLAY - Candidate Answer Loop (Lines 159-195):**
```python
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

        print(f"You (transcribed): {text}\n")  # ← TEXT REPETITION HERE
        confirm = input(
            "Send this answer? (Enter to confirm / r to re-record / quit to end): "
        ).strip().lower()

        if confirm == "quit":
            return None, True
        if confirm != "r":
            return text, False
        print("Re-recording...")
```

**KEY FINDING - Text Duplication:**
- **Line 185:** `print(f"You (transcribed): {text}\n")` - The transcribed text is displayed to the user
- The user can then confirm, re-record, or quit
- If re-recording, the entire process loops and displays the same text again
- This could appear as "text repetition" if multiple attempts are made

#### 4. **Main Interview Loop (Lines 500-530):**
```python
# Opening greeting
messages.append({
    "role": "user",
    "content": "The candidate has just joined the interview. Please greet them and begin."
})

response = chat_with_ollama(messages)
messages.append({"role": "assistant", "content": response})
transcript.append({"role": "HR Manager", "content": response})
print(f"HR Manager: {response}\n")  # ← HR Manager response displayed

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
    print(f"HR Manager: {response}\n")  # ← HR Manager response displayed again
```

**Key Flow:**
1. HR Manager question/greeting is printed
2. User records answer via `get_candidate_answer()`
3. Transcribed text is displayed (Line 185)
4. HR Manager response is printed
5. Loop repeats - text could appear to repeat if user re-records

---

## 2. EMOTIONDETECTION DIRECTORY - Emotion & Behavioral Monitoring

### File: `emotiondetection/models/interview_monitor.py`
**Purpose:** Real-time emotion and behavior detection during interviews

**Gaze Detection Class (Lines 96-200+):**
- Detects eye gaze direction using MediaPipe face landmarks
- Uses calibration to establish baseline gaze position
- Does NOT handle audio - monitors video only

**No Audio Processing:**
- This file focuses on face recognition, emotion detection, gaze tracking
- No audio capture or playback code present

### File: `emotiondetection/models/emotion_worker.py`
**Purpose:** Persistent interview monitor worker for incremental processing

**Key Functions:**
- `_process_one_frame()` - Processes individual frames for emotion/gaze analysis
- `cmd_process_pending()` - Processes queued frames
- `cmd_finalize()` - Finalizes session analysis

**No Audio Processing:**
- This file handles video frame analysis only
- No microphone, recording, or audio transcription code

### File: `emotiondetection/models/api_runner.py`
**Purpose:** API runner for emotion detection

**capture_emotion_summary() Function (Lines 10-70):**
```python
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
            # ... emotion and gaze detection logic ...
    finally:
        cap.release()
```

**No Audio Processing:**
- This is purely video-based emotion detection
- No audio capture or speech-to-text

### File: `emotiondetection/models/emotion_session_cli.py`
**Purpose:** Incremental interview monitoring from web client frames

**Key Functions:**
- `_calibrate_gaze()` - Calibrates gaze detection
- `_process_one_frame()` - Analyzes individual frame
- `cmd_process_pending()` - Processes pending frames
- `cmd_finalize()` - Finalizes session

**No Audio Processing:**
- Frame-by-frame analysis only
- No audio handling

---

## 3. LIBRARIES AND DEPENDENCIES

### Audio Processing Libraries:
- **sounddevice** - For audio input/output
- **wave** - For WAV file handling
- **whisper** - OpenAI's speech-to-text model
- **numpy** - For audio data manipulation

### Video Processing Libraries:
- **opencv-cv2** - For webcam video capture and processing
- **mediapipe** - For face landmark detection and gaze analysis
- **keras** - For emotion classification model

### Libraries NOT used for audio:
- No `pyttsx3` (text-to-speech) - No audio output/playback
- No `pyaudio` - Uses sounddevice instead
- No `librosa` - Direct numpy audio processing instead

---

## 4. TEXT REPETITION/DUPLICATION ANALYSIS

### Where Text Appears Multiple Times:

#### 1. **Transcribed Answer Confirmation (hr_interview.py)**
   - **Location:** `get_candidate_answer()` function, Line 185
   - **Code:** `print(f"You (transcribed): {text}\n")`
   - **When it happens:**
     - User records audio
     - Whisper transcribes to text
     - Text is printed for user confirmation
     - **If user selects 'r' to re-record**: Loop restarts and can print multiple times
     - **If multiple candidates**: Text could repeat across sessions
   - **Root Cause:** The confirmation loop allows re-recording, causing the display to repeat

#### 2. **Interview Q&A Display (hr_interview.py)**
   - **Location:** Main interview loop, Lines 516 & 527
   - **Instances:**
     - Line 516: `print(f"HR Manager: {response}\n")` - Initial greeting
     - Line 527: `print(f"HR Manager: {response}\n")` - After each candidate answer
   - **When it repeats:**
     - Each question/response is printed in sequence
     - Not a duplication issue - normal Q&A flow

#### 3. **Saved Transcript Storage**
   - **Location:** `save_transcript()` function (Lines 332-365)
   - **What happens:**
     - Same conversation is stored in multiple formats:
       - `transcript[]` - Full conversation history
       - `questionsAnswers[]` - Q&A pairs extracted
       - Both stored in same JSON file
   - **Not a display issue:** Backend storage deduplication

---

## 5. NO "PLAY" OR AUDIO PLAYBACK FUNCTIONALITY FOUND

### Evidence:
- No `pygame.mixer` usage
- No `playsound` library
- No `pyaudio` for playback
- No `pyttsx3` for text-to-speech
- No audio output code in any file
- All audio is INPUT (microphone recording) only

### Conclusion:
The system captures and transcribes audio but does NOT:
- Play back audio to users
- Convert text to speech
- Output any "play" button or audio playback UI

---

## 6. KEY FILES SUMMARY TABLE

| File | Purpose | Audio? | Video? | Text Display? |
|------|---------|--------|--------|---------------|
| `chatbot/api_runner.py` | Programmatic interview API | ✅ Record & transcribe | ❌ | ❌ |
| `chatbot/hr_interview.py` | Interactive CLI interview | ✅ Record & transcribe | ❌ | ✅ Transcribed text |
| `chatbot/resumebot.py` | Resume generation from interview | ❌ | ❌ | ✅ Resume JSON |
| `chatbot/question_picker.py` | Question selection utility | ❌ | ❌ | ❌ |
| `emotiondetection/models/interview_monitor.py` | Real-time emotion/gaze detection | ❌ | ✅ Live webcam | ✅ Frame overlay |
| `emotiondetection/models/emotion_worker.py` | Batch frame processing | ❌ | ✅ Saved frames | ❌ |
| `emotiondetection/models/api_runner.py` | Emotion summary API | ❌ | ✅ Live webcam | ❌ |
| `emotiondetection/models/emotion_session_cli.py` | Session frame processing | ❌ | ✅ Pending frames | ❌ |

---

## 7. POTENTIAL TEXT DUPLICATION ISSUES

### Issue 1: Re-recording Loop in hr_interview.py
**File:** `chatbot/hr_interview.py`, lines 159-195
**Problem:** When user selects "r" to re-record, the entire `get_candidate_answer()` loop runs again
**Effect:** 
- Same prompt "Recording... Press Enter to stop" prints multiple times
- Transcribed text `"You (transcribed): {text}\n"` can print multiple times
- User confirmation prompt repeats

**Code Flow:**
```
get_candidate_answer() called
  → record_audio() → print("🎤 Recording...")
  → transcribe_audio()
  → print(f"You (transcribed): {text}\n")  [TEXT APPEARS HERE]
  → User types "r" for re-record
  → Loop continues from top
  → record_audio() → print("🎤 Recording...") [REPEATS]
  → transcribe_audio()
  → print(f"You (transcribed): {text}\n")  [TEXT REPEATS HERE]
```

### Issue 2: Session File Duplication
**File:** `chatbot/resumebot.py` & `chatbot/hr_interview.py`
**Problem:** Transcript saved with both full history and Q&A pairs
**Effect:** Same conversation stored twice in JSON (not visible to user, backend only)

### Issue 3: Question Generation Fallback
**Files:** `chatbot/api_runner.py` (lines 62-78), `chatbot/hr_interview.py` (lines 280-302)
**Problem:** If LLM fails, fallback questions are used as defaults
**Effect:** Same default questions could appear in multiple interviews

---

## 8. RECOMMENDATIONS FOR FIXING TEXT DUPLICATION

### Fix 1: Add State Tracking to get_candidate_answer()
Replace the simple loop with a state machine that avoids reprinting unchanged prompts.

### Fix 2: Consolidate Transcription Display
Move the transcription display to a separate function with deduplication logic.

### Fix 3: Add Audio Output if Needed
If "play" functionality is required, implement:
- Text-to-speech with `pyttsx3` or API
- Audio file playback with `pygame` or `pyaudio`
- UI button or command to trigger playback

---

## 9. CONFIGURATION & ENVIRONMENT

### Audio Parameters:
- **Sample Rate:** 16000 Hz (16 kHz)
- **Channels:** 1 (mono)
- **Bit Depth:** 16-bit (int16)
- **Whisper Model:** "base" (60.5 MB)

### LLM Configuration:
- **Ollama URL:** `http://localhost:11434/api/chat`
- **Model:** "llama3" (configurable via OLLAMA_MODEL env var)

### Paths:
- **Transcripts:** `chatbot/transcripts/` (with timestamp: `interview_YYYYMMDD_HHMMSS.json`)
- **Resumes:** `chatbot/resumes/` (with timestamp: `resume_name_YYYYMMDD_HHMMSS.json`)

---

## 10. EXECUTION FLOW DIAGRAM

```
┌─────────────────────────────────────────┐
│  HR Interview Session (hr_interview.py) │
└──────────────┬──────────────────────────┘
               │
        ┌──────▼──────┐
        │  Load Model │
        │  + Whisper  │
        └──────┬──────┘
               │
        ┌──────▼──────────┐
        │ Load Resume PDF │
        │ (optional)      │
        └──────┬──────────┘
               │
        ┌──────▼────────────────┐
        │ Get Interview Role    │
        │ + System Prompt       │
        └──────┬────────────────┘
               │
        ┌──────▼────────────────────────────┐
        │ Loop: Question → Record → Confirm │
        │                                   │
        │ 1. display_question()             │
        │ 2. record_audio()                 │
        │    ├─ 🎤 recording...             │
        │    ├─ write to WAV                │
        │    └─ show tmp_path               │
        │ 3. transcribe_audio()             │
        │    ├─ Whisper model               │
        │    ├─ "You (transcribed): {X}"    │
        │    └─ delete WAV                  │
        │ 4. confirm_answer()               │
        │    ├─ Enter = send                │
        │    ├─ r = re-record ──────┐       │
        │    └─ quit = exit         │       │
        │                   (REPEAT)│       │
        │ 5. append to transcript   ◄───────┘
        │ 6. call_ollama()          
        │ 7. display_response()     
        │    "HR Manager: {Y}"      
        └──────┬────────────────────────────┘
               │
        ┌──────▼──────────────┐
        │ Save Transcript JSON │
        │ (interview_*.json)   │
        └──────────────────────┘
```

---

## CONCLUSION

The codebase implements a complete **audio capture and speech-to-text system** for HR interviews:

1. ✅ **Audio Recording** - Using sounddevice library in real-time
2. ✅ **Speech-to-Text** - Using OpenAI's Whisper model
3. ✅ **Transcription Display** - Showing transcribed text for confirmation
4. ❌ **Audio Playback** - NOT implemented (no "play" functionality)
5. ⚠️ **Text Repetition** - Occurs when user re-records answers in confirmation loop

**Main text repetition source:** The `get_candidate_answer()` loop in `hr_interview.py` (lines 159-195) prints transcribed text each iteration when re-recording is selected.

