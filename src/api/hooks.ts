import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, queryKeys } from './endpoints';
import type { Client, PageParams, Project, TimeEntry, TimeEntryInput } from './types';
import { recordTasks } from '../lib/taskDirectory';

/** Clients/projects/tasks change rarely; cache them generously to protect the 15 req/min budget. */
const HIERARCHY_STALE = 5 * 60_000;

export function useClients() {
  return useQuery({ queryKey: queryKeys.clients, queryFn: api.allClients, staleTime: HIERARCHY_STALE });
}

export function useProjects(clientId: number | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.projects(clientId ?? -1),
    queryFn: () => api.allProjects(clientId!),
    enabled: enabled && clientId !== undefined,
    staleTime: HIERARCHY_STALE,
  });
}

export function useTasks(project: Project | undefined, client: Client | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.tasks(project?.id ?? -1),
    queryFn: async () => {
      const tasks = await api.allTasks(project!.id);
      recordTasks(tasks, {
        projectId: project!.id,
        projectName: project!.name,
        clientId: client!.id,
        clientName: client!.name,
      });
      return tasks;
    },
    enabled: enabled && !!project && !!client,
    staleTime: HIERARCHY_STALE,
  });
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
      v.id ? api.updateTimeEntry(v.id, v.input) : api.createTimeEntry(v.input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.timeEntries }),
  });
}

export function useDeleteTimeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteTimeEntry(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.timeEntries }),
  });
}
