/** One inference at a time, with bounded pending audio. */
export class ProcessingQueue<T> {
  private tail: Promise<void> = Promise.resolve();
  private pending = 0;
  constructor(private readonly consume: (item: T) => Promise<void>, private readonly limit = 4) {}
  enqueue(item: T): boolean {
    if (this.pending >= this.limit) return false;
    this.pending++;
    this.tail = this.tail.then(() => this.consume(item)).finally(() => { this.pending--; });
    // Consumer errors are handled by the owner; keep later work runnable.
    this.tail = this.tail.catch(() => {});
    return true;
  }
  async drain(): Promise<void> {
    while (this.pending > 0) await this.tail;
  }
}
