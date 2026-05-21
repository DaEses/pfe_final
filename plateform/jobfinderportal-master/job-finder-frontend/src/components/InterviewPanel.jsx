import { useState, useEffect } from 'react';
import '../styles/interview-panel.css';

function InterviewPanel({ onStartInterview }) {
  const [interviews, setInterviews] = useState([]);
  const [upcomingInterviews, setUpcomingInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const token = localStorage.getItem('jobSeekerToken');

  useEffect(() => {
    fetchInterviews();
  }, []);

  const fetchInterviews = async () => {
    if (!token) {
      setError('Please login to view interviews');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('http://localhost:3000/api/interviews', {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch interviews');

      const data = await response.json();
      setInterviews(Array.isArray(data) ? data : []);

      // Separate upcoming and past interviews
      const now = new Date();
      const upcoming = data.filter(interview => {
        const interviewDate = new Date(interview.scheduledDateTime);
        return interviewDate > now && interview.status !== 'cancelled';
      });
      setUpcomingInterviews(upcoming);

      setError('');
    } catch (err) {
      setError('Failed to load interviews');
      setInterviews([]);
      setUpcomingInterviews([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status) => {
    const statusClass = {
      scheduled: 'status-scheduled',
      completed: 'status-completed',
      cancelled: 'status-cancelled',
      'no-show': 'status-noshow',
    }[status] || 'status-scheduled';

    return <span className={`status-badge ${statusClass}`}>{status}</span>;
  };

  const completedInterviews = interviews.filter(i => i.status === 'completed');

  return (
    <div className="interview-panel">
      <div className="interview-header">
        <h2>My Interviews</h2>
        <button className="btn btn-primary" onClick={onStartInterview}>
          + Start New Interview
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div className="loading">Loading interviews...</div>
      ) : (
        <>
          {upcomingInterviews.length > 0 && (
            <div className="interview-section">
              <h3>📅 Upcoming Interviews ({upcomingInterviews.length})</h3>
              <div className="interview-list">
                {upcomingInterviews.map(interview => (
                  <div key={interview.id} className="interview-card upcoming">
                    <div className="interview-info">
                      <div className="interview-details">
                        <h4>{interview.application?.jobPosting?.title || 'Interview'}</h4>
                        <p className="interview-company">
                          {interview.application?.jobPosting?.postedBy?.companyName || 'Company'}
                        </p>
                        <p className="interview-datetime">
                          📅 {formatDate(interview.scheduledDateTime)}
                        </p>
                        <p className="interview-type">
                          Type: {interview.type || 'Not specified'}
                        </p>
                        {interview.duration && (
                          <p className="interview-duration">⏱️ {interview.duration} minutes</p>
                        )}
                        {interview.meetingLink && (
                          <p className="interview-link">
                            <a href={interview.meetingLink} target="_blank" rel="noopener noreferrer">
                              Join Meeting →
                            </a>
                          </p>
                        )}
                      </div>
                      <div className="interview-status">
                        {getStatusBadge(interview.status)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {completedInterviews.length > 0 && (
            <div className="interview-section">
              <h3>✓ Interview History ({completedInterviews.length})</h3>
              <div className="interview-list">
                {completedInterviews.map(interview => (
                  <div key={interview.id} className="interview-card completed">
                    <div className="interview-info">
                      <div className="interview-details">
                        <h4>{interview.application?.jobPosting?.title || 'Interview'}</h4>
                        <p className="interview-company">
                          {interview.application?.jobPosting?.postedBy?.companyName || 'Company'}
                        </p>
                        <p className="interview-datetime">
                          📅 {formatDate(interview.scheduledDateTime)}
                        </p>
                        {interview.feedback && (
                          <p className="interview-feedback">Feedback: {interview.feedback}</p>
                        )}
                        {interview.score && (
                          <p className="interview-score">Score: {interview.score}/10</p>
                        )}
                      </div>
                      <div className="interview-status">
                        {getStatusBadge(interview.status)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {interviews.length === 0 && (
            <div className="empty-state">
              <p>No interviews yet. Start your first interview by clicking the button above!</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default InterviewPanel;
