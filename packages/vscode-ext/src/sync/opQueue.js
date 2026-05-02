// OpQueue: buffers operations when the WebSocket is offline and replays
// them once reconnected. Currently used as a utility for future offline
// resilience work — integrate with wsClient.js reconnect flow.

class OpQueue {
  constructor() {
    this.queue    = [];
    this.flushing = false;
  }

  /**
   * Add an operation to the queue.
   * @param {*} op  Any serialisable operation object.
   */
  enqueue(op) {
    this.queue.push({ op, timestamp: Date.now() });
  }

  /**
   * Flush all queued operations by calling sendFn for each.
   * Stops and re-queues on the first failure so ordering is preserved.
   * @param {(op: *) => Promise<void>} sendFn
   */
  async flush(sendFn) {
    if (this.flushing || this.queue.length === 0) return;
    this.flushing = true;
    console.log(`[OpQueue] Flushing ${this.queue.length} queued operations`);
    while (this.queue.length > 0) {
      const { op } = this.queue.shift();
      try {
        await sendFn(op);
      } catch (err) {
        // Re-queue at the front and stop — retry on the next reconnect
        this.queue.unshift({ op, timestamp: Date.now() });
        console.error('[OpQueue] Flush failed, will retry on next reconnect:', err.message);
        break;
      }
    }
    this.flushing = false;
  }

  /** Discard all queued operations. */
  clear() {
    this.queue = [];
  }

  /** Number of operations currently queued. */
  get size() {
    return this.queue.length;
  }
}

module.exports = { OpQueue };