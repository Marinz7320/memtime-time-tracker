import { useEffect, useState } from 'react';

/**
 * A floating arrow for long pages (e.g. a hundred clients): jumps to the bottom,
 * and once near the bottom flips to take you back to the top.
 * Only shown when the page is meaningfully taller than the window.
 */
export function ScrollJump() {
  const [state, setState] = useState<{ visible: boolean; atBottom: boolean }>({ visible: false, atBottom: false });

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const doc = document.documentElement;
        const scrollable = doc.scrollHeight - window.innerHeight;
        const visible = scrollable > window.innerHeight * 0.5;
        const atBottom = window.scrollY > scrollable - 120 || window.scrollY > scrollable / 2;
        setState((s) => (s.visible === visible && s.atBottom === atBottom ? s : { visible, atBottom }));
      });
    };
    measure();
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    // Content grows as clients/projects load and expand.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(document.body);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      ro?.disconnect();
    };
  }, []);

  if (!state.visible) return null;

  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const go = () =>
    window.scrollTo({
      top: state.atBottom ? 0 : document.documentElement.scrollHeight,
      behavior: reduced ? 'auto' : 'smooth',
    });

  return (
    <button
      type="button"
      className="scroll-jump"
      onClick={go}
      aria-label={state.atBottom ? 'Back to top' : 'Jump to bottom'}
      title={state.atBottom ? 'Back to top' : 'Jump to bottom'}
    >
      <svg viewBox="0 0 20 20" aria-hidden className={state.atBottom ? 'is-up' : undefined}>
        <path d="M10 4v12M5 11l5 5 5-5" />
      </svg>
    </button>
  );
}
