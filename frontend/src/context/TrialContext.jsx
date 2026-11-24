import React, { createContext, useContext, useState, useEffect } from 'react';
import { systemAPI } from '../services/api';

const TrialContext = createContext({
  isTrial: false,
  isExpired: false,
  daysLeft: 5,
  hoursLeft: 0,
  minutesLeft: 0,
  remainingMs: 0,
  message: '',
  loading: true,
  refresh: () => {}
});

export const TrialProvider = ({ children }) => {
  const [trialState, setTrialState] = useState({
    isTrial: false,
    isExpired: false,
    remainingDays: 5,
    remainingHours: 0,
    remainingMinutes: 0,
    remainingMs: 0,
    message: '',
    loading: true
  });

  const checkStatus = async () => {
    try {
      const res = await systemAPI.getTrialStatus();
      if (res.data) {
        setTrialState({
          isTrial: Boolean(res.data.isTrial),
          isExpired: Boolean(res.data.isExpired),
          remainingDays: res.data.remainingDays ?? 0,
          remainingHours: res.data.remainingHours ?? 0,
          remainingMinutes: res.data.remainingMinutes ?? 0,
          remainingMs: res.data.remainingMs ?? 0,
          message: res.data.message || '',
          loading: false
        });
      }
    } catch (_) {
      // In case of error, do not block unless confirmed
      setTrialState((prev) => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 30000); // Poll every 30 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <TrialContext.Provider value={{ ...trialState, refresh: checkStatus }}>
      {children}
    </TrialContext.Provider>
  );
};

export const useTrial = () => useContext(TrialContext);
export default TrialContext;
