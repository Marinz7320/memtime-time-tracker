import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useSaveTimeEntry } from '../../api/hooks';
import type { TimeEntry } from '../../api/types';
import { ErrorNotice } from '../../components/Feedback';
import { useTaskDirectory } from '../../lib/taskDirectory';
import { formatMinutes } from '../../lib/timeParse';
import { TaskPicker } from './TaskPicker';
import { WhenInput } from './WhenInput';
import { COMMENT_MAX, defaultValues, validate, valuesFromEntry, type EntryFormValues } from './entryForm';

export type FormMode = { kind: 'create'; taskId?: number } | { kind: 'edit'; entry: TimeEntry };

interface Props {
  mode: FormMode;
  onSaved: (entry: TimeEntry, kind: 'created' | 'updated') => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

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
  const directory = useTaskDirectory();
  const id = useId();
  // Note: the API uses 0 as a real entry ID, so always compare against undefined.
  const editId = mode.kind === 'edit' ? mode.entry.id : undefined;
  const isEdit = editId !== undefined;

  const result = validate(values);
  const show = (f: keyof typeof result.errors) => (submitted || touched[f] ? result.errors[f] : undefined);
  const timeError = submitted || touched.time ? (result.errors.date ?? result.errors.startTime ?? result.errors.endTime) : undefined;

  useEffect(() => {
    onDirtyChange(JSON.stringify(values) !== JSON.stringify(initial));
  }, [values, initial, onDirtyChange]);

  const set = (patch: Partial<EntryFormValues>) => {
    setValues((v) => ({ ...v, ...patch }));
    if (save.isError) save.reset();
  };
  const touch = (f: string) => setTouched((t) => ({ ...t, [f]: true }));

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    setSubmitted(true);
    if (!result.input || save.isPending) {
      if (result.errors.comment && !result.errors.taskId) commentRef.current?.focus();
      return;
    }
    save.mutate(
      { id: editId, input: result.input },
      { onSuccess: (entry) => onSaved(entry, isEdit ? 'updated' : 'created') },
    );
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
  };

  const minutes = result.range ? Math.round((result.range.end.getTime() - result.range.start.getTime()) / 60_000) : 0;
  const taskName = values.taskId != null ? directory[values.taskId]?.taskName : undefined;

  return (
    <form className="entry-form" onSubmit={submit} onKeyDown={onKeyDown} noValidate>
      <fieldset className="entry-form__section">
        <legend>What did you work on?</legend>
        <TaskPicker value={values.taskId} onChange={(taskId) => set({ taskId })} error={show('taskId')} />
      </fieldset>

      <fieldset className="entry-form__section">
        <legend>When?</legend>
        <WhenInput
          date={values.date}
          startTime={values.startTime}
          endTime={values.endTime}
          endDate={values.endDate}
          range={result.range}
          error={timeError}
          onChange={(patch) => {
            set(patch);
            touch('time');
          }}
        />
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
        <div className="entry-form__total" aria-live="polite">
          {minutes > 0 ? (
            <>
              <strong>{formatMinutes(minutes)}</strong>
              <span className="muted">{taskName ? ` on ${taskName}` : ' to log'}</span>
            </>
          ) : (
            <span className="muted">No time set yet</span>
          )}
        </div>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create entry'}
        </button>
      </div>
      <p className="entry-form__shortcut muted">
        Press <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to save.
      </p>
    </form>
  );
}
