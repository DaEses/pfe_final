import '../styles/Navigation.css';

function Navigation({ currentPage, onNavigate, user, onLogout }) {
  return (
    <nav className="navbar">
      <div className="nav-header">
        <h2 className="nav-title">HR Platform</h2>
        <p className="nav-subtitle">Recruitment Management</p>
      </div>

      <ul className="nav-menu">
        <li>
          <button
            className={`nav-item ${currentPage === 'dashboard' ? 'active' : ''}`}
            onClick={() => onNavigate('dashboard')}
          >
            📊 Dashboard
          </button>
        </li>
        <li>
          <button
            className={`nav-item ${currentPage === 'jobs' ? 'active' : ''}`}
            onClick={() => onNavigate('jobs')}
          >
            💼 Job Postings
          </button>
        </li>
        <li>
          <button
            className={`nav-item ${currentPage === 'applicants' ? 'active' : ''}`}
            onClick={() => onNavigate('applicants')}
          >
            👥 Applicants
          </button>
        </li>
        <li>
          <button
            className={`nav-item ${currentPage === 'meetings' ? 'active' : ''}`}
            onClick={() => onNavigate('meetings')}
          >
            📅 Scheduled Meetings
          </button>
        </li>
      </ul>

      <div className="nav-footer">
        <div className="user-info">
          <div className="user-avatar">{user?.name?.[0]?.toUpperCase()}</div>
          <div>
            <p className="user-name">{user?.name}</p>
            <p className="user-email">{user?.email}</p>
          </div>
        </div>
        <button className="btn btn-secondary logout-btn" onClick={onLogout}>
          Logout
        </button>
      </div>
    </nav>
  );
}

export default Navigation;
