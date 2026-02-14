import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { isAuthenticated } from './utils/auth';
import ProtectedRoute from './components/ProtectedRoute';
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ConnectInstagram from './pages/ConnectInstagram';
import CreateAutomation from './pages/CreateAutomation';
import Automations from './pages/Automations';
import AutomationLeads from './pages/AutomationLeads';
import BasicAutomation from './pages/BasicAutomation';
import Sequences from './pages/Sequences';
import Pricing from './pages/Pricing';
import Contacts from './pages/Contacts';
import Settings from './pages/Settings';
import Analytics from './pages/Analytics';
import Leads from './pages/Leads';
import Onboarding from './pages/Onboarding';

function App() {
  return (
    <Router>
      <Routes>
        {/* Public routes */}
        <Route
          path="/login"
          element={
            isAuthenticated() ? <Navigate to="/dashboard" replace /> : <Login />
          }
        />

        {/* Protected routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/connect-instagram"
          element={
            <ProtectedRoute>
              <ConnectInstagram />
            </ProtectedRoute>
          }
        />
        <Route
          path="/create-automation"
          element={
            <ProtectedRoute>
              <CreateAutomation />
            </ProtectedRoute>
          }
        />
        <Route
          path="/edit-automation/:id"
          element={
            <ProtectedRoute>
              <CreateAutomation />
            </ProtectedRoute>
          }
        />
        <Route
          path="/automations"
          element={
            <ProtectedRoute>
              <Automations />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pricing"
          element={
            <ProtectedRoute>
              <Pricing />
            </ProtectedRoute>
          }
        />
        <Route
          path="/contacts"
          element={
            <ProtectedRoute>
              <Contacts />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/automations/:id/leads"
          element={
            <ProtectedRoute>
              <AutomationLeads />
            </ProtectedRoute>
          }
        />
        <Route
          path="/basic-automation"
          element={
            <ProtectedRoute>
              <BasicAutomation />
            </ProtectedRoute>
          }
        />
        <Route
          path="/sequences"
          element={
            <ProtectedRoute>
              <Sequences />
            </ProtectedRoute>
          }
        />

        {/* Analytics - Pro feature */}
        <Route
          path="/analytics"
          element={
            <ProtectedRoute>
              <Analytics />
            </ProtectedRoute>
          }
        />
        {/* Leads page */}
        <Route
          path="/leads"
          element={
            <ProtectedRoute>
              <Leads />
            </ProtectedRoute>
          }
        />
        {/* Onboarding */}
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <Onboarding />
            </ProtectedRoute>
          }
        />

        {/* Public landing page */}
        <Route
          path="/"
          element={
            isAuthenticated() ? <Navigate to="/dashboard" replace /> : <LandingPage />
          }
        />

        {/* 404 redirect */}
        <Route
          path="*"
          element={
            <Navigate to={isAuthenticated() ? '/dashboard' : '/login'} replace />
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
