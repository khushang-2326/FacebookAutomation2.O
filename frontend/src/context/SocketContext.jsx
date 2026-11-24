import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [latestMetrics, setLatestMetrics] = useState({});

  useEffect(() => {
    // Connect to backend Socket.IO
    const newSocket = io('/', {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    newSocket.on('connect', () => {
      setIsConnected(true);
      console.log('⚡ Socket.IO Connected:', newSocket.id);
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      console.log('⚡ Socket.IO Disconnected');
    });

    newSocket.on('ffmpeg:metrics', (data) => {
      if (data && data.broadcastId) {
        setLatestMetrics((prev) => ({
          ...prev,
          [data.broadcastId]: data.metrics,
          [data.automationId]: data.metrics,
        }));
      }
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const joinAutomationRoom = (automationId) => {
    if (socket && isConnected && automationId) {
      socket.emit('join:automation', automationId);
    }
  };

  const leaveAutomationRoom = (automationId) => {
    if (socket && isConnected && automationId) {
      socket.emit('leave:automation', automationId);
    }
  };

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        latestMetrics,
        joinAutomationRoom,
        leaveAutomationRoom,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
