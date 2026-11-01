import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useClients, useProjects, useTasks } from '../../api/hooks';
import { queryKeys } from '../../api/endpoints';
import type { Client, Project, Task } from '../../api/types';
import { buildTaskTree, countTasks, type TaskNode } from '../../lib/taskTree';
import { EmptyState, ErrorNotice, PartialStatus, Spinner, StatusBadge } from '../../components/Feedback';
import { ClientEffort } from '../insights/ClientEffort';

interface Props {
  onLogTime: (taskId: number) => void;
}

const norm = (s: string) => s.toLocaleLowerCase().trim();
const hit = (name: string, q: string) => norm(name).includes(q);

/** Does anything already cached under this project match the search? */
function projectMatches(qc: QueryClient, p: Project, q: string): boolean {
  if (hit(p.name, q)) return true;
  const tasks = qc.getQueryData<Task[]>(queryKeys.tasks(p.id));
  return !!tasks?.some((t) => hit(t.name, q));
}

function clientMatches(qc: QueryClient, c: Client, q: string): boolean {
  if (hit(c.name, q) || hit(c.description ?? '', q)) return true;
  const projects = qc.getQueryData<Project[]>(queryKeys.projects(c.id));
  return !!projects?.some((p) => projectMatches(qc, p, q));
}

export function HierarchyView({ onLogTime }: Props) {
  const clients = useClients();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [expandAllRequest, setExpandAllRequest] = useState(0);
  const [query, setQuery] = useState('');
  const q = norm(query);

  const toggle = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const expandKeys = useCallback((keys: string[]) => {
    setExpanded((prev) => {
      if (keys.every((k) => prev.has(k))) return prev;
      const next = new Set(prev);
      keys.forEach((k) => next.add(k));
      return next;
    });
  }, []);

  const expandAll = () => {
    expandKeys((clients.data ?? []).map((c) => `c:${c.id}`));
    setExpandAllRequest((n) => n + 1);
  };

  const visibleClients = useMemo(
    () => (clients.data ?? []).filter((c) => !q || clientMatches(qc, c, q)),
    [clients.data, q, qc, expanded],
  );

  return (
    <section className="panel" aria-labelledby="hierarchy-title">
      <header className="panel__header">
        <div>
          <h1 id="hierarchy-title">Clients and projects</h1>
          <p className="muted">Open a client to see its projects, and a project to see its tasks. Pick any task to log time on it.</p>
        </div>
        <div className="toolbar">
          <input
            className="input input--search"
            type="search"
            placeholder="Search clients, projects, tasks"
            aria-label="Search clients, projects and tasks"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn" onClick={expandAll} disabled={!clients.data?.length}>
            Expand all
          </button>
          <button className="btn btn--ghost" onClick={() => setExpanded(new Set())} disabled={!expanded.size}>
            Collapse all
          </button>
        </div>
      </header>

      <div className="clients-layout">
        <div className="clients-layout__main">
          {q && (
            <p className="hint">Search covers everything loaded so far. Use Expand all to search every project and task.</p>
          )}

          {!clients.data ? (
            clients.isError ? (
              <ErrorNotice error={clients.error} onRetry={() => clients.refetch()} />
            ) : (
              <div className="loading-row">
                <Spinner /> Loading clients…
              </div>
            )
          ) : !clients.data.length ? (
            <EmptyState title="No clients yet">Clients created in your account will appear here.</EmptyState>
          ) : !visibleClients.length ? (
            <EmptyState title={`Nothing matches “${query}”`}>Try another name, or expand all to search deeper.</EmptyState>
          ) : (
            <ul className="tree" role="tree" aria-label="Clients, projects and tasks">
              {visibleClients.map((c) => (
                <ClientNode
                  key={c.id}
                  client={c}
                  expanded={expanded}
                  toggle={toggle}
                  expandKeys={expandKeys}
                  expandAllRequest={expandAllRequest}
                  q={q}
                  onLogTime={onLogTime}
                />
              ))}
            </ul>
          )}
          <PartialStatus query={clients} label="more clients" />
        </div>
        <aside className="clients-layout__side">
          <ClientEffort />
        </aside>
      </div>
    </section>
  );
}

interface NodeProps {
  expanded: Set<string>;
  toggle: (key: string) => void;
  expandKeys: (keys: string[]) => void;
  expandAllRequest: number;
  q: string;
  onLogTime: (taskId: number) => void;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={`chevron${open ? ' chevron--open' : ''}`} viewBox="0 0 16 16" aria-hidden>
      <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClientNode({ client, ...rest }: NodeProps & { client: Client }) {
  const { expanded, toggle, expandKeys, expandAllRequest, q } = rest;
  const key = `c:${client.id}`;
  const qc = useQueryClient();
  const searchOpen = !!q && !hit(client.name, q) && clientMatches(qc, client, q);
  const open = expanded.has(key) || searchOpen;
  const projects = useProjects(client.id, open);
  const [handled, setHandled] = useState(0);

  useEffect(() => {
    if (expandAllRequest > handled && open && projects.data) {
      expandKeys(projects.data.map((p) => `p:${p.id}`));
      setHandled(expandAllRequest);
    }
  }, [expandAllRequest, handled, open, projects.data, expandKeys]);

  const showAll = !q || hit(client.name, q) || hit(client.description ?? '', q);
  const visible = (projects.data ?? []).filter((p) => showAll || projectMatches(qc, p, q));

  return (
    <li role="treeitem" aria-expanded={open} className="tree__item tree__item--client">
      <button className="tree__row" onClick={() => toggle(key)}>
        <Chevron open={open} />
        <span className="tree__name">{client.name}</span>
        <StatusBadge status={client.status} />
        {client.description && <span className="tree__meta">{client.description}</span>}
        {projects.data && (
          <span className="count" title="Projects">
            {projects.data.length} {projects.data.length === 1 ? 'project' : 'projects'}
          </span>
        )}
      </button>
      {open && (
        <ul role="group" className="tree__children">
          {!projects.data ? (
            <li className="tree__status">
              {projects.isError ? (
                <ErrorNotice compact error={projects.error} onRetry={() => projects.refetch()} />
              ) : (
                <>
                  <Spinner /> Loading projects…
                </>
              )}
            </li>
          ) : !projects.data.length ? (
            <li className="tree__status muted">No projects for this client.</li>
          ) : (
            visible.map((p) => (
              <ProjectNode key={p.id} project={p} client={client} parentMatched={showAll} {...rest} />
            ))
          )}
          <PartialStatus as="li" query={projects} label="more projects" />
        </ul>
      )}
    </li>
  );
}

function ProjectNode({
  project,
  client,
  parentMatched,
  ...rest
}: NodeProps & { project: Project; client: Client; parentMatched: boolean }) {
  const { expanded, toggle, q, onLogTime } = rest;
  const key = `p:${project.id}`;
  const qc = useQueryClient();
  const selfMatch = !q || parentMatched || hit(project.name, q);
  const searchOpen = !!q && !selfMatch && projectMatches(qc, project, q);
  const open = expanded.has(key) || searchOpen;
  const tasks = useTasks(project, client, open);
  const tree = useMemo(() => buildTaskTree(tasks.data ?? []), [tasks.data]);

  return (
    <li role="treeitem" aria-expanded={open} className="tree__item">
      <button className="tree__row" onClick={() => toggle(key)}>
        <Chevron open={open} />
        <span className="tree__name">{project.name}</span>
        <StatusBadge status={project.status} />
        {tasks.data && (
          <span className="count" title="Tasks">
            {countTasks(tree)} {countTasks(tree) === 1 ? 'task' : 'tasks'}
          </span>
        )}
      </button>
      {open && (
        <ul role="group" className="tree__children">
          {!tasks.data ? (
            <li className="tree__status">
              {tasks.isError ? (
                <ErrorNotice compact error={tasks.error} onRetry={() => tasks.refetch()} />
              ) : (
                <>
                  <Spinner /> Loading tasks…
                </>
              )}
            </li>
          ) : !tree.length ? (
            <li className="tree__status muted">No tasks in this project.</li>
          ) : (
            tree.map((n) => (
              <TaskItem key={n.task.id} node={n} q={selfMatch ? '' : q} onLogTime={onLogTime} />
            ))
          )}
          <PartialStatus as="li" query={tasks} label="more tasks" />
        </ul>
      )}
    </li>
  );
}

function subtreeMatches(n: TaskNode, q: string): boolean {
  return hit(n.task.name, q) || n.children.some((c) => subtreeMatches(c, q));
}

function TaskItem({ node, q, onLogTime }: { node: TaskNode; q: string; onLogTime: (id: number) => void }) {
  if (q && !subtreeMatches(node, q)) return null;
  const { task } = node;
  const childQ = q && hit(task.name, q) ? '' : q;
  const inactive = task.status === 'completed' || task.status === 'inactive';
  return (
    <li role="treeitem" className={`tree__item tree__item--task${inactive ? ' is-inactive' : ''}`}>
      <div className="tree__row tree__row--task">
        <span className="tree__dot" aria-hidden />
        <span className="tree__name">{task.name}</span>
        <StatusBadge status={task.status} />
        <span className="tree__id">#{task.id}</span>
        <button
          className="btn btn--sm btn--ghost tree__action"
          onClick={() => onLogTime(task.id)}
          aria-label={`Log time on ${task.name}`}
        >
          Log time
        </button>
      </div>
      {node.children.length > 0 && (
        <ul role="group" className="tree__children">
          {node.children.map((c) => (
            <TaskItem key={c.task.id} node={c} q={childQ} onLogTime={onLogTime} />
          ))}
        </ul>
      )}
    </li>
  );
}
