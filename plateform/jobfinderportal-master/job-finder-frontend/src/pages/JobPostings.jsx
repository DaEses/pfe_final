import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest, getHRToken } from '../services/api';
import '../styles/JobPostings.css';

const initialForm = {
  title: '',
  position: '',
  location: '',
  description: '',
  requirements: '',
  salary: '',
};

function JobPostings() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const navigate = useNavigate();

  const token = getHRToken();

  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      const { ok, data } = await apiRequest('/job-postings', { token });
      if (ok && Array.isArray(data)) {
        setJobs(data);
        setError('');
      } else {
        setError('Could not load job postings.');
      }
    } catch (e) {
      setError(`Network error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    fetchJobs();
  }, [token, navigate, fetchJobs]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const formatApiError = (data) => {
    if (!data?.message) return 'Could not create posting.';
    if (Array.isArray(data.message)) return data.message.join(' ');
    return String(data.message);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const payload = { ...formData };
      if (payload.salary) {
        const salaryNum = Number(payload.salary);
        if (Number.isNaN(salaryNum) || salaryNum < 0 || salaryNum > 99999999) {
          setError(
            'Salary must be between 0 and 99,999,999 (annual, in dollars).',
          );
          setSubmitting(false);
          return;
        }
        payload.salary = salaryNum;
      } else {
        delete payload.salary;
      }

      const { ok, data } = await apiRequest('/job-postings', {
        method: 'POST',
        token,
        body: payload,
      });

      if (ok && data?.id) {
        setSuccessMessage('Job posting created successfully!');
        setTimeout(() => setSuccessMessage(''), 3000);
        setFormData(initialForm);
        setShowModal(false);
        fetchJobs();
      } else {
        setError(formatApiError(data));
      }
    } catch (err) {
      setError(`Network error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this job posting?')) return;
    const { ok } = await apiRequest(`/job-postings/${id}`, {
      method: 'DELETE',
      token,
    });
    if (ok) {
      fetchJobs();
    } else {
      alert('Could not delete posting.');
    }
  };

  return (
    <div className="job-postings">
      <div className="page-header">
        <div>
          <h1>Job Postings</h1>
          <p className="page-subtitle">Manage your open positions</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setError('');
            setShowModal(true);
          }}
        >
          + Create New Job
        </button>
      </div>

      {successMessage && <div className="success-msg">{successMessage}</div>}
      {error && <div className="error-message">{error}</div>}

      <div className="jobs-container">
        {loading ? (
          <div className="loading">Loading...</div>
        ) : jobs.length > 0 ? (
          <div className="jobs-grid">
            {jobs.map((job) => (
              <div key={job.id} className="job-card">
                <div className="job-header">
                  <h3>{job.title}</h3>
                  <span
                    className={`badge ${
                      job.status === 'active' ? 'badge-success' : 'badge-warning'
                    }`}
                  >
                    {job.status}
                  </span>
                </div>
                <p className="job-department">Position: {job.position}</p>
                <p className="job-location">{job.location}</p>
                {job.salary && (
                  <p className="job-date">
                    Salary: ${Number(job.salary).toLocaleString()}/year
                  </p>
                )}

                <div className="job-stats">
                  <div className="stat">
                    <span className="stat-number">
                      {job.applicantCount || 0}
                    </span>
                    <span className="stat-label">Applicants</span>
                  </div>
                  <div className="stat">
                    <span className="stat-number" style={{ color: job.status === 'active' ? 'var(--success)' : 'var(--warning)' }}>
                      {job.status === 'active' ? '●' : '○'}
                    </span>
                    <span className="stat-label">{job.status}</span>
                  </div>
                </div>

                <div className="job-actions">
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={() => navigate(`/hr/jobs/${job.id}/applicants`)}
                  >
                    View Applicants
                  </button>
                  <button
                    className="btn btn-danger btn-small"
                    onClick={() => handleDelete(job.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>No job postings yet. Create one to get started!</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal active">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Create New Job Posting</h2>
              <button
                className="modal-close"
                onClick={() => setShowModal(false)}
              >
                X
              </button>
            </div>

            <form onSubmit={handleSubmit} className="job-form">
              <div className="form-group">
                <label>Job Title *</label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Position *</label>
                  <input
                    type="text"
                    name="position"
                    value={formData.position}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Location *</label>
                  <input
                    type="text"
                    name="location"
                    value={formData.location}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Salary (optional, annual USD)</label>
                <input
                  type="number"
                  name="salary"
                  min="0"
                  max="99999999"
                  step="1000"
                  value={formData.salary}
                  onChange={handleChange}
                  placeholder="e.g. 50000"
                />
                <small className="form-hint">Maximum: 99,999,999</small>
              </div>

              <div className="form-group">
                <label>Job Description *</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label>Requirements</label>
                <textarea
                  name="requirements"
                  value={formData.requirements}
                  onChange={handleChange}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting}
                >
                  {submitting ? 'Creating...' : 'Create Job Posting'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default JobPostings;
