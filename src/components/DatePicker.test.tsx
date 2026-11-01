import { afterEach, describe, expect, it } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DatePicker, parseDateInput } from './DatePicker';
import { toDateInput } from '../lib/time';

afterEach(cleanup);

function Harness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <DatePicker label="Date" value={value} onChange={setValue} />
      <output data-testid="value">{value}</output>
    </>
  );
}

const value = () => screen.getByTestId('value').textContent;

describe('DatePicker', () => {
  it('parses dates as local days', () => {
    const d = parseDateInput('2026-03-01')!;
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 2, 1]);
    expect(parseDateInput('nope')).toBeNull();
  });

  it('steps a day at a time and has Today / Yesterday shortcuts', () => {
    render(<Harness initial="2026-03-01" />);
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(value()).toBe('2026-02-28');
    fireEvent.click(screen.getByRole('button', { name: 'Next day' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next day' }));
    expect(value()).toBe('2026-03-02');
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(value()).toBe(toDateInput(new Date()));
    const y = new Date();
    y.setDate(y.getDate() - 1);
    fireEvent.click(screen.getByRole('button', { name: 'Yesterday' }));
    expect(value()).toBe(toDateInput(y));
  });

  it('opens a calendar, picks a day by click, and closes', () => {
    render(<Harness initial="2026-01-15" />);
    fireEvent.click(screen.getByRole('button', { name: /Date/, expanded: false }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('grid')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    // Day labels follow the runtime locale, so build the expected name the same way.
    const feb3 = new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(2026, 1, 3));
    fireEvent.click(screen.getByRole('button', { name: feb3 }));
    expect(value()).toBe('2026-02-03');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is fully keyboard operable', () => {
    render(<Harness initial="2026-01-31" />);
    fireEvent.click(screen.getByRole('button', { name: /Date/, expanded: false }));
    const grid = screen.getByRole('grid');
    fireEvent.keyDown(grid, { key: 'ArrowRight' }); // Feb 1
    fireEvent.keyDown(grid, { key: 'ArrowDown' }); // Feb 8
    fireEvent.keyDown(grid, { key: 'PageDown' }); // Mar 8
    fireEvent.keyDown(grid, { key: 'ArrowLeft' }); // Mar 7
    expect(document.activeElement?.getAttribute('data-date')).toBe('2026-03-07');
    fireEvent.click(document.activeElement!);
    expect(value()).toBe('2026-03-07');

    fireEvent.click(screen.getByRole('button', { name: /Date/, expanded: false }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(value()).toBe('2026-03-07');
  });

  it('clamps month jumps to the end of shorter months', () => {
    render(<Harness initial="2026-01-31" />);
    fireEvent.click(screen.getByRole('button', { name: /Date/, expanded: false }));
    fireEvent.keyDown(screen.getByRole('grid'), { key: 'PageDown' });
    expect(document.activeElement?.getAttribute('data-date')).toBe('2026-02-28');
  });
});
