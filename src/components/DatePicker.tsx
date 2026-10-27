import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { toDateInput } from '../lib/time';

interface Props {
  /** Local date as `YYYY-MM-DD`. */
  value: string;
  onChange: (value: string) => void;
  label: string;
  invalid?: boolean;
  describedBy?: string;
}

/** Parse `YYYY-MM-DD` as a local date (never through `new Date(string)`, which reads it as UTC). */
export function parseDateInput(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(+m[1]!, +m[2]! - 1, +m[3]!);
  return Number.isNaN(d.getTime()) ? null : d;
}

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Same day in another month, clamped (31 Jan + 1 month = 28/29 Feb). */
function addMonths(d: Date, n: number): Date {
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), last));
}

/** First day of week from the browser locale where supported; Monday otherwise. 0 = Sunday. */
function firstDayOfWeek(): number {
  try {
    const loc = new Intl.Locale(navigator.language) as Intl.Locale & {
      weekInfo?: { firstDay: number };
      getWeekInfo?: () => { firstDay: number };
    };
    const first = loc.getWeekInfo?.().firstDay ?? loc.weekInfo?.firstDay;
    if (first) return first % 7;
  } catch {
    /* fall through */
  }
  return 1;
}

const fullFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const weekdayShort = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const weekdayLong = new Intl.DateTimeFormat(undefined, { weekday: 'long' });

function relativeLabel(d: Date): string | null {
  const today = toDateInput(new Date());
  const v = toDateInput(d);
  if (v === today) return 'Today';
  if (v === toDateInput(addDays(new Date(), -1))) return 'Yesterday';
  if (v === toDateInput(addDays(new Date(), 1))) return 'Tomorrow';
  return null;
}

/**
 * Date field built for time entry:
 * - one click for the common cases (Today, Yesterday, step a day back/forward),
 * - a month calendar for everything else, fully keyboard operable
 *   (arrows, Home/End, Page Up/Down, Enter, Escape) following the WAI-ARIA date picker dialog pattern.
 */
export function DatePicker({ value, onChange, label, invalid, describedBy }: Props) {
  const selected = parseDateInput(value);
  const [open, setOpen] = useState(false);
  const [focusDate, setFocusDate] = useState<Date>(() => selected ?? new Date());
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLTableElement>(null);
  const ids = { label: useId(), dialog: useId(), month: useId() };
  const weekStart = useMemo(firstDayOfWeek, []);
  const todayStr = toDateInput(new Date());

  const commit = (d: Date) => onChange(toDateInput(d));

  const openCalendar = () => {
    setFocusDate(selected ?? new Date());
    setOpen(true);
  };
  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  // Move DOM focus to the focused day whenever it changes while open.
  useEffect(() => {
    if (!open) return;
    const btn = gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${toDateInput(focusDate)}"]`);
    btn?.focus();
  }, [open, focusDate]);

  // Close when clicking or tabbing outside.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close(false);
    };
    const onFocus = (e: FocusEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('focusin', onFocus);
    };
  }, [open]);

  const weeks = useMemo(() => {
    const first = new Date(focusDate.getFullYear(), focusDate.getMonth(), 1);
    const offset = (first.getDay() - weekStart + 7) % 7;
    const start = addDays(first, -offset);
    return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
  }, [focusDate, weekStart]);

  const onGridKey = (e: KeyboardEvent) => {
    const map: Record<string, () => Date> = {
      ArrowLeft: () => addDays(focusDate, -1),
      ArrowRight: () => addDays(focusDate, 1),
      ArrowUp: () => addDays(focusDate, -7),
      ArrowDown: () => addDays(focusDate, 7),
      Home: () => addDays(focusDate, -((focusDate.getDay() - weekStart + 7) % 7)),
      End: () => addDays(focusDate, 6 - ((focusDate.getDay() - weekStart + 7) % 7)),
      PageUp: () => addMonths(focusDate, e.shiftKey ? -12 : -1),
      PageDown: () => addMonths(focusDate, e.shiftKey ? 12 : 1),
    };
    const next = map[e.key];
    if (next) {
      e.preventDefault();
      setFocusDate(next());
    }
  };

  const onDialogKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // don't also close the surrounding drawer
      close();
    }
  };

  const rel = selected ? relativeLabel(selected) : null;
  const yesterday = toDateInput(addDays(new Date(), -1));

  return (
    <div className="datepicker" ref={rootRef}>
      <span id={ids.label} className="datepicker__label">
        {label}
      </span>
      <div className={`datepicker__field${invalid ? ' is-invalid' : ''}`}>
        <button
          type="button"
          className="datepicker__step"
          aria-label="Previous day"
          disabled={!selected}
          onClick={() => selected && commit(addDays(selected, -1))}
        >
          <svg viewBox="0 0 16 16" aria-hidden>
            <path d="M10 3.5 5.5 8l4.5 4.5" />
          </svg>
        </button>
        <button
          ref={triggerRef}
          type="button"
          className="datepicker__trigger"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? ids.dialog : undefined}
          aria-labelledby={`${ids.label} ${ids.label}-value`}
          aria-describedby={describedBy}
          onClick={() => (open ? close() : openCalendar())}
        >
          <svg className="datepicker__icon" viewBox="0 0 20 20" aria-hidden>
            <rect x="3" y="4.5" width="14" height="12" rx="2" />
            <path d="M3 8.5h14M7 2.5v4M13 2.5v4" />
          </svg>
          <span id={`${ids.label}-value`} className="datepicker__value">
            {selected ? (
              <>
                {rel && <strong>{rel}, </strong>}
                {rel ? shortFmt.format(selected) : fullFmt.format(selected)}
              </>
            ) : (
              'Choose a date'
            )}
          </span>
        </button>
        <button
          type="button"
          className="datepicker__step"
          aria-label="Next day"
          disabled={!selected}
          onClick={() => selected && commit(addDays(selected, 1))}
        >
          <svg viewBox="0 0 16 16" aria-hidden>
            <path d="M6 3.5 10.5 8 6 12.5" />
          </svg>
        </button>
      </div>

      <div className="datepicker__quick">
        <button
          type="button"
          className="chip"
          aria-pressed={value === todayStr}
          onClick={() => onChange(todayStr)}
        >
          Today
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={value === yesterday}
          onClick={() => onChange(yesterday)}
        >
          Yesterday
        </button>
      </div>

      {open && (
        <div
          id={ids.dialog}
          className="calendar"
          role="dialog"
          aria-modal="false"
          aria-labelledby={ids.month}
          onKeyDown={onDialogKey}
        >
          <div className="calendar__head">
            <button
              type="button"
              className="icon-btn calendar__nav"
              aria-label="Previous month"
              onClick={() => setFocusDate((d) => addMonths(d, -1))}
            >
              <svg viewBox="0 0 16 16" aria-hidden>
                <path d="M10 3.5 5.5 8l4.5 4.5" />
              </svg>
            </button>
            <h3 id={ids.month} className="calendar__month" aria-live="polite">
              {monthFmt.format(focusDate)}
            </h3>
            <button
              type="button"
              className="icon-btn calendar__nav"
              aria-label="Next month"
              onClick={() => setFocusDate((d) => addMonths(d, 1))}
            >
              <svg viewBox="0 0 16 16" aria-hidden>
                <path d="M6 3.5 10.5 8 6 12.5" />
              </svg>
            </button>
          </div>

          <table ref={gridRef} className="calendar__grid" role="grid" aria-labelledby={ids.month} onKeyDown={onGridKey}>
            <thead>
              <tr>
                {weeks[0]!.map((d) => (
                  <th key={d.getDay()} scope="col" abbr={weekdayLong.format(d)}>
                    {weekdayShort.format(d).slice(0, 2)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => (
                <tr key={toDateInput(week[0]!)}>
                  {week.map((d) => {
                    const ds = toDateInput(d);
                    const isSelected = ds === value;
                    const isFocus = ds === toDateInput(focusDate);
                    const outside = d.getMonth() !== focusDate.getMonth();
                    const future = ds > todayStr;
                    return (
                      <td key={ds} role="gridcell" aria-selected={isSelected}>
                        <button
                          type="button"
                          data-date={ds}
                          tabIndex={isFocus ? 0 : -1}
                          aria-label={fullFmt.format(d)}
                          aria-current={ds === todayStr ? 'date' : undefined}
                          className={[
                            'calendar__day',
                            isSelected && 'is-selected',
                            outside && 'is-outside',
                            future && 'is-future',
                            ds === todayStr && 'is-today',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => {
                            commit(d);
                            close();
                          }}
                        >
                          {d.getDate()}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="calendar__foot">
            <span className="muted">Arrows move, Enter picks</span>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => {
                onChange(todayStr);
                close();
              }}
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
