import { Link, useLocation } from 'react-router-dom';
import { getJobSeekerToken, getHRToken } from '../services/api';
import '../styles/Header.css';

function Header() {
  const location = useLocation();
  const isCandidateLoggedIn = Boolean(getJobSeekerToken());
  const isHRLoggedIn = Boolean(getHRToken());

  return (
    <header className="site-header">
      <div className="container header-container">
        <div className="logo-area">
          <Link to="/" className="logo-link">
            <img src="/assets/img/logo/logo.png" alt="Job Finder Logo" className="brand-logo" />
          </Link>
        </div>

        <nav className="nav-menu">
          <ul>
            <li>
              <Link to="/" className={location.pathname === '/' ? 'active' : ''}>
                Home
              </Link>
            </li>
            <li>
              <Link to="/job-seeker/search" className={location.pathname === '/job-seeker/search' ? 'active' : ''}>
                Find Jobs
              </Link>
            </li>
            <li>
              <Link to="/login" className={location.pathname.startsWith('/hr') || location.pathname === '/login' ? 'active' : ''}>
                HR Portal
              </Link>
            </li>
          </ul>
        </nav>

        <div className="header-actions">
          {isCandidateLoggedIn ? (
            <Link to="/job-seeker/search" className="btn btn-secondary">
              Candidate Dashboard
            </Link>
          ) : isHRLoggedIn ? (
            <Link to="/hr/dashboard" className="btn btn-primary">
              HR Dashboard
            </Link>
          ) : (
            <>
              <Link to="/job-seeker/login" className="btn btn-secondary login-nav-btn">
                Candidate Login
              </Link>
              <Link to="/login" className="btn btn-primary signup-nav-btn">
                HR Sign In
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
