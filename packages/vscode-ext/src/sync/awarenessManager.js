class AwarenessManager {
  constructor(awareness, localUser) {
    this.awareness = awareness;
    this.localUser = localUser;
    this._listeners = [];
  }

  setLocalUser(user) {
    this.localUser = user;
    this.awareness.setLocalStateField('user', {
      name: user.name,
      color: user.avatarColor || '#4A90E2',
      userId: user._id
    });
  }

  setLocalCursor(anchor, head) {
    this.awareness.setLocalStateField('cursor', { anchor, head });
  }

  getRemoteUsers() {
    const states = Array.from(this.awareness.getStates().entries());
    const localId = this.awareness.clientID;
    return states
      .filter(([clientId]) => clientId !== localId)
      .map(([clientId, state]) => ({ clientId, ...state }));
  }

  onChange(callback) {
    this.awareness.on('change', callback);
    this._listeners.push(callback);
  }

  destroy() {
    this._listeners.forEach(cb => this.awareness.off('change', cb));
    this._listeners = [];
  }
}

module.exports = { AwarenessManager };