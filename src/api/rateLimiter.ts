export interface RateLimitState {
  /** Requests waiting for a free slot. */
  queued: number;
  /** Epoch ms when the next queued request is expected to go out, or null when nothing waits. */
  resumeAt: number | null;
}

type Listener = (state: RateLimitState) => void;

export interface AcquireOptions {
  /** Aborting removes the request from the queue and rejects with the signal's reason. */
  signal?: AbortSignal;
  /** Goes ahead of non-urgent requests, so a save never waits behind background reads. */
  urgent?: boolean;
}

interface Waiter {
  resolve: () => void;
  reject: (reason: unknown) => void;
  urgent: boolean;
  detach: () => void;
}

/**
 * Client-side sliding-window limiter.
 *
 * The API allows N requests per window per API key. Rather than firing requests
 * and collecting 429s, every request first acquires a slot here; when the window
 * is full, requests queue (FIFO, urgent first) and go out as soon as the oldest slot
 * expires. This count starts empty on every page load and doesn't see other tabs, while
 * the server's doesn't, so `syncWithServer` corrects it from response headers. A server
 * 429 can still extend the wait via `penalize`.
 */
export class RateLimiter {
  private stamps: number[] = [];
  private queue: Waiter[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private blockedUntil = 0;
  private resumeAt: number | null = null;
  private listeners = new Set<Listener>();

  constructor(
    readonly limit: number,
    readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  acquire({ signal, urgent = false }: AcquireOptions = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      const onAbort = () => {
        this.queue = this.queue.filter((w) => w !== waiter);
        reject(signal?.reason);
        this.drain();
      };
      const waiter: Waiter = {
        resolve,
        reject,
        urgent,
        detach: () => signal?.removeEventListener('abort', onAbort),
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      const firstRead = urgent ? this.queue.findIndex((w) => !w.urgent) : -1;
      if (firstRead === -1) this.queue.push(waiter);
      else this.queue.splice(firstRead, 0, waiter);
      this.drain();
    });
  }

  /** Reject everything still waiting. Those requests were never sent. */
  cancelQueued(makeError: () => unknown): void {
    const waiting = this.queue;
    this.queue = [];
    waiting.forEach((w) => {
      w.detach();
      w.reject(makeError());
    });
    this.drain();
  }

  /**
   * Adopt the server's count when it has seen more requests than we have.
   * Slots we don't know about are assumed to free up when the server's window resets.
   */
  syncWithServer(remaining: number, resetMs: number): void {
    const t = this.now();
    this.stamps = this.stamps.filter((s) => s > t - this.windowMs);
    const unknown = this.limit - remaining - this.stamps.length;
    if (unknown <= 0) return;
    const stamp = t + resetMs - this.windowMs;
    this.stamps = [...this.stamps, ...Array<number>(unknown).fill(stamp)].sort((a, b) => a - b);
    this.drain();
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
        const next = this.queue.shift()!;
        next.detach();
        next.resolve();
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
