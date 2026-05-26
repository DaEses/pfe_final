import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiRequest } from '../services/api';
import '../styles/Auth.css';

function RegisterPage() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    companyName: '',
    companyDescription: '',
    phone: '',
    recruiterName: '',
    companyRole: '',
    companyWebsite: '',
    companyLogo: '',
    terms: false,
  });

  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [recruiterError, setRecruiterError] = useState('');
  const [companyError, setCompanyError] = useState('');
  const [logoName, setLogoName] = useState('');
  const [logoPreview, setLogoPreview] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const navigate = useNavigate();

  // Password strength checker
  const getPasswordStrength = (pwd) => {
    if (!pwd) return { score: 0, label: 'None' };
    let score = 0;
    if (pwd.length >= 6) score += 1;
    if (pwd.length >= 8) score += 1;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score += 1;
    if (/[0-9]/.test(pwd) || /[^A-Za-z0-9]/.test(pwd)) score += 1;

    let label = 'Weak';
    if (score === 2) label = 'Fair';
    if (score === 3) label = 'Good';
    if (score === 4) label = 'Strong';

    return { score, label };
  };

  const strength = getPasswordStrength(formData.password);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    setError('');

    // Inline validations
    if (name === 'email') {
      if (!value) {
        setEmailError('Email is required');
      } else if (!/\S+@\S+\.\S+/.test(value)) {
        setEmailError('Please enter a valid email address');
      } else {
        setEmailError('');
      }
    }

    if (name === 'recruiterName') {
      if (!value) {
        setRecruiterError('Recruiter name is required');
      } else {
        setRecruiterError('');
      }
    }

    if (name === 'companyName') {
      if (!value) {
        setCompanyError('Company name is required');
      } else {
        setCompanyError('');
      }
    }

    if (name === 'password') {
      if (!value) {
        setPasswordError('Password is required');
      } else if (value.length < 6) {
        setPasswordError('Password must be at least 6 characters');
      } else {
        setPasswordError('');
      }
      
      if (formData.confirmPassword && value !== formData.confirmPassword) {
        setConfirmError('Passwords do not match');
      } else {
        setConfirmError('');
      }
    }

    if (name === 'confirmPassword') {
      if (!value) {
        setConfirmError('Please confirm your password');
      } else if (value !== formData.password) {
        setConfirmError('Passwords do not match');
      } else {
        setConfirmError('');
      }
    }
  };

  // Base64 Logo Upload Handler
  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file for the logo');
      return;
    }

    setLogoName(file.name);
    setError('');

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Str = event.target?.result;
      if (typeof base64Str === 'string') {
        setLogoPreview(base64Str);
        setFormData((prev) => ({ ...prev, companyLogo: base64Str }));
      }
    };
    reader.onerror = () => {
      setError('Failed to read logo image');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setLogoName('');
    setLogoPreview('');
    setFormData((prev) => ({ ...prev, companyLogo: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Pre-submission validation checks
    if (!formData.email || emailError) {
      setEmailError('Valid email is required');
      return;
    }
    if (!formData.recruiterName) {
      setRecruiterError('Recruiter name is required');
      return;
    }
    if (!formData.companyName) {
      setCompanyError('Company name is required');
      return;
    }
    if (!formData.password || passwordError) {
      setPasswordError('Password of at least 6 characters is required');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setConfirmError('Passwords do not match');
      return;
    }
    if (!formData.terms) {
      setError('You must agree to the Terms and Conditions to proceed');
      return;
    }

    setLoading(true);

    try {
      const { ok, data } = await apiRequest('/auth/register', {
        method: 'POST',
        body: {
          email: formData.email,
          password: formData.password,
          companyName: formData.companyName,
          companyDescription: formData.companyDescription,
          phone: formData.phone,
          recruiterName: formData.recruiterName,
          companyRole: formData.companyRole,
          companyWebsite: formData.companyWebsite,
          companyLogo: formData.companyLogo,
        },
      });

      if (ok && data?.accessToken) {
        localStorage.setItem('hrUserToken', data.accessToken);
        if (data.user) {
          localStorage.setItem('hrUser', JSON.stringify(data.user));
        }
        setSuccess('Account created successfully! Redirecting...');
        setTimeout(() => navigate('/hr/dashboard'), 1200);
      } else {
        setError(data?.message || 'Registration failed. Please try again.');
      }
    } catch (err) {
      setError(`Network error: ${err.message}`);
    } finally {
      setLoading(false);
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
          <h1>Start Recruiting with AI Intelligence.</h1>
          <p className="side-desc">
            Create your recruiter profile and configure your team dashboard in less than 2 minutes. Get instant access to candidates, reports, and AI interview pipelines.
          </p>

          <div className="auth-side-features">
            <div className="side-feature-item">
              <div className="feature-icon-wrapper">
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
                </svg>
              </div>
              <div>
                <h3>Smart Dashboards</h3>
                <p>Track job listings, applicants, and video recording transcripts in one clean feed.</p>
              </div>
            </div>

            <div className="side-feature-item">
              <div className="feature-icon-wrapper">
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H7c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.04-.42 1.99-1.07 2.75z" />
                </svg>
              </div>
              <div>
                <h3>Interactive Sentiment</h3>
                <p>Get automatic assessments of candidate emotion expressions during coding tests.</p>
              </div>
            </div>
          </div>

          <div className="side-stats-card">
            <div className="stat-item">
              <span className="stat-number">5,000+</span>
              <span className="stat-label">Companies</span>
            </div>
            <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }} />
            <div className="stat-item">
              <span className="stat-number">98.4%</span>
              <span className="stat-label">Placement Match</span>
            </div>
          </div>
        </div>

        <div className="auth-side-footer">
          &copy; {new Date().getFullYear()} JobFinder Inc. All rights reserved.
        </div>
      </div>

      {/* Right Panel: HR Registration Form */}
      <div className="auth-form-panel">
        <div className="auth-card" style={{ maxWidth: '640px' }}>
          <div className="auth-header">
            <h2>Create Recruiter Account</h2>
            <p className="subtitle">Set up your workspace and start hiring</p>
          </div>

          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-msg">{success}</div>}

          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            <div className="auth-row">
              <div className="form-group">
                <label htmlFor="recruiterName">
                  Full Name *
                </label>
                <div className={`input-wrapper ${recruiterError ? 'is-invalid' : formData.recruiterName ? 'is-valid' : ''}`}>
                  <span className="input-icon">👤</span>
                  <input
                    id="recruiterName"
                    type="text"
                    name="recruiterName"
                    placeholder="Jane Doe"
                    value={formData.recruiterName}
                    onChange={handleChange}
                    disabled={loading}
                    required
                  />
                </div>
                {recruiterError && <span className="validation-error-text">{recruiterError}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="email">
                  Work Email *
                </label>
                <div className={`input-wrapper ${emailError ? 'is-invalid' : formData.email ? 'is-valid' : ''}`}>
                  <span className="input-icon">@</span>
                  <input
                    id="email"
                    type="email"
                    name="email"
                    placeholder="jane@company.com"
                    value={formData.email}
                    onChange={handleChange}
                    disabled={loading}
                    required
                  />
                </div>
                {emailError && <span className="validation-error-text">{emailError}</span>}
              </div>
            </div>

            <div className="auth-row">
              <div className="form-group">
                <label htmlFor="password">
                  Password *
                </label>
                <div className={`input-wrapper ${passwordError ? 'is-invalid' : formData.password && !passwordError ? 'is-valid' : ''}`}>
                  <span className="input-icon">🔒</span>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    placeholder="Choose password"
                    value={formData.password}
                    onChange={handleChange}
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
                {formData.password && (
                  <div className="password-strength-container" style={{ marginTop: '6px' }}>
                    <div className={`password-strength-bar level-${strength.label.toLowerCase()}`}>
                      <div className="strength-segment" />
                      <div className="strength-segment" />
                      <div className="strength-segment" />
                      <div className="strength-segment" />
                    </div>
                    <span className="password-strength-label">Password Strength: {strength.label}</span>
                  </div>
                )}
                {passwordError && <span className="validation-error-text">{passwordError}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="confirmPassword">
                  Confirm Password *
                </label>
                <div className={`input-wrapper ${confirmError ? 'is-invalid' : formData.confirmPassword && !confirmError ? 'is-valid' : ''}`}>
                  <span className="input-icon">🔒</span>
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    name="confirmPassword"
                    placeholder="Confirm password"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    disabled={loading}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    tabIndex="-1"
                  >
                    {showConfirmPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                {confirmError && <span className="validation-error-text">{confirmError}</span>}
              </div>
            </div>

            <div className="auth-row">
              <div className="form-group">
                <label htmlFor="companyName">
                  Company Name *
                </label>
                <div className={`input-wrapper ${companyError ? 'is-invalid' : formData.companyName ? 'is-valid' : ''}`}>
                  <span className="input-icon">🏢</span>
                  <input
                    id="companyName"
                    type="text"
                    name="companyName"
                    placeholder="e.g. Acme Corporation"
                    value={formData.companyName}
                    onChange={handleChange}
                    disabled={loading}
                    required
                  />
                </div>
                {companyError && <span className="validation-error-text">{companyError}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="companyWebsite">
                  Company Website (Optional)
                </label>
                <div className="input-wrapper">
                  <span className="input-icon">🔗</span>
                  <input
                    id="companyWebsite"
                    type="url"
                    name="companyWebsite"
                    placeholder="https://acme.com"
                    value={formData.companyWebsite}
                    onChange={handleChange}
                    disabled={loading}
                  />
                </div>
              </div>
            </div>

            <div className="auth-row">
              <div className="form-group">
                <label htmlFor="companyRole">
                  Your Role / Title (Optional)
                </label>
                <div className="input-wrapper">
                  <span className="input-icon">💼</span>
                  <input
                    id="companyRole"
                    type="text"
                    name="companyRole"
                    placeholder="e.g. Talent Acquisition Manager"
                    value={formData.companyRole}
                    onChange={handleChange}
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="phone">
                  Phone Number (Optional)
                </label>
                <div className="input-wrapper">
                  <span className="input-icon">📞</span>
                  <input
                    id="phone"
                    type="tel"
                    name="phone"
                    placeholder="+1 (555) 012-3456"
                    value={formData.phone}
                    onChange={handleChange}
                    disabled={loading}
                  />
                </div>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="companyDescription">Company Description (Optional)</label>
              <textarea
                id="companyDescription"
                name="companyDescription"
                placeholder="A brief overview of your business..."
                rows="2"
                value={formData.companyDescription}
                onChange={handleChange}
                disabled={loading}
              />
            </div>

            {/* Custom Logo Upload zone */}
            <div className="form-group">
              <label>Company Logo (Optional)</label>
              {!logoPreview ? (
                <div 
                  className="cv-upload-zone"
                  onClick={() => document.getElementById('company-logo-input').click()}
                >
                  <svg className="cv-upload-icon" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                  <p className="cv-upload-text"><span>Click to upload</span> company logo</p>
                  <p className="cv-upload-hint">PNG, JPG, or SVG up to 1MB</p>
                  <input
                    id="company-logo-input"
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    style={{ display: 'none' }}
                    disabled={loading}
                  />
                </div>
              ) : (
                <div className="uploaded-file-meta">
                  <div className="file-meta-info">
                    <img 
                      src={logoPreview} 
                      alt="Logo Preview" 
                      style={{ width: '40px', height: '40px', objectFit: 'contain', borderRadius: '6px', border: '1px solid var(--border)', background: '#fff' }} 
                    />
                    <div className="file-meta-text">
                      <p className="file-meta-name">{logoName}</p>
                      <p className="file-meta-size">Company Logo Loaded</p>
                    </div>
                  </div>
                  <button 
                    type="button" 
                    className="file-remove-btn"
                    onClick={handleRemoveLogo}
                    disabled={loading}
                    title="Remove Logo"
                  >
                    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            <div className="form-group" style={{ marginTop: '6px' }}>
              <div className="form-check">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="terms"
                  name="terms"
                  checked={formData.terms}
                  onChange={handleChange}
                  disabled={loading}
                  required
                />
                <label className="form-check-label" htmlFor="terms">
                  I agree to the <a href="#terms-link" onClick={(e) => e.preventDefault()} style={{ color: 'var(--theme-primary)' }}>Terms and Conditions</a> and <a href="#privacy-link" onClick={(e) => e.preventDefault()} style={{ color: 'var(--theme-primary)' }}>Privacy Policy</a>
                </label>
              </div>
            </div>

            <button
              type="submit"
              className="btn-auth-submit"
              disabled={loading || !!emailError || !!passwordError || !!confirmError || !formData.terms}
            >
              {loading ? (
                <>
                  <div className="auth-spinner" />
                  <span>Creating Account...</span>
                </>
              ) : (
                'Create HR Account'
              )}
            </button>
          </form>

          <div className="auth-footer">
            <p>
              Already have an account?{' '}
              <Link to="/login">Sign in here</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RegisterPage;
