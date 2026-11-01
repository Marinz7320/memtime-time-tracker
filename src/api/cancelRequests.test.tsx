import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { ApiError, cancelPendingRequests, describeError, rateLimiter, request, shouldRetryQuery } from './http';
import { fetchAll } from './endpoints';
import { RateLimitBanner } from '../components/RateLimitBanner';
import { ErrorNotice } from '../components/Feedback';
import { HierarchyView } from '../features/hierarchy/HierarchyView';
import { matchTasksToClients } from '../lib/matchTasks';

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

describe('stopping a long list halfway', () => {
  const client = (i: number) => ({ id: i, name: `Client ${i}`, description: '', status: 'active' });
  const url = (input: RequestInfo | URL) => String(input);

  /** Clients: one full page, then the next page hangs. Time entries: none. */
  const stallOnSecondPage = (onSecondPage?: () => Response) =>
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      if (url(input).includes('/time-entries')) return Promise.resolve(json(200, []));
      if (url(input).includes('offset=0')) {
        return Promise.resolve(json(200, Array.from({ length: 50 }, (_, i) => client(i))));
      }
      if (onSecondPage) return Promise.resolve(onSecondPage());
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    });

  const renderView = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: shouldRetryQuery } } });
    render(
      <QueryClientProvider client={qc}>
        <HierarchyView onLogTime={() => undefined} />
      </QueryClientProvider>,
    );
    return qc;
  };

  it('shows clients while more are loading, and keeps them after stopping', async () => {
    const fetchMock = stallOnSecondPage();
    renderView();

    await screen.findByText('Client 0');
    expect(screen.getByText('Loading more clients…')).toBeTruthy();

    act(() => cancelPendingRequests());

    await screen.findByText('Showing what loaded before you stopped.');
    expect(screen.getByText('Client 49')).toBeTruthy();
    expect(screen.queryByText('Loading more clients…')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();

    fetchMock.mockRestore();
    stallOnSecondPage(() => json(200, [client(50)]));
    fireEvent.click(screen.getByRole('button', { name: 'Load the rest' }));

    await screen.findByText('Client 50');
    expect(screen.getByText('Client 0')).toBeTruthy();
    expect(screen.queryByText('Showing what loaded before you stopped.')).toBeNull();
  });

  it('Match tasks reloads a stopped list instead of treating it as complete', async () => {
    const fetchMock = stallOnSecondPage();
    const qc = renderView();
    await screen.findByText('Client 0');
    act(() => cancelPendingRequests());
    await screen.findByText('Showing what loaded before you stopped.');

    fetchMock.mockRestore();
    const again = stallOnSecondPage(() => json(200, [client(50)]));
    await matchTasksToClients(qc, []);

    expect(again.mock.calls.filter(([input]) => url(input).includes('/clients'))).toHaveLength(2);
  });
});

// Runs last: the penalty below blocks the shared limiter for the rest of this file.
describe('when requests are stuck behind the limit', () => {
  it('Cancel never sends them and replaces the spinner with a quiet Load option', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    rateLimiter.penalize(60_000);

    function Clients() {
      const q = useQuery({ queryKey: ['clients'], queryFn: () => request('/clients'), retry: shouldRetryQuery });
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

    await screen.findByText('Not loaded.');
    expect(screen.getByRole('button', { name: 'Load' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
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
