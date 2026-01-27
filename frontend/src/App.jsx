import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { isAuthenticated } from './utils/auth';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ConnectInstagram from './pages/ConnectInstagram';
import CreateAutomation from './pages/CreateAutomation';
import Automations from './pages/Automations';

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
          path="/automations"
          element={
            <ProtectedRoute>
              <Automations />
            </ProtectedRoute>
          }
        />

        {/* Default redirect */}
        <Route
          path="/"
          element={
            <Navigate to={isAuthenticated() ? '/dashboard' : '/login'} replace />
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
