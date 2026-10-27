import { formatDay, formatDuration, formatTime } from '../../lib/time';

interface Props {
  range: { start: Date; end: Date; overnight: boolean } | null;
}

const HOURS = [0, 6, 12, 18, 24];

/**
 * A 24-hour strip for the start day showing exactly where the entry sits.
 * It makes AM/PM slips, wrong dates and accidental overnight entries obvious at a glance.
 */
export function DayStrip({ range }: Props) {
  const ms = range ? range.end.getTime() - range.start.getTime() : 0;
  const valid = !!range && ms > 0;

  let left = 0;
  let width = 0;
  let continues = false;
  if (valid) {
    const dayStart = new Date(range.start);
    dayStart.setHours(0, 0, 0, 0);
    const day = 86_400_000;
    const s = (range.start.getTime() - dayStart.getTime()) / day;
    const e = (range.end.getTime() - dayStart.getTime()) / day;
    left = s * 100;
    width = Math.max((Math.min(e, 1) - s) * 100, 0.6);
    continues = e > 1;
  }

  return (
    <div className="daystrip" aria-live="polite">
      <div className="daystrip__head">
        <span className={`daystrip__duration${valid ? '' : ' is-empty'}`}>{valid ? formatDuration(ms) : '0m'}</span>
        <span className="daystrip__when">
          {valid ? (
            <>
              {formatDay(range.start)}, {formatTime(range.start)} to {formatTime(range.end)}
              {continues && <strong className="daystrip__next"> ends {range.overnight ? 'next day' : formatDay(range.end)}</strong>}
            </>
          ) : (
            'Set a start and end time'
          )}
        </span>
      </div>
      <div className="daystrip__track" aria-hidden>
        {HOURS.slice(1, -1).map((h) => (
          <span key={h} className="daystrip__tick" style={{ left: `${(h / 24) * 100}%` }} />
        ))}
        {valid && (
          <span
            className={`daystrip__fill${continues ? ' daystrip__fill--continues' : ''}`}
            style={{ left: `${left}%`, width: `${width}%` }}
          />
        )}
      </div>
      <div className="daystrip__scale" aria-hidden>
        {HOURS.map((h) => (
          <span key={h} style={{ left: `${(h / 24) * 100}%` }}>
            {String(h).padStart(2, '0')}
          </span>
        ))}
      </div>
    </div>
  );
}
