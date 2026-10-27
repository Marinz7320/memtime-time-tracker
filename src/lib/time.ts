const pad = (n: number) => String(n).padStart(2, '0');

/** Local date as `YYYY-MM-DD` (value format of <input type="date">). */
export function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local time as `HH:MM` (value format of <input type="time">). */
export function toTimeInput(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Combine local date + time inputs into a Date. Returns null for incomplete/invalid input. */
export function combineLocal(date: string, time: string): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dm || !tm) return null;
  const d = new Date(+dm[1]!, +dm[2]! - 1, +dm[3]!, +tm[1]!, +tm[2]!, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface ResolvedRange {
  start: Date;
  end: Date;
  /** End time is earlier than start time, so the entry ends on the following day. */
  overnight: boolean;
}

/**
 * Resolve a single-day form (date, start time, end time) into a range.
 * An end time earlier than the start time is read as "ends the next day" (night shifts),
 * which the form shows explicitly so it is never a silent surprise.
 */
export function resolveRange(date: string, startTime: string, endTime: string): ResolvedRange | null {
  const start = combineLocal(date, startTime);
  const end = combineLocal(date, endTime);
  if (!start || !end) return null;
  if (end.getTime() < start.getTime()) {
    const next = new Date(end);
    next.setDate(next.getDate() + 1);
    return { start, end: next, overnight: true };
  }
  return { start, end, overnight: false };
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

/** Round down to the nearest `step` minutes. */
export function floorToMinutes(d: Date, step: number): Date {
  const r = new Date(d);
  r.setSeconds(0, 0);
  r.setMinutes(Math.floor(r.getMinutes() / step) * step);
  return r;
}

export function durationMs(startIso: string, endIso: string): number {
  return new Date(endIso).getTime() - new Date(startIso).getTime();
}

/** `2h 05m`, `45m`, `0m`. Negative durations are shown with a minus sign. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return '–';
  const sign = ms < 0 ? '−' : '';
  const totalMin = Math.round(Math.abs(ms) / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${sign}${m}m`;
  return `${sign}${h}h ${pad(m)}m`;
}

const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateTimeFmt.format(d);
}

export function formatTime(d: Date): string {
  return timeFmt.format(d);
}

export function formatDay(d: Date): string {
  return dayFmt.format(d);
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return toDateInput(a) === toDateInput(b);
}

export function timeZoneName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'local time';
  }
}
