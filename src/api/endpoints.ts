import { request } from './http';
import type { Client, PageParams, Project, Task, TimeEntry, TimeEntryInput } from './types';

/**
 * The API returns bare arrays (no total count), so "fetch all" walks pages until
 * a short page comes back. A hard cap guards against runaway loops.
 */
export const FETCH_ALL_PAGE_SIZE = 50;
const FETCH_ALL_MAX_PAGES = 20;

export async function fetchAll<T>(
  fetchPage: (params: PageParams) => Promise<T[]>,
  base: PageParams = {},
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 0; page < FETCH_ALL_MAX_PAGES; page++) {
    const items = await fetchPage({ ...base, limit: FETCH_ALL_PAGE_SIZE, offset: page * FETCH_ALL_PAGE_SIZE });
    all.push(...items);
    if (items.length < FETCH_ALL_PAGE_SIZE) break;
  }
  return all;
}

const byName: PageParams = { sortBy: 'name', order: 'asc' };

export const api = {
  listClients: (p: PageParams = {}) => request<Client[]>('/clients', { query: { ...p } }),
  listProjects: (clientId: number, p: PageParams = {}) =>
    request<Project[]>(`/clients/${clientId}/projects`, { query: { ...p } }),
  listTasks: (projectId: number, p: PageParams = {}) =>
    request<Task[]>(`/projects/${projectId}/tasks`, { query: { ...p } }),
  getTask: (id: number) => request<Task>(`/tasks/${id}`),

  listTimeEntries: (p: PageParams = {}) => request<TimeEntry[]>('/time-entries', { query: { ...p } }),
  getTimeEntry: (id: number) => request<TimeEntry>(`/time-entries/${id}`),
  createTimeEntry: (input: TimeEntryInput) =>
    request<TimeEntry>('/time-entries', { method: 'POST', body: input }),
  updateTimeEntry: (id: number, input: TimeEntryInput) =>
    request<TimeEntry>(`/time-entries/${id}`, { method: 'PUT', body: input }),
  deleteTimeEntry: (id: number) =>
    request<{ message: string }>(`/time-entries/${id}`, { method: 'DELETE' }),

  allClients: () => fetchAll((p) => api.listClients(p), byName),
  allProjects: (clientId: number) => fetchAll((p) => api.listProjects(clientId, p), byName),
  allTasks: (projectId: number) => fetchAll((p) => api.listTasks(projectId, p), byName),
};

export const queryKeys = {
  clients: ['clients'] as const,
  projects: (clientId: number) => ['clients', clientId, 'projects'] as const,
  tasks: (projectId: number) => ['projects', projectId, 'tasks'] as const,
  task: (id: number) => ['tasks', id] as const,
  timeEntries: ['time-entries'] as const,
  timeEntryPage: (p: PageParams) => ['time-entries', 'page', p] as const,
};
