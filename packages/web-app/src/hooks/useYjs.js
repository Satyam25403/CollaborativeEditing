import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

export default function useYjs(roomId, user) {
  const ydocRef = useRef(null);
  const providerRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (!roomId || !user) return;

    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    const token = localStorage.getItem('collab_token');
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/collab`;

    const provider = new WebsocketProvider(wsUrl, roomId, ydoc, {
      params: { token }
    });
    providerRef.current = provider;

    provider.on('status', ({ status }) => {
      setConnected(status === 'connected');
    });

    provider.on('sync', (isSynced) => {
      setSynced(isSynced);
    });

    // Set local awareness (who I am)
    provider.awareness.setLocalStateField('user', {
      name: user.name,
      color: user.avatarColor,
      userId: user._id
    });

    return () => {
      provider.destroy();
      ydoc.destroy();
      setConnected(false);
      setSynced(false);
    };
  }, [roomId, user]);

  return {
    ydoc: ydocRef.current,
    provider: providerRef.current,
    connected,
    synced
  };
}
