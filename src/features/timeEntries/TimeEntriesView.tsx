import { useEffect, useState, type FormEvent } from 'react';
import { useDeleteTimeEntry, useTimeEntriesPage } from '../../api/hooks';
import { api } from '../../api/endpoints';
import { describeError } from '../../api/http';
import type { SortOrder, TimeEntry } from '../../api/types';
import { useTaskDirectory } from '../../lib/taskDirectory';
import { durationMs, formatDateTime, formatDuration, formatTime, isSameLocalDay } from '../../lib/time';
import { EmptyState, ErrorNotice, Spinner } from '../../components/Feedback';
import { useToast } from '../../components/Toasts';

type SortField = 'id' | 'taskId' | 'start' | 'end' | 'createdAt';

const PAGE_SIZES = [10, 25, 50];
const PAGE_SIZE_KEY = 'tt.pageSize';

function initialPageSize(): number {
  try {
    const v = Number(localStorage.getItem(PAGE_SIZE_KEY));
    return PAGE_SIZES.includes(v) ? v : 10;
  } catch {
    return 10;
  }
}

interface Props {
  onEdit: (entry: TimeEntry) => void;
  onNew: () => void;
  highlightId: number | null;
}

export function TimeEntriesView({ onEdit, onNew, highlightId }: Props) {
  const [limit, setLimit] = useState(initialPageSize);
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState<SortField>('start');
  const [order, setOrder] = useState<SortOrder>('desc');
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const toast = useToast();
  const directory = useTaskDirectory();

  const query = useTimeEntriesPage({ limit, offset: page * limit, sortBy, order });
  const del = useDeleteTimeEntry();
  const items = query.data?.items ?? [];

  // Deleting the last row of a page leaves it empty: step back instead of showing nothing.
  useEffect(() => {
    if (page > 0 && query.data && !query.isPlaceholderData && query.data.items.length === 0) setPage((p) => p - 1);
  }, [page, query.data, query.isPlaceholderData]);

  const sort = (field: SortField) => {
    if (field === sortBy) setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(field);
      setOrder(field === 'id' || field === 'taskId' ? 'asc' : 'desc');
    }
    setPage(0);
  };

  const changeLimit = (n: number) => {
    setLimit(n);
    setPage(0);
    try {
      localStorage.setItem(PAGE_SIZE_KEY, String(n));
    } catch {
      /* ignore */
    }
  };

  const remove = (entry: TimeEntry) => {
    del.mutate(entry.id, {
      onSuccess: () => {
        setConfirmDelete(null);
        toast({ tone: 'success', title: `Time entry #${entry.id} deleted` });
      },
      onError: (err) => {
        setConfirmDelete(null);
        const d = describeError(err, { entryId: entry.id });
        toast({ tone: 'error', title: d.title, detail: d.detail });
      },
    });
  };

  const SortHeader = ({ field, children, className }: { field: SortField; children: string; className?: string }) => {
    const active = sortBy === field;
    return (
      <th className={className} aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button className={`th-sort${active ? ' is-active' : ''}`} onClick={() => sort(field)}>
          {children}
          <span className="th-sort__arrow" aria-hidden>
            {active ? (order === 'asc' ? '↑' : '↓') : '↕'}
          </span>
        </button>
      </th>
    );
  };

  const from = page * limit + 1;
  const to = page * limit + items.length;

  return (
    <section className="panel" aria-labelledby="entries-title">
      <header className="panel__header">
        <div>
          <h1 id="entries-title">Time entries</h1>
          <p className="muted">Your logged time, newest first. Select a row to edit it.</p>
        </div>
        <div className="toolbar">
          <OpenById onFound={onEdit} />
          <button className="btn btn--primary" onClick={onNew}>
            New entry
          </button>
        </div>
      </header>

      {query.isPending ? (
        <div className="loading-row">
          <Spinner /> Loading time entries…
        </div>
      ) : query.isError && !query.data ? (
        <ErrorNotice error={query.error} onRetry={() => query.refetch()} />
      ) : items.length === 0 && page === 0 ? (
        <EmptyState title="No time logged yet">
          <p>Start with your first entry, or pick a task under Clients and projects.</p>
          <button className="btn btn--primary" onClick={onNew}>
            Log your first entry
          </button>
        </EmptyState>
      ) : (
        <>
          {query.isError && <ErrorNotice compact error={query.error} onRetry={() => query.refetch()} />}
          <div className={`table-wrap${query.isFetching ? ' is-fetching' : ''}`}>
            <table className="table">
              <thead>
                <tr>
                  <SortHeader field="id" className="col-num">ID</SortHeader>
                  <SortHeader field="taskId">Task</SortHeader>
                  <th>Comment</th>
                  <SortHeader field="start">Start</SortHeader>
                  <SortHeader field="end">End</SortHeader>
                  <th className="col-num">Duration</th>
                  <SortHeader field="createdAt">Created at</SortHeader>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((e) => {
                  const info = directory[e.taskId];
                  const start = new Date(e.start);
                  const end = new Date(e.end);
                  const ms = durationMs(e.start, e.end);
                  return (
                    <tr
                      key={e.id}
                      className={e.id === highlightId ? 'is-highlighted' : undefined}
                      onClick={(ev) => {
                        if ((ev.target as HTMLElement).closest('button')) return;
                        onEdit(e);
                      }}
                    >
                      <td className="col-num">{e.id}</td>
                      <td>
                        <div className="cell-task">
                          <span>{info ? info.taskName : `Task #${e.taskId}`}</span>
                          <small className="muted">
                            {info ? `#${e.taskId}, ${info.clientName} / ${info.projectName}` : 'Name not loaded yet'}
                          </small>
                        </div>
                      </td>
                      <td className="cell-comment" title={e.comment}>
                        {e.comment || <span className="muted">No comment</span>}
                      </td>
                      <td className="nowrap">{formatDateTime(e.start)}</td>
                      <td className="nowrap">
                        {isSameLocalDay(start, end) ? formatTime(end) : formatDateTime(e.end)}
                      </td>
                      <td className={`col-num nowrap${ms <= 0 ? ' text-danger' : ''}`}>{formatDuration(ms)}</td>
                      <td className="nowrap muted">{formatDateTime(e.createdAt)}</td>
                      <td className="cell-actions">
                        {confirmDelete === e.id ? (
                          <span className="confirm">
                            <button
                              className="btn btn--sm btn--danger"
                              onClick={() => remove(e)}
                              disabled={del.isPending}
                            >
                              {del.isPending ? 'Deleting…' : 'Delete'}
                            </button>
                            <button className="btn btn--sm btn--ghost" onClick={() => setConfirmDelete(null)}>
                              Keep
                            </button>
                          </span>
                        ) : (
                          <>
                            <button className="btn btn--sm btn--ghost" onClick={() => onEdit(e)}>
                              Edit
                            </button>
                            <button
                              className="btn btn--sm btn--ghost btn--quiet-danger"
                              onClick={() => setConfirmDelete(e.id)}
                              aria-label={`Delete time entry ${e.id}`}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <footer className="pager">
            <label className="pager__size">
              Rows per page
              <select className="input input--sm" value={limit} onChange={(e) => changeLimit(Number(e.target.value))}>
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <span className="pager__range" aria-live="polite">
              {items.length ? `Showing ${from}–${to}` : 'No entries on this page'}
              {query.isFetching && <Spinner label="Refreshing" />}
            </span>
            <div className="pager__nav">
              <button className="btn btn--sm" onClick={() => setPage((p) => p - 1)} disabled={page === 0}>
                Previous
              </button>
              <span className="pager__page">Page {page + 1}</span>
              <button
                className="btn btn--sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={!query.data?.hasMore || query.isPlaceholderData}
              >
                Next
              </button>
            </div>
          </footer>
        </>
      )}
    </section>
  );
}

/** Jump straight to an entry by its ID; a missing ID gets a clear "not found" message. */
function OpenById({ onFound }: { onFound: (e: TimeEntry) => void }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) {
      setError('Enter a whole number, like 42.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onFound(await api.getTimeEntry(id));
      setValue('');
    } catch (err) {
      const d = describeError(err, { entryId: id });
      setError(d.detail ? `${d.title}. ${d.detail}` : d.title);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="open-by-id" onSubmit={submit} noValidate>
      <label className="sr-only" htmlFor="open-id">
        Open entry by ID
      </label>
      <input
        id="open-id"
        className="input input--id"
        inputMode="numeric"
        placeholder="Entry ID"
        value={value}
        onChange={(e) => {
          setValue(e.target.value.replace(/[^\d]/g, ''));
          setError(null);
        }}
        aria-invalid={!!error}
        aria-describedby={error ? 'open-id-error' : undefined}
      />
      <button className="btn" disabled={busy || !value}>
        {busy ? 'Opening…' : 'Open'}
      </button>
      {error && (
        <p id="open-id-error" className="field-error open-by-id__error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
