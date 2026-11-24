import React, { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);

const defaultAdminUser = {
  _id: '000000000000000000000001',
  name: 'Administrator',
  email: 'admin@liveautomation.dev',
  role: 'admin'
};

export const AuthProvider = ({ children }) => {
  // Completely bypass all authentication
  const [user] = useState(defaultAdminUser);
  const [token] = useState('bypassed-token-xyz');
  const loading = false;

  const login = async () => user;
  const register = async () => user;
  const logout = () => {};

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: true,
        loading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
