const WebSocket = require('ws');

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];
const MAX_RECONNECT_ATTEMPTS = 10;

class WsClient {
  constructor(url) {
    this.url = url;
    this.ws  = null;
    this.attempt = 0;
    this.alive   = false;
    this._destroyed = false;   // FIX BUG 4: hard stop flag for reconnect loop
    this._messageHandlers = [];
    this._openHandlers    = [];
    this._closeHandlers   = [];
  }

  connect() {
    if (this._destroyed) return;

    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      console.log('[WsClient] Connected');
      this.alive   = true;
      this.attempt = 0;
      this._openHandlers.forEach(fn => fn());
    });

    this.ws.on('message', (data) => {
      this._messageHandlers.forEach(fn => fn(data));
    });

    this.ws.on('close', () => {
      console.log('[WsClient] Disconnected');
      this.alive = false;
      this._closeHandlers.forEach(fn => fn());
      // FIX BUG 4: only reconnect if not intentionally destroyed
      if (!this._destroyed) {
        this._scheduleReconnect();
      }
    });

    this.ws.on('error', (err) => {
      console.error('[WsClient] Error:', err.message);
    });
  }

  _scheduleReconnect() {
    // FIX BUG 4: cap reconnect attempts to avoid infinite CPU burn
    if (this.attempt >= MAX_RECONNECT_ATTEMPTS) {
      console.error(`[WsClient] Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`);
      return;
    }
    const delay = RECONNECT_DELAYS[Math.min(this.attempt, RECONNECT_DELAYS.length - 1)];
    this.attempt++;
    console.log(`[WsClient] Reconnecting in ${delay}ms (attempt ${this.attempt}/${MAX_RECONNECT_ATTEMPTS})`);
    setTimeout(() => this.connect(), delay);
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  onMessage(fn) { this._messageHandlers.push(fn); }
  onOpen(fn)    { this._openHandlers.push(fn); }
  onClose(fn)   { this._closeHandlers.push(fn); }

  close() {
    // FIX BUG 4: set destroyed flag BEFORE calling ws.close so the close
    //            handler does not trigger a reconnect; also guard null ws
    this._destroyed = true;
    this.alive      = false;
    if (this.ws) {
      this.ws.removeAllListeners('close');
      this.ws.close();
      this.ws = null;
    }
  }
}

module.exports = { WsClient };