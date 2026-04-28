import { useState, useEffect } from 'react';
import { sessionAPI, inviteAPI } from '../api/index.js';

export default function useSession(roomId) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!roomId) return;
    setLoading(true);
    sessionAPI.get(roomId)
      .then(res => setSession(res.data))
      .catch(err => setError(err.response?.data?.error || 'Failed to load session'))
      .finally(() => setLoading(false));
  }, [roomId]);

  async function createSession(name) {
    const res = await sessionAPI.create({ name });
    return res.data;
  }

  async function generateInvite() {
    if (!session) return null;
    const res = await inviteAPI.create(session._id);
    return res.data.link;
  }

  async function deleteSession() {
    if (!session) return;
    await sessionAPI.delete(session.roomId);
    setSession(null);
  }

  return { session, loading, error, createSession, generateInvite, deleteSession };
}
