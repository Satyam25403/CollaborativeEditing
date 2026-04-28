import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sessionAPI, fileAPI } from '../api/index.js';
import useAuthStore from '../store/authStore.js';
import useAuth from '../hooks/useAuth.js';
import './DashboardPage.css';

export default function DashboardPage() {
  const user = useAuthStore(s => s.user);
  const { handleLogout } = useAuth();
  const navigate = useNavigate();

  const [sessions, setSessions] = useState([]);
  const [files, setFiles] = useState([]);
  const [newSessionName, setNewSessionName] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    sessionAPI.list().then(r => setSessions(r.data));
    fileAPI.list().then(r => setFiles(r.data));
  }, []);

  async function createSession() {
    if (!newSessionName.trim()) return;
    const res = await sessionAPI.create({ name: newSessionName });
    setSessions(s => [res.data, ...s]);
    setNewSessionName('');
    navigate(`/session/${res.data.roomId}`);
  }

  async function uploadFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fileAPI.upload(form);
      setFiles(f => [res.data, ...f]);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="dashboard">
      <header className="dash-header">
        <span className="dash-logo">🤝 CollabEdit</span>
        <div className="dash-user">
          <div className="dash-avatar" style={{ background: user?.avatarColor }}>{user?.name?.[0]}</div>
          <span>{user?.name}</span>
          <button onClick={handleLogout} className="dash-logout">Log out</button>
        </div>
      </header>

      <div className="dash-body">
        {/* Sessions */}
        <section className="dash-section">
          <h2>Sessions</h2>
          <div className="dash-new-session">
            <input
              value={newSessionName}
              onChange={e => setNewSessionName(e.target.value)}
              placeholder="New session name..."
              onKeyDown={e => e.key === 'Enter' && createSession()}
            />
            <button onClick={createSession} className="dash-btn-primary">+ Create</button>
          </div>
          <div className="dash-cards">
            {sessions.map(s => (
              <div key={s._id} className="dash-card" onClick={() => navigate(`/session/${s.roomId}`)}>
                <div className="dash-card-icon">🗂️</div>
                <div className="dash-card-info">
                  <strong>{s.name}</strong>
                  <span>{s.participants?.length || 1} participant(s)</span>
                </div>
                <span className="dash-card-arrow">→</span>
              </div>
            ))}
            {sessions.length === 0 && <p className="dash-empty">No sessions yet. Create one above.</p>}
          </div>
        </section>

        {/* Files */}
        <section className="dash-section">
          <h2>Files</h2>
          <label className="dash-upload-btn">
            {uploading ? 'Uploading...' : '⬆ Upload file'}
            <input type="file" hidden onChange={uploadFile} />
          </label>
          <div className="dash-cards">
            {files.map(f => (
              <div key={f._id} className="dash-card">
                <div className="dash-card-icon">📄</div>
                <div className="dash-card-info">
                  <strong>{f.name}</strong>
                  <span>.{f.fileType} · {(f.size / 1024).toFixed(1)} KB</span>
                </div>
              </div>
            ))}
            {files.length === 0 && <p className="dash-empty">No files yet. Upload one above.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
