/**
 * Forgiving parsers for typed times and durations, so people can type the way they think:
 *   times:     "9" "930" "0930" "9:30" "9.30" "17h" "5pm" "5:30 pm" "12am"
 *   durations: "1h 30m" "1h30" "90m" "1:30" "1.5" "1,5h" "45" (bare numbers above 12 are minutes)
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** Returns `HH:MM` (24h) or null if the text can't be read as a time of day. */
export function parseTimeInput(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return null;
  const m = /^(\d{1,2})(?:[:.h]?(\d{2}))?h?(am|pm|a|p)?$/.exec(s) ?? /^(\d{3,4})(am|pm|a|p)?$/.exec(s);
  if (!m) return null;

  let h: number;
  let min: number;
  let suffix: string | undefined;
  if (m.length === 3) {
    // "930" / "1730"
    const digits = m[1]!;
    h = Number(digits.slice(0, -2));
    min = Number(digits.slice(-2));
    suffix = m[2];
  } else {
    h = Number(m[1]);
    min = m[2] ? Number(m[2]) : 0;
    suffix = m[3];
  }
  if (suffix) {
    if (h < 1 || h > 12) return null;
    const pm = suffix.startsWith('p');
    h = (h % 12) + (pm ? 12 : 0);
  }
  if (h === 24 && min === 0) h = 0;
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

/** Returns minutes, or null. */
export function parseDurationInput(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(',', '.');
  if (!s) return null;

  const hm = /^(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?$/.exec(s) ?? /^(\d+)\s*h\s*(\d+)$/.exec(s);
  if (hm) return Math.round(Number(hm[1]) * 60 + (hm[2] ? Number(hm[2]) : 0));

  const mOnly = /^(\d+)\s*m(?:in(?:utes?)?)?$/.exec(s);
  if (mOnly) return Number(mOnly[1]);

  const colon = /^(\d+):(\d{1,2})$/.exec(s);
  if (colon) return Number(colon[1]) * 60 + Number(colon[2]);

  const num = /^\d+(?:\.\d+)?$/.exec(s);
  if (num) {
    const n = Number(s);
    // "1.5" or "8" read as hours; "45" or "90" read as minutes.
    return n <= 12 ? Math.round(n * 60) : Math.round(n);
  }
  return null;
}

/** Minutes as `1h 30m`, `45m`, `8h`. */
export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${pad(m)}m` : `${h}h`;
}

/** Shift an `HH:MM` value by some minutes, wrapping around midnight. */
export function shiftTime(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}
