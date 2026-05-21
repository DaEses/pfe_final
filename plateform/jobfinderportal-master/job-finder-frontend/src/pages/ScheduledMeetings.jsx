import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest, getHRToken } from '../services/api';
import '../styles/ScheduledMeetings.css';

function ScheduledMeetings() {
  const navigate = useNavigate();
  const token = getHRToken();
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const fetchMeetings = useCallback(async () => {
    if (!token) {
      navigate('/login');
      return;
    }
    try {
      setLoading(true);
      const { ok, data } = await apiRequest('/interviews', { token });
      if (ok && Array.isArray(data)) {
        setMeetings(data);
        setError('');
      } else {
        setMeetings([]);
        setError('Could not load scheduled meetings.');
      }
    } catch (e) {
      setError(`Network error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [navigate, token]);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  const runInterviewFlow = async (meeting) => {
    setActionLoading(true);
    setError('');
    try {
      const { ok } = await apiRequest(
        `/interviews/${meeting.id}/complete-and-generate-report`,
        { method: 'POST', token },
      );
      if (ok) {
        setSuccessMessage('Interview completed! Redirecting to report...');
        setTimeout(() => navigate(`/hr/reports/${meeting.id}`), 1500);
      } else {
        setError('Failed to complete interview. Check that Python venvs are installed (see README).');
      }
    } catch (e) {
      setError(`Interview error: ${e.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const upcomingMeetings = meetings.filter((m) => m.status !== 'completed');
  const completedMeetings = meetings.filter((m) => m.status === 'completed');

  return (
    <div className="scheduled-meetings">
      <div className="page-header">
        <div>
          <h1>Scheduled Meetings</h1>
          <p className="page-subtitle">
            Manage interview schedules. The candidate runs the interview (questions + webcam)
            from their account: My Applications → Start Interview.
          </p>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {successMessage && <div className="success-msg">{successMessage}</div>}

      <div className="meetings-sections">
        <div className="meetings-section">
          <h2>Upcoming Meetings ({upcomingMeetings.length})</h2>

          {loading ? (
            <div className="loading">Loading meetings...</div>
          ) : upcomingMeetings.length > 0 ? (
            <div className="meetings-list">
              {upcomingMeetings.map((meeting) => (
                <div key={meeting.id} className="meeting-card">
                  <div className="meeting-header">
                    <div>
                      <h3>{meeting.application?.applicantName || 'Candidate'}</h3>
                      <p className="meeting-position">
                        {meeting.application?.jobPosting?.title || 'Position'}
                      </p>
                    </div>
                    <span className="badge badge-info">{meeting.status}</span>
                  </div>

                  <div className="meeting-info-grid">
                    <div className="info-item">
                      <span className="info-label">Date & Time</span>
                      <span className="info-value">
                        {new Date(meeting.scheduledDateTime).toLocaleString()}
                      </span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Type</span>
                      <span className="info-value">{meeting.type || 'Video'}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Duration</span>
                      <span className="info-value">{meeting.duration || 30} min</span>
                    </div>
                    {meeting.meetingLink && (
                      <div className="info-item">
                        <span className="info-label">Link</span>
                        <a
                          href={meeting.meetingLink}
                          target="_blank"
                          rel="noreferrer"
                          className="info-value"
                        >
                          Join Meeting
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="meeting-actions">
                    <button
                      className="btn btn-warning btn-small"
                      onClick={() => runInterviewFlow(meeting)}
                      disabled={actionLoading}
                    >
                      {actionLoading ? 'Running...' : 'Generate HR report (server-side)'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>
                No upcoming meetings. Approve applicants from the Job Postings page
                to schedule interviews.
              </p>
            </div>
          )}
        </div>

        {completedMeetings.length > 0 && (
          <div className="meetings-section completed-section">
            <h2>Completed Meetings ({completedMeetings.length})</h2>
            <div className="meetings-list">
              {completedMeetings.map((meeting) => (
                <div key={meeting.id} className="meeting-card completed">
                  <div className="meeting-header">
                    <div>
                      <h3>{meeting.application?.applicantName || 'Candidate'}</h3>
                      <p className="meeting-position">
                        {meeting.application?.jobPosting?.title || 'Position'}
                      </p>
                    </div>
                    <span className="badge badge-success">Completed</span>
                  </div>
                  <div className="meeting-info-grid">
                    <div className="info-item">
                      <span className="info-label">Date</span>
                      <span className="info-value">
                        {new Date(meeting.scheduledDateTime).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className="meeting-actions">
                    <button
                      className="btn btn-secondary btn-small"
                      onClick={() => navigate(`/hr/reports/${meeting.id}`)}
                    >
                      View Report
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ScheduledMeetings;
