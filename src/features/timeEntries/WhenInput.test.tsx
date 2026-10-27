import { afterEach, describe, expect, it } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WhenInput, type WhenValues } from './WhenInput';
import { resolveRange } from '../../lib/time';

afterEach(cleanup);

function Harness() {
  const [v, setV] = useState<WhenValues>({ date: '2026-03-10', startTime: '09:00', endTime: '10:00', endDate: null });
  return (
    <>
      <WhenInput {...v} range={resolveRange(v.date, v.startTime, v.endTime)} onChange={(p) => setV((x) => ({ ...x, ...p }))} />
      <output data-testid="v">{`${v.startTime}-${v.endTime}`}</output>
    </>
  );
}

const out = () => screen.getByTestId('v').textContent;

describe('WhenInput', () => {
  it('accepts typed times and normalises them', () => {
    render(<Harness />);
    const start = screen.getByLabelText('Start');
    fireEvent.change(start, { target: { value: '830' } });
    fireEvent.blur(start);
    expect(out()).toBe('08:30-10:00');
    expect((screen.getByLabelText('Duration') as HTMLInputElement).value).toBe('1h 30m');
  });

  it('moves the end time when the duration is typed', () => {
    render(<Harness />);
    const duration = screen.getByLabelText('Duration');
    fireEvent.change(duration, { target: { value: '2h15' } });
    fireEvent.blur(duration);
    expect(out()).toBe('09:00-11:15');
  });

  it('nudges with arrow keys and flags text it cannot read', () => {
    render(<Harness />);
    const end = screen.getByLabelText('End');
    fireEvent.keyDown(end, { key: 'ArrowUp' });
    expect(out()).toBe('09:00-10:15');
    fireEvent.change(end, { target: { value: 'later' } });
    fireEvent.blur(end);
    expect(end.getAttribute('aria-invalid')).toBe('true');
    expect(out()).toBe('09:00-10:15');
  });
});
