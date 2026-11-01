import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, buildUrl, describeError, request } from './http';
import { fetchAll } from './endpoints';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

afterEach(() => vi.restoreAllMocks());

describe('buildUrl', () => {
  it('adds the API prefix and skips empty params', () => {
    expect(buildUrl('/clients', { limit: 10, offset: 0, sortBy: undefined, order: '' })).toBe(
      '/api/v1/clients?limit=10&offset=0',
    );
    expect(buildUrl('/time-entries/3')).toBe('/api/v1/time-entries/3');
  });
});

describe('request', () => {
  it('sends JSON bodies and returns parsed JSON', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(201, { id: 7 }));
    const res = await request<{ id: number }>('/time-entries', { method: 'POST', body: { taskId: 1 } });
    expect(res.id).toBe(7);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{"taskId":1}');
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('turns { error } responses into ApiError with the server message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(404, { error: 'Time entry #99 not found' }));
    const err = await request('/time-entries/99').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(404);
    expect(err.serverMessage).toBe('Time entry #99 not found');
  });

  it('maps network failures to a network ApiError', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const err = await request('/clients').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.kind).toBe('network');
  });
});

describe('describeError', () => {
  it('gives specific copy for 400, 404, 429 and network errors', () => {
    expect(describeError(new ApiError(400, 'Invalid JSON body')).detail).toContain('Invalid JSON body');
    expect(describeError(new ApiError(404, 'x'), { entryId: 5 }).title).toBe('Time entry #5 not found');
    expect(describeError(new ApiError(429, undefined)).title).toBe('Too many requests');
    expect(describeError(new ApiError(0, undefined, 'network')).title).toMatch(/reach the server/);
    expect(describeError(new ApiError(503, undefined)).title).toMatch(/server had a problem/);
  });
});

describe('fetchAll', () => {
  it('walks pages until a short page arrives', async () => {
    const data = Array.from({ length: 120 }, (_, i) => i);
    const calls: Array<[number, number]> = [];
    const all = await fetchAll(async ({ limit = 0, offset = 0 }) => {
      calls.push([limit, offset]);
      return data.slice(offset, offset + limit);
    });
    expect(all).toEqual(data);
    expect(calls).toEqual([
      [50, 0],
      [50, 50],
      [50, 100],
    ]);
  });

  it('reports what has loaded after each page that has more to come', async () => {
    const data = Array.from({ length: 120 }, (_, i) => i);
    const seen: number[] = [];
    await fetchAll(async ({ limit = 0, offset = 0 }) => data.slice(offset, offset + limit), {}, (loaded) =>
      seen.push(loaded.length),
    );
    expect(seen).toEqual([50, 100]);
  });
});
