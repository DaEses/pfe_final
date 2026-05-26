import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiRequest } from '../../services/api';
import '../../styles/Auth.css';

function JobSeekerRegister() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    phone: '',
    bio: '',
    skills: '',
    location: '',
    linkedinProfile: '',
    resume: '',
  });

  // Validation feedback
  const [firstNameError, setFirstNameError] = useState('');
  const [lastNameError, setLastNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  
  // CV file upload state
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [dragActive, setDragActive] = useState(false);

  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
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

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError('');

    // Inline validations
    if (name === 'firstName') {
      setFirstNameError(value ? '' : 'First name is required');
    }
    if (name === 'lastName') {
      setLastNameError(value ? '' : 'Last name is required');
    }
    
    if (name === 'email') {
      if (!value) {
        setEmailError('Email is required');
      } else if (!/\S+@\S+\.\S+/.test(value)) {
        setEmailError('Please enter a valid email address');
      } else {
        setEmailError('');
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

  // CV File Parsing Handler
  const handleCVFile = (file) => {
    if (!file) return;

    // Check size limit (e.g. 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setError('File size exceeds the 2MB limit');
      return;
    }

    setFileName(file.name);
    setFileSize(Math.round(file.size / 1024));
    setError('');

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === 'string') {
        setFormData((prev) => ({ ...prev, resume: text }));
      }
    };
    reader.onerror = () => {
      setError('Failed to read resume/CV file content');
    };
    reader.readAsText(file);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleCVFile(e.dataTransfer.files[0]);
    }
  };

  const handleRemoveCV = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setFileName('');
    setFileSize(0);
    setFormData((prev) => ({ ...prev, resume: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    // Pre-submit checks
    if (!formData.firstName) {
      setFirstNameError('First name is required');
      return;
    }
    if (!formData.lastName) {
      setLastNameError('Last name is required');
      return;
    }
    if (!formData.email || emailError) {
      setEmailError('Valid email is required');
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

    setIsLoading(true);

    try {
      const { ok, data } = await apiRequest('/auth/job-seeker/register', {
        method: 'POST',
        body: {
          email: formData.email,
          password: formData.password,
          firstName: formData.firstName,
          lastName: formData.lastName,
          phone: formData.phone,
          bio: formData.bio,
          skills: formData.skills
            ? formData.skills.split(',').map((s) => s.trim()).filter(Boolean)
            : [],
          location: formData.location,
          linkedinProfile: formData.linkedinProfile,
          resume: formData.resume,
        },
      });

      if (ok && data?.token) {
        setSuccessMessage('Registration successful! Redirecting to login...');
        setTimeout(() => navigate('/job-seeker/login'), 1200);
      } else {
        setError(data?.message || 'Registration failed. Please try again.');
      }
    } catch (err) {
      setError(`Network error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-wrapper seeker-theme">
      {/* Left Panel: Warm illustrative panel */}
      <div className="auth-side-panel">
        <div className="auth-side-header">
          <Link to="/" className="side-logo">
            <img src="/assets/img/logo/logo.png" alt="Job Finder Logo" className="side-logo-img" />
            <span>JobFinder</span>
          </Link>
        </div>

        <div className="auth-side-content">
          <h1>Build Your Professional AI Profile.</h1>
          <p className="side-desc">
            Upload your resume, add your LinkedIn handle, and start taking video/audio interviews with top global hiring teams instantly.
          </p>

          <div className="auth-side-features">
            <div className="side-feature-item">
              <div className="feature-icon-wrapper">
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4.35 19.4c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l1.9-1.9C9.22 19.58 10.57 20 12 20c4.97 0 9-4.03 9-9s-4.03-9-9-9zm0 15c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6zm1-8h-2v4h2v-4zm0-3h-2v2h2V7z" />
                </svg>
              </div>
              <div>
                <h3>Advanced AI Audio Logging</h3>
                <p>Enjoy stable speech capture with progressive transcript merging.</p>
              </div>
            </div>

            <div className="side-feature-item">
              <div className="feature-icon-wrapper">
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
                </svg>
              </div>
              <div>
                <h3>Enriched Portfolios</h3>
                <p>Showcase your work experience, education history, and specialized skills.</p>
              </div>
            </div>
          </div>

          <div className="side-stats-card">
            <div className="stat-item">
              <span className="stat-number">20k+</span>
              <span className="stat-label">Applicants Placed</span>
            </div>
            <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }} />
            <div className="stat-item">
              <span className="stat-number">98%</span>
              <span className="stat-label">Satisfaction Rate</span>
            </div>
          </div>
        </div>

        <div className="auth-side-footer">
          &copy; {new Date().getFullYear()} JobFinder Inc. All rights reserved.
        </div>
      </div>

      {/* Right Panel: Job Seeker Form */}
      <div className="auth-form-panel">
        <div className="auth-card" style={{ maxWidth: '640px' }}>
          <div className="auth-header">
            <h2>Create Candidate Account</h2>
            <p className="subtitle">Join our job board and find your next opportunity</p>
          </div>

          {error && <div className="error-message">{error}</div>}
          {successMessage && <div className="success-msg">{successMessage}</div>}

          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            <div className="auth-row">
              <div className="form-group">
                <label htmlFor="firstName">First Name *</label>
                <div className={`input-wrapper ${firstNameError ? 'is-invalid' : formData.firstName ? 'is-valid' : ''}`}>
                  <span className="input-icon">👤</span>
                  <input
                    id="firstName"
                    type="text"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleInputChange}
                    placeholder="John"
                    disabled={isLoading}
                    required
                  />
                </div>
                {firstNameError && <span className="validation-error-text">{firstNameError}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="lastName">Last Name *</label>
                <div className={`input-wrapper ${lastNameError ? 'is-invalid' : formData.lastName ? 'is-valid' : ''}`}>
                  <span className="input-icon">👤</span>
                  <input
                    id="lastName"
                    type="text"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleInputChange}
                    placeholder="Doe"
                    disabled={isLoading}
                    required
                  />
                </div>
                {lastNameError && <span className="validation-error-text">{lastNameError}</span>}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="email">Email Address *</label>
              <div className={`input-wrapper ${emailError ? 'is-invalid' : formData.email ? 'is-valid' : ''}`}>
                <span className="input-icon">@</span>
                <input
                  id="email"
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="yourname@email.com"
                  disabled={isLoading}
                  required
                />
              </div>
              {emailError && <span className="validation-error-text">{emailError}</span>}
            </div>

            <div className="auth-row">
              <div className="form-group">
                <label htmlFor="password">Password *</label>
                <div className={`input-wrapper ${passwordError ? 'is-invalid' : formData.password && !passwordError ? 'is-valid' : ''}`}>
                  <span className="input-icon">🔒</span>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    placeholder="At least 6 characters"
                    disabled={isLoading}
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
                <label htmlFor="confirmPassword">Confirm Password *</label>
                <div className={`input-wrapper ${confirmError ? 'is-invalid' : formData.confirmPassword && !confirmError ? 'is-valid' : ''}`}>
                  <span className="input-icon">🔒</span>
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    placeholder="Confirm password"
                    disabled={isLoading}
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
                <label htmlFor="phone">Phone Number</label>
                <div className="input-wrapper">
                  <span className="input-icon">📞</span>
                  <input
                    id="phone"
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    placeholder="+1 (555) 012-3456"
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="location">Location</label>
                <div className="input-wrapper">
                  <span className="input-icon">📍</span>
                  <input
                    id="location"
                    type="text"
                    name="location"
                    value={formData.location}
                    onChange={handleInputChange}
                    placeholder="e.g. San Francisco, CA"
                    disabled={isLoading}
                  />
                </div>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="linkedinProfile">LinkedIn Profile URL (Optional)</label>
              <div className="input-wrapper">
                <span className="input-icon">🔗</span>
                <input
                  id="linkedinProfile"
                  type="url"
                  name="linkedinProfile"
                  value={formData.linkedinProfile}
                  onChange={handleInputChange}
                  placeholder="https://linkedin.com/in/username"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="skills">Skills (comma-separated)</label>
              <div className="input-wrapper">
                <span className="input-icon">🛠️</span>
                <input
                  id="skills"
                  type="text"
                  name="skills"
                  value={formData.skills}
                  onChange={handleInputChange}
                  placeholder="e.g. JavaScript, React, Node.js"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="bio">Bio</label>
              <textarea
                id="bio"
                name="bio"
                value={formData.bio}
                onChange={handleInputChange}
                placeholder="Tell us a bit about yourself and your professional experience..."
                rows="2"
                disabled={isLoading}
              />
            </div>

            {/* Premium CV Upload Dropzone */}
            <div className="form-group">
              <label>Resume / CV Upload</label>
              {!fileName ? (
                <div
                  className={`cv-upload-zone ${dragActive ? 'drag-active' : ''}`}
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById('cv-file-input').click()}
                >
                  <svg className="cv-upload-icon" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                  </svg>
                  <p className="cv-upload-text"><span>Drag & drop CV</span> or browse files</p>
                  <p className="cv-upload-hint">Text or PDF files up to 2MB (reads text contents)</p>
                  <input
                    id="cv-file-input"
                    type="file"
                    accept=".txt,.pdf,.doc,.docx"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleCVFile(e.target.files[0]);
                      }
                    }}
                    style={{ display: 'none' }}
                    disabled={isLoading}
                  />
                </div>
              ) : (
                <div className="uploaded-file-meta">
                  <div className="file-meta-info">
                    <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ color: 'var(--theme-primary)' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    <div className="file-meta-text">
                      <p className="file-meta-name">{fileName}</p>
                      <p className="file-meta-size">{fileSize} KB</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="file-remove-btn"
                    onClick={handleRemoveCV}
                    disabled={isLoading}
                    title="Remove file"
                  >
                    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            <button
              type="submit"
              className="btn-auth-submit"
              disabled={isLoading || !!firstNameError || !!lastNameError || !!emailError || !!passwordError || !!confirmError}
            >
              {isLoading ? (
                <>
                  <div className="auth-spinner" />
                  <span>Registering...</span>
                </>
              ) : (
                'Register Account'
              )}
            </button>
          </form>

          <div className="auth-footer">
            <p>
              Already have an account?{' '}
              <Link to="/job-seeker/login">Login here</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default JobSeekerRegister;
