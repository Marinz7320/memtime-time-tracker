import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { DatePicker } from '../../components/DatePicker';
import { addMinutes, combineLocal, toDateInput, toTimeInput, timeZoneName, type ResolvedRange } from '../../lib/time';
import { formatMinutes, parseDurationInput, parseTimeInput, shiftTime } from '../../lib/timeParse';
import { DayStrip } from './DayStrip';

export interface WhenValues {
  date: string;
  startTime: string;
  endTime: string;
  endDate: string | null;
}

interface Props extends WhenValues {
  onChange: (patch: Partial<WhenValues>) => void;
  range: ResolvedRange | null;
  error?: string;
}

const QUICK = [15, 30, 60, 120, 240, 480];

/**
 * Everything about "when" in one place: the day, start, end and duration.
 * Times and duration are plain text fields that understand how people type
 * ("9", "930", "5pm", "1h30", "1.5", "90m"); arrow keys nudge by 15 minutes (Shift: 1 hour).
 * Changing the duration moves the end time, so either can be entered.
 */
export function WhenInput({ date, startTime, endTime, endDate, onChange, range, error }: Props) {
  const errId = useId();
  const minutes = range ? Math.round((range.end.getTime() - range.start.getTime()) / 60_000) : null;
  const isToday = date === toDateInput(new Date());

  const setDuration = (mins: number) => {
    const start = combineLocal(date, startTime);
    if (!start || mins <= 0) return;
    const end = addMinutes(start, mins);
    const sameOrNext = mins < 1440;
    onChange({ endTime: toTimeInput(end), endDate: sameOrNext ? null : toDateInput(end) });
  };

  return (
    <div className={`when${error ? ' has-error' : ''}`}>
      <DatePicker
        label={endDate ? 'Start date' : 'Date'}
        value={date}
        onChange={(d) => onChange({ date: d })}
        describedBy={error ? errId : undefined}
      />
      {endDate && <DatePicker label="End date" value={endDate} onChange={(d) => onChange({ endDate: d })} />}

      <div className="when__times">
        <TextTimeField label="Start" value={startTime} onCommit={(v) => onChange({ startTime: v })} />
        <span className="when__arrow" aria-hidden>
          →
        </span>
        <TextTimeField label="End" value={endTime} onCommit={(v) => onChange({ endTime: v })} />
        <DurationField minutes={minutes} onCommit={setDuration} />
      </div>

      <div className="quick" role="group" aria-label="Set duration from start">
        {QUICK.map((m) => (
          <button
            key={m}
            type="button"
            className="chip"
            aria-pressed={minutes === m}
            onClick={() => setDuration(m)}
          >
            {formatMinutes(m)}
          </button>
        ))}
        {isToday && !endDate && (
          <button type="button" className="chip" onClick={() => onChange({ endTime: toTimeInput(new Date()) })}>
            Until now
          </button>
        )}
      </div>

      <DayStrip range={range} />

      {error && (
        <p id={errId} className="field-error" role="alert">
          {error}
        </p>
      )}

      <div className="when__foot">
        Times are in your time zone ({timeZoneName()}).{' '}
        {!endDate ? (
          <button type="button" className="link" onClick={() => onChange({ endDate: date })}>
            Ends on another day?
          </button>
        ) : (
          <button type="button" className="link" onClick={() => onChange({ endDate: null })}>
            Use a single date
          </button>
        )}
      </div>
    </div>
  );
}

function nudge(e: KeyboardEvent): number {
  if (e.key === 'ArrowUp') return e.shiftKey ? 60 : 15;
  if (e.key === 'ArrowDown') return e.shiftKey ? -60 : -15;
  return 0;
}

function TextTimeField({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setDraft(value);
    setInvalid(false);
  }, [value]);

  const commit = () => {
    const parsed = parseTimeInput(draft);
    if (parsed) {
      setInvalid(false);
      setDraft(parsed);
      if (parsed !== value) onCommit(parsed);
    } else {
      setInvalid(draft.trim() !== '');
      if (!draft.trim()) setDraft(value);
    }
  };

  return (
    <div className="when__field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="when__input"
        inputMode="text"
        autoComplete="off"
        spellCheck={false}
        value={draft}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-hint` : undefined}
        title="Type a time like 9:30, 1730 or 5pm. Arrow keys change it by 15 minutes."
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          const step = nudge(e);
          if (step && value) {
            e.preventDefault();
            onCommit(shiftTime(value, step));
          } else if (e.key === 'Enter' && !(e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            commit();
          }
        }}
      />
      {invalid && (
        <span id={`${id}-hint`} className="when__hint">
          Try 9:30 or 5pm
        </span>
      )}
    </div>
  );
}

function DurationField({ minutes, onCommit }: { minutes: number | null; onCommit: (m: number) => void }) {
  const id = useId();
  const shown = minutes && minutes > 0 ? formatMinutes(minutes) : '';
  const [draft, setDraft] = useState(shown);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setDraft(shown);
    setInvalid(false);
  }, [shown]);

  const commit = () => {
    const parsed = parseDurationInput(draft);
    if (parsed && parsed > 0) {
      setInvalid(false);
      setDraft(formatMinutes(parsed));
      if (parsed !== minutes) onCommit(parsed);
    } else {
      setInvalid(draft.trim() !== '');
      if (!draft.trim()) setDraft(shown);
    }
  };

  return (
    <div className="when__field when__field--duration">
      <label htmlFor={id}>Duration</label>
      <input
        id={id}
        className="when__input"
        autoComplete="off"
        spellCheck={false}
        value={draft}
        placeholder="1h 30m"
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-hint` : undefined}
        title="Type a duration like 1h 30m, 90m or 1.5. The end time follows."
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          const step = nudge(e);
          if (step && minutes) {
            e.preventDefault();
            if (minutes + step > 0) onCommit(minutes + step);
          } else if (e.key === 'Enter' && !(e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            commit();
          }
        }}
      />
      {invalid && (
        <span id={`${id}-hint`} className="when__hint">
          Try 1h 30m or 90m
        </span>
      )}
    </div>
  );
}
