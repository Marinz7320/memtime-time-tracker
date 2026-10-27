import type { Task } from '../api/types';

export interface TaskNode {
  task: Task;
  depth: number;
  children: TaskNode[];
}

/**
 * Tasks are returned flat with a `parent` id (0 = top level). Build the nested tree,
 * keeping API order within each level. Tasks whose parent is not in the list (or that
 * would form a cycle) are treated as top-level so nothing silently disappears.
 */
export function buildTaskTree(tasks: Task[]): TaskNode[] {
  const nodes = new Map<number, TaskNode>();
  for (const task of tasks) nodes.set(task.id, { task, depth: 0, children: [] });

  const roots: TaskNode[] = [];
  for (const task of tasks) {
    const node = nodes.get(task.id)!;
    const parent = task.parent && task.parent !== task.id ? nodes.get(task.parent) : undefined;
    if (parent && !isAncestor(node, parent)) parent.children.push(node);
    else roots.push(node);
  }

  const setDepth = (list: TaskNode[], depth: number) => {
    for (const n of list) {
      n.depth = depth;
      setDepth(n.children, depth + 1);
    }
  };
  setDepth(roots, 0);
  return roots;
}

function isAncestor(candidate: TaskNode, node: TaskNode): boolean {
  // Would attaching `candidate` under `node` create a cycle? (node is inside candidate's subtree)
  const stack = [...candidate.children];
  while (stack.length) {
    const n = stack.pop()!;
    if (n === node) return true;
    stack.push(...n.children);
  }
  return false;
}

/** Depth-first flattening, e.g. for <select> options. */
export function flattenTree(nodes: TaskNode[]): TaskNode[] {
  const out: TaskNode[] = [];
  const walk = (list: TaskNode[]) => {
    for (const n of list) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

export function countTasks(nodes: TaskNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countTasks(n.children), 0);
}
