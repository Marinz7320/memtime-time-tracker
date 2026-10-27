import { useEffect, useId, useMemo, useState } from 'react';
import { useClients, useProjects, useTask, useTasks } from '../../api/hooks';
import { flattenTree, buildTaskTree } from '../../lib/taskTree';
import { useTaskDirectory } from '../../lib/taskDirectory';
import { Spinner } from '../../components/Feedback';
import { describeError } from '../../api/http';

interface Props {
  value: number | null;
  onChange: (taskId: number | null) => void;
  error?: string;
}

/**
 * Choose a task the way people think about their work: client, then project, then task.
 * Nobody should have to know a task ID by heart.
 */
export function TaskPicker({ value, onChange, error }: Props) {
  const directory = useTaskDirectory();
  const known = value != null ? directory[value] : undefined;
  const [choosing, setChoosing] = useState(value == null);
  const [clientId, setClientId] = useState<number | undefined>(known?.clientId);
  const [projectId, setProjectId] = useState<number | undefined>(known?.projectId);
  const ids = { client: useId(), project: useId(), task: useId(), err: useId() };

  // A preselected task we have no names for: look it up once.
  const lookup = useTask(value ?? undefined, value != null && !known && !choosing);

  const clients = useClients();
  const client = clients.data?.find((c) => c.id === clientId);
  const projects = useProjects(clientId, choosing && clientId !== undefined);
  const project = projects.data?.find((p) => p.id === projectId);
  const tasks = useTasks(project, client, choosing && !!project);
  const options = useMemo(() => flattenTree(buildTaskTree(tasks.data ?? [])), [tasks.data]);

  // Only one project for this client? Choose it for the user.
  useEffect(() => {
    if (choosing && projectId === undefined && projects.data?.length === 1) setProjectId(projects.data[0]!.id);
  }, [choosing, projectId, projects.data]);

  if (!choosing && value != null) {
    return (
      <div className={`task-summary${error ? ' has-error' : ''}`}>
        <div>
          {known ? (
            <>
              <div className="task-summary__path">
                {known.clientName} / {known.projectName}
              </div>
              <div className="task-summary__name">{known.taskName}</div>
            </>
          ) : lookup.isPending ? (
            <div className="task-summary__name">
              <Spinner /> Task #{value}
            </div>
          ) : lookup.isError ? (
            <>
              <div className="task-summary__name">Task #{value}</div>
              <div className="field-error">{describeError(lookup.error).title}. Choose the task again.</div>
            </>
          ) : (
            <>
              <div className="task-summary__path">Task #{value}</div>
              <div className="task-summary__name">{lookup.data?.name}</div>
            </>
          )}
        </div>
        <button type="button" className="btn btn--sm" onClick={() => setChoosing(true)}>
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="task-picker">
      <div className="field">
        <label htmlFor={ids.client}>Client</label>
        <select
          id={ids.client}
          className="input"
          value={clientId ?? ''}
          disabled={!clients.data}
          onChange={(e) => {
            setClientId(e.target.value ? Number(e.target.value) : undefined);
            setProjectId(undefined);
            onChange(null);
          }}
        >
          <option value="">{clients.isPending ? 'Loading clients…' : 'Choose a client'}</option>
          {clients.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor={ids.project}>Project</label>
        <select
          id={ids.project}
          className="input"
          value={projectId ?? ''}
          disabled={!clientId || !projects.data}
          onChange={(e) => {
            setProjectId(e.target.value ? Number(e.target.value) : undefined);
            onChange(null);
          }}
        >
          <option value="">
            {!clientId ? 'Choose a client first' : projects.isPending ? 'Loading projects…' : projects.data?.length ? 'Choose a project' : 'No projects for this client'}
          </option>
          {projects.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor={ids.task}>Task</label>
        <select
          id={ids.task}
          className="input"
          value={value ?? ''}
          disabled={!project || !tasks.data}
          aria-invalid={!!error}
          aria-describedby={error ? ids.err : undefined}
          onChange={(e) => {
            const id = e.target.value ? Number(e.target.value) : null;
            onChange(id);
            if (id != null) setChoosing(false);
          }}
        >
          <option value="">
            {!project ? 'Choose a project first' : tasks.isPending ? 'Loading tasks…' : options.length ? 'Choose a task' : 'No tasks in this project'}
          </option>
          {options.map(({ task, depth }) => (
            <option key={task.id} value={task.id}>
              {' '.repeat(depth)}
              {task.name}
            </option>
          ))}
        </select>
      </div>

      {(clients.isError || projects.isError || tasks.isError) && (
        <p className="field-error" role="alert">
          {describeError(clients.error ?? projects.error ?? tasks.error).title}. Close the form and try again.
        </p>
      )}
      {error && (
        <p id={ids.err} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
