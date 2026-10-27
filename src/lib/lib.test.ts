import { describe, expect, it } from 'vitest';
import { buildTaskTree, countTasks, flattenTree } from './taskTree';
import { formatDuration, resolveRange } from './time';
import { defaultValues, validate, valuesFromEntry } from '../features/timeEntries/entryForm';
import type { Task, TimeEntry } from '../api/types';

const task = (id: number, parent: number, name = `T${id}`): Task => ({
  id,
  parent,
  name,
  status: 'active',
  createdAt: '',
  updatedAt: '',
});

describe('buildTaskTree', () => {
  it('nests subtasks under their parent and keeps orphans at the top', () => {
    const tree = buildTaskTree([task(1, 0), task(2, 1), task(3, 2), task(4, 0), task(5, 999)]);
    expect(tree.map((n) => n.task.id)).toEqual([1, 4, 5]);
    expect(tree[0]!.children[0]!.children[0]!.task.id).toBe(3);
    expect(flattenTree(tree).map((n) => [n.task.id, n.depth])).toEqual([
      [1, 0],
      [2, 1],
      [3, 2],
      [4, 0],
      [5, 0],
    ]);
    expect(countTasks(tree)).toBe(5);
  });

  it('survives cycles and self-references', () => {
    const tree = buildTaskTree([task(1, 2), task(2, 1), task(3, 3)]);
    expect(countTasks(tree)).toBe(3);
  });
});

describe('time helpers', () => {
  it('formats durations', () => {
    expect(formatDuration(45 * 60_000)).toBe('45m');
    expect(formatDuration(125 * 60_000)).toBe('2h 05m');
    expect(formatDuration(-30 * 60_000)).toBe('−30m');
  });

  it('treats an end time before the start time as the next day', () => {
    const r = resolveRange('2026-03-10', '22:00', '01:30')!;
    expect(r.overnight).toBe(true);
    expect(r.end.getTime() - r.start.getTime()).toBe(3.5 * 3_600_000);
  });
});

describe('entry form validation', () => {
  const now = new Date(2026, 9, 27, 18, 7);

  it('defaults to the last hour, snapped to the quarter hour', () => {
    const v = defaultValues(3, now);
    expect([v.date, v.startTime, v.endTime]).toEqual(['2026-10-27', '17:00', '18:00']);
  });

  it('reports every missing field with actionable copy', () => {
    const r = validate({ taskId: null, date: '', startTime: '', endTime: '', endDate: null, comment: '  ' }, now);
    expect(r.errors.taskId).toMatch(/Choose the task/);
    expect(r.errors.comment).toMatch(/Describe/);
    expect(r.errors.date).toBeTruthy();
    expect(r.input).toBeNull();
  });

  it('rejects zero-length and backwards ranges', () => {
    const base = { taskId: 1, date: '2026-10-27', comment: 'x', endDate: null };
    expect(validate({ ...base, startTime: '09:00', endTime: '09:00' }, now).errors.endTime).toBeTruthy();
    expect(
      validate({ ...base, startTime: '09:00', endTime: '08:00', endDate: '2026-10-27' }, now).errors.endTime,
    ).toMatch(/after the start/);
  });

  it('builds an ISO 8601 payload with a trimmed comment', () => {
    const r = validate(
      { taskId: 4, date: '2026-10-27', startTime: '09:00', endTime: '10:30', endDate: null, comment: '  Review  ' },
      now,
    );
    expect(r.input).not.toBeNull();
    expect(r.input!.comment).toBe('Review');
    expect(new Date(r.input!.end).getTime() - new Date(r.input!.start).getTime()).toBe(90 * 60_000);
    expect(r.input!.start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('warns about long and future entries without blocking them', () => {
    const r = validate(
      { taskId: 4, date: '2026-10-27', startTime: '05:00', endTime: '19:00', endDate: null, comment: 'x' },
      now,
    );
    expect(r.input).not.toBeNull();
    expect(r.warnings).toHaveLength(2);
  });

  it('round-trips an existing entry, including multi-day ones', () => {
    const entry = (start: Date, end: Date): TimeEntry => ({
      id: 1,
      taskId: 2,
      userId: 'u',
      comment: 'c',
      start: start.toISOString(),
      end: end.toISOString(),
      createdAt: '',
      updatedAt: '',
    });
    for (const [s, e] of [
      [new Date(2026, 0, 5, 9), new Date(2026, 0, 5, 17)],
      [new Date(2026, 0, 5, 22), new Date(2026, 0, 6, 2)],
      [new Date(2026, 0, 5, 9), new Date(2026, 0, 7, 11)],
    ] as const) {
      const r = validate(valuesFromEntry(entry(s, e)), new Date(2027, 0, 1));
      expect(r.input?.start).toBe(s.toISOString());
      expect(r.input?.end).toBe(e.toISOString());
    }
  });
});
