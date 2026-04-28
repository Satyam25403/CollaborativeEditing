import React from 'react';
import useAwareness from './useAwareness.js';

export default function AvatarBar({ provider }) {
  const users = useAwareness(provider);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {users.map(u => (
        <div
          key={u.clientId}
          title={u.name}
          style={{
            width: 32, height: 32,
            borderRadius: '50%',
            background: u.color || '#6366f1',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: 13,
            border: '2px solid #1a1d27',
            flexShrink: 0
          }}
        >
          {u.name?.[0]?.toUpperCase() || '?'}
        </div>
      ))}
      {users.length > 0 && (
        <span style={{ fontSize: 12, color: '#94a3b8' }}>
          {users.length} online
        </span>
      )}
    </div>
  );
}
