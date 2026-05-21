import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../services/api';
import '../styles/Auth.css';

function RegisterPage() {
  const [formData, setFormData] = useState({
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    companyName: '',
    companyDescription: '',
    terms: false,
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }
    if (!formData.terms) {
      setError('Please agree to Terms and Conditions');
      setLoading(false);
      return;
    }

    try {
      const { ok, data } = await apiRequest('/auth/register', {
        method: 'POST',
        body: {
          email: formData.email,
          password: formData.password,
          companyName: formData.companyName,
          companyDescription: formData.companyDescription,
          phone: formData.phone,
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
    <main>
      <div className="slider-area">
        <div
          className="single-slider section-overly slider-height2 d-flex align-items-center"
          style={{ backgroundImage: 'url(/assets/img/hero/about.jpg)' }}
        >
          <div className="container">
            <div className="row">
              <div className="col-xl-12">
                <div className="hero-cap text-center">
                  <h2>Create New Account</h2>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <section className="contact-section" style={{ padding: '60px 0' }}>
        <div className="container">
          <div className="row justify-content-center">
            <div className="col-lg-7 col-md-9">
              <div
                className="contact-form-wrapper"
                style={{
                  background: '#f9f9f9',
                  padding: '40px',
                  borderRadius: '8px',
                  boxShadow: '0 0 20px rgba(0,0,0,0.1)',
                }}
              >
                <h3 style={{ marginBottom: '30px', textAlign: 'center', color: '#333' }}>
                  Create Your HR Account
                </h3>

                {error && (
                  <div
                    style={{
                      color: '#c33',
                      background: '#fee',
                      padding: '10px',
                      borderRadius: '5px',
                      marginBottom: '15px',
                      borderLeft: '4px solid #c33',
                    }}
                  >
                    {error}
                  </div>
                )}
                {success && (
                  <div
                    style={{
                      color: '#3c3',
                      background: '#efe',
                      padding: '10px',
                      borderRadius: '5px',
                      marginBottom: '15px',
                      borderLeft: '4px solid #3c3',
                    }}
                  >
                    {success}
                  </div>
                )}

                <form onSubmit={handleSubmit}>
                  <div className="form-group">
                    <label htmlFor="email">Email Address</label>
                    <input
                      className="form-control"
                      id="email"
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="phone">Phone Number</label>
                    <input
                      className="form-control"
                      id="phone"
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="row">
                    <div className="col-md-6">
                      <div className="form-group">
                        <label htmlFor="password">Password</label>
                        <input
                          className="form-control"
                          id="password"
                          type="password"
                          name="password"
                          value={formData.password}
                          onChange={handleChange}
                          required
                        />
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-group">
                        <label htmlFor="confirmPassword">Confirm Password</label>
                        <input
                          className="form-control"
                          id="confirmPassword"
                          type="password"
                          name="confirmPassword"
                          value={formData.confirmPassword}
                          onChange={handleChange}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="companyName">Company Name</label>
                    <input
                      className="form-control"
                      id="companyName"
                      type="text"
                      name="companyName"
                      value={formData.companyName}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="companyDescription">Company Description</label>
                    <textarea
                      className="form-control"
                      id="companyDescription"
                      name="companyDescription"
                      rows="3"
                      value={formData.companyDescription}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: '25px' }}>
                    <div className="form-check">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="terms"
                        name="terms"
                        checked={formData.terms}
                        onChange={handleChange}
                      />
                      <label className="form-check-label" htmlFor="terms">
                        I agree to the Terms and Conditions and Privacy Policy
                      </label>
                    </div>
                  </div>

                  <div className="form-group">
                    <button
                      type="submit"
                      className="button button-contactForm boxed-btn"
                      style={{
                        width: '100%',
                        padding: '15px',
                        border: 'none',
                        borderRadius: '5px',
                        fontSize: '16px',
                        cursor: 'pointer',
                        background: '#ff6b6b',
                        color: 'white',
                        fontWeight: '600',
                      }}
                      disabled={loading}
                    >
                      {loading ? 'Creating Account...' : 'Create Account'}
                    </button>
                  </div>
                </form>

                <div
                  style={{
                    textAlign: 'center',
                    marginTop: '20px',
                    borderTop: '1px solid #ddd',
                    paddingTop: '20px',
                  }}
                >
                  <p style={{ color: '#666', marginBottom: '0' }}>
                    Already have an account?{' '}
                    <a
                      href="/login"
                      style={{
                        color: '#ff6b6b',
                        textDecoration: 'none',
                        fontWeight: '500',
                      }}
                    >
                      Login here
                    </a>
                  </p>
                  <hr style={{ margin: '15px 0' }} />
                  <p style={{ color: '#666', marginBottom: '0' }}>
                    Looking for a job?{' '}
                    <a
                      href="/job-seeker/register"
                      style={{
                        color: '#ff6b6b',
                        textDecoration: 'none',
                        fontWeight: '500',
                      }}
                    >
                      Register as a Job Seeker
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default RegisterPage;
