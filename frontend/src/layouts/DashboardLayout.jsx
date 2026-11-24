import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Navbar from '../components/Navbar';
import { useTrial } from '../context/TrialContext';
import TrialExpiredModal from '../components/TrialExpiredModal';
import FloatingLivePlayer from '../components/FloatingLivePlayer';

export const DashboardLayout = () => {
  const { isTrial, isExpired, message, refresh } = useTrial();

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 relative">
      {isTrial && isExpired && (
        <TrialExpiredModal message={message} onRetry={refresh} />
      )}
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar />
        <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
      {/* Floating Picture-in-Picture Mini Screen when Live */}
      <FloatingLivePlayer />
    </div>
  );
};

export default DashboardLayout;
