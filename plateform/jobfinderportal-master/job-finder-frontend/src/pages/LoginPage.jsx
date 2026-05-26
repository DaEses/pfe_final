import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiRequest } from '../services/api';
import '../styles/Auth.css';

function LoginPage({ setIsLoggedIn }) {
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
    const savedEmail = localStorage.getItem('hrRememberEmail');
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
    
    // Final check before submitting
    if (!email || emailError) {
      setEmailError('Valid email is required');
      return;
    }
    if (!password || passwordError) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }

    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const { ok, data } = await apiRequest('/auth/login', {
        method: 'POST',
        body: { email, password },
      });

      if (ok && data?.accessToken) {
        setSuccess('Authentication successful! Loading dashboard...');
        
        // Handle Remember Me persistence
        if (remember) {
          localStorage.setItem('hrRememberEmail', email);
        } else {
          localStorage.removeItem('hrRememberEmail');
        }

        localStorage.setItem('hrUserToken', data.accessToken);
        if (data.user) {
          localStorage.setItem('hrUser', JSON.stringify(data.user));
        }
        
        setIsLoggedIn(true);
        setTimeout(() => {
          navigate('/hr/dashboard');
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
      // Simulation of forgot password endpoint or simple mock confirmation
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
    <div className="auth-wrapper hr-theme">
      {/* Left Panel: Corporate Info & Stats */}
      <div className="auth-side-panel">
        <div className="auth-side-header">
          <Link to="/" className="side-logo">
            <img src="/assets/img/logo/logo.png" alt="Job Finder Logo" className="side-logo-img" />
            <span>JobFinder <span style={{ color: 'var(--primary)' }}>HR</span></span>
          </Link>
        </div>

        <div className="auth-side-content">
          <h1>Hire the Best Talent, Faster.</h1>
          <p className="side-desc">
            Deploy AI-assisted video interviews, automated screening, and interactive speech recognition to find your next unicorn candidate.
          </p>

          <div className="auth-side-features">
            <div className="side-feature-item">
              <div className="feature-icon-wrapper">
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                </svg>
              </div>
              <div>
                <h3>Smart AI Interviewer</h3>
                <p>Interactive speech-to-text response logging with face landmarker tasks.</p>
              </div>
            </div>

            <div className="side-feature-item">
              <div className="feature-icon-wrapper">
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
              </div>
              <div>
                <h3>Automated Assessment</h3>
                <p>Review emotions and confidence scores instantly inside your pipeline.</p>
              </div>
            </div>
          </div>

          <div className="side-stats-card">
            <div className="stat-item">
              <span className="stat-number">98.4%</span>
              <span className="stat-label">Match Rate</span>
            </div>
            <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }} />
            <div className="stat-item">
              <span className="stat-number">20k+</span>
              <span className="stat-label">Interviews Run</span>
            </div>
          </div>
        </div>

        <div className="auth-side-footer">
          &copy; {new Date().getFullYear()} JobFinder Inc. All rights reserved.
        </div>
      </div>

      {/* Right Panel: HR Login Form */}
      <div className="auth-form-panel">
        <div className="auth-card">
          <div className="auth-header">
            <h2>Welcome Back</h2>
            <p className="subtitle">Sign in to your Recruiter Dashboard</p>
          </div>

          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-msg">{success}</div>}

          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            <div className="form-group">
              <label htmlFor="email">
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
                Work Email Address
              </label>
              <div className={`input-wrapper ${emailError ? 'is-invalid' : email ? 'is-valid' : ''}`}>
                <span className="input-icon">@</span>
                <input
                  id="email"
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>
              {emailError && (
                <span className="validation-error-text">
                  <svg width="12" height="12" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {emailError}
                </span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="password">
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
                Password
              </label>
              <div className={`input-wrapper ${passwordError ? 'is-invalid' : password && !passwordError ? 'is-valid' : ''}`}>
                <span className="input-icon">
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-.999.43-1.563A6 6 0 1121.75 8.25z" />
                  </svg>
                </span>
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
                  {showPassword ? (
                    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.43 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
              {passwordError && (
                <span className="validation-error-text">
                  <svg width="12" height="12" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {passwordError}
                </span>
              )}
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
                  <span>Logging in...</span>
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="auth-footer">
            <p>
              New recruiter?{' '}
              <Link to="/register">Create an HR account</Link>
            </p>
            
            <div className="auth-footer-divider">Are you a job seeker?</div>
            
            <button
              type="button"
              className="btn-role-switch"
              onClick={() => navigate('/job-seeker/login')}
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
              Sign In as Job Seeker
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
              Enter your work email address below and we will send you instructions to reset your recruiter account password.
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
                      placeholder="name@company.com"
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

export default LoginPage;
