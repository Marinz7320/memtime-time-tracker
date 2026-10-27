import { formatDay, formatTime } from '../../lib/time';

interface Props {
  range: { start: Date; end: Date; overnight: boolean } | null;
}

/**
 * A slim 24-hour bar for the start day: enough to spot an AM/PM slip or a wrong day at a glance,
 * without taking over the form.
 */
export function DayStrip({ range }: Props) {
  const valid = !!range && range.end.getTime() > range.start.getTime();

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
    width = Math.max((Math.min(e, 1) - s) * 100, 0.8);
    continues = e > 1;
  }

  return (
    <div className="daystrip" aria-hidden={!valid}>
      <div className="daystrip__track">
        {[25, 50, 75].map((p) => (
          <span key={p} className="daystrip__tick" style={{ left: `${p}%` }} />
        ))}
        {valid && (
          <span
            className={`daystrip__fill${continues ? ' daystrip__fill--continues' : ''}`}
            style={{ left: `${left}%`, width: `${width}%` }}
          />
        )}
      </div>
      <div className="daystrip__caption">
        <span className="daystrip__scale">
          <span>00</span>
          <span>06</span>
          <span>12</span>
          <span>18</span>
          <span>24</span>
        </span>
        {valid && (
          <span className="daystrip__when" aria-live="polite">
            {formatDay(range.start)}, {formatTime(range.start)} to {formatTime(range.end)}
            {continues && (
              <strong className="daystrip__next">
                {' '}
                (ends {range.overnight ? 'next day' : formatDay(range.end)})
              </strong>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
