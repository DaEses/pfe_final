import { useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { getHRToken } from '../services/api';
import '../styles/Navigation.css';
import '../styles/hr-shell.css';

function HRLayout() {
  const navigate = useNavigate();
  const token = getHRToken();
  const user = JSON.parse(localStorage.getItem('hrUser') || 'null');

  useEffect(() => {
    if (!token) {
      navigate('/login', { replace: true });
    }
  }, [token, navigate]);

  const handleLogout = () => {
    localStorage.removeItem('hrUserToken');
    localStorage.removeItem('hrUser');
    navigate('/login', { replace: true });
  };

  if (!token) return null;

  return (
    <div className="hr-shell">
      <nav className="navbar">
        <div className="nav-header">
          <div className="nav-brand">
            <img src="/assets/img/logo/logo.png" alt="Logo" className="nav-logo-img" />
          </div>
        </div>

        <ul className="nav-menu">
          <li>
            <NavLink
              to="/hr/dashboard"
              className={({ isActive }) =>
                `nav-item ${isActive ? 'active' : ''}`
              }
            >
              <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="9" rx="1" />
                <rect x="14" y="3" width="7" height="5" rx="1" />
                <rect x="14" y="12" width="7" height="9" rx="1" />
                <rect x="3" y="16" width="7" height="5" rx="1" />
              </svg>
              <span>Dashboard</span>
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/hr/jobs"
              className={({ isActive }) =>
                `nav-item ${isActive ? 'active' : ''}`
              }
            >
              <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
              <span>Job Postings</span>
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/hr/meetings"
              className={({ isActive }) =>
                `nav-item ${isActive ? 'active' : ''}`
              }
            >
              <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span>Scheduled Meetings</span>
            </NavLink>
          </li>
        </ul>

        <div className="nav-footer">
          {user && (
            <div className="user-info">
              <div className="user-avatar">
                {(user.firstName?.[0] || user.email?.[0] || 'U').toUpperCase()}
              </div>
              <div className="user-details">
                <p className="user-name">{user.firstName || user.companyName || 'Recruiter'}</p>
                <p className="user-email">{user.email}</p>
              </div>
            </div>
          )}
          <button
            className="btn btn-secondary logout-btn"
            onClick={handleLogout}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '16px', height: '16px' }}>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Logout</span>
          </button>
        </div>
      </nav>

      <main className="hr-main">
        <div className="hr-content-container">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default HRLayout;
