import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiRequest } from '../../services/api';
import '../../styles/Auth.css';

function JobSeekerLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  
  // Validation & feedback states
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Password visibility
  const [showPassword, setShowPassword] = useState(false);

  // Forgot Password modal
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  const navigate = useNavigate();

  // Load remembered email on mount
  useEffect(() => {
    const savedEmail = localStorage.getItem('jobSeekerRememberEmail');
    if (savedEmail) {
      setEmail(savedEmail);
      setRemember(true);
    }
  }, []);

  // Validate email inline
  const handleEmailChange = (val) => {
    setEmail(val);
    setError('');
    if (!val) {
      setEmailError('Email is required');
    } else if (!/\S+@\S+\.\S+/.test(val)) {
      setEmailError('Please enter a valid email address');
    } else {
      setEmailError('');
    }
  };

  // Validate password inline
  const handlePasswordChange = (val) => {
    setPassword(val);
    setError('');
    if (!val) {
      setPasswordError('Password is required');
    } else if (val.length < 6) {
      setPasswordError('Password must be at least 6 characters');
    } else {
      setPasswordError('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Final checks
    if (!email || emailError) {
      setEmailError('Valid email is required');
      return;
    }
    if (!password || passwordError) {
      setPasswordError('Password is required');
      return;
    }

    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const { ok, data } = await apiRequest('/auth/job-seeker/login', {
        method: 'POST',
        body: { email, password },
      });

      if (ok && data?.token) {
        setSuccess('Authentication successful! Loading dashboard...');
        
        // Handle Remember Me persistence
        if (remember) {
          localStorage.setItem('jobSeekerRememberEmail', email);
        } else {
          localStorage.removeItem('jobSeekerRememberEmail');
        }

        localStorage.setItem('jobSeekerToken', data.token);
        if (data.user) {
          localStorage.setItem('jobSeekerUser', JSON.stringify(data.user));
        }
        
        setTimeout(() => {
          navigate('/job-seeker/search');
        }, 1000);
      } else {
        setError(data?.message || 'Invalid email or password. Please try again.');
      }
    } catch (err) {
      setError(`Network error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setForgotError('');
    setForgotSuccess('');

    if (!forgotEmail || !/\S+@\S+\.\S+/.test(forgotEmail)) {
      setForgotError('Please enter a valid email address');
      return;
    }

    setForgotLoading(true);
    try {
      // Simulation of forgot password endpoint
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setForgotSuccess('Instructions to reset your password have been sent to your email.');
      setForgotEmail('');
    } catch {
      setForgotError('Something went wrong. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="auth-wrapper seeker-theme">
      {/* Left Panel: Warm Candidate Branding & Info */}
      <div className="auth-side-panel">
        <div className="auth-side-header">
          <Link to="/" className="side-logo">
            <img src="/assets/img/logo/logo.png" alt="Job Finder Logo" className="side-logo-img" />
            <span>JobFinder</span>
          </Link>
        </div>

        <div className="auth-side-content">
          <h1>Your Career Journey Starts Here.</h1>
          <p className="side-desc">
            Connect with top hiring teams, take dynamic interactive AI voice interviews, and match your unique skills to the world's best tech roles.
          </p>

          <div className="auth-side-features">
            <div className="side-feature-item">
              <div className="feature-icon-wrapper">
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                </svg>
              </div>
              <div>
                <h3>Interactive Voice Assessments</h3>
                <p>Respond naturally using your microphone and let AI translate your insights.</p>
              </div>
            </div>

            <div className="side-feature-item">
              <div className="feature-icon-wrapper">
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                </svg>
              </div>
              <div>
                <h3>Smart Matching</h3>
                <p>Upload your CV once and apply to dozens of open, high-paying vacancies instantly.</p>
              </div>
            </div>
          </div>

          <div className="side-stats-card">
            <div className="stat-item">
              <span className="stat-number">5,000+</span>
              <span className="stat-label">Active Roles</span>
            </div>
            <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }} />
            <div className="stat-item">
              <span className="stat-number">92%</span>
              <span className="stat-label">Placement Rate</span>
            </div>
          </div>
        </div>

        <div className="auth-side-footer">
          &copy; {new Date().getFullYear()} JobFinder Inc. All rights reserved.
        </div>
      </div>

      {/* Right Panel: Job Seeker Login Form */}
      <div className="auth-form-panel">
        <div className="auth-card">
          <div className="auth-header">
            <h2>Welcome Back, Pioneer</h2>
            <p className="subtitle">Sign in to your Candidate Dashboard</p>
          </div>

          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-msg">{success}</div>}

          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            <div className="form-group">
              <label htmlFor="email">
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
                Email Address
              </label>
              <div className={`input-wrapper ${emailError ? 'is-invalid' : email ? 'is-valid' : ''}`}>
                <span className="input-icon">@</span>
                <input
                  id="email"
                  type="email"
                  placeholder="yourname@email.com"
                  value={email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>
              {emailError && <span className="validation-error-text">{emailError}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="password">
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
                Password
              </label>
              <div className={`input-wrapper ${passwordError ? 'is-invalid' : password && !passwordError ? 'is-valid' : ''}`}>
                <span className="input-icon">🔒</span>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => handlePasswordChange(e.target.value)}
                  disabled={loading}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex="-1"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {passwordError && <span className="validation-error-text">{passwordError}</span>}
            </div>

            <div className="auth-extra">
              <div className="form-check">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="remember"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  disabled={loading}
                />
                <label className="form-check-label" htmlFor="remember">
                  Remember me
                </label>
              </div>
              <button
                type="button"
                className="forgot-password-link"
                onClick={() => {
                  setForgotError('');
                  setForgotSuccess('');
                  setShowForgotModal(true);
                }}
                disabled={loading}
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              className="btn-auth-submit"
              disabled={loading || !!emailError || !!passwordError}
            >
              {loading ? (
                <>
                  <div className="auth-spinner" />
                  <span>Signing In...</span>
                </>
              ) : (
                'Login'
              )}
            </button>
          </form>

          <div className="auth-footer">
            <p>
              Don&apos;t have an account?{' '}
              <Link to="/job-seeker/register">Register here</Link>
            </p>

            <div className="auth-footer-divider">Are you looking to hire?</div>

            <button
              type="button"
              className="btn-role-switch"
              onClick={() => navigate('/login')}
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21h10.5V6.75a.75.75 0 00-.75-.75H7.5a.75.75 0 00-.75.75V21z" />
              </svg>
              Go to HR Recruiter Portal
            </button>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="auth-modal">
          <div className="auth-modal-content">
            <div className="auth-modal-header">
              <h3>Reset Password</h3>
              <button
                type="button"
                className="auth-modal-close"
                onClick={() => setShowForgotModal(false)}
              >
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <p className="auth-modal-desc">
              Enter your email address below and we will send you instructions to reset your candidate account password.
            </p>

            {forgotError && <div className="error-message" style={{ margin: '0 0 16px 0' }}>{forgotError}</div>}
            {forgotSuccess && <div className="success-msg" style={{ margin: '0 0 16px 0' }}>{forgotSuccess}</div>}

            {!forgotSuccess && (
              <form onSubmit={handleForgotSubmit}>
                <div className="form-group" style={{ marginBottom: '20px' }}>
                  <label htmlFor="forgot-email">Email Address</label>
                  <div className="input-wrapper">
                    <span className="input-icon">@</span>
                    <input
                      id="forgot-email"
                      type="email"
                      placeholder="yourname@email.com"
                      value={forgotEmail}
                      onChange={(e) => {
                        setForgotEmail(e.target.value);
                        setForgotError('');
                      }}
                      disabled={forgotLoading}
                      required
                    />
                  </div>
                </div>

                <div className="auth-modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowForgotModal(false)}
                    disabled={forgotLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={forgotLoading}
                    style={{ background: 'var(--theme-primary)' }}
                  >
                    {forgotLoading ? 'Sending...' : 'Send Reset Link'}
                  </button>
                </div>
              </form>
            )}

            {forgotSuccess && (
              <div className="auth-modal-footer">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setShowForgotModal(false)}
                  style={{ background: 'var(--theme-primary)', width: '100%' }}
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default JobSeekerLogin;
