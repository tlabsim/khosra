/** Keep at most one in-flight snapshot and the latest queued snapshot. The latest
 * workspace contains every immutable revision, so coalescing never prunes history. */
export class SnapshotWriter<T> {
  private pending: T | undefined;
  private running = false;
  private waiters: { resolve: () => void; reject: (error: unknown) => void }[] =
    [];
  constructor(private persist: (snapshot: T) => Promise<void>) {}
  enqueue(snapshot: T): Promise<void> {
    this.pending = snapshot;
    const complete = new Promise<void>((resolve, reject) =>
      this.waiters.push({ resolve, reject }),
    );
    if (!this.running) {
      this.running = true;
      void this.drain();
    }
    return complete;
  }
  private async drain() {
    try {
      while (this.pending !== undefined) {
        const snapshot = this.pending;
        this.pending = undefined;
        await this.persist(snapshot);
      }
      for (const waiter of this.waiters) waiter.resolve();
    } catch (error) {
      this.pending = undefined;
      for (const waiter of this.waiters) waiter.reject(error);
    } finally {
      this.waiters = [];
      this.running = false;
    }
  }
}
