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
    paperDetections: 0,
    gazeAlerts: 0,
    lastDominantEmotion: 'NEUTRAL',
    calibrated: false,
    alerts: [],
    gaze: 'center',
    gazeLabel: 'Looking Center',
    calibrationFrames: 0,
  });
  const [cameraError, setCameraError] = useState('');
  const [doneResult, setDoneResult] = useState(null);

  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const stopMonitorRef = useRef(null);
  const recognitionRef = useRef(null);
  const voiceSessionIdRef = useRef(0);
  const finalizeStartedRef = useRef(false);

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
      if (ok && Array.isArray(data?.questionsAnswers)) {
        setSession(data);
        setAnswers(data.questionsAnswers);
        const idx = Number.isInteger(data?.currentQuestionIndex)
          ? data.currentQuestionIndex
          : 0;
        setStep(Math.max(0, idx));
        setCurrentAnswer(data?.questionsAnswers?.[idx]?.answer || '');
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
            const gazeDir = det.gaze ?? data.lastGazeDirection ?? 'center';
            const gazeLabels = {
              left: 'Looking Left',
              right: 'Looking Right',
              center: 'Looking Center',
              up: 'Looking Up',
              calibrating: 'Calibrating',
              no_face: 'No Face',
            };
            setMonitor((prev) => ({
              ...prev,
              framesAnalyzed: data.framesAnalyzed ?? prev.framesAnalyzed,
              phoneDetections: data.phoneDetections ?? prev.phoneDetections,
              paperDetections: data.paperDetections ?? prev.paperDetections,
              gazeAlerts: data.gazeAlerts ?? prev.gazeAlerts,
              lastDominantEmotion:
                data.lastDominantEmotion ?? det.emotion ?? prev.lastDominantEmotion,
              calibrated: data.calibrated ?? prev.calibrated,
              calibrationFrames:
                data.calibrationFrames ?? prev.calibrationFrames,
              gaze: gazeDir,
              gazeLabel: det.gazeLabel ?? gazeLabels[gazeDir] ?? prev.gazeLabel,
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

  // (auto-finalize is declared later, after finishInterview)

  const stopVoice = () => {
    // Invalidate any pending callbacks from the current recognition session.
    voiceSessionIdRef.current += 1;
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

    const sessionId = ++voiceSessionIdRef.current;

    const recognition = new SpeechRecognition();
    recognition.lang = navigator.language?.startsWith('fr') ? 'fr-FR' : 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;
    setListening(true);
    setVoiceHint('Listening… speak clearly, then pause.');

    // Base at the moment microphone starts, so we don't re-insert old transcript.
    const baseAtStart = (currentAnswer || '').trim();

    // These two buffers keep the UI stable and prevent duplicate final chunks.
    let finalizedText = '';
    let interimText = '';
    let lastFinalChunk = '';
    let lastAppliedText = baseAtStart;

    const timeout = setTimeout(() => {
      stopVoice();
      setVoiceHint('Voice timeout — you can edit the text or try again.');
    }, 20000);

    recognition.onresult = (event) => {
      if (sessionId !== voiceSessionIdRef.current) return; // ignore late callbacks

      // Build progressive transcript from final chunks + latest interim.
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const res = event.results[i];
        const chunk = res?.[0]?.transcript?.trim() || '';
        if (!chunk) continue;

        if (res.isFinal) {
          // Ignore exact duplicates or already-ended content.
          const alreadyHas =
            chunk.toLowerCase() === lastFinalChunk.toLowerCase() ||
            (finalizedText && finalizedText.toLowerCase().endsWith(chunk.toLowerCase()));
          if (!alreadyHas) {
            finalizedText = finalizedText
              ? `${finalizedText} ${chunk}`
              : chunk;
            lastFinalChunk = chunk;
          }
          interimText = '';
        } else {
          interimText = chunk;
        }
      }

      const merged = [baseAtStart, finalizedText, interimText]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (merged && merged !== lastAppliedText) {
        lastAppliedText = merged;
        setCurrentAnswer(merged);
      }
    };
    recognition.onerror = (ev) => {
      clearTimeout(timeout);
      if (sessionId !== voiceSessionIdRef.current) return;
      setListening(false);
      setVoiceHint(
        ev.error === 'not-allowed'
          ? 'Microphone blocked — allow access in the browser.'
          : 'Voice capture failed. Type your answer instead.',
      );
    };
    recognition.onend = () => {
      clearTimeout(timeout);
      if (sessionId !== voiceSessionIdRef.current) return;
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

  const finishInterview = async (finalQuestionsAnswers) => {
    const updated = finalQuestionsAnswers ?? saveCurrentStepAnswer();
    const lastAnswer = updated?.[updated.length - 1]?.answer;
    if (!lastAnswer?.trim()) {
      setError('Please answer the last question before finishing.');
      return;
    }

    setSubmitting(true);
    setPhase('submitting');
    setError('');
    stopVoice();
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

  useEffect(() => {
    if (!session?.isComplete) return;
    if (phase !== 'questions') return;
    if (finalizeStartedRef.current) return;
    finalizeStartedRef.current = true;
    // Finalize and create HR report even after reconnect/reload.
    finishInterview(session.questionsAnswers);
  }, [session?.isComplete, phase]);

  const submitCurrentAnswer = async () => {
    const updated = saveCurrentStepAnswer();
    if (!updated[step]?.answer?.trim()) {
      setError('Please type or record an answer before continuing.');
      return;
    }

    setError('');
    stopVoice();
    setSubmitting(true);

    try {
      const { ok, data } = await apiRequest(
        `/interviews/candidate/${session.interviewId}/answer`,
        {
          method: 'POST',
          token,
          body: { answer: updated[step].answer },
        },
      );

      if (!ok) {
        setError(data?.message || 'Failed to continue interview.');
        setSubmitting(false);
        return;
      }

      if (data?.done) {
        await finishInterview(data?.questionsAnswers);
        return;
      }

      const nextAnswers = Array.isArray(data?.questionsAnswers)
        ? data.questionsAnswers
        : updated;

      setAnswers(nextAnswers);
      const pendingIdx = nextAnswers.findIndex(
        (qa) => !(qa.answer || '').trim(),
      );
      const nextIdx = pendingIdx === -1 ? step : pendingIdx;
      setStep(nextIdx);
      setCurrentAnswer(nextAnswers[nextIdx]?.answer || '');
      setVoiceHint('');
    } catch (e) {
      setError(`Network error: ${e.message}`);
    } finally {
      setSubmitting(false);
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

  const totalQuestions = answers.length || 1;
  const answeredCount = answers.filter((qa) => (qa.answer || '').trim()).length;
  const progress = (answeredCount / totalQuestions) * 100;
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
            Question {answeredCount + 1}
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
              disabled={true}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={submitCurrentAnswer}
              disabled={submitting}
            >
              Submit answer
            </button>
          </div>
        </div>

        <aside className="monitor-panel">
          <p className="monitor-title">Live monitoring</p>
          <div className="monitor-video-wrap">
            <video ref={videoRef} className="monitor-video" playsInline muted autoPlay />
            <canvas ref={overlayRef} className="monitor-overlay" />
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
                {monitor.gazeLabel || 'Looking Center'}
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
