import { useState, useEffect } from 'react';
import '../styles/start-interview-modal.css';

function StartInterviewModal({ onClose, onInterviewStarted }) {
  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [interviewType, setInterviewType] = useState('Phone');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const token = localStorage.getItem('jobSeekerToken');

  useEffect(() => {
    fetchApplications();
  }, []);

  const fetchApplications = async () => {
    if (!token) {
      setError('Please login to start an interview');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('http://localhost:3000/api/job-applications', {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch applications');

      const data = await response.json();
      setApplications(Array.isArray(data) ? data : []);
      setError('');
    } catch (err) {
      setError('Failed to load your applications');
      setApplications([]);
    } finally {
      setLoading(false);
    }
  };

  const handleStartInterview = async (e) => {
    e.preventDefault();

    if (!selectedJobId) {
      setError('Please select a job application');
      return;
    }

    try {
      setSubmitting(true);
      const selectedApp = applications.find(app => app.id === selectedJobId);

      if (!selectedApp) {
        setError('Selected application not found');
        return;
      }

      const response = await fetch(
        `http://localhost:3000/api/interviews/${selectedJobId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            type: interviewType,
            scheduledDateTime: new Date().toISOString(),
            duration: 60,
          }),
        }
      );

      if (!response.ok) throw new Error('Failed to start interview');

      const result = await response.json();
      alert('Interview started! You will be contacted by the employer soon.');
      onInterviewStarted();
      onClose();
    } catch (err) {
      setError('Failed to start interview: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal active interview-modal">
      <div className="modal-content modal-lg">
        <div className="modal-header">
          <h2>Start New Interview</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        {loading ? (
          <div className="loading">Loading your applications...</div>
        ) : (
          <form onSubmit={handleStartInterview} className="interview-form">
            <div className="form-group">
              <label htmlFor="job-select">Select Job Application *</label>
              <select
                id="job-select"
                value={selectedJobId}
                onChange={(e) => setSelectedJobId(e.target.value)}
                className="form-control"
                required
              >
                <option value="">-- Choose a job you've applied for --</option>
                {applications.length > 0 ? (
                  applications.map(app => (
                    <option key={app.id} value={app.id}>
                      {app.jobPosting?.title || 'Unknown Position'} at{' '}
                      {app.jobPosting?.postedBy?.companyName || 'Company'}
                    </option>
                  ))
                ) : (
                  <option disabled>No applications found. Apply to jobs first!</option>
                )}
              </select>
              <small>You can only start interviews for jobs you've already applied to.</small>
            </div>

            <div className="form-group">
              <label htmlFor="interview-type">Interview Type *</label>
              <select
                id="interview-type"
                value={interviewType}
                onChange={(e) => setInterviewType(e.target.value)}
                className="form-control"
              >
                <option value="Phone">Phone Interview</option>
                <option value="Video">Video Interview</option>
                <option value="In-person">In-person Interview</option>
              </select>
            </div>

            <div className="interview-info-box">
              <h4>📋 How It Works:</h4>
              <ul>
                <li>Request an interview for your selected job application</li>
                <li>The employer will review your request and schedule a time</li>
                <li>You'll receive a confirmation with interview details</li>
                <li>Check your "Upcoming Interviews" section for scheduled interviews</li>
              </ul>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting || applications.length === 0}
              >
                {submitting ? 'Starting...' : 'Request Interview'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default StartInterviewModal;
