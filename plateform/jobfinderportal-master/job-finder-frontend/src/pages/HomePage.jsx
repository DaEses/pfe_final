import { Link } from 'react-router-dom';

function HomePage() {
  const jobCategories = [
    { id: 1, title: 'Design & Creative', count: 653, icon: 'flaticon-tour' },
    { id: 2, title: 'Design & Development', count: 658, icon: 'flaticon-cms' },
    { id: 3, title: 'Sales & Marketing', count: 658, icon: 'flaticon-report' },
    { id: 4, title: 'Mobile Application', count: 658, icon: 'flaticon-app' },
    { id: 5, title: 'Construction', count: 658, icon: 'flaticon-helmet' },
  ];

  return (
    <main>
      {/* Hero Section */}
      <div className="slider-area">
        <div className="slider-active">
          <div className="single-slider slider-height d-flex align-items-center" style={{ backgroundImage: 'url(/assets/img/hero/h1_hero.jpg)', backgroundSize: 'cover', position: 'relative', zIndex: '1' }}>
            <div className="container" style={{ position: 'relative', zIndex: '10' }}>
              <div className="row">
                <div className="col-xl-6 col-lg-9 col-md-10">
                  <div className="hero__caption">
                    <h1>Find the most exciting startup jobs</h1>
                  </div>
                </div>
              </div>

              {/* Search Box */}
              <div className="row">
                <div className="col-xl-8">
                  <form className="search-box" style={{ display: 'flex', gap: '15px', marginTop: '30px', alignItems: 'center', position: 'relative', zIndex: '20' }}>
                    <div className="input-form" style={{ flex: 1 }}>
                      <input type="text" placeholder="Job Title or keyword" className="form-control" style={{ padding: '12px 15px', border: '1px solid #ddd', borderRadius: '5px', height: '50px', fontSize: '14px', position: 'relative', zIndex: '20' }} />
                    </div>
                    <div className="select-form" style={{ minWidth: '160px', position: 'relative', zIndex: '20' }}>
                      <select className="form-control" style={{ padding: '12px 15px', border: '1px solid #ddd', borderRadius: '5px', height: '50px', fontSize: '14px' }}>
                        <option value="">Location BD</option>
                        <option value="">Location PK</option>
                        <option value="">Location US</option>
                        <option value="">Location UK</option>
                      </select>
                    </div>
                    <div className="search-form">
                      <Link to="/job_listing" className="button button-contactForm" style={{ padding: '12px 30px', height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ff6b6b', color: 'white', textDecoration: 'none', borderRadius: '5px', fontWeight: '600', border: 'none', cursor: 'pointer', position: 'relative', zIndex: '20' }}>Find job</Link>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Job Categories Section */}
      <div className="our-services section-pad-t30" style={{ padding: '60px 0' }}>
        <div className="container">
          <div className="row">
            <div className="col-lg-12">
              <div className="section-tittle text-center" style={{ marginBottom: '50px' }}>
                <span style={{ color: '#ff6b6b', fontWeight: '600', fontSize: '14px' }}>FEATURED TOURS Packages</span>
                <h2 style={{ marginTop: '10px' }}>Browse Top Categories</h2>
              </div>
            </div>
          </div>
          <div className="row d-flex justify-content-center">
            {jobCategories.map((category) => (
              <div key={category.id} className="col-xl-3 col-lg-3 col-md-4 col-sm-6">
                <div className="single-services text-center mb-30" style={{ padding: '20px', borderRadius: '8px', boxShadow: '0 0 10px rgba(0,0,0,0.05)', transition: 'all 0.3s ease' }}>
                  <div className="services-ion" style={{ marginBottom: '20px' }}>
                    <span className={category.icon} style={{ fontSize: '40px', color: '#ff6b6b' }}></span>
                  </div>
                  <div className="services-cap">
                    <h5 style={{ marginBottom: '10px' }}>
                      <Link to="/job_listing" style={{ color: '#333', textDecoration: 'none' }}>{category.title}</Link>
                    </h5>
                    <span style={{ color: '#666' }}>({category.count})</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Featured Jobs Section */}
      <section className="featured-job-area" style={{ padding: '60px 0', background: '#f9f9f9' }}>
        <div className="container">
          <div className="row">
            <div className="col-lg-12">
              <div className="section-tittle text-center" style={{ marginBottom: '50px' }}>
                <span style={{ color: '#ff6b6b', fontWeight: '600', fontSize: '14px' }}>FEATURED JOBS</span>
                <h2 style={{ marginTop: '10px' }}>Featured Jobs</h2>
              </div>
            </div>
          </div>

          <div className="row">
            <div className="col-lg-12">
              <div style={{ background: 'white', padding: '30px', borderRadius: '8px', marginBottom: '20px', boxShadow: '0 0 10px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ marginBottom: '5px', color: '#333' }}>Senior Product Designer</h4>
                    <p style={{ color: '#666', marginBottom: '10px' }}>Google Inc. • New York, USA</p>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <span style={{ background: '#e8f5e9', color: '#27ae60', padding: '5px 15px', borderRadius: '20px', fontSize: '12px' }}>Full Time</span>
                      <span style={{ background: '#fff3e0', color: '#f39c12', padding: '5px 15px', borderRadius: '20px', fontSize: '12px' }}>Design</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <h4 style={{ color: '#ff6b6b', marginBottom: '10px' }}>$120k - $150k</h4>
                    <Link to="/job_listing" className="button button-contactForm" style={{ padding: '10px 20px', textDecoration: 'none', color: 'white', background: '#ff6b6b' }}>Apply Now</Link>
                  </div>
                </div>
              </div>

              <div style={{ background: 'white', padding: '30px', borderRadius: '8px', marginBottom: '20px', boxShadow: '0 0 10px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ marginBottom: '5px', color: '#333' }}>Frontend Developer</h4>
                    <p style={{ color: '#666', marginBottom: '10px' }}>Tech Startup • San Francisco, USA</p>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <span style={{ background: '#e8f5e9', color: '#27ae60', padding: '5px 15px', borderRadius: '20px', fontSize: '12px' }}>Full Time</span>
                      <span style={{ background: '#fff3e0', color: '#f39c12', padding: '5px 15px', borderRadius: '20px', fontSize: '12px' }}>Development</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <h4 style={{ color: '#ff6b6b', marginBottom: '10px' }}>$100k - $130k</h4>
                    <Link to="/job_listing" className="button button-contactForm" style={{ padding: '10px 20px', textDecoration: 'none', color: 'white', background: '#ff6b6b' }}>Apply Now</Link>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="row" style={{ marginTop: '30px' }}>
            <div className="col-lg-12 text-center">
              <Link to="/job_listing" className="button button-contactForm" style={{ padding: '15px 40px' }}>Browse All Jobs</Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section style={{ padding: '80px 0', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
        <div className="container">
          <div className="row justify-content-center">
            <div className="col-lg-8 text-center">
              <h2 style={{ fontSize: '42px', marginBottom: '20px', color: 'white' }}>Ready to Start Your Career?</h2>
              <p style={{ fontSize: '18px', marginBottom: '30px', color: 'rgba(255,255,255,0.9)' }}>Join thousands of job seekers and find your perfect job today.</p>
              <Link to="/register" className="button button-contactForm" style={{ padding: '15px 40px', background: '#ff6b6b', color: 'white', textDecoration: 'none', display: 'inline-block', borderRadius: '5px', fontWeight: '600' }}>Register Now</Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default HomePage;

