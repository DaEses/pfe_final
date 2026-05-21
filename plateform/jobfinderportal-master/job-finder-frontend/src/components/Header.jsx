import { Link } from 'react-router-dom';
import '../styles/Header.css';

function Header({ isLoggedIn }) {
  return (
    <header>
      <div className="header-area header-transparrent">
        <div className="headder-top header-sticky">
          <div className="container">
            <div className="row align-items-center">
              <div className="col-lg-3 col-md-2">
                <div className="logo">
                  <Link to="/">
                    <img src="/assets/img/logo/logo.png" alt="Job Finder Logo" />
                  </Link>
                </div>
              </div>
              <div className="col-lg-9 col-md-9">
                <div className="menu-wrapper">
                  <div className="main-menu">
                    <nav className="d-none d-lg-block">
                      <ul id="navigation">
                        <li><Link to="/">Home</Link></li>
                        <li><Link to="/">About</Link></li>
                        <li>
                          <a href="#">Page</a>
                          <ul className="submenu">
                            <li><a href="#">Blog</a></li>
                            <li><a href="#">Blog Details</a></li>
                            <li><a href="#">Elements</a></li>
                            <li><a href="#">Job Details</a></li>
                          </ul>
                        </li>
                        <li><a href="#">Contact</a></li>
                      </ul>
                    </nav>
                  </div>
                  <div className="header-btn d-none f-right d-lg-block">
                    {!isLoggedIn ? (
                      <>
                        <Link to="/register" className="btn head-btn1">Register</Link>
                        <Link to="/login" className="btn head-btn2">Login</Link>
                      </>
                    ) : (
                      <Link to="/login" className="btn head-btn2">Logout</Link>
                    )}
                  </div>
                </div>
              </div>
              <div className="col-12">
                <div className="mobile_menu d-block d-lg-none"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;
