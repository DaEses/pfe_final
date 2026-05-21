import { useState, useEffect } from 'react';
import '../styles/JobListing.css';

function JobListingPage() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    location: '',
    minSalary: '',
    maxSalary: '',
  });

  useEffect(() => {
    fetchJobs();
  }, [filters]);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.location) params.append('location', filters.location);
      if (filters.minSalary) params.append('minSalary', filters.minSalary);
      if (filters.maxSalary) params.append('maxSalary', filters.maxSalary);

      const response = await fetch(`http://localhost:3000/api/jobs?${params}`);
      const data = await response.json();
      setJobs(Array.isArray(data) ? data : []);
      setError('');
    } catch (err) {
      setError('Failed to load jobs');
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  return (
    <main>
      {/* Hero Area */}
      <div className="slider-area">
        <div className="single-slider section-overly slider-height2 d-flex align-items-center" style={{ backgroundImage: 'url(/assets/img/hero/about.jpg)' }}>
          <div className="container">
            <div className="row">
              <div className="col-xl-12">
                <div className="hero-cap text-center">
                  <h2>Get your job</h2>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Job Listing Section */}
      <section className="job-listing-section section-padding40">
        <div className="container">
          <div style={{ display: 'flex', gap: '40px' }}>
            {/* Filters Sidebar */}
            <div style={{ flex: '0 0 40%', width: '40%' }}>
              <div className="filter-section">
                <h4>🔍 Filter Jobs</h4>

                <div className="filter-group">
                  <label>Location</label>
                  <input
                    type="text"
                    name="location"
                    className="form-control"
                    placeholder="e.g., New York, Remote"
                    value={filters.location}
                    onChange={handleFilterChange}
                  />
                </div>

                <div className="filter-group">
                  <label>Min Salary ($)</label>
                  <input
                    type="number"
                    name="minSalary"
                    className="form-control"
                    placeholder="Minimum"
                    value={filters.minSalary}
                    onChange={handleFilterChange}
                  />
                </div>

                <div className="filter-group">
                  <label>Max Salary ($)</label>
                  <input
                    type="number"
                    name="maxSalary"
                    className="form-control"
                    placeholder="Maximum"
                    value={filters.maxSalary}
                    onChange={handleFilterChange}
                  />
                </div>
              </div>
            </div>

            {/* Job Listings */}
            <div style={{ flex: '0 0 60%', width: '60%' }}>
              {error && <div style={{ color: '#c33', background: '#fee', padding: '15px', borderRadius: '5px', marginBottom: '20px' }}>{error}</div>}

              {loading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <p>Loading jobs...</p>
                </div>
              ) : jobs.length > 0 ? (
                <div className="job-listings">
                  {jobs.map(job => (
                    <div key={job.id} className="job-listing-card">
                      <div className="job-header">
                        <h4>{job.title}</h4>
                        <p style={{ fontWeight: '600', color: '#ff6b6b', marginTop: '8px' }}>
                          {job.postedBy?.companyName || 'Company'}
                        </p>
                      </div>

                      <div style={{ display: 'flex', gap: '25px', margin: '18px 0', flexWrap: 'wrap' }}>
                        <div>
                          <span style={{ fontSize: '13px', color: '#999', fontWeight: '600', textTransform: 'uppercase' }}>📍 Location</span>
                          <p style={{ margin: '6px 0 0 0', fontSize: '16px', color: '#333', fontWeight: '500' }}>{job.location}</p>
                        </div>
                        {job.salary && (
                          <div>
                            <span style={{ fontSize: '13px', color: '#999', fontWeight: '600', textTransform: 'uppercase' }}>💰 Salary</span>
                            <p style={{ margin: '6px 0 0 0', fontSize: '16px', color: '#27ae60', fontWeight: '700' }}>
                              ${job.salary.toLocaleString()}/year
                            </p>
                          </div>
                        )}
                      </div>

                      <p style={{ color: '#555', margin: '18px 0', lineHeight: '1.8', fontSize: '15px' }}>
                        {job.description.substring(0, 220)}...
                      </p>

                      <div style={{ display: 'flex', gap: '12px', marginTop: '22px', paddingTop: '18px', borderTop: '1px solid #e8e8e8' }}>
                        <a href="#" className="button button-secondary">
                          View Details
                        </a>
                        <a href="/login" className="button button-contactForm">
                          Apply Now
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '60px 40px', background: 'white', borderRadius: '12px', color: '#666' }}>
                  <p style={{ fontSize: '18px' }}>😔 No jobs found. Try adjusting your filters.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default JobListingPage;
