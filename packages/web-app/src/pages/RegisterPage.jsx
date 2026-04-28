import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import useAuth from '../hooks/useAuth.js';
import './AuthPage.css';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { handleRegister, loading, error } = useAuth();

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2>Create account</h2>
        <p className="auth-sub">Start collaborating in seconds</p>
        {error && <div className="auth-error">{error}</div>}
        <label>Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
        <label>Email</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
        <label>Password</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 6 characters" />
        <button className="auth-btn" onClick={() => handleRegister(name, email, password)} disabled={loading}>
          {loading ? 'Creating account...' : 'Register'}
        </button>
        <p className="auth-switch">Already have an account? <Link to="/login">Log in</Link></p>
      </div>
    </div>
  );
}
