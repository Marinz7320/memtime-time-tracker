import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryFunctionContext,
  type QueryKey,
} from '@tanstack/react-query';
import { api, fetchAll, queryKeys, type OnPage } from './endpoints';
import { ApiError } from './http';
import type { Client, PageParams, Project, Task, TimeEntry, TimeEntryInput } from './types';
import { recordTasks } from '../lib/taskDirectory';

/** Clients/projects/tasks change rarely; cache them generously to protect the 15 req/min budget. */
const HIERARCHY_STALE = 5 * 60_000;

/**
 * Publish each page as it arrives, so long lists fill in instead of showing a spinner.
 * If loading then stops, the query is in its error state but keeps this data: that
 * combination means "partial", and the UI shows the rows with a way to load the rest.
 * A reload of a longer list never shrinks what's on screen; it swaps in when complete.
 */
function publishPages<T>(client: QueryClient, queryKey: QueryKey): OnPage<T> {
  return (loaded) => {
    const current = client.getQueryData<T[]>(queryKey);
    if (!current || loaded.length > current.length) client.setQueryData(queryKey, loaded);
  };
}

/** Query options shared by the hooks and by code that prefetches (e.g. matching tasks to clients). */
export const clientsQuery = () => ({
  queryKey: queryKeys.clients,
  queryFn: ({ client, queryKey }: QueryFunctionContext) => api.allClients(publishPages(client, queryKey)),
  staleTime: HIERARCHY_STALE,
});

export const projectsQuery = (clientId: number) => ({
  queryKey: queryKeys.projects(clientId),
  queryFn: ({ client, queryKey }: QueryFunctionContext) => api.allProjects(clientId, publishPages(client, queryKey)),
  staleTime: HIERARCHY_STALE,
});

export const tasksQuery = (project: Project, client: Client) => ({
  queryKey: queryKeys.tasks(project.id),
  queryFn: async ({ client: queryClient, queryKey }: QueryFunctionContext) => {
    const path = {
      projectId: project.id,
      projectName: project.name,
      clientId: client.id,
      clientName: client.name,
    };
    const publish = publishPages<Task>(queryClient, queryKey);
    const tasks = await api.allTasks(project.id, (loaded) => {
      recordTasks(loaded, path);
      publish(loaded);
    });
    recordTasks(tasks, path);
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
    queryFn: ({ client, queryKey }) =>
      fetchAll((p) => api.listTimeEntries(p), { sortBy: 'id', order: 'asc' }, publishPages(client, queryKey)),
    staleTime: 60_000,
  });
}
