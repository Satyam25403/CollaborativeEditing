import { useEffect, useState } from 'react';

export default function useAwareness(provider) {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    if (!provider) return;

    function update() {
      const states = Array.from(provider.awareness.getStates().entries());
      const localId = provider.awareness.clientID;
      const remote = states
        .filter(([id]) => id !== localId)
        .map(([id, state]) => ({ clientId: id, ...state.user, cursor: state.cursor }))
        .filter(u => u.name);
      setUsers(remote);
    }

    provider.awareness.on('change', update);
    update();

    return () => provider.awareness.off('change', update);
  }, [provider]);

  return users;
}
