import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../api/index.js';
import useAuthStore from '../store/authStore.js';

export default function useAuth() {
  const { login, logout, token, user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function handleLogin(email, password) {
    setLoading(true);
    setError('');
    try {
      const res = await authAPI.login({ email, password });
      login(res.data.token, res.data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(name, email, password) {
    setLoading(true);
    setError('');
    try {
      const res = await authAPI.register({ name, email, password });
      login(res.data.token, res.data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return { user, token, loading, error, handleLogin, handleRegister, handleLogout };
}
