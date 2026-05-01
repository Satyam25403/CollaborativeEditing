import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

// BUG 15 FIX: return ydoc/provider as STATE not refs so React re-renders when they are ready
export default function useYjs(roomId, user) {
  const [ydoc, setYdoc] = useState(null);
  const [provider, setProvider] = useState(null);
  const [connected, setConnected] = useState(false);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (!roomId || !user) return;

    const doc = new Y.Doc();
    const token = localStorage.getItem('collab_token');
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${proto}://${window.location.host}/collab`;

    const prov = new WebsocketProvider(wsUrl, roomId, doc, {
      params: { token }
    });

    prov.on('status', ({ status }) => setConnected(status === 'connected'));
    prov.on('sync', (isSynced) => setSynced(isSynced));

    prov.awareness.setLocalStateField('user', {
      name: user.name,
      color: user.avatarColor,
      userId: user._id
    });

    // Set state so consumers re-render when ready
    setYdoc(doc);
    setProvider(prov);

    return () => {
      prov.destroy();
      doc.destroy();
      setYdoc(null);
      setProvider(null);
      setConnected(false);
      setSynced(false);
    };
  }, [roomId, user?._id]); // use user._id not user object to avoid infinite loops

  return { ydoc, provider, connected, synced };
}
