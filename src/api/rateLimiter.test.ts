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
