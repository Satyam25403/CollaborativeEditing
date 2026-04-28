import React from 'react';
import useAwareness from './useAwareness.js';

/**
 * Overlay component for non-code editors (PDF, PPTX etc).
 * For code editors, cursors are handled by y-monaco directly.
 */
export default function CursorLayer({ provider, containerRef }) {
  const users = useAwareness(provider);

  return (
    <>
      {users.map(u => {
        if (!u.cursor) return null;
        const { x, y } = u.cursor;
        return (
          <div
            key={u.clientId}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              pointerEvents: 'none',
              zIndex: 100
            }}
          >
            {/* Cursor caret */}
            <div style={{
              width: 2, height: 20,
              background: u.color || '#6366f1',
              borderRadius: 1
            }} />
            {/* Name label */}
            <div style={{
              background: u.color || '#6366f1',
              color: '#fff',
              fontSize: 11,
              fontWeight: 600,
              padding: '1px 5px',
              borderRadius: '0 4px 4px 4px',
              whiteSpace: 'nowrap',
              marginTop: 2
            }}>
              {u.name}
            </div>
          </div>
        );
      })}
    </>
  );
}
