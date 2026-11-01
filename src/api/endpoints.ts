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
  onPage?: OnPage<T>,
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 0; page < FETCH_ALL_MAX_PAGES; page++) {
    const items = await fetchPage({ ...base, limit: FETCH_ALL_PAGE_SIZE, offset: page * FETCH_ALL_PAGE_SIZE });
    all.push(...items);
    if (items.length < FETCH_ALL_PAGE_SIZE) break;
    onPage?.([...all]);
  }
  return all;
}

/** Called with everything loaded so far whenever more pages are still to come. */
export type OnPage<T> = (loadedSoFar: T[]) => void;

/** "Client 2" before "Client 10", locale-aware. */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
export const sortByName = <T extends { name: string }>(items: T[]): T[] =>
  [...items].sort((a, b) => collator.compare(a.name, b.name));

const fetchAllSorted = async <T extends { name: string }>(
  fetchPage: (params: PageParams) => Promise<T[]>,
  onPage?: OnPage<T>,
): Promise<T[]> => sortByName(await fetchAll(fetchPage, {}, onPage && ((items) => onPage(sortByName(items)))));

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

  allClients: (onPage?: OnPage<Client>) => fetchAllSorted((p) => api.listClients(p), onPage),
  allProjects: (clientId: number, onPage?: OnPage<Project>) =>
    fetchAllSorted((p) => api.listProjects(clientId, p), onPage),
  allTasks: (projectId: number, onPage?: OnPage<Task>) => fetchAllSorted((p) => api.listTasks(projectId, p), onPage),
};

export const queryKeys = {
  clients: ['clients'] as const,
  projects: (clientId: number) => ['clients', clientId, 'projects'] as const,
  tasks: (projectId: number) => ['projects', projectId, 'tasks'] as const,
  task: (id: number) => ['tasks', id] as const,
  timeEntries: ['time-entries'] as const,
  timeEntryPage: (p: PageParams) => ['time-entries', 'page', p] as const,
};
