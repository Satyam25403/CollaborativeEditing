const WebSocket = require('ws');

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];

class WsClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.attempt = 0;
    this.alive = false;
    this._messageHandlers = [];
    this._openHandlers = [];
    this._closeHandlers = [];
  }

  connect() {
    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      console.log('[WsClient] Connected');
      this.alive = true;
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
      this._scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error('[WsClient] Error:', err.message);
    });
  }

  _scheduleReconnect() {
    const delay = RECONNECT_DELAYS[Math.min(this.attempt, RECONNECT_DELAYS.length - 1)];
    this.attempt++;
    console.log(`[WsClient] Reconnecting in ${delay}ms (attempt ${this.attempt})`);
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
    this.alive = false;
    // Remove reconnect by nulling handlers before close
    this.ws.removeAllListeners('close');
    this.ws && this.ws.close();
  }
}

module.exports = { WsClient };