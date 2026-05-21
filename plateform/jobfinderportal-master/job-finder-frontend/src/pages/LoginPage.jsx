import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../services/api';
import '../styles/Auth.css';

function LoginPage({ setIsLoggedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { ok, data } = await apiRequest('/auth/login', {
        method: 'POST',
        body: { email, password },
      });

      if (ok && data?.accessToken) {
        localStorage.setItem('hrUserToken', data.accessToken);
        if (data.user) {
          localStorage.setItem('hrUser', JSON.stringify(data.user));
        }
        setIsLoggedIn(true);
        navigate('/hr/dashboard');
      } else {
        setError(data?.message || 'Login failed. Please try again.');
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
                  <h2>Login to Your Account</h2>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <section className="contact-section" style={{ padding: '60px 0' }}>
        <div className="container">
          <div className="row justify-content-center">
            <div className="col-lg-6 col-md-8">
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
                  Sign In to Your HR Account
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

                <form onSubmit={handleSubmit}>
                  <div className="form-group">
                    <label htmlFor="email" style={{ marginBottom: '10px', fontWeight: '500' }}>
                      Email Address
                    </label>
                    <input
                      className="form-control"
                      id="email"
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="password" style={{ marginBottom: '10px', fontWeight: '500' }}>
                      Password
                    </label>
                    <input
                      className="form-control"
                      id="password"
                      type="password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>

                  <div
                    className="form-group"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '20px',
                    }}
                  >
                    <div className="form-check">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="remember"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                      />
                      <label className="form-check-label" htmlFor="remember">
                        Remember me
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
                      {loading ? 'Logging in...' : 'Login'}
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
                    Don&apos;t have an account?{' '}
                    <a href="/register" style={{ color: '#ff6b6b', textDecoration: 'none', fontWeight: '500' }}>
                      Register here
                    </a>
                  </p>
                  <p style={{ color: '#666', marginTop: '8px' }}>
                    Looking for a job?{' '}
                    <a
                      href="/job-seeker/login"
                      style={{ color: '#ff6b6b', textDecoration: 'none', fontWeight: '500' }}
                    >
                      Job Seeker Login
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

export default LoginPage;
