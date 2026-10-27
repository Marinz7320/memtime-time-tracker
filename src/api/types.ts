export type Status = 'active' | 'inactive' | (string & {});

export interface Client {
  id: number;
  name: string;
  description: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: number;
  clientId: number;
  name: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: number;
  /** Parent task id; 0 means top-level task within the project. */
  parent: number;
  name: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
}

export interface TimeEntry {
  id: number;
  taskId: number;
  userId: string;
  comment: string;
  start: string;
  end: string;
  createdAt: string;
  updatedAt: string;
}

/** Body for POST /time-entries and PUT /time-entries/:id */
export interface TimeEntryInput {
  taskId: number;
  comment: string;
  start: string;
  end: string;
}

export type SortOrder = 'asc' | 'desc';

export interface PageParams {
  limit?: number;
  offset?: number;
  sortBy?: string;
  order?: SortOrder;
}
