import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAllTimeEntries } from '../../api/hooks';
import { ApiError, cancelPendingRequests } from '../../api/http';
import { aggregateByClient } from '../../lib/clientEffort';
import { matchTasksToClients, type MatchProgress } from '../../lib/matchTasks';
import { useTaskDirectory } from '../../lib/taskDirectory';
import { formatMinutes } from '../../lib/timeParse';
import { ErrorNotice, PartialStatus, Spinner } from '../../components/Feedback';

const COLLAPSED_ROWS = 6;

/**
 * Where does the time go? Logged time per client, largest first, so a team lead can see
 * which clients take the most effort and where people may need to be added or moved.
 */
export function ClientEffort() {
  const entries = useAllTimeEntries();
  const directory = useTaskDirectory();
  const qc = useQueryClient();
  const [showAll, setShowAll] = useState(false);
  const [progress, setProgress] = useState<MatchProgress | null>(null);
  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState<unknown>(null);
  const abort = useRef<AbortController | null>(null);

  const effort = useMemo(() => aggregateByClient(entries.data ?? [], directory), [entries.data, directory]);
  const max = effort.rows[0]?.minutes ?? 0;
  const visible = showAll ? effort.rows : effort.rows.slice(0, COLLAPSED_ROWS);
  const top = effort.rows[0];

  const startMatching = async () => {
    abort.current = new AbortController();
    setMatching(true);
    setMatchError(null);
    try {
      await matchTasksToClients(qc, effort.unmatched.taskIds, { onProgress: setProgress, signal: abort.current.signal });
    } catch (err) {
      // Cancelling is the user's choice, not a failure.
      if (!(err instanceof ApiError && err.kind === 'cancelled')) setMatchError(err);
    } finally {
      setMatching(false);
    }
  };

  const stopMatching = () => {
    abort.current?.abort();
    cancelPendingRequests();
  };

  return (
    <section className="effort" aria-labelledby="effort-title">
      <header className="effort__head">
        <div>
          <h2 id="effort-title">Time by client</h2>
          <p className="muted">
            {entries.data
              ? `${formatMinutes(effort.totalMinutes)} logged in ${entries.data.length} ${entries.data.length === 1 ? 'entry' : 'entries'}.`
              : 'Where your logged time goes.'}
          </p>
        </div>
      </header>

      {!entries.data ? (
        entries.isError ? (
          <ErrorNotice compact error={entries.error} onRetry={() => entries.refetch()} />
        ) : (
          <div className="loading-row">
            <Spinner /> Adding up your time…
          </div>
        )
      ) : !entries.data.length ? (
        <p className="muted">No time logged yet. Totals per client appear here once you log time.</p>
      ) : (
        <>
          {top && effort.rows.length > 1 && (
            <p className="effort__lead">
              <strong>{top.clientName}</strong> takes the most time: {Math.round(top.share * 100)}% of matched hours.
              {top.share >= 0.4 && ' A share this large may need more people on the team.'}
            </p>
          )}

          {effort.rows.length > 0 && (
            <ol className="effort__list">
              {visible.map((r) => (
                <li key={r.clientId} className="effort__row">
                  <span className="effort__name" title={r.clientName}>
                    {r.clientName}
                  </span>
                  <span className="effort__bar" aria-hidden>
                    <span style={{ width: `${Math.max((r.minutes / max) * 100, 2)}%` }} />
                  </span>
                  <span className="effort__value">
                    <strong>{formatMinutes(r.minutes)}</strong>
                    <span className="muted">
                      {' '}
                      {Math.round(r.share * 100)}%
                    </span>
                  </span>
                  <span className="effort__meta muted">
                    {r.entries} {r.entries === 1 ? 'entry' : 'entries'}, {r.projects}{' '}
                    {r.projects === 1 ? 'project' : 'projects'}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {effort.rows.length > COLLAPSED_ROWS && (
            <button type="button" className="link effort__more" onClick={() => setShowAll((s) => !s)}>
              {showAll ? 'Show fewer clients' : `Show all ${effort.rows.length} clients`}
            </button>
          )}

          {effort.unmatched.entries > 0 && (
            <div className="effort__unmatched">
              <p>
                <strong>{formatMinutes(effort.unmatched.minutes)}</strong> in {effort.unmatched.entries}{' '}
                {effort.unmatched.entries === 1 ? 'entry is' : 'entries are'} on tasks not yet matched to a client.
                Entries only carry a task ID, so the app looks the tasks up through the client list.
              </p>
              {matching ? (
                <div className="effort__progress">
                  <Spinner />
                  <span>
                    Checked {progress?.clientsChecked ?? 0} of {progress?.clientsTotal ?? '…'} clients. The API allows
                    15 requests a minute, so this can take a while; results are saved for next time.
                  </span>
                  <button type="button" className="btn btn--sm" onClick={stopMatching}>
                    Stop
                  </button>
                </div>
              ) : (
                <button type="button" className="btn btn--sm" onClick={startMatching}>
                  {progress && progress.remaining > 0 && progress.clientsChecked >= progress.clientsTotal
                    ? 'Check again'
                    : 'Match tasks to clients'}
                </button>
              )}
              {!matching && matchError != null && <ErrorNotice compact error={matchError} />}
              {!matching && progress && progress.clientsChecked >= progress.clientsTotal && progress.remaining > 0 && (
                <p className="muted">
                  {progress.remaining} {progress.remaining === 1 ? 'task wasn’t' : 'tasks weren’t'} found under any
                  client.
                </p>
              )}
            </div>
          )}
        </>
      )}
      <PartialStatus query={entries} label="more entries" />
    </section>
  );
}
