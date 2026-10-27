import { useSyncExternalStore } from 'react';
import type { Task } from '../api/types';

/**
 * A small lookup of task id → readable path ("Client / Project / Task").
 *
 * Time entries only carry a taskId, and the API has no "task with its project" endpoint,
 * so resolving names per row would cost one request each against a 15 req/min budget.
 * Instead, every time the app loads tasks for a known project (tree or task picker)
 * it records them here. The directory is persisted, so names survive reloads.
 */
export interface TaskInfo {
  taskId: number;
  taskName: string;
  projectId: number;
  projectName: string;
  clientId: number;
  clientName: string;
}

const STORAGE_KEY = 'tt.taskDirectory.v1';
let directory: Record<number, TaskInfo> = load();
const listeners = new Set<() => void>();

function load(): Record<number, TaskInfo> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<number, TaskInfo>) : {};
  } catch {
    return {};
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(directory));
  } catch {
    /* storage unavailable (private mode, quota) – the directory still works in memory */
  }
}

export function recordTasks(
  tasks: Task[],
  ctx: { projectId: number; projectName: string; clientId: number; clientName: string },
): void {
  let changed = false;
  const next = { ...directory };
  for (const t of tasks) {
    const prev = next[t.id];
    if (!prev || prev.taskName !== t.name || prev.projectName !== ctx.projectName || prev.clientName !== ctx.clientName) {
      next[t.id] = { taskId: t.id, taskName: t.name, ...ctx };
      changed = true;
    }
  }
  if (!changed) return;
  directory = next;
  persist();
  listeners.forEach((l) => l());
}

export function getTaskInfo(id: number): TaskInfo | undefined {
  return directory[id];
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useTaskDirectory(): Record<number, TaskInfo> {
  return useSyncExternalStore(subscribe, () => directory);
}
