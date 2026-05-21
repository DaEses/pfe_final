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
          <h2 className="nav-title">HR Platform</h2>
          <p className="nav-subtitle">Recruitment Management</p>
        </div>

        <ul className="nav-menu">
          <li>
            <NavLink
              to="/hr/dashboard"
              className={({ isActive }) =>
                `nav-item ${isActive ? 'active' : ''}`
              }
            >
              Dashboard
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/hr/jobs"
              className={({ isActive }) =>
                `nav-item ${isActive ? 'active' : ''}`
              }
            >
              Job Postings
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/hr/meetings"
              className={({ isActive }) =>
                `nav-item ${isActive ? 'active' : ''}`
              }
            >
              Scheduled Meetings
            </NavLink>
          </li>
        </ul>

        <div className="nav-footer">
          {user && (
            <div className="user-info">
              <div className="user-avatar">
                {(user.firstName?.[0] || user.email?.[0] || 'U').toUpperCase()}
              </div>
              <div>
                <p className="user-name">{user.firstName || user.companyName || user.email}</p>
                <p className="user-email">{user.email}</p>
              </div>
            </div>
          )}
          <button
            className="btn btn-secondary logout-btn"
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      </nav>

      <main className="hr-main">
        <Outlet />
      </main>
    </div>
  );
}

export default HRLayout;
