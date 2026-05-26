import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiRequest, getHRToken } from '../services/api';
import '../styles/InterviewReport.css';

function InterviewReport() {
  const { interviewId } = useParams();
  const navigate = useNavigate();
  const token = getHRToken();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const run = async () => {
      if (!token) {
        navigate('/login');
        return;
      }
      try {
        const { ok, data } = await apiRequest(
          `/interviews/${interviewId}/report`,
          { token },
        );
        if (ok && data) {
          setReport(data);
        } else {
          setError('Report not found yet. The interview may still be processing.');
        }
      } catch (e) {
        setError(`Network error: ${e.message}`);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [interviewId, navigate, token]);

  if (loading) return <div className="interview-report"><div className="loading">Loading interview report...</div></div>;
  if (error) return <div className="interview-report"><div className="error-message">{error}</div></div>;
  if (!report) return null;

  const emotion = report.emotionSummary || {};
  const riskClass =
    emotion.riskLevel === 'high'
      ? 'risk-high'
      : emotion.riskLevel === 'medium'
      ? 'risk-medium'
      : 'risk-low';

  return (
    <div className="interview-report">
      <div className="report-header">
        <h1>Interview Report</h1>
        <p className="candidate-name">Candidate: {report.candidateName}</p>
      </div>

      {report.application?.applicantResume?.trim() ? (
        <div className="report-card">
          <h3>CV / Resume</h3>
          {report.application.applicantResume.startsWith('data:application/pdf') ? (
            <iframe
              title="CV preview"
              src={report.application.applicantResume}
              style={{ width: '100%', height: '420px', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px' }}
            />
          ) : null}

          {!report.application.applicantResume.startsWith('data:') ? (
            <pre
              style={{
                maxHeight: '240px',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                fontSize: '12px',
                background: '#fafafa',
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid rgba(0,0,0,0.06)',
              }}
            >
              {report.application.applicantResume}
            </pre>
          ) : null}

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '10px' }}>
            <a
              className="btn btn-secondary btn-small"
              href={report.application.applicantResume}
              target="_blank"
              rel="noreferrer"
            >
              View CV
            </a>
            <a
              className="btn btn-primary btn-small"
              href={report.application.applicantResume}
              download="candidate-cv"
            >
              Download CV
            </a>
          </div>
        </div>
      ) : (
        <div className="report-card">
          <h3>CV / Resume</h3>
          <p className="report-note">No CV uploaded.</p>
        </div>
      )}

      {emotion.overallScore !== undefined && (
        <div className="report-card score-card">
          <h3>Overall Score</h3>
          <p className="score-value">{emotion.overallScore}/10</p>
        </div>
      )}

      <div className="report-card">
        <h3>Final Recommendation</h3>
        <p className="recommendation-text">
          {report.finalDecisionHints || 'No recommendation yet.'}
        </p>
      </div>

      <div className="report-card">
        <h3>Questions & Answers (written / voice transcript)</h3>
        <p className="report-note">
          Score uses 65% answer quality and 35% webcam presence analysis from the candidate session.
        </p>
        {(report.questionsAnswers || []).length === 0 && (
          <p className="report-note">No answers recorded yet.</p>
        )}
        {(report.questionsAnswers || []).map((item, idx) => (
          <div key={idx} className="qa-item">
            <p className="qa-question">
              Q{idx + 1}: {item.question}
            </p>
            <p className="qa-answer">{item.answer}</p>
          </div>
        ))}
      </div>

      {Object.keys(emotion).length > 0 && (
        <div className="report-card">
          <h3>Emotion & Behavior Analysis</h3>
          <div className="emotion-grid">
            {emotion.dominantEmotion && (
              <div className="emotion-stat">
                <p className="emotion-stat-label">Dominant Emotion</p>
                <p className="emotion-stat-value">{emotion.dominantEmotion}</p>
              </div>
            )}
            {emotion.neutralRatio !== undefined && (
              <div className="emotion-stat">
                <p className="emotion-stat-label">Neutral</p>
                <p className="emotion-stat-value">
                  {Math.round(emotion.neutralRatio * 100)}%
                </p>
              </div>
            )}
            {emotion.irritatedRatio !== undefined && (
              <div className="emotion-stat">
                <p className="emotion-stat-label">Irritated</p>
                <p className="emotion-stat-value">
                  {Math.round(emotion.irritatedRatio * 100)}%
                </p>
              </div>
            )}
            {emotion.lastGazeDirection && (
              <div className="emotion-stat">
                <p className="emotion-stat-label">Last Gaze</p>
                <p className="emotion-stat-value">
                  {String(emotion.lastGazeDirection).toUpperCase()}
                </p>
              </div>
            )}
            {emotion.gazeAlerts !== undefined && (
              <div className="emotion-stat">
                <p className="emotion-stat-label">Gaze Alerts</p>
                <p className="emotion-stat-value">{emotion.gazeAlerts}</p>
              </div>
            )}
            {emotion.phoneDetections !== undefined && (
              <div className="emotion-stat">
                <p className="emotion-stat-label">Phone Detections</p>
                <p
                  className={`emotion-stat-value ${
                    emotion.phoneDetections > 0 ? 'risk-high' : 'risk-low'
                  }`}
                >
                  {emotion.phoneDetections}
                  {emotion.phoneDetections > 0 ? ' — flagged' : ''}
                </p>
              </div>
            )}
            {emotion.source && (
              <div className="emotion-stat">
                <p className="emotion-stat-label">Analysis engine</p>
                <p className="emotion-stat-value">{String(emotion.source)}</p>
              </div>
            )}
            {emotion.riskLevel && (
              <div className="emotion-stat">
                <p className="emotion-stat-label">Risk Level</p>
                <p className={`emotion-stat-value ${riskClass}`}>
                  {emotion.riskLevel.toUpperCase()}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default InterviewReport;
