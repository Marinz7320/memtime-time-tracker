import { describe, expect, it } from 'vitest';
import { formatMinutes, parseDurationInput, parseTimeInput, shiftTime } from './timeParse';
import { aggregateByClient } from './clientEffort';
import type { TimeEntry } from '../api/types';

describe('parseTimeInput', () => {
  it.each([
    ['9', '09:00'],
    ['930', '09:30'],
    ['0930', '09:30'],
    ['9:30', '09:30'],
    ['9.30', '09:30'],
    ['17h', '17:00'],
    ['1730', '17:30'],
    ['5pm', '17:00'],
    ['5:30 PM', '17:30'],
    ['12am', '00:00'],
    ['12pm', '12:00'],
    ['24', '00:00'],
  ])('reads %s as %s', (input, expected) => expect(parseTimeInput(input)).toBe(expected));

  it.each(['', 'abc', '25', '9:75', '13pm', '12345'])('rejects %s', (input) =>
    expect(parseTimeInput(input)).toBeNull(),
  );
});

describe('parseDurationInput', () => {
  it.each([
    ['1h 30m', 90],
    ['1h30', 90],
    ['2h', 120],
    ['90m', 90],
    ['45 min', 45],
    ['1:15', 75],
    ['1.5', 90],
    ['1,5h', 90],
    ['8', 480],
    ['45', 45],
  ])('reads %s as %i minutes', (input, expected) => expect(parseDurationInput(input)).toBe(expected));

  it.each(['', 'soon', '1h 30x'])('rejects %s', (input) => expect(parseDurationInput(input)).toBeNull());
});

describe('time helpers', () => {
  it('formats and shifts', () => {
    expect(formatMinutes(90)).toBe('1h 30m');
    expect(formatMinutes(120)).toBe('2h');
    expect(formatMinutes(45)).toBe('45m');
    expect(shiftTime('23:50', 15)).toBe('00:05');
    expect(shiftTime('00:05', -15)).toBe('23:50');
  });
});

describe('aggregateByClient', () => {
  const entry = (id: number, taskId: number, hours: number): TimeEntry => ({
    id,
    taskId,
    userId: 'u',
    comment: '',
    start: '2026-01-05T09:00:00.000Z',
    end: new Date(Date.parse('2026-01-05T09:00:00.000Z') + hours * 3_600_000).toISOString(),
    createdAt: '',
    updatedAt: '',
  });
  const info = (taskId: number, clientId: number, projectId: number) => ({
    taskId,
    taskName: `T${taskId}`,
    projectId,
    projectName: `P${projectId}`,
    clientId,
    clientName: `Client ${clientId}`,
  });

  it('sums time per client, largest first, and keeps unknown tasks aside', () => {
    const dir = { 1: info(1, 10, 100), 2: info(2, 10, 101), 3: info(3, 20, 200) };
    const r = aggregateByClient([entry(1, 1, 2), entry(2, 2, 1), entry(3, 3, 1), entry(4, 99, 4)], dir);
    expect(r.rows.map((x) => [x.clientName, x.minutes, x.entries, x.projects])).toEqual([
      ['Client 10', 180, 2, 2],
      ['Client 20', 60, 1, 1],
    ]);
    expect(r.rows[0]!.share).toBeCloseTo(0.75);
    expect(r.unmatched).toEqual({ minutes: 240, entries: 1, taskIds: [99] });
    expect(r.totalMinutes).toBe(480);
  });
});
