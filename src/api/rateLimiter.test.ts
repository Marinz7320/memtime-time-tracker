import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimiter } from './rateLimiter';

describe('RateLimiter', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('lets up to `limit` requests through immediately, then queues the rest', async () => {
    const rl = new RateLimiter(3, 60_000);
    const done: number[] = [];
    for (let i = 0; i < 5; i++) rl.acquire().then(() => done.push(i));

    await vi.advanceTimersByTimeAsync(0);
    expect(done).toEqual([0, 1, 2]);
    expect(rl.getState().queued).toBe(2);
    expect(rl.getState().resumeAt).not.toBeNull();

    await vi.advanceTimersByTimeAsync(59_000);
    expect(done).toEqual([0, 1, 2]);

    await vi.advanceTimersByTimeAsync(1_100);
    expect(done).toEqual([0, 1, 2, 3, 4]);
    expect(rl.getState()).toEqual({ queued: 0, resumeAt: null });
  });

  it('uses a sliding window, not fixed buckets', async () => {
    const rl = new RateLimiter(2, 10_000);
    const done: string[] = [];
    rl.acquire().then(() => done.push('a'));
    await vi.advanceTimersByTimeAsync(6_000);
    rl.acquire().then(() => done.push('b'));
    rl.acquire().then(() => done.push('c'));
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toEqual(['a', 'b']);
    // 'a' expires at t=10s, so 'c' goes out ~4s later, not after a fresh 10s window.
    await vi.advanceTimersByTimeAsync(4_100);
    expect(done).toEqual(['a', 'b', 'c']);
  });

  it('penalize blocks everything until the penalty passes', async () => {
    const rl = new RateLimiter(10, 60_000);
    rl.penalize(5_000);
    let ran = false;
    rl.acquire().then(() => (ran = true));
    await vi.advanceTimersByTimeAsync(4_900);
    expect(ran).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(ran).toBe(true);
  });

  it('cancelQueued rejects everything waiting and clears the wait', async () => {
    const rl = new RateLimiter(1, 60_000);
    await rl.acquire();
    const a = rl.acquire().catch((e) => e);
    const b = rl.acquire().catch((e) => e);
    expect(rl.getState().queued).toBe(2);

    rl.cancelQueued(() => 'cancelled');

    expect(await a).toBe('cancelled');
    expect(await b).toBe('cancelled');
    expect(rl.getState()).toEqual({ queued: 0, resumeAt: null });
  });

  it('removes a request from the queue when its signal aborts', async () => {
    const rl = new RateLimiter(1, 60_000);
    await rl.acquire();
    const ctrl = new AbortController();
    const aborted = rl.acquire({ signal: ctrl.signal }).catch((e) => e.name);
    let otherRan = false;
    rl.acquire().then(() => (otherRan = true));

    ctrl.abort();

    expect(await aborted).toBe('AbortError');
    expect(rl.getState().queued).toBe(1);
    await vi.advanceTimersByTimeAsync(60_100);
    expect(otherRan).toBe(true);
  });

  it('lets urgent requests overtake queued reads, keeping their own order', async () => {
    const rl = new RateLimiter(1, 1_000);
    await rl.acquire();
    const done: string[] = [];
    rl.acquire().then(() => done.push('read'));
    rl.acquire({ urgent: true }).then(() => done.push('save 1'));
    rl.acquire({ urgent: true }).then(() => done.push('save 2'));

    await vi.advanceTimersByTimeAsync(3_100);
    expect(done).toEqual(['save 1', 'save 2', 'read']);
  });

  it('adopts the server count, so a reload cannot overspend the window', async () => {
    const rl = new RateLimiter(3, 60_000);
    rl.syncWithServer(0, 20_000); // Fresh limiter, but the server has none left for 20 s.
    let ran = false;
    rl.acquire().then(() => (ran = true));
    await vi.advanceTimersByTimeAsync(19_900);
    expect(ran).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(ran).toBe(true);
  });

  it('ignores a server count lower than its own', async () => {
    const rl = new RateLimiter(3, 60_000);
    await rl.acquire();
    await rl.acquire();
    rl.syncWithServer(2, 60_000); // A late response from before our second request.
    let ran = false;
    rl.acquire().then(() => (ran = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(ran).toBe(true);
  });

  it('notifies subscribers about queue changes', async () => {
    const rl = new RateLimiter(1, 1_000);
    const seen: number[] = [];
    rl.subscribe((s) => seen.push(s.queued));
    rl.acquire();
    rl.acquire();
    await vi.advanceTimersByTimeAsync(1_100);
    expect(seen).toContain(1);
    expect(seen.at(-1)).toBe(0);
  });
});
