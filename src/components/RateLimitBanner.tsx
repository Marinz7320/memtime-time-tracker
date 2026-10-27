import { useEffect, useState, useSyncExternalStore } from 'react';
import { rateLimiter } from '../api/http';

let snapshot = rateLimiter.getState();
const subscribe = (cb: () => void) =>
  rateLimiter.subscribe((s) => {
    snapshot = s;
    cb();
  });

/**
 * Shown only while requests are waiting for the API's 15-per-minute window,
 * so a slow screen is explained instead of looking broken.
 */
export function RateLimitBanner() {
  const state = useSyncExternalStore(subscribe, () => snapshot);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!state.resumeAt) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [state.resumeAt]);

  if (!state.queued || !state.resumeAt) return null;
  const seconds = Math.max(1, Math.ceil((state.resumeAt - now) / 1000));

  return (
    <div className="ratelimit" role="status">
      <span className="ratelimit__pulse" aria-hidden />
      Waiting for the API limit (15 requests per minute). {state.queued}{' '}
      {state.queued === 1 ? 'request' : 'requests'} will continue in {seconds}s.
    </div>
  );
}
