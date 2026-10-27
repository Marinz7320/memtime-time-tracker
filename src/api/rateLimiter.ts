export interface RateLimitState {
  /** Requests waiting for a free slot. */
  queued: number;
  /** Epoch ms when the next queued request is expected to go out, or null when nothing waits. */
  resumeAt: number | null;
}

type Listener = (state: RateLimitState) => void;

/**
 * Client-side sliding-window limiter.
 *
 * The API allows N requests per window per API key. Rather than firing requests
 * and collecting 429s, every request first acquires a slot here; when the window
 * is full, requests queue (FIFO) and go out as soon as the oldest slot expires.
 * A server 429 (e.g. another tab using the same key) can extend the wait via `penalize`.
 */
export class RateLimiter {
  private stamps: number[] = [];
  private queue: Array<() => void> = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private blockedUntil = 0;
  private resumeAt: number | null = null;
  private listeners = new Set<Listener>();

  constructor(
    readonly limit: number,
    readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  acquire(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.drain();
    });
  }

  /** Block all requests for `ms` (used after a server 429). */
  penalize(ms: number): void {
    this.blockedUntil = Math.max(this.blockedUntil, this.now() + ms);
    this.drain();
  }

  getState(): RateLimitState {
    return { queued: this.queue.length, resumeAt: this.queue.length ? this.resumeAt : null };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private drain(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.resumeAt = null;

    while (this.queue.length) {
      const t = this.now();
      this.stamps = this.stamps.filter((s) => s > t - this.windowMs);

      if (t < this.blockedUntil) {
        this.schedule(this.blockedUntil - t);
        break;
      }
      if (this.stamps.length < this.limit) {
        this.stamps.push(t);
        this.queue.shift()!();
        continue;
      }
      this.schedule(this.stamps[0]! + this.windowMs - t);
      break;
    }
    this.emit();
  }

  private schedule(ms: number): void {
    const wait = Math.max(ms, 0) + 5;
    this.resumeAt = this.now() + wait;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.drain();
    }, wait);
  }

  private emit(): void {
    const state = this.getState();
    this.listeners.forEach((l) => l(state));
  }
}
