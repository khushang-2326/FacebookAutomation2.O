import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import DashboardLayout from './layouts/DashboardLayout';
import Dashboard from './pages/Dashboard';
import FacebookConnect from './pages/FacebookConnect';
import MediaLibrary from './pages/MediaLibrary';
import CreateAutomation from './pages/CreateAutomation';
import AutomationDetail from './pages/AutomationDetail';
import BroadcastHistory from './pages/BroadcastHistory';
import Logs from './pages/Logs';
import Settings from './pages/Settings';
import Cameras from './pages/Cameras';
import CameraWall from './pages/CameraWall';
import ProjectorScreen from './pages/ProjectorScreen';
import Login from './pages/Login';
import Register from './pages/Register';

const ProtectedLayout = () => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
        Loading platform authentication...
      </div>
    );
  }
  return isAuthenticated ? <DashboardLayout /> : <Navigate to="/login" replace />;
};

export const App = () => {
  return (
    <Routes>
      {/* Public Auth Routes */}
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/register" element={<Navigate to="/" replace />} />

      {/* Dedicated HDMI Projector Screen Route (Borderless, Fullscreen, Standalone) */}
      <Route path="/projector" element={<ProjectorScreen />} />

      {/* Protected App Routes */}
      <Route path="/" element={<ProtectedLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="camera-wall" element={<CameraWall />} />
        <Route path="cameras" element={<Cameras />} />
        <Route path="facebook" element={<FacebookConnect />} />
        <Route path="media" element={<MediaLibrary />} />
        <Route path="automations/new" element={<CreateAutomation />} />
        <Route path="automations/:id/edit" element={<CreateAutomation />} />
        <Route path="automations/:id" element={<AutomationDetail />} />
        <Route path="history" element={<BroadcastHistory />} />
        <Route path="logs" element={<Logs />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* Redirect all other routes */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;

