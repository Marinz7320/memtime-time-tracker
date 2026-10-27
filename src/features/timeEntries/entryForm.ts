import type { TimeEntry, TimeEntryInput } from '../../api/types';
import { addMinutes, combineLocal, floorToMinutes, resolveRange, toDateInput, toTimeInput } from '../../lib/time';

export const COMMENT_MAX = 500;
const LONG_ENTRY_HOURS = 12;

export interface EntryFormValues {
  taskId: number | null;
  date: string;
  startTime: string;
  endTime: string;
  /** Only set when the entry ends on a day other than the start day or the next one. */
  endDate: string | null;
  comment: string;
}

export type FieldErrors = Partial<Record<'taskId' | 'date' | 'startTime' | 'endTime' | 'comment', string>>;

export interface Validation {
  errors: FieldErrors;
  warnings: string[];
  range: { start: Date; end: Date; overnight: boolean } | null;
  input: TimeEntryInput | null;
}

/** A sensible starting point: the last hour, snapped to the quarter hour. */
export function defaultValues(taskId: number | null, now = new Date()): EntryFormValues {
  const end = floorToMinutes(now, 15);
  const start = addMinutes(end, -60);
  return {
    taskId,
    date: toDateInput(start),
    startTime: toTimeInput(start),
    endTime: toTimeInput(end),
    endDate: null,
    comment: '',
  };
}

export function valuesFromEntry(e: TimeEntry): EntryFormValues {
  const start = new Date(e.start);
  const end = new Date(e.end);
  const nextDay = new Date(start);
  nextDay.setDate(nextDay.getDate() + 1);
  const endDay = toDateInput(end);
  // Same day, or an overnight entry shorter than a day, fits the simple one-date form.
  const simple =
    endDay === toDateInput(start) || (endDay === toDateInput(nextDay) && end.getTime() - start.getTime() < 86_400_000 && toTimeInput(end) < toTimeInput(start));
  return {
    taskId: e.taskId,
    date: toDateInput(start),
    startTime: toTimeInput(start),
    endTime: toTimeInput(end),
    endDate: simple ? null : endDay,
    comment: e.comment,
  };
}

export function validate(v: EntryFormValues, now = new Date()): Validation {
  const errors: FieldErrors = {};
  const warnings: string[] = [];

  if (v.taskId == null) errors.taskId = 'Choose the task you worked on.';
  if (!v.date) errors.date = 'Enter the date you worked.';
  if (!v.startTime) errors.startTime = 'Enter a start time.';
  if (!v.endTime) errors.endTime = 'Enter an end time.';

  const comment = v.comment.trim();
  if (!comment) errors.comment = 'Describe what you worked on.';
  else if (comment.length > COMMENT_MAX) errors.comment = `Keep the comment under ${COMMENT_MAX} characters.`;

  let range: Validation['range'] = null;
  if (!errors.date && !errors.startTime && !errors.endTime) {
    if (v.endDate) {
      const start = combineLocal(v.date, v.startTime);
      const end = combineLocal(v.endDate, v.endTime);
      if (start && end) range = { start, end, overnight: false };
    } else {
      range = resolveRange(v.date, v.startTime, v.endTime);
    }
    if (!range) errors.startTime = 'Enter a valid date and time.';
  }

  if (range) {
    const ms = range.end.getTime() - range.start.getTime();
    if (ms <= 0) {
      errors.endTime = v.endDate ? 'The end must be after the start.' : 'Start and end are the same. Enter when you finished.';
    } else {
      if (ms > LONG_ENTRY_HOURS * 3_600_000) warnings.push(`This entry is longer than ${LONG_ENTRY_HOURS} hours. Check the times before saving.`);
      if (range.end.getTime() > now.getTime() + 60_000) warnings.push('This entry ends in the future.');
    }
  }

  const valid = Object.keys(errors).length === 0 && range;
  return {
    errors,
    warnings,
    range,
    input: valid
      ? { taskId: v.taskId!, comment, start: range!.start.toISOString(), end: range!.end.toISOString() }
      : null,
  };
}
