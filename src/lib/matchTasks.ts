import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { queryKeys } from '../api/endpoints';
import { clientsQuery, projectsQuery, tasksQuery } from '../api/hooks';
import type { Client, Project, Task } from '../api/types';

export interface MatchProgress {
  clientsChecked: number;
  clientsTotal: number;
  remaining: number;
}

/**
 * Walk clients → projects → tasks until every wanted task ID is found (or everything is checked).
 * Every task loaded on the way is recorded in the task directory, so this is a one-time cost:
 * results persist across reloads. Requests go through the shared cache and rate limiter.
 */
export async function matchTasksToClients(
  qc: QueryClient,
  wantedIds: number[],
  opts: { onProgress?: (p: MatchProgress) => void; signal?: AbortSignal } = {},
): Promise<MatchProgress> {
  const wanted = new Set(wantedIds);

  /** A list that was stopped halfway looks fresh in the cache, but this walk needs all of it. */
  const reloadIfPartial = (queryKey: QueryKey) => {
    if (qc.getQueryState(queryKey)?.status === 'error') {
      void qc.invalidateQueries({ queryKey, exact: true, refetchType: 'none' });
    }
  };

  reloadIfPartial(queryKeys.clients);
  const clients = await qc.fetchQuery<Client[]>(clientsQuery());
  let checked = 0;
  const report = () => {
    const p = { clientsChecked: checked, clientsTotal: clients.length, remaining: wanted.size };
    opts.onProgress?.(p);
    return p;
  };
  report();

  for (const client of clients) {
    if (opts.signal?.aborted || wanted.size === 0) break;
    reloadIfPartial(queryKeys.projects(client.id));
    const projects = await qc.fetchQuery<Project[]>(projectsQuery(client.id));
    for (const project of projects) {
      if (opts.signal?.aborted) break;
      reloadIfPartial(queryKeys.tasks(project.id));
      const tasks = await qc.fetchQuery<Task[]>(tasksQuery(project, client));
      tasks.forEach((t) => wanted.delete(t.id));
    }
    checked += 1;
    report();
  }
  return report();
}
