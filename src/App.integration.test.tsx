/**
 * End-to-end UI test: renders the whole app against the local mock API (mock/server.mjs),
 * which implements the documented endpoints, error formats and status codes.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { rateLimiter } from './api/http';
import { ToastProvider } from './components/Toasts';

const PORT = 8899;
let server: ChildProcess;
const realFetch = globalThis.fetch;

beforeAll(async () => {
  server = spawn(process.execPath, ['mock/server.mjs'], {
    env: { ...process.env, MOCK_PORT: String(PORT), MOCK_KEY: 'test-key', MOCK_LIMIT: '1000' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await realFetch(`http://127.0.0.1:${PORT}/health`)).ok) break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  // Stand in for the dev proxy: forward /api/* to the mock and add the key.
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) =>
    realFetch(`http://127.0.0.1:${PORT}${String(input)}`, {
      ...init,
      headers: { ...(init?.headers as Record<string, string>), Authorization: 'Bearer test-key' },
    }),
  );
  // The mock allows 1000 req/min; lift the client-side 15/min budget so tests don't wait on it.
  Object.defineProperty(rateLimiter, 'limit', { value: 1000 });
  window.confirm = () => true;
  // jsdom does not implement modal dialogs; every evergreen browser does.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

afterAll(() => {
  server?.kill();
  vi.restoreAllMocks();
});

function renderApp() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const T = { timeout: 4000 };

describe('Time tracker', () => {
  it('lists time entries with pagination and sorting', async () => {
    window.location.hash = '#/entries';
    const { unmount } = renderApp();
    expect(await screen.findByText('Showing 1–10', {}, T)).toBeTruthy();
    const rows = () => screen.getAllByRole('row').slice(1);
    expect(rows()).toHaveLength(10);
    // Default sort: newest start first -> seeded entry 1 (today) on top.
    expect(within(rows()[0]!).getByText('Seeded entry 1')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Showing 11–14', {}, T)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /^ID/ }));
    await waitFor(() => expect(within(rows()[0]!).getAllByRole('cell')[0]!.textContent).toBe('0'), T);
    unmount();
  });

  it('shows a clear message for an entry ID that does not exist', async () => {
    const { unmount } = renderApp();
    const input = await screen.findByPlaceholderText('Entry ID');
    fireEvent.change(input, { target: { value: '999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(await screen.findByText(/Time entry #999 not found/, {}, T)).toBeTruthy();
    unmount();
  });

  it('validates and creates a new entry, then confirms with the new ID', async () => {
    const { unmount } = renderApp();
    fireEvent.click(screen.getAllByRole('button', { name: 'New entry' })[0]!);
    fireEvent.click(await screen.findByRole('button', { name: 'Create entry' }));
    expect(screen.getByText('Choose the task you worked on.')).toBeTruthy();
    expect(screen.getByText('Describe what you worked on.')).toBeTruthy();

    const client = await screen.findByLabelText('Client');
    await waitFor(() => expect(within(client).getByText('Acme Corp')).toBeTruthy(), T);
    fireEvent.change(client, { target: { value: '1' } });
    const project = screen.getByLabelText('Project');
    await waitFor(() => expect(within(project).getByText('Website redesign')).toBeTruthy(), T);
    fireEvent.change(project, { target: { value: '1' } });
    const task = screen.getByLabelText('Task');
    await waitFor(() => expect(within(task).getByText(/Checkout/)).toBeTruthy(), T);
    fireEvent.change(task, { target: { value: '3' } });

    // The picker collapses into a readable summary of the choice.
    expect(await screen.findByText('Acme Corp / Website redesign')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Comment'), { target: { value: 'Built the checkout form' } });
    fireEvent.click(screen.getByRole('button', { name: '1h' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create entry' }));

    expect(await screen.findByText(/Time entry #14 created/, {}, T)).toBeTruthy();
    expect(screen.getByText(/Checkout, .*\(1h 00m\)/)).toBeTruthy();
    unmount();
  });

  it('updates an existing entry and shows the updated entry', async () => {
    const { unmount } = renderApp();
    await screen.findByText('Showing 1–10', {}, T);
    const row = screen.getByText('Seeded entry 2').closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }));
    expect(await screen.findByText(/Edit time entry #1/)).toBeTruthy();
    const comment = screen.getByLabelText('Comment');
    expect((comment as HTMLTextAreaElement).value).toBe('Seeded entry 2');
    fireEvent.change(comment, { target: { value: 'Seeded entry 2, revised' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Time entry #1 updated', {}, T)).toBeTruthy();
    expect(screen.getByText(/“Seeded entry 2, revised”/)).toBeTruthy();
    unmount();
  });

  it('updates entry #0 instead of creating a new one (the API uses 0 as an ID)', async () => {
    const { unmount } = renderApp();
    await screen.findByText('Showing 1–10', {}, T);
    fireEvent.click(within(screen.getByText('Seeded entry 1').closest('tr')!).getByRole('button', { name: 'Edit' }));
    expect(await screen.findByRole('button', { name: 'Save changes' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Comment'), { target: { value: 'Entry zero, edited' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Time entry #0 updated', {}, T)).toBeTruthy();
    unmount();
  });

  it('opens entry #0 by ID', async () => {
    const { unmount } = renderApp();
    fireEvent.change(await screen.findByPlaceholderText('Entry ID'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(await screen.findByText(/Edit time entry #0/, {}, T)).toBeTruthy();
    unmount();
  });

  it('shows clients, projects and nested tasks as a tree', async () => {
    window.location.hash = '#/clients';
    const { unmount } = renderApp();
    fireEvent.click(await screen.findByRole('button', { name: /Acme Corp/ }, T));
    fireEvent.click(await screen.findByRole('button', { name: /Website redesign/ }, T));
    const parent = (await screen.findByText('Design mockups', {}, T)).closest('li')!;
    expect(within(parent).getByText('Homepage')).toBeTruthy();
    expect(within(parent).getByText('Checkout')).toBeTruthy();
    expect(screen.getByText('4 tasks')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Log time on Homepage' }));
    expect(await screen.findByText('New time entry')).toBeTruthy();
    expect(screen.getByText('Homepage', { selector: '.task-summary__name' })).toBeTruthy();
    unmount();
    window.location.hash = '';
  });
});
