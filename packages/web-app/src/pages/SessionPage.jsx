import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore.js';
import useYjs from '../hooks/useYjs.js';
import useSession from '../hooks/useSession.js';
import EditorRouter from '../editors/EditorRouter.jsx';
import AvatarBar from '../presence/AvatarBar.jsx';
import { fileAPI } from '../api/index.js';
import './SessionPage.css';

export default function SessionPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const { session, loading, generateInvite } = useSession(roomId);
  const { ydoc, provider, connected, synced } = useYjs(roomId, user);

  const [activeDoc, setActiveDoc] = useState(null);
  const [files, setFiles] = useState([]);
  const [inviteLink, setInviteLink] = useState('');
  const [uploading, setUploading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    fileAPI.list().then(r => setFiles(r.data));
  }, []);

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fileAPI.upload(form);
      setFiles(f => [res.data, ...f]);
      setActiveDoc(res.data);
    } finally {
      setUploading(false);
    }
  }

  async function copyInvite() {
    const link = await generateInvite();
    if (link) {
      setInviteLink(link);
      navigator.clipboard.writeText(link);
    }
  }

  if (loading) return <div className="session-loading">Loading session...</div>;

  return (
    <div className="session-page">
      {/* Top bar */}
      <div className="session-topbar">
        <button className="session-back" onClick={() => navigate('/dashboard')}>← Dashboard</button>
        <div className="session-title">
          <span>{session?.name || roomId}</span>
          <span className={`session-status ${connected ? 'online' : 'offline'}`}>
            {connected ? (synced ? '● Live' : '● Syncing') : '○ Offline'}
          </span>
        </div>
        <div className="session-topbar-right">
          <AvatarBar provider={provider} />
          <button onClick={copyInvite} className="session-invite-btn">🔗 Invite</button>
          {inviteLink && <span className="session-invite-copied">Copied!</span>}
        </div>
      </div>

      <div className="session-body">
        {/* Sidebar */}
        {sidebarOpen && (
          <div className="session-sidebar">
            <div className="sidebar-header">
              <span>Files</span>
              <label className="sidebar-upload">
                {uploading ? '...' : '+'}
                <input type="file" hidden onChange={handleUpload} />
              </label>
            </div>
            <div className="sidebar-files">
              {files.map(f => (
                <div
                  key={f._id}
                  className={`sidebar-file ${activeDoc?._id === f._id ? 'active' : ''}`}
                  onClick={() => setActiveDoc(f)}
                >
                  <span className="sidebar-file-ext">.{f.fileType}</span>
                  <span className="sidebar-file-name">{f.name}</span>
                </div>
              ))}
              {files.length === 0 && <p className="sidebar-empty">Upload a file to start editing</p>}
            </div>
          </div>
        )}

        {/* Editor area */}
        <div className="session-editor">
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(v => !v)}>
            {sidebarOpen ? '◀' : '▶'}
          </button>
          {activeDoc && ydoc ? (
            <EditorRouter document={activeDoc} ydoc={ydoc} provider={provider} />
          ) : (
            <div className="session-placeholder">
              <div>📂</div>
              <p>Select a file from the sidebar or upload one to start collaborating</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
