import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useSaveTimeEntry } from '../../api/hooks';
import type { TimeEntry } from '../../api/types';
import { addMinutes, combineLocal, toDateInput, toTimeInput, timeZoneName } from '../../lib/time';
import { ErrorNotice } from '../../components/Feedback';
import { DayStrip } from './DayStrip';
import { TaskPicker } from './TaskPicker';
import { COMMENT_MAX, defaultValues, validate, valuesFromEntry, type EntryFormValues } from './entryForm';

export type FormMode = { kind: 'create'; taskId?: number } | { kind: 'edit'; entry: TimeEntry };

interface Props {
  mode: FormMode;
  onSaved: (entry: TimeEntry, kind: 'created' | 'updated') => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

const QUICK = [
  { label: '15m', min: 15 },
  { label: '30m', min: 30 },
  { label: '1h', min: 60 },
  { label: '2h', min: 120 },
  { label: '4h', min: 240 },
  { label: '8h', min: 480 },
];

export function TimeEntryForm({ mode, onSaved, onCancel, onDirtyChange }: Props) {
  const initial = useMemo<EntryFormValues>(
    () => (mode.kind === 'edit' ? valuesFromEntry(mode.entry) : defaultValues(mode.taskId ?? null)),
    [mode],
  );
  const [values, setValues] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const save = useSaveTimeEntry();
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const editId = mode.kind === 'edit' ? mode.entry.id : undefined;

  const result = validate(values);
  const show = (f: keyof typeof result.errors) => (submitted || touched[f] ? result.errors[f] : undefined);

  useEffect(() => {
    onDirtyChange(JSON.stringify(values) !== JSON.stringify(initial));
  }, [values, initial, onDirtyChange]);

  const set = (patch: Partial<EntryFormValues>) => {
    setValues((v) => ({ ...v, ...patch }));
    if (save.isError) save.reset();
  };
  const touch = (f: string) => setTouched((t) => ({ ...t, [f]: true }));

  const applyDuration = (minutes: number) => {
    const start = combineLocal(values.date, values.startTime);
    if (!start) return;
    const end = addMinutes(start, minutes);
    set({ endTime: toTimeInput(end), endDate: null });
  };

  const isToday = values.date === toDateInput(new Date());

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    setSubmitted(true);
    if (!result.input || save.isPending) {
      if (result.errors.comment && !result.errors.taskId) commentRef.current?.focus();
      return;
    }
    save.mutate(
      { id: editId, input: result.input },
      { onSuccess: (entry) => onSaved(entry, editId ? 'updated' : 'created') },
    );
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
  };

  return (
    <form className="entry-form" onSubmit={submit} onKeyDown={onKeyDown} noValidate>
      <fieldset className="entry-form__section">
        <legend>What did you work on?</legend>
        <TaskPicker value={values.taskId} onChange={(taskId) => set({ taskId })} error={show('taskId')} />
      </fieldset>

      <fieldset className="entry-form__section">
        <legend>When?</legend>
        <div className="time-grid">
          <div className="field">
            <label htmlFor={`${id}-date`}>{values.endDate ? 'Start date' : 'Date'}</label>
            <input
              id={`${id}-date`}
              type="date"
              className="input"
              value={values.date}
              onChange={(e) => set({ date: e.target.value })}
              onBlur={() => touch('date')}
              aria-invalid={!!show('date')}
              required
            />
          </div>
          <div className="field">
            <label htmlFor={`${id}-start`}>Start</label>
            <input
              id={`${id}-start`}
              type="time"
              className="input"
              value={values.startTime}
              onChange={(e) => set({ startTime: e.target.value })}
              onBlur={() => touch('startTime')}
              aria-invalid={!!show('startTime')}
              required
            />
          </div>
          {values.endDate && (
            <div className="field">
              <label htmlFor={`${id}-enddate`}>End date</label>
              <input
                id={`${id}-enddate`}
                type="date"
                className="input"
                value={values.endDate}
                onChange={(e) => set({ endDate: e.target.value || null })}
              />
            </div>
          )}
          <div className="field">
            <label htmlFor={`${id}-end`}>End</label>
            <input
              id={`${id}-end`}
              type="time"
              className="input"
              value={values.endTime}
              onChange={(e) => set({ endTime: e.target.value })}
              onBlur={() => touch('endTime')}
              aria-invalid={!!show('endTime')}
              aria-describedby={`${id}-time-err`}
              required
            />
          </div>
        </div>
        <div id={`${id}-time-err`}>
          {(show('date') || show('startTime') || show('endTime')) && (
            <p className="field-error">{show('date') ?? show('startTime') ?? show('endTime')}</p>
          )}
        </div>

        <div className="quick" role="group" aria-label="Set duration from start">
          <span className="quick__label">Duration</span>
          {QUICK.map((q) => (
            <button key={q.min} type="button" className="chip" onClick={() => applyDuration(q.min)}>
              {q.label}
            </button>
          ))}
          {isToday && !values.endDate && (
            <button type="button" className="chip" onClick={() => set({ endTime: toTimeInput(new Date()) })}>
              Until now
            </button>
          )}
        </div>

        <DayStrip range={result.range} />

        <div className="entry-form__tz">
          Times are in your time zone ({timeZoneName()}).{' '}
          {!values.endDate ? (
            <button type="button" className="link" onClick={() => set({ endDate: values.date })}>
              Ends on another day?
            </button>
          ) : (
            <button type="button" className="link" onClick={() => set({ endDate: null })}>
              Use a single date
            </button>
          )}
        </div>
      </fieldset>

      <fieldset className="entry-form__section">
        <legend>
          <label htmlFor={`${id}-comment`}>Comment</label>
        </legend>
        <textarea
          id={`${id}-comment`}
          ref={commentRef}
          className="input textarea"
          rows={3}
          placeholder="For example: Reviewed pull requests for the checkout redesign"
          value={values.comment}
          maxLength={COMMENT_MAX + 50}
          onChange={(e) => set({ comment: e.target.value })}
          onBlur={() => touch('comment')}
          aria-invalid={!!show('comment')}
          aria-describedby={`${id}-comment-help`}
          required
        />
        <div id={`${id}-comment-help`} className="field-foot">
          <span className="field-error">{show('comment')}</span>
          <span className={values.comment.trim().length > COMMENT_MAX ? 'text-danger' : 'muted'}>
            {values.comment.trim().length}/{COMMENT_MAX}
          </span>
        </div>
      </fieldset>

      {result.warnings.length > 0 && (
        <div className="notice notice--warning" role="status">
          <ul>
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {save.isError && <ErrorNotice error={save.error} entryId={editId} />}

      <div className="entry-form__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : editId ? 'Save changes' : 'Create entry'}
        </button>
      </div>
      <p className="entry-form__shortcut muted">
        Press <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to save.
      </p>
    </form>
  );
}
