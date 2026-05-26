import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest, getHRToken } from '../services/api';
import '../styles/Dashboard.css';

function Dashboard() {
  const [stats, setStats] = useState({
    totalJobs: 0,
    activeJobs: 0,
    totalApplicants: 0,
    scheduledMeetings: 0,
  });
  const [recentJobs, setRecentJobs] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('hrUser') || 'null');

  useEffect(() => {
    const token = getHRToken();
    if (!token) {
      navigate('/login');
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const [{ ok: jobsOk, data: jobs }, { data: ints }] = await Promise.all([
          apiRequest('/job-postings', { token }),
          apiRequest('/interviews/upcoming', { token }),
        ]);

        if (cancelled) return;

        if (jobsOk && Array.isArray(jobs)) {
          const totalApplicants = jobs.reduce(
            (acc, j) => acc + (j.applicantCount || 0),
            0,
          );
          setStats({
            totalJobs: jobs.length,
            activeJobs: jobs.filter((j) => j.status === 'active').length,
            totalApplicants,
            scheduledMeetings: Array.isArray(ints) ? ints.length : 0,
          });
          setRecentJobs(jobs.slice(0, 5));
        } else {
          setError('Could not load jobs.');
        }

        if (Array.isArray(ints)) {
          setUpcoming(ints.slice(0, 5));
        }
      } catch (e) {
        setError(`Network error: ${e.message}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <p className="header-subtitle">
          Welcome back{user ? `, ${user.firstName || user.email}` : ''}!
        </p>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div className="loading">Loading dashboard...</div>
      ) : (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">📋</div>
              <div className="stat-content">
                <p className="stat-label">Total Job Postings</p>
                <p className="stat-value">{stats.totalJobs}</p>
              </div>
            </div>
            <div className="stat-card stat-success">
              <div className="stat-icon">✅</div>
              <div className="stat-content">
                <p className="stat-label">Active Positions</p>
                <p className="stat-value">{stats.activeJobs}</p>
              </div>
            </div>
            <div className="stat-card stat-info">
              <div className="stat-icon">👥</div>
              <div className="stat-content">
                <p className="stat-label">Total Applicants</p>
                <p className="stat-value">{stats.totalApplicants}</p>
              </div>
            </div>
            <div className="stat-card stat-warning">
              <div className="stat-icon">📅</div>
              <div className="stat-content">
                <p className="stat-label">Upcoming Meetings</p>
                <p className="stat-value">{stats.scheduledMeetings}</p>
              </div>
            </div>
          </div>

          <div className="dashboard-content">
            <div className="content-section">
              <h2>Recent Job Postings</h2>
              {recentJobs.length > 0 ? (
                <div className="applications-list">
                  {recentJobs.map((job) => (
                    <div key={job.id} className="application-item">
                      <div className="app-info">
                        <h3>{job.title}</h3>
                        <p className="app-position">{job.location}</p>
                        <p className="app-date">
                          Applicants: {job.applicantCount || 0}
                        </p>
                      </div>
                      <div className="app-status">
                        <span className={`badge ${job.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
                          {job.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-state">No job postings yet.</p>
              )}
            </div>

            <div className="content-section">
              <h2>Upcoming Interviews</h2>
              {upcoming.length > 0 ? (
                <div className="meetings-list">
                  {upcoming.map((meeting) => (
                    <div key={meeting.id} className="meeting-item">
                      <div className="meeting-info">
                        <h3>{meeting.application?.applicantName || 'Candidate'}</h3>
                        <p className="meeting-position">
                          {meeting.application?.jobPosting?.title || ''}
                        </p>
                        <p className="meeting-datetime">
                          {new Date(meeting.scheduledDateTime).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-state">No upcoming interviews.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default Dashboard;
