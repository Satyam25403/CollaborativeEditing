class OpQueue {
  constructor() {
    this.queue = [];
    this.flushing = false;
  }

  enqueue(op) {
    this.queue.push({ op, timestamp: Date.now() });
  }

  async flush(sendFn) {
    if (this.flushing || this.queue.length === 0) return;
    this.flushing = true;
    console.log(`[OpQueue] Flushing ${this.queue.length} queued operations`);
    while (this.queue.length > 0) {
      const { op } = this.queue.shift();
      try {
        await sendFn(op);
      } catch (err) {
        // Re-queue on failure and stop flushing
        this.queue.unshift({ op, timestamp: Date.now() });
        console.error('[OpQueue] Flush failed, will retry on next reconnect:', err.message);
        break;
      }
    }
    this.flushing = false;
  }

  clear() {
    this.queue = [];
  }

  get size() {
    return this.queue.length;
  }
}

module.exports = { OpQueue };