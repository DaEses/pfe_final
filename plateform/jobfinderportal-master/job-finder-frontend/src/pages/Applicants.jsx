import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiRequest, getHRToken } from '../services/api';
import '../styles/Applicants.css';

function Applicants() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const token = getHRToken();
  const [applicants, setApplicants] = useState([]);
  const [selectedApplicant, setSelectedApplicant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const statusOptions = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'reviewed', label: 'Reviewed' },
    { value: 'shortlisted', label: 'Shortlisted' },
    { value: 'interview_scheduled', label: 'Interview Scheduled' },
    { value: 'interview_in_progress', label: 'Interview In Progress' },
    { value: 'interview_completed', label: 'Interview Completed' },
    { value: 'rejected', label: 'Rejected' }
  ];

  const fetchApplicants = useCallback(async () => {
    if (!token) {
      navigate('/login');
      return;
    }
    try {
      setLoading(true);
      const { ok, data } = await apiRequest(`/applications/job/${jobId}`, { token });
      if (ok && Array.isArray(data)) {
        setApplicants(data);
        setError('');
      } else {
        setApplicants([]);
        setError('Could not load applications for this job.');
      }
    } catch (e) {
      setError(`Network error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [jobId, navigate, token]);

  useEffect(() => {
    fetchApplicants();
  }, [fetchApplicants]);

  const filteredApplicants = useMemo(() => {
    if (filterStatus === 'all') return applicants;
    return applicants.filter((app) => app.status === filterStatus);
  }, [applicants, filterStatus]);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return <span className="badge badge-info">Under Review</span>;
      case 'reviewed':
        return <span className="badge badge-info">Reviewed</span>;
      case 'shortlisted':
        return <span className="badge badge-success">Shortlisted</span>;
      case 'interview_scheduled':
        return <span className="badge badge-warning">Interview Scheduled</span>;
      case 'interview_in_progress':
        return <span className="badge badge-warning">Interview In Progress</span>;
      case 'interview_completed':
        return <span className="badge badge-success">Interview Completed</span>;
      case 'rejected':
        return <span className="badge badge-danger">Rejected</span>;
      default:
        return <span className="badge">{status?.replace(/_/g, ' ')}</span>;
    }
  };

  const updateApplicantStatus = async (id, newStatus) => {
    setActionLoading(true);
    const { ok } = await apiRequest(`/applications/${id}/status`, {
      method: 'PATCH',
      token,
      body: { status: newStatus },
    });
    if (ok) {
      await fetchApplicants();
    }
    setSelectedApplicant(null);
    setActionLoading(false);
  };

  const approveAndSchedule = async (applicant) => {
    setActionLoading(true);
    const scheduledDateTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const { ok, data } = await apiRequest(
      `/applications/${applicant.id}/approve-and-schedule`,
      {
        method: 'POST',
        token,
        body: {
          interviewType: 'Video',
          scheduledDateTime,
          duration: 30,
        },
      },
    );
    if (ok) {
      await fetchApplicants();
      setSelectedApplicant({ ...applicant, interviews: [data.interview] });
    }
    setActionLoading(false);
  };

  const getApplicantScore = (applicant) => {
    const interview = applicant.interviews?.[0];
    if (interview?.score != null) return interview.score;
    if (applicant.rating != null) return applicant.rating;
    return null;
  };

  const viewReport = (applicant) => {
    const interviewId = applicant.interviews?.[0]?.id;
    if (interviewId) navigate(`/hr/reports/${interviewId}`);
  };

  const runInterviewFlow = async (applicant) => {
    const interviewId = applicant.interviews?.[0]?.id;
    if (!interviewId) return;
    if (applicant.status === 'interview_completed') {
      viewReport(applicant);
      return;
    }

    setActionLoading(true);
    const { ok, data } = await apiRequest(
      `/interviews/${interviewId}/complete-and-generate-report`,
      {
        method: 'POST',
        token,
      },
    );
    if (ok) {
      await fetchApplicants();
      navigate(`/hr/reports/${interviewId}`);
    } else {
      setError(data?.message || 'Could not generate report.');
    }
    setActionLoading(false);
  };

  return (
    <div className="applicants">
      <div className="page-header">
        <div>
          <h1>Applicants</h1>
          <p className="page-subtitle">
            Review applications. After you approve and schedule, the candidate starts the
            interview from their account (My Applications → Start Interview).
          </p>
        </div>
      </div>
      {error && <div className="error-message">{error}</div>}

      <div className="filter-section">
        <label>Filter by Status:</label>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="filter-select"
        >
          {statusOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="filter-count">Showing {filteredApplicants.length} applicant(s)</p>
      </div>

      <div className="applicants-container">
        {loading ? (
          <div className="loading">Loading applicants...</div>
        ) : filteredApplicants.length > 0 ? (
          <div className="applicants-table-wrapper">
            <table className="table applicants-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Position</th>
                  <th>Applied Date</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredApplicants.map(applicant => (
                  <tr key={applicant.id} className="applicant-row">
                    <td className="name-cell">
                      <strong>{applicant.applicantName}</strong>
                    </td>
                    <td>{applicant.jobPosting?.title || 'N/A'}</td>
                    <td>{new Date(applicant.appliedAt).toLocaleDateString()}</td>
                    <td>
                      <a href={`mailto:${applicant.applicantEmail}`}>{applicant.applicantEmail}</a>
                    </td>
                    <td>{getStatusBadge(applicant.status)}</td>
                    <td>
                      <div className="score-bar">
                        {(() => {
                          const s = getApplicantScore(applicant);
                          return (
                            <>
                              <div
                                className="score-fill"
                                style={{ width: `${(s ?? 0) * 10}%` }}
                              />
                              <span className="score-text">
                                {s != null ? `${s}/10` : '—'}
                              </span>
                            </>
                          );
                        })()}
                      </div>
                    </td>
                    <td>
                      <button
                        className="btn btn-secondary btn-small"
                        onClick={() => setSelectedApplicant(applicant)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <p>No applicants found with the selected filter.</p>
          </div>
        )}
      </div>

      {selectedApplicant && (
        <div className="modal active">
          <div className="modal-content detailed-modal">
            <div className="modal-header">
              <h2>{selectedApplicant.applicantName}</h2>
              <button
                className="modal-close"
                onClick={() => setSelectedApplicant(null)}
              >
                ✕
              </button>
            </div>

            <div className="applicant-details">
              <div className="detail-row">
                <span className="detail-label">Position:</span>
                <span className="detail-value">
                  {selectedApplicant.jobPosting?.title || 'N/A'}
                </span>
              </div>

              <div className="detail-row">
                <span className="detail-label">Email:</span>
                <a href={`mailto:${selectedApplicant.applicantEmail}`} className="detail-value">
                  {selectedApplicant.applicantEmail}
                </a>
              </div>

              <div className="detail-row">
                <span className="detail-label">Phone:</span>
                <a href={`tel:${selectedApplicant.applicantPhone}`} className="detail-value">
                  {selectedApplicant.applicantPhone}
                </a>
              </div>

              <div className="detail-row">
                <span className="detail-label">Applied Date:</span>
                <span className="detail-value">
                  {new Date(selectedApplicant.appliedAt).toLocaleDateString()}
                </span>
              </div>

              <div className="detail-row">
                <span className="detail-label">Status:</span>
                <span className="detail-value">
                  {getStatusBadge(selectedApplicant.status)}
                </span>
              </div>

              <div className="detail-row">
                <span className="detail-label">Evaluation Score:</span>
                <div className="score-bar-large">
                  {(() => {
                    const s = getApplicantScore(selectedApplicant);
                    const display = s != null ? s : '—';
                    const width = s != null ? s * 10 : 0;
                    return (
                      <>
                        <div className="score-fill" style={{ width: `${width}%` }} />
                        <span className="score-text">
                          {display}{s != null ? '/10' : ' (pending)'}
                        </span>
                      </>
                    );
                  })()}
                </div>
              </div>

              {selectedApplicant.status === 'interview_completed' &&
                selectedApplicant.interviews?.[0]?.id && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ width: '100%', marginBottom: '12px' }}
                    onClick={() => viewReport(selectedApplicant)}
                  >
                    View full interview report
                  </button>
                )}

              <div className="action-section">
                <label>Actions:</label>
                <div className="status-buttons">
                  <button
                    className="btn btn-secondary"
                    onClick={() => updateApplicantStatus(selectedApplicant.id, 'reviewed')}
                    disabled={actionLoading}
                  >
                    Mark Reviewed
                  </button>
                  <button
                    className="btn btn-success"
                    onClick={() => approveAndSchedule(selectedApplicant)}
                    disabled={actionLoading}
                  >
                    Approve + Schedule
                  </button>
                  <button
                    className="btn btn-warning"
                    onClick={() => runInterviewFlow(selectedApplicant)}
                    disabled={actionLoading || !selectedApplicant.interviews?.length}
                  >
                    {selectedApplicant.status === 'interview_completed'
                      ? 'Open interview report'
                      : 'Generate HR report (legacy)'}
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() => updateApplicantStatus(selectedApplicant.id, 'rejected')}
                    disabled={actionLoading}
                  >
                    Reject
                  </button>
                </div>
              </div>

              <button
                className="btn btn-secondary"
                onClick={() => setSelectedApplicant(null)}
                style={{ marginTop: '20px', width: '100%' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Applicants;
