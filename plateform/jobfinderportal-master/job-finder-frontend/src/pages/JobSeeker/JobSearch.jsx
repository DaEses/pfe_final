import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest, getJobSeekerToken } from '../../services/api';
import '../../styles/JobSeeker/job-search.css';

const SEEKER_STATUS_LABELS = {
  applied: 'Applied',
  reviewing: 'Under review',
  shortlisted: 'Shortlisted',
  interview_scheduled: 'Interview scheduled',
  interview_in_progress: 'Interview in progress',
  interview_completed: 'Interview completed',
  rejected: 'Rejected',
  accepted: 'Accepted',
  withdrawn: 'Withdrawn',
};

function getApplicationBadgeClass(status) {
  switch (status) {
    case 'applied':
    case 'reviewing':
      return 'badge-info';
    case 'shortlisted':
    case 'accepted':
    case 'interview_completed':
      return 'badge-success';
    case 'interview_scheduled':
    case 'interview_in_progress':
      return 'badge-warning';
    case 'rejected':
    case 'withdrawn':
      return 'badge-danger';
    default:
      return 'badge-info';
  }
}

function JobSearch() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    location: '',
    minSalary: '',
    maxSalary: '',
  });
  const [selectedJob, setSelectedJob] = useState(null);
  const [coverLetter, setCoverLetter] = useState('');
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [savedJobs, setSavedJobs] = useState([]);
  const [activeTab, setActiveTab] = useState('jobs');
  const [myApplications, setMyApplications] = useState([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const navigate = useNavigate();

  const token = getJobSeekerToken();
  const user = JSON.parse(localStorage.getItem('jobSeekerUser') || 'null');

  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.location) params.append('location', filters.location);
      if (filters.minSalary) params.append('minSalary', filters.minSalary);
      if (filters.maxSalary) params.append('maxSalary', filters.maxSalary);

      const { ok, data } = await apiRequest(`/jobs?${params.toString()}`);
      if (ok && Array.isArray(data)) {
        setJobs(data);
        setError('');
      } else {
        setJobs([]);
      }
    } catch {
      setError('Failed to load jobs');
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const fetchSavedJobs = useCallback(async () => {
    if (!token) return;
    try {
      const { ok, data } = await apiRequest('/saved-jobs', { token });
      if (ok && Array.isArray(data)) {
        setSavedJobs(data.map((s) => s.jobPostingId));
      }
    } catch {
      // silent for v1
    }
  }, [token]);

  const fetchMyApplications = useCallback(async () => {
    if (!token) return;
    try {
      setAppsLoading(true);
      const { ok, data } = await apiRequest('/job-applications', { token });
      if (ok && Array.isArray(data)) {
        setMyApplications(data);
      }
    } catch {
      // silent for v1
    } finally {
      setAppsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  useEffect(() => {
    if (token) fetchSavedJobs();
  }, [token, fetchSavedJobs]);

  useEffect(() => {
    if (activeTab === 'applications' && token) fetchMyApplications();
  }, [activeTab, token, fetchMyApplications]);

  useEffect(() => {
    if (activeTab !== 'applications' || !token) return undefined;
    const id = setInterval(fetchMyApplications, 15000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchMyApplications();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [activeTab, token, fetchMyApplications]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleApplyClick = (job) => {
    if (!token) {
      alert('Please login to apply for jobs');
      navigate('/job-seeker/login');
      return;
    }
    setSelectedJob(job);
    setShowApplyModal(true);
  };

  const handleApplySubmit = async () => {
    try {
      const { ok, data } = await apiRequest('/job-applications', {
        method: 'POST',
        token,
        body: { jobPostingId: selectedJob.id, coverLetter },
      });
      if (ok && data?.success !== false) {
        alert('Application submitted successfully!');
        setShowApplyModal(false);
        setCoverLetter('');
        setSelectedJob(null);
        fetchMyApplications();
      } else {
        alert(data?.message || 'Application failed');
      }
    } catch {
      alert('Failed to submit application');
    }
  };

  const handleSaveJob = async (jobId) => {
    if (!token) {
      alert('Please login to save jobs');
      return;
    }
    const isSaved = savedJobs.includes(jobId);
    try {
      const { ok } = await apiRequest(`/saved-jobs/${jobId}`, {
        method: isSaved ? 'DELETE' : 'POST',
        token,
      });
      if (ok) {
        setSavedJobs((prev) =>
          isSaved ? prev.filter((id) => id !== jobId) : [...prev, jobId],
        );
      }
    } catch {
      alert('Failed to update saved job');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('jobSeekerToken');
    localStorage.removeItem('jobSeekerUser');
    navigate('/job-seeker/login');
  };

  const handleStartInterview = (application) => {
    if (!token) {
      navigate('/job-seeker/login');
      return;
    }
    navigate(`/job-seeker/interview/${application.jobPostingId}`);
  };

  return (
    <div className="job-search">
      <div className="page-header">
        <div>
          <h1>Find Your Next Job</h1>
          <p className="page-subtitle">Browse and apply to open positions</p>
        </div>
        {token && user && (
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <p style={{ margin: 0 }}>
              Hello, <strong>{user.firstName}</strong>
            </p>
            <button className="btn btn-secondary btn-sm" onClick={handleLogout}>
              Logout
            </button>
          </div>
        )}
      </div>

      <div className="tabs-section">
        <button
          className={`tab-btn ${activeTab === 'jobs' ? 'active' : ''}`}
          onClick={() => setActiveTab('jobs')}
        >
          Find Jobs
        </button>
        <button
          className={`tab-btn ${activeTab === 'applications' ? 'active' : ''}`}
          onClick={() => setActiveTab('applications')}
        >
          My Applications
        </button>
      </div>

      {activeTab === 'jobs' ? (
        <>
          <div className="filter-section">
            <div className="filter-group">
              <label>Location</label>
              <input
                type="text"
                name="location"
                value={filters.location}
                onChange={handleFilterChange}
                placeholder="e.g., New York, Remote"
                className="filter-input"
              />
            </div>
            <div className="filter-group">
              <label>Min Salary ($)</label>
              <input
                type="number"
                name="minSalary"
                value={filters.minSalary}
                onChange={handleFilterChange}
                placeholder="Minimum"
                className="filter-input"
              />
            </div>
            <div className="filter-group">
              <label>Max Salary ($)</label>
              <input
                type="number"
                name="maxSalary"
                value={filters.maxSalary}
                onChange={handleFilterChange}
                placeholder="Maximum"
                className="filter-input"
              />
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          {loading ? (
            <div className="loading">Loading jobs...</div>
          ) : jobs.length > 0 ? (
            <div className="jobs-grid">
              {jobs.map((job) => (
                <div key={job.id} className="job-card">
                  <div className="job-header">
                    <div>
                      <h3>{job.title}</h3>
                      <p className="job-company">
                        {job.postedBy?.companyName || 'Company'}
                      </p>
                    </div>
                    <button
                      className="save-btn"
                      onClick={() => handleSaveJob(job.id)}
                      title={
                        savedJobs.includes(job.id) ? 'Unsave job' : 'Save job'
                      }
                    >
                      {savedJobs.includes(job.id) ? 'Saved' : 'Save'}
                    </button>
                  </div>

                  <p className="job-location">{job.location}</p>
                  {job.salary && (
                    <p className="job-salary">
                      ${Number(job.salary).toLocaleString()}/year
                    </p>
                  )}

                  <p className="job-description">
                    {(job.description || '').substring(0, 150)}
                    {job.description?.length > 150 ? '...' : ''}
                  </p>

                  <div className="job-actions">
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleApplyClick(job)}
                    >
                      Apply Now
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>No jobs found. Try adjusting your filters.</p>
            </div>
          )}
        </>
      ) : (
        <div className="applications-section">
          {!token ? (
            <div className="empty-state">
              <p>Please login to view your applications.</p>
            </div>
          ) : appsLoading ? (
            <div className="loading">Loading your applications...</div>
          ) : myApplications.length === 0 ? (
            <div className="empty-state">
              <p>You haven&apos;t applied to any jobs yet.</p>
            </div>
          ) : (
            <div className="jobs-grid">
              {myApplications.map((app) => (
                <div key={app.id} className="job-card">
                  <h3>{app.jobPosting?.title || 'Application'}</h3>
                  <p className="job-company">
                    {app.jobPosting?.postedBy?.companyName || 'Company'}
                  </p>
                  <p>
                    Applied:{' '}
                    {new Date(app.appliedAt).toLocaleDateString()}
                  </p>
                  <div className="job-actions" style={{ flexDirection: 'column', gap: '8px' }}>
                    <span className={`badge ${getApplicationBadgeClass(app.status)}`}>
                      {SEEKER_STATUS_LABELS[app.status] || app.status.replace(/_/g, ' ')}
                    </span>
                    {(app.status === 'interview_scheduled' || app.status === 'interview_in_progress') && (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleStartInterview(app)}
                        style={{ width: '100%' }}
                      >
                        Start Interview
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showApplyModal && selectedJob && (
        <div className="modal active">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Apply for {selectedJob.title}</h2>
              <button
                className="modal-close"
                onClick={() => setShowApplyModal(false)}
              >
                X
              </button>
            </div>

            <div className="apply-form">
              <div className="form-group">
                <label>Cover Letter (Optional)</label>
                <textarea
                  value={coverLetter}
                  onChange={(e) => setCoverLetter(e.target.value)}
                  placeholder="Tell the employer why you're interested..."
                  rows="6"
                />
              </div>

              <div className="modal-actions">
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowApplyModal(false)}
                >
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleApplySubmit}>
                  Submit Application
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default JobSearch;
