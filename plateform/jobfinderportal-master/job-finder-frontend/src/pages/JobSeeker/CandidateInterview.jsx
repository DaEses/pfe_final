import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiRequest, getJobSeekerToken } from '../../services/api';
import {
  openUserCamera,
  startParallelEmotionUpload,
  stopCameraStream,
} from '../../utils/interviewMonitor';
import '../../styles/CandidateInterview.css';

function CandidateInterview() {
  const { jobPostingId } = useParams();
  const navigate = useNavigate();
  const token = getJobSeekerToken();

  const [phase, setPhase] = useState('questions');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [session, setSession] = useState(null);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [listening, setListening] = useState(false);
  const [voiceHint, setVoiceHint] = useState('');
  const [monitor, setMonitor] = useState({
    framesAnalyzed: 0,
    phoneDetections: 0,
    gazeAlerts: 0,
    lastDominantEmotion: 'NEUTRAL',
    calibrated: false,
    alerts: [],
    gaze: 'center',
    calibrationFrames: 0,
  });
  const [monitorPreview, setMonitorPreview] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [doneResult, setDoneResult] = useState(null);

  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const stopMonitorRef = useRef(null);
  const recognitionRef = useRef(null);

  const loadSession = useCallback(async () => {
    if (!token) {
      navigate('/job-seeker/login');
      return;
    }
    try {
      setLoading(true);
      const { ok, data } = await apiRequest('/interviews/candidate/begin', {
        method: 'POST',
        token,
        body: { jobPostingId },
      });
      if (ok && data?.questions) {
        setSession(data);
        setAnswers(data.questions.map((q) => ({ question: q, answer: '' })));
        setError('');
      } else {
        setError(
          data?.message ||
            'Cannot start interview. HR must approve your application first.',
        );
      }
    } catch (e) {
      setError(`Network error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [jobPostingId, navigate, token]);

  useEffect(() => {
    loadSession();
    return () => {
      stopVoice();
      stopMonitorRef.current?.();
      stopCameraStream(cameraStreamRef.current);
    };
  }, [loadSession]);

  useEffect(() => {
    if (!session?.interviewId || phase !== 'questions') return undefined;

    let cancelled = false;

    const startCamera = async () => {
      try {
        const stream = await openUserCamera();
        if (cancelled) {
          stopCameraStream(stream);
          return;
        }
        cameraStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraError('');

        stopMonitorRef.current = startParallelEmotionUpload({
          videoEl: videoRef.current,
          canvasEl: overlayRef.current,
          interviewId: session.interviewId,
          token,
          apiRequest,
          onStatus: (data) => {
            const det = data.detection || {};
            if (data.previewBase64) {
              setMonitorPreview(`data:image/jpeg;base64,${data.previewBase64}`);
            }
            setMonitor((prev) => ({
              ...prev,
              framesAnalyzed: data.framesAnalyzed ?? prev.framesAnalyzed,
              phoneDetections: data.phoneDetections ?? prev.phoneDetections,
              gazeAlerts: data.gazeAlerts ?? prev.gazeAlerts,
              lastDominantEmotion:
                data.lastDominantEmotion ?? det.emotion ?? prev.lastDominantEmotion,
              calibrated: data.calibrated ?? prev.calibrated,
              calibrationFrames:
                data.calibrationFrames ?? prev.calibrationFrames,
              gaze: det.gaze ?? data.lastGazeDirection ?? prev.gaze,
              alerts: det.alerts ?? prev.alerts,
            }));
          },
        });
      } catch (e) {
        setCameraError(
          e.message ||
            'Allow camera access — emotion & phone detection run during the interview.',
        );
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      stopMonitorRef.current?.();
      stopMonitorRef.current = null;
    };
  }, [session?.interviewId, phase, token]);

  const stopVoice = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    }
    setListening(false);
  };

  const startVoiceInput = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceHint('Microphone speech is not supported here. Please type your answer.');
      return;
    }
    stopVoice();
    const recognition = new SpeechRecognition();
    recognition.lang = navigator.language?.startsWith('fr') ? 'fr-FR' : 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;
    setListening(true);
    setVoiceHint('Listening… speak clearly, then pause.');

    const timeout = setTimeout(() => {
      stopVoice();
      setVoiceHint('Voice timeout — you can edit the text or try again.');
    }, 20000);

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        transcript += event.results[i][0].transcript;
      }
      setCurrentAnswer((prev) => {
        const base = prev?.trim() || '';
        return base ? `${base} ${transcript.trim()}` : transcript.trim();
      });
    };
    recognition.onerror = (ev) => {
      clearTimeout(timeout);
      setListening(false);
      setVoiceHint(
        ev.error === 'not-allowed'
          ? 'Microphone blocked — allow access in the browser.'
          : 'Voice capture failed. Type your answer instead.',
      );
    };
    recognition.onend = () => {
      clearTimeout(timeout);
      setListening(false);
      setVoiceHint('Voice captured. Review or edit your answer below.');
    };
    try {
      recognition.start();
    } catch {
      clearTimeout(timeout);
      setListening(false);
      setVoiceHint('Could not start microphone. Type your answer.');
    }
  };

  const saveCurrentStepAnswer = () => {
    const updated = [...answers];
    updated[step] = {
      ...updated[step],
      answer: currentAnswer.trim() || updated[step].answer || '',
    };
    setAnswers(updated);
    return updated;
  };

  const goNext = () => {
    const updated = saveCurrentStepAnswer();
    if (!updated[step].answer?.trim()) {
      setError('Please type or record an answer before continuing.');
      return;
    }
    setError('');
    setCurrentAnswer('');
    if (step < answers.length - 1) {
      setStep(step + 1);
      setCurrentAnswer(updated[step + 1].answer || '');
    }
  };

  const goBack = () => {
    if (step > 0) {
      saveCurrentStepAnswer();
      const prev = step - 1;
      setStep(prev);
      setCurrentAnswer(answers[prev].answer || '');
      setError('');
    }
  };

  const finishInterview = async () => {
    const updated = saveCurrentStepAnswer();
    if (!updated[step].answer?.trim()) {
      setError('Please answer the last question before finishing.');
      return;
    }

    setSubmitting(true);
    setPhase('submitting');
    setError('');
    stopMonitorRef.current?.();
    stopMonitorRef.current = null;

    try {
      const { ok, data } = await apiRequest(
        `/interviews/candidate/${session.interviewId}/finish`,
        {
          method: 'POST',
          token,
          body: { questionsAnswers: updated },
        },
      );
      if (ok) {
        setDoneResult({ score: data.score, reportId: data.reportId });
        setPhase('done');
      } else {
        setError(data?.message || 'Failed to submit interview.');
        setPhase('questions');
      }
    } catch (e) {
      setError(`Network error: ${e.message}`);
      setPhase('questions');
    } finally {
      setSubmitting(false);
      stopCameraStream(cameraStreamRef.current);
      cameraStreamRef.current = null;
    }
  };

  if (loading) {
    return (
      <div className="candidate-interview">
        <div className="loading">Preparing your interview...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="candidate-interview">
        <div className="error-message">{error}</div>
        <button
          className="btn btn-secondary"
          onClick={() => navigate('/job-seeker/search')}
        >
          Back to applications
        </button>
      </div>
    );
  }

  if (phase === 'done' && doneResult) {
    return (
      <div className="candidate-interview">
        <div className="interview-session-card done-card">
          <h1>Interview completed</h1>
          <p className="done-score">
            Your score: <strong>{doneResult.score}/10</strong>
          </p>
          <p className="session-hint">
            Written answers and Python emotion monitoring (phone, gaze, expressions)
            were saved for HR.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate('/job-seeker/search')}
          >
            Back to my applications
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'submitting') {
    return (
      <div className="candidate-interview">
        <div className="interview-session-card">
          <h1>Finalizing report</h1>
          <p className="session-hint">
            Processing your answers and emotion analysis (YOLO phone detection, gaze,
            expressions)…
          </p>
          <div className="loading">This may take up to one minute…</div>
        </div>
      </div>
    );
  }

  const isLast = step === answers.length - 1;
  const progress = ((step + 1) / answers.length) * 100;
  const phoneAlert = monitor.phoneDetections > 0;
  const paperAlert = monitor.paperDetections > 0;

  return (
    <div className="candidate-interview">
      <div className="interview-session-card interview-layout">
        <div className="interview-main">
          <div className="session-header">
            <div>
              <h1>AI Interview</h1>
              <p className="session-subtitle">
                {session.jobTitle} — {session.candidateName}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => navigate('/job-seeker/search')}
              disabled={submitting}
            >
              Exit
            </button>
          </div>

          <p className="session-hint">
          The camera stays active while you answer. You will see colored boxes
          (face, phone) like the standalone Interview Monitor — powered by the same
          Python module (YOLO + gaze + emotions).
          </p>

          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <p className="progress-label">
            Question {step + 1} of {answers.length}
          </p>

          {error && <div className="error-message">{error}</div>}
          {cameraError && <div className="error-message">{cameraError}</div>}

          <div className="question-card">
            <h2 className="question-text">{answers[step]?.question}</h2>

            <label className="answer-label">Your answer (written or voice)</label>
            <textarea
              className="answer-input"
              rows={6}
              value={currentAnswer}
              onChange={(e) => setCurrentAnswer(e.target.value)}
              placeholder="Type your answer here…"
              disabled={submitting}
            />

            <div className="answer-actions">
              <button
                type="button"
                className={`btn btn-secondary btn-sm ${listening ? 'btn-active' : ''}`}
                onClick={startVoiceInput}
                disabled={submitting || listening}
              >
                {listening ? 'Listening…' : 'Use microphone'}
              </button>
            </div>
            {voiceHint && <p className="voice-hint">{voiceHint}</p>}
          </div>

          <div className="nav-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={goBack}
              disabled={step === 0 || submitting}
            >
              Previous
            </button>
            {!isLast ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={goNext}
                disabled={submitting}
              >
                Next question
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={finishInterview}
                disabled={submitting}
              >
                Finish interview
              </button>
            )}
          </div>
        </div>

        <aside className="monitor-panel">
          <p className="monitor-title">Live monitoring</p>
          <div className="monitor-video-wrap">
            <video ref={videoRef} className="monitor-video" playsInline muted autoPlay />
            {monitorPreview ? (
              <img src={monitorPreview} alt="Analysis" className="monitor-overlay" />
            ) : (
              <canvas ref={overlayRef} className="monitor-overlay" />
            )}
            <span className={`monitor-live ${cameraError ? 'off' : ''}`}>
              {cameraError ? 'Camera off' : 'REC'}
            </span>
          </div>
          {monitor.alerts?.length > 0 && (
            <p className="monitor-warning">{monitor.alerts.join(' · ')}</p>
          )}
          <ul className="monitor-stats">
            <li>
              <span>Frames</span>
              <strong>{monitor.framesAnalyzed}</strong>
            </li>
            <li>
              <span>Emotion</span>
              <strong>{monitor.lastDominantEmotion}</strong>
            </li>
            <li>
              <span>Gaze</span>
              <strong className={monitor.gaze !== 'center' ? 'stat-warn' : ''}>
                {String(monitor.gaze).toUpperCase()}
              </strong>
            </li>
            <li>
              <span>Gaze alerts</span>
              <strong>{monitor.gazeAlerts}</strong>
            </li>
            <li className={phoneAlert ? 'stat-alert' : ''}>
              <span>Phone</span>
              <strong>{monitor.phoneDetections}</strong>
            </li>
            <li className={paperAlert ? 'stat-alert' : ''}>
              <span>Paper</span>
              <strong>{monitor.paperDetections}</strong>
            </li>
          </ul>
          {phoneAlert && (
            <p className="monitor-warning">Phone detected — recorded in HR report.</p>
          )}
          {paperAlert && (
            <p className="monitor-warning">Paper/documents detected — recorded in HR report.</p>
          )}
          {!monitor.calibrated && (
            <p className="monitor-note">
              Calibrating gaze ({monitor.calibrationFrames || 0}/15) — look at the
              camera.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

export default CandidateInterview;
