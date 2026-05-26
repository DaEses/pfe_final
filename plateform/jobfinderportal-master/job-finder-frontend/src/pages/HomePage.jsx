import { Link } from 'react-router-dom';
import '../styles/HomePage.css';

function HomePage() {
  const jobCategories = [
    { id: 1, title: 'Design & Creative', count: 653, icon: '🎨' },
    { id: 2, title: 'Design & Development', count: 658, icon: '💻' },
    { id: 3, title: 'Sales & Marketing', count: 658, icon: '📈' },
    { id: 4, title: 'Mobile Application', count: 658, icon: '📱' },
    { id: 5, title: 'Management & Finance', count: 658, icon: '💼' },
  ];

  return (
    <main className="homepage-main">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="container hero-container">
          <div className="hero-content">
            <h1 className="hero-title">Find the most exciting startup jobs</h1>
            <p className="hero-subtitle">
              Connect with top tech companies and run AI-assisted interviews to showcase your skills directly to recruiters.
            </p>
            
            <div className="hero-search-box">
              <div className="input-form">
                <input type="text" placeholder="Job Title or keyword" />
              </div>
              <div className="select-form">
                <select>
                  <option value="">All Locations</option>
                  <option value="remote">Remote</option>
                  <option value="new-york">New York, USA</option>
                  <option value="san-francisco">San Francisco, USA</option>
                </select>
              </div>
              <Link to="/job-seeker/search" className="btn btn-primary search-btn">
                Search Jobs
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Job Categories Section */}
      <section className="categories-section">
        <div className="container">
          <div className="section-title text-center">
            <span className="section-tag">Featured Categories</span>
            <h2>Browse Top Categories</h2>
          </div>
          <div className="categories-grid">
            {jobCategories.map((category) => (
              <div key={category.id} className="category-card">
                <div className="category-icon">{category.icon}</div>
                <h3 className="category-title">
                  <Link to="/job-seeker/search">{category.title}</Link>
                </h3>
                <span className="category-count">({category.count} open roles)</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Jobs Section */}
      <section className="featured-jobs-section">
        <div className="container">
          <div className="section-title text-center">
            <span className="section-tag">Find Your Role</span>
            <h2>Featured Jobs</h2>
          </div>

          <div className="jobs-list">
            <div className="featured-job-card">
              <div className="job-info-block">
                <div className="job-title-group">
                  <h3>Senior Product Designer</h3>
                  <p className="job-meta">Google Inc. • New York, USA</p>
                </div>
                <div className="job-tags">
                  <span className="badge badge-success">Full Time</span>
                  <span className="badge badge-info">Design</span>
                </div>
              </div>
              <div className="job-action-block">
                <span className="job-salary-range">$120,000 - $150,000 / yr</span>
                <Link to="/job-seeker/search" className="btn btn-primary">
                  Apply Now
                </Link>
              </div>
            </div>

            <div className="featured-job-card">
              <div className="job-info-block">
                <div className="job-title-group">
                  <h3>Frontend Developer</h3>
                  <p className="job-meta">Tech Startup • San Francisco, USA</p>
                </div>
                <div className="job-tags">
                  <span className="badge badge-success">Full Time</span>
                  <span className="badge badge-info">Development</span>
                </div>
              </div>
              <div className="job-action-block">
                <span className="job-salary-range">$100,000 - $130,000 / yr</span>
                <Link to="/job-seeker/search" className="btn btn-primary">
                  Apply Now
                </Link>
              </div>
            </div>
          </div>

          <div className="browse-all-wrapper">
            <Link to="/job-seeker/search" className="btn btn-secondary">
              Browse All Jobs
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <div className="container text-center">
          <h2>Ready to Start Your Career?</h2>
          <p>Join thousands of job seekers and find your perfect job today.</p>
          <Link to="/job-seeker/register" className="btn btn-primary cta-btn">
            Register as Candidate
          </Link>
        </div>
      </section>
    </main>
  );
}

export default HomePage;
