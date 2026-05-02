// FIX BUG 6/7: AwarenessManager is now used by yjsProvider.js instead of
// being dead code. It centralises all awareness state mutations and cleanup.

class AwarenessManager {
  /**
   * @param {import('y-protocols/awareness').Awareness} awareness
   * @param {{ name: string, avatarColor?: string, _id?: string } | null} localUser
   */
  constructor(awareness, localUser) {
    this.awareness = awareness;
    this.localUser = localUser;
    this._listeners = [];
  }

  /**
   * Push local user identity into awareness so remote peers see the correct name/color.
   * @param {{ name: string, avatarColor?: string, _id?: string }} user
   */
  setLocalUser(user) {
    this.localUser = user;
    this.awareness.setLocalStateField('user', {
      name:   user.name,
      color:  user.avatarColor || '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0'),
      userId: user._id || null
    });
  }

  /**
   * Push current cursor position into awareness.
   * @param {number} anchor  character offset
   * @param {number} head    character offset (same as anchor for a collapsed cursor)
   */
  setLocalCursor(anchor, head) {
    this.awareness.setLocalStateField('cursor', { anchor, head });
  }

  /**
   * Returns awareness state for all peers except the local client.
   * @returns {Array<{ clientId: number, user: object, cursor?: object }>}
   */
  getRemoteUsers() {
    const states  = Array.from(this.awareness.getStates().entries());
    const localId = this.awareness.clientID;
    return states
      .filter(([clientId]) => clientId !== localId)
      .map(([clientId, state]) => ({ clientId, ...state }));
  }

  /**
   * Register a callback that fires whenever awareness state changes.
   * The manager tracks listeners so they can be cleaned up in destroy().
   * @param {Function} callback
   */
  onChange(callback) {
    this.awareness.on('change', callback);
    this._listeners.push(callback);
  }

  /**
   * Remove all listeners registered through this manager.
   */
  destroy() {
    this._listeners.forEach(cb => this.awareness.off('change', cb));
    this._listeners = [];
  }
}

module.exports = { AwarenessManager };