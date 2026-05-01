import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sessionAPI, fileAPI } from '../api/index.js';
import useAuthStore from '../store/authStore.js';
import './DashboardPage.css';

// FILE TYPE ICONS
const FILE_ICONS = {
  pdf: '📕', pptx: '📊', ppt: '📊',
  xlsx: '📗', xls: '📗', csv: '📗',
  docx: '📘', doc: '📘',
  txt: '📄', md: '📄',
  js: '🟨', jsx: '🟨', ts: '🔷', tsx: '🔷',
  py: '🐍', java: '☕', cpp: '⚙️', c: '⚙️',
  png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', webp: '🖼️'
};
const fileIcon = (ext) => FILE_ICONS[(ext || '').toLowerCase()] || '📄';

export default function DashboardPage() {
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const navigate = useNavigate();

  const [sessions, setSessions]         = useState([]);
  const [files, setFiles]               = useState([]);
  const [newSessionName, setNewName]    = useState('');
  const [creating, setCreating]         = useState(false);
  const [uploading, setUploading]       = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [uploadError, setUploadError]   = useState('');
  const [activeTab, setActiveTab]       = useState('sessions'); // 'sessions' | 'files'

  useEffect(() => {
    sessionAPI.list()
      .then(r => setSessions(r.data))
      .catch(err => console.error('Failed to load sessions:', err));
    fileAPI.list()
      .then(r => setFiles(r.data))
      .catch(err => console.error('Failed to load files:', err));
  }, []);

  async function createSession() {
    const name = newSessionName.trim();
    if (!name) {
      setSessionError('Please enter a session name first');
      return;
    }
    setCreating(true);
    setSessionError('');
    try {
      const res = await sessionAPI.create({ name });
      setSessions(s => [res.data, ...s]);
      setNewName('');
      // Navigate immediately into the new session
      navigate(`/session/${res.data.roomId}`);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to create session';
      setSessionError(msg);
      console.error('createSession error:', err);
    } finally {
      setCreating(false);
    }
  }

  async function uploadFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setUploadError('');
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fileAPI.upload(form);
      setFiles(f => [res.data, ...f]);
      setActiveTab('files');
    } catch (err) {
      setUploadError(err.response?.data?.error || 'Upload failed — check file type is supported');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const STEPS = [
    { n: 1, icon: '🗂️', text: 'Create a session' },
    { n: 2, icon: '📁', text: 'Upload a file inside it' },
    { n: 3, icon: '🔗', text: 'Share the invite link' },
    { n: 4, icon: '✏️', text: 'Edit together in real time' }
  ];

  return (
    <div className="dashboard">
      {/* ── Header ── */}
      <header className="dash-header">
        <span className="dash-logo">🤝 CollabEdit</span>
        <div className="dash-user">
          <div className="dash-avatar" style={{ background: user?.avatarColor }}>
            {user?.name?.[0]?.toUpperCase()}
          </div>
          <span className="dash-username">{user?.name}</span>
          <button onClick={handleLogout} className="dash-logout">Log out</button>
        </div>
      </header>

      <div className="dash-body">

        {/* ── How it works banner (shown when no sessions yet) ── */}
        {sessions.length === 0 && (
          <div className="dash-howto">
            <h3>👋 Welcome, {user?.name}! Here's how to get started:</h3>
            <div className="dash-steps">
              {STEPS.map(s => (
                <div key={s.n} className="dash-step">
                  <div className="dash-step-num">{s.n}</div>
                  <div className="dash-step-icon">{s.icon}</div>
                  <div className="dash-step-text">{s.text}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Create session — always visible, prominent ── */}
        <div className="dash-create-box">
          <h2>Start a new session</h2>
          <p className="dash-create-hint">
            A session is a shared workspace. Give it a name, then invite collaborators.
          </p>
          <div className="dash-create-row">
            <input
              value={newSessionName}
              onChange={e => { setNewName(e.target.value); setSessionError(''); }}
              placeholder='e.g. "Q3 Review" or "Lecture 5 Notes"'
              onKeyDown={e => e.key === 'Enter' && createSession()}
              className="dash-create-input"
              autoFocus
            />
            <button
              onClick={createSession}
              className="dash-btn-primary"
              disabled={creating}
            >
              {creating ? 'Creating...' : '+ Create & Open'}
            </button>
          </div>
          {sessionError && (
            <p className="dash-error">⚠ {sessionError}</p>
          )}
        </div>

        {/* ── Tabs: Sessions | Files ── */}
        <div className="dash-tabs">
          <button
            className={`dash-tab ${activeTab === 'sessions' ? 'active' : ''}`}
            onClick={() => setActiveTab('sessions')}
          >
            🗂️ Sessions ({sessions.length})
          </button>
          <button
            className={`dash-tab ${activeTab === 'files' ? 'active' : ''}`}
            onClick={() => setActiveTab('files')}
          >
            📁 Files ({files.length})
          </button>
        </div>

        {/* ── Sessions tab ── */}
        {activeTab === 'sessions' && (
          <div className="dash-tab-content">
            {sessions.length === 0 ? (
              <div className="dash-empty-state">
                <div className="dash-empty-icon">🗂️</div>
                <p>No sessions yet.</p>
                <p className="dash-empty-sub">Type a name above and hit <strong>+ Create &amp; Open</strong>.</p>
              </div>
            ) : (
              <div className="dash-cards">
                {sessions.map(s => (
                  <div
                    key={s._id}
                    className="dash-card clickable"
                    onClick={() => navigate(`/session/${s.roomId}`)}
                  >
                    <div className="dash-card-icon">🗂️</div>
                    <div className="dash-card-info">
                      <strong>{s.name}</strong>
                      <span>{s.participants?.length || 1} participant(s) · click to open</span>
                    </div>
                    <span className="dash-card-arrow">→</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Files tab ── */}
        {activeTab === 'files' && (
          <div className="dash-tab-content">
            <div className="dash-files-header">
              <p className="dash-files-hint">
                Files uploaded here are available in any session. You can also upload directly inside a session.
              </p>
              <label className={`dash-upload-btn ${uploading ? 'loading' : ''}`}>
                {uploading ? '⏳ Uploading...' : '⬆ Upload file'}
                <input type="file" hidden onChange={uploadFile} disabled={uploading} />
              </label>
              <p className="dash-supported-types">
                Supported: PDF, PPTX, XLSX, DOCX, TXT, MD, JS, PY, PNG, JPG and more
              </p>
              {uploadError && <p className="dash-error">⚠ {uploadError}</p>}
            </div>

            {files.length === 0 ? (
              <div className="dash-empty-state">
                <div className="dash-empty-icon">📁</div>
                <p>No files yet.</p>
                <p className="dash-empty-sub">Upload a file to open it in a collaborative session.</p>
              </div>
            ) : (
              <div className="dash-cards">
                {files.map(f => (
                  <div key={f._id} className="dash-card">
                    <div className="dash-card-icon">{fileIcon(f.fileType)}</div>
                    <div className="dash-card-info">
                      <strong>{f.name}</strong>
                      <span>.{f.fileType} · {(f.size / 1024).toFixed(1)} KB</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}