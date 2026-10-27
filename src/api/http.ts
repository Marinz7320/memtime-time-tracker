import { RateLimiter } from './rateLimiter';

/** Same-origin path; the dev/preview server proxies it and adds the API key. */
export const API_PREFIX = '/api/v1';

/** API allows 15 requests / 60 s per key. */
export const rateLimiter = new RateLimiter(15, 60_000);

export type ApiErrorKind = 'http' | 'network' | 'parse';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** Message returned by the API in `{ "error": "..." }`, if any. */
    readonly serverMessage: string | undefined,
    readonly kind: ApiErrorKind = 'http',
  ) {
    super(serverMessage || `Request failed with status ${status}`);
    this.name = 'ApiError';
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  signal?: AbortSignal;
}

const MAX_429_RETRIES = 2;

export function buildUrl(path: string, query?: RequestOptions['query']): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return `${API_PREFIX}${path}${qs ? `?${qs}` : ''}`;
}

function retryAfterMs(res: Response, fallback: number): number {
  const header = res.headers.get('Retry-After');
  const seconds = header ? Number(header) : NaN;
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : fallback;
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', query, body, signal } = opts;
  const url = buildUrl(path, query);

  for (let attempt = 0; ; attempt++) {
    await rateLimiter.acquire();
    signal?.throwIfAborted();

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        signal,
        headers: {
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') throw err;
      throw new ApiError(0, undefined, 'network');
    }

    if (res.status === 429 && attempt < MAX_429_RETRIES) {
      rateLimiter.penalize(retryAfterMs(res, rateLimiter.windowMs));
      continue;
    }

    const data = await readBody(res);

    if (!res.ok) {
      const message =
        data && typeof data === 'object' && 'error' in data
          ? String((data as { error: unknown }).error)
          : typeof data === 'string' && data.length < 300
            ? data
            : undefined;
      throw new ApiError(res.status, message);
    }

    if (data !== undefined && typeof data !== 'object') {
      throw new ApiError(res.status, 'Unexpected response from the server', 'parse');
    }
    return data as T;
  }
}

export interface ErrorDescription {
  title: string;
  detail?: string;
}

/** Turn any thrown value into copy a user can act on. */
export function describeError(err: unknown, context?: { entryId?: number }): ErrorDescription {
  if (!(err instanceof ApiError)) {
    return { title: 'Something went wrong', detail: err instanceof Error ? err.message : undefined };
  }
  const msg = err.serverMessage;
  switch (true) {
    case err.kind === 'network':
      return {
        title: 'Can’t reach the server',
        detail: 'Check your internet connection and try again.',
      };
    case err.status === 400:
      return {
        title: 'The server didn’t accept this request',
        detail: msg ? `${msg}. Check the fields and try again.` : 'Check the fields and try again.',
      };
    case err.status === 401 || err.status === 403:
      return {
        title: 'Not authorized',
        detail: 'The API key is missing or invalid. Check API_KEY in your .env file.',
      };
    case err.status === 404:
      return {
        title: context?.entryId ? `Time entry #${context.entryId} not found` : 'Not found',
        detail: context?.entryId
          ? 'It may have been deleted, or it belongs to another user.'
          : msg,
      };
    case err.status === 429:
      return {
        title: 'Too many requests',
        detail: 'The API allows 15 requests per minute. Wait a moment and try again.',
      };
    case err.status >= 500:
      return {
        title: 'The server had a problem',
        detail: 'This is not caused by your input. Try again in a moment.',
      };
    default:
      return { title: `Request failed (${err.status})`, detail: msg };
  }
}
