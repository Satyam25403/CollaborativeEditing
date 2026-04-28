import React from 'react';
import { Link } from 'react-router-dom';
import './HomePage.css';

export default function HomePage() {
  return (
    <div className="home">
      <div className="home-hero">
        <div className="home-badge">🤝 Real-time collaboration</div>
        <h1>Edit <span>anything</span> together</h1>
        <p>Code, PDFs, presentations, spreadsheets — all collaborative, all in real time.</p>
        <div className="home-actions">
          <Link to="/register" className="btn-primary">Get started free</Link>
          <Link to="/login" className="btn-ghost">Log in</Link>
        </div>
      </div>
      <div className="home-features">
        {[
          { icon: '⚡', title: 'Real-time sync', desc: 'Conflict-free edits powered by Yjs CRDT' },
          { icon: '📄', title: 'Every file type', desc: 'Code, PDF, PPTX, spreadsheets, images' },
          { icon: '🔗', title: 'Invite anyone', desc: 'Share a link — no account required to view' },
          { icon: '👁️', title: 'Live cursors', desc: 'See exactly where your collaborators are' }
        ].map(f => (
          <div key={f.title} className="home-feature-card">
            <div className="feature-icon">{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
