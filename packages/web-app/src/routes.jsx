import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import HomePage from './pages/HomePage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import SessionPage from './pages/SessionPage.jsx';
import JoinPage from './pages/JoinPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import useAuthStore from './store/authStore.js';

function PrivateRoute({ children }) {
  const token = useAuthStore(s => s.token);
  return token ? children : <Navigate to="/login" replace />;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/join/:token" element={<JoinPage />} />
      <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
      <Route path="/session/:roomId" element={<PrivateRoute><SessionPage /></PrivateRoute>} />
    </Routes>
  );
}