import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { ApiError, cancelPendingRequests, describeError, rateLimiter, request } from './http';
import { fetchAll } from './endpoints';
import { RateLimitBanner } from '../components/RateLimitBanner';
import { ErrorNotice } from '../components/Feedback';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

/** A fetch that never answers, but rejects like the real one when aborted. */
const hangingFetch = () =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }),
  );

afterEach(() => {
  cancelPendingRequests();
  cleanup();
  vi.restoreAllMocks();
});

describe('cancelPendingRequests', () => {
  it('aborts reads on the wire and ends a multi-page load', async () => {
    const fetchMock = hangingFetch();
    const all = fetchAll((p) => request<number[]>('/clients', { query: { ...p } })).catch((e) => e);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    cancelPendingRequests();

    const err = await all;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.kind).toBe('cancelled');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(describeError(err).title).toBe('Request cancelled');
  });

  it('leaves writes on the wire alone, because their outcome would be unknown', async () => {
    const fetchMock = hangingFetch();
    let settled = false;
    request('/time-entries', { method: 'POST', body: {} }).catch(() => undefined).finally(() => (settled = true));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    cancelPendingRequests();
    await new Promise((r) => setTimeout(r, 0));

    expect(settled).toBe(false);
    expect((fetchMock.mock.calls[0]![1]?.signal as AbortSignal).aborted).toBe(false);
  });
});

// Runs last: the penalty below blocks the shared limiter for the rest of this file.
describe('when requests are stuck behind the limit', () => {
  it('Cancel never sends them and replaces the spinner with a retry option', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    rateLimiter.penalize(60_000);

    function Clients() {
      const q = useQuery({
        queryKey: ['clients'],
        queryFn: () => request('/clients'),
        retry: (count, err) => count < 1 && !(err instanceof ApiError && err.kind === 'cancelled'),
      });
      return q.isPending ? <p>Loading clients…</p> : <ErrorNotice error={q.error} onRetry={() => q.refetch()} />;
    }

    render(
      <QueryClientProvider client={new QueryClient()}>
        <RateLimitBanner />
        <Clients />
      </QueryClientProvider>,
    );

    await screen.findByText(/1 request will continue/);
    expect(screen.getByText('Loading clients…')).toBeTruthy();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel 1 waiting request' }));
    });

    await screen.findByRole('alert');
    expect(screen.getByText('Request cancelled')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.queryByText(/will continue/)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('server rate-limit headers', () => {
  it('are passed to the limiter on every response', async () => {
    const sync = vi.spyOn(rateLimiter, 'syncWithServer');
    vi.spyOn(rateLimiter, 'acquire').mockResolvedValue();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json(200, [], { 'RateLimit-Remaining': '4', 'RateLimit-Reset': '30' }),
    );
    await request('/clients');
    expect(sync).toHaveBeenCalledWith(4, 30_000);
  });
});
