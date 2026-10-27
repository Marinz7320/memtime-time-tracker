import type { TimeEntry } from '../api/types';
import type { TaskInfo } from './taskDirectory';

export interface ClientEffortRow {
  clientId: number;
  clientName: string;
  minutes: number;
  entries: number;
  projects: number;
  /** Share of all attributed time, 0..1 */
  share: number;
}

export interface ClientEffort {
  rows: ClientEffortRow[];
  totalMinutes: number;
  /** Time on tasks we can't place under a client yet. */
  unmatched: { minutes: number; entries: number; taskIds: number[] };
}

const minutesOf = (e: TimeEntry) => Math.max(0, Math.round((Date.parse(e.end) - Date.parse(e.start)) / 60_000));

/** Group logged time by client, largest first. Entries on unknown tasks are kept aside, never dropped. */
export function aggregateByClient(entries: TimeEntry[], directory: Record<number, TaskInfo>): ClientEffort {
  const byClient = new Map<number, { clientName: string; minutes: number; entries: number; projects: Set<number> }>();
  const unmatchedTasks = new Set<number>();
  let unmatchedMinutes = 0;
  let unmatchedEntries = 0;

  for (const e of entries) {
    const m = minutesOf(e);
    const info = directory[e.taskId];
    if (!info) {
      unmatchedTasks.add(e.taskId);
      unmatchedMinutes += m;
      unmatchedEntries += 1;
      continue;
    }
    const row = byClient.get(info.clientId) ?? { clientName: info.clientName, minutes: 0, entries: 0, projects: new Set() };
    row.minutes += m;
    row.entries += 1;
    row.projects.add(info.projectId);
    byClient.set(info.clientId, row);
  }

  const attributed = [...byClient.values()].reduce((sum, r) => sum + r.minutes, 0);
  const rows = [...byClient.entries()]
    .map(([clientId, r]) => ({
      clientId,
      clientName: r.clientName,
      minutes: r.minutes,
      entries: r.entries,
      projects: r.projects.size,
      share: attributed ? r.minutes / attributed : 0,
    }))
    .sort((a, b) => b.minutes - a.minutes || a.clientName.localeCompare(b.clientName));

  return {
    rows,
    totalMinutes: attributed + unmatchedMinutes,
    unmatched: { minutes: unmatchedMinutes, entries: unmatchedEntries, taskIds: [...unmatchedTasks] },
  };
}
