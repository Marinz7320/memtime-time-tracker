import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fetchAll, queryKeys } from './endpoints';
import { ApiError } from './http';
import type { Client, PageParams, Project, TimeEntry, TimeEntryInput } from './types';
import { recordTasks } from '../lib/taskDirectory';

/** Clients/projects/tasks change rarely; cache them generously to protect the 15 req/min budget. */
const HIERARCHY_STALE = 5 * 60_000;

/** Query options shared by the hooks and by code that prefetches (e.g. matching tasks to clients). */
export const clientsQuery = () => ({ queryKey: queryKeys.clients, queryFn: api.allClients, staleTime: HIERARCHY_STALE });

export const projectsQuery = (clientId: number) => ({
  queryKey: queryKeys.projects(clientId),
  queryFn: () => api.allProjects(clientId),
  staleTime: HIERARCHY_STALE,
});

export const tasksQuery = (project: Project, client: Client) => ({
  queryKey: queryKeys.tasks(project.id),
  queryFn: async () => {
    const tasks = await api.allTasks(project.id);
    recordTasks(tasks, {
      projectId: project.id,
      projectName: project.name,
      clientId: client.id,
      clientName: client.name,
    });
    return tasks;
  },
  staleTime: HIERARCHY_STALE,
});

export function useClients() {
  return useQuery(clientsQuery());
}

export function useProjects(clientId: number | undefined, enabled = true) {
  return useQuery({ ...projectsQuery(clientId ?? -1), enabled: enabled && clientId !== undefined });
}

export function useTasks(project: Project | undefined, client: Client | undefined, enabled = true) {
  const opts = project && client ? tasksQuery(project, client) : { queryKey: queryKeys.tasks(-1), queryFn: async () => [] };
  return useQuery({ ...opts, staleTime: HIERARCHY_STALE, enabled: enabled && !!project && !!client });
}

export function useTask(id: number | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.task(id ?? -1),
    queryFn: () => api.getTask(id!),
    enabled: enabled && id !== undefined,
    staleTime: HIERARCHY_STALE,
    retry: false,
  });
}

export interface EntriesPage {
  items: TimeEntry[];
  hasMore: boolean;
}

/**
 * The API returns no total count, so we ask for one extra row to know whether a next page exists.
 */
export function useTimeEntriesPage(params: Required<PageParams>) {
  return useQuery({
    queryKey: queryKeys.timeEntryPage(params),
    queryFn: async (): Promise<EntriesPage> => {
      const rows = await api.listTimeEntries({ ...params, limit: params.limit + 1 });
      return { items: rows.slice(0, params.limit), hasMore: rows.length > params.limit };
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useSaveTimeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id?: number; input: TimeEntryInput }) =>
      v.id !== undefined ? api.updateTimeEntry(v.id, v.input) : api.createTimeEntry(v.input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.timeEntries }),
    // The entry no longer exists on the server: refresh the list so the stale row disappears.
    onError: (err) => {
      if (err instanceof ApiError && err.status === 404) qc.invalidateQueries({ queryKey: queryKeys.timeEntries });
    },
  });
}

export function useDeleteTimeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteTimeEntry(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.timeEntries }),
  });
}

/** Every entry of the user (all pages), for totals such as time per client. */
export function useAllTimeEntries() {
  return useQuery({
    queryKey: [...queryKeys.timeEntries, 'all'] as const,
    queryFn: () => fetchAll((p) => api.listTimeEntries(p), { sortBy: 'id', order: 'asc' }),
    staleTime: 60_000,
  });
}
