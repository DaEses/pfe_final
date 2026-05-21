import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import HRLayout from './components/HRLayout';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import JobListingPage from './pages/JobListingPage';
import Dashboard from './pages/Dashboard';
import JobPostings from './pages/JobPostings';
import Applicants from './pages/Applicants';
import ScheduledMeetings from './pages/ScheduledMeetings';
import InterviewReport from './pages/InterviewReport';
import JobSeekerLogin from './pages/JobSeeker/Login';
import JobSeekerRegister from './pages/JobSeeker/Register';
import JobSearch from './pages/JobSeeker/JobSearch';
import CandidateInterview from './pages/JobSeeker/CandidateInterview';
import { getHRToken } from './services/api';
import './App.css';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(Boolean(getHRToken()));
  const location = useLocation();
  const isHRArea = location.pathname.startsWith('/hr');

  useEffect(() => {
    setIsLoggedIn(Boolean(getHRToken()));
  }, [location.pathname]);

  return (
    <div className="app">
      {!isHRArea && <Header isLoggedIn={isLoggedIn} />}

      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route
          path="/login"
          element={<LoginPage setIsLoggedIn={setIsLoggedIn} />}
        />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/job_listing" element={<JobListingPage />} />

        {/* Job Seeker public area */}
        <Route path="/job-seeker/login" element={<JobSeekerLogin />} />
        <Route path="/job-seeker/register" element={<JobSeekerRegister />} />
        <Route path="/job-seeker/search" element={<JobSearch />} />
        <Route path="/job-seeker/interview/:jobPostingId" element={<CandidateInterview />} />

        {/* HR private area */}
        <Route path="/hr" element={<HRLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="jobs" element={<JobPostings />} />
          <Route path="jobs/:jobId/applicants" element={<Applicants />} />
          <Route path="meetings" element={<ScheduledMeetings />} />
          <Route path="reports/:interviewId" element={<InterviewReport />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {!isHRArea && <Footer />}
    </div>
  );
}

export default App;
