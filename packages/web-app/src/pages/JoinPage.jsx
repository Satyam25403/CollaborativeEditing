import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { inviteAPI } from '../api/index.js';
import useAuthStore from '../store/authStore.js';

export default function JoinPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const authToken = useAuthStore(s => s.token);
  const [status, setStatus] = useState('Validating invite...');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authToken) {
      // Save the invite token then redirect to login
      sessionStorage.setItem('pendingInvite', token);
      navigate(`/login?next=/join/${token}`);
      return;
    }

    inviteAPI.validate(token)
      .then(res => {
        setStatus('Joining session...');
        navigate(`/session/${res.data.session.roomId}`);
      })
      .catch(err => {
        setError(err.response?.data?.error || 'Invalid or expired invite');
      });
  }, [token, authToken]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      {error ? (
        <>
          <div style={{ fontSize: 32 }}>❌</div>
          <p style={{ color: '#ef4444' }}>{error}</p>
          <button onClick={() => navigate('/dashboard')} style={{ background: '#6366f1', color: '#fff', padding: '8px 20px', borderRadius: 8 }}>
            Go to Dashboard
          </button>
        </>
      ) : (
        <>
          <div style={{ fontSize: 32 }}>⏳</div>
          <p style={{ color: '#94a3b8' }}>{status}</p>
        </>
      )}
    </div>
  );
}
