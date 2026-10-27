import { useCallback, useEffect, useRef, useState } from 'react';
import type { TimeEntry } from './api/types';
import { Drawer } from './components/Drawer';
import { RateLimitBanner } from './components/RateLimitBanner';
import { ScrollJump } from './components/ScrollJump';
import { useToast } from './components/Toasts';
import { HierarchyView } from './features/hierarchy/HierarchyView';
import { TimeEntriesView } from './features/timeEntries/TimeEntriesView';
import { TimeEntryForm, type FormMode } from './features/timeEntries/TimeEntryForm';
import { getTaskInfo } from './lib/taskDirectory';
import { durationMs, formatDay, formatDuration, formatTime } from './lib/time';

type View = 'entries' | 'clients';

function viewFromHash(): View {
  return window.location.hash === '#/clients' ? 'clients' : 'entries';
}

function describeEntry(e: TimeEntry): string {
  const info = getTaskInfo(e.taskId);
  const task = info ? info.taskName : `Task #${e.taskId}`;
  const start = new Date(e.start);
  return `${task}, ${formatDay(start)}, ${formatTime(start)} to ${formatTime(new Date(e.end))} (${formatDuration(
    durationMs(e.start, e.end),
  )}). “${e.comment}”`;
}

export default function App() {
  const [view, setView] = useState<View>(viewFromHash);
  const [form, setForm] = useState<FormMode | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const dirty = useRef(false);
  const toast = useToast();

  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (v: View) => {
    window.location.hash = v === 'clients' ? '#/clients' : '#/entries';
    setView(v);
  };

  const openForm = useCallback((mode: FormMode) => {
    dirty.current = false;
    setFormKey((k) => k + 1);
    setForm(mode);
  }, []);

  const closeForm = () => {
    if (dirty.current && !window.confirm('Discard your unsaved changes?')) return;
    dirty.current = false;
    setForm(null);
  };

  const onDirtyChange = useCallback((d: boolean) => {
    dirty.current = d;
  }, []);

  // "N" opens a new entry from anywhere (unless typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (form || e.metaKey || e.ctrlKey || e.altKey) return;
      if (t.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        openForm({ kind: 'create' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [form, openForm]);

  const onSaved = (entry: TimeEntry, kind: 'created' | 'updated') => {
    dirty.current = false;
    setForm(null);
    setHighlightId(entry.id);
    setTimeout(() => setHighlightId((h) => (h === entry.id ? null : h)), 4000);
    if (view !== 'entries') go('entries');
    toast({
      tone: 'success',
      title: kind === 'created' ? `Time entry #${entry.id} created` : `Time entry #${entry.id} updated`,
      detail: describeEntry(entry),
      action: { label: 'Edit', onClick: () => openForm({ kind: 'edit', entry }) },
    });
  };

  return (
    <div className="app">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <div className="topbar__inner">
          <div className="brand">
            <svg viewBox="0 0 32 32" aria-hidden className="brand__mark">
              <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="3" />
              <path d="M16 9v7l5 3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <span>Time Tracker</span>
          </div>
          <nav className="tabs" aria-label="Sections">
            <a href="#/entries" className="tab" aria-current={view === 'entries' ? 'page' : undefined} onClick={() => setView('entries')}>
              Time entries
            </a>
            <a href="#/clients" className="tab" aria-current={view === 'clients' ? 'page' : undefined} onClick={() => setView('clients')}>
              Clients and projects
            </a>
          </nav>
          <button className="btn btn--primary topbar__new" onClick={() => openForm({ kind: 'create' })} title="New entry (N)">
            New entry
          </button>
        </div>
      </header>

      <RateLimitBanner />

      <main id="main" className="main">
        {view === 'entries' ? (
          <TimeEntriesView
            onEdit={(entry) => openForm({ kind: 'edit', entry })}
            onNew={() => openForm({ kind: 'create' })}
            highlightId={highlightId}
          />
        ) : (
          <HierarchyView onLogTime={(taskId) => openForm({ kind: 'create', taskId })} />
        )}
      </main>

      <ScrollJump />

      <Drawer
        open={!!form}
        title={form?.kind === 'edit' ? `Edit time entry #${form.entry.id}` : 'New time entry'}
        subtitle={
          form?.kind === 'edit' ? `Last changed ${new Date(form.entry.updatedAt).toLocaleString()}` : undefined
        }
        onRequestClose={closeForm}
      >
        {form && (
          <TimeEntryForm key={formKey} mode={form} onSaved={onSaved} onCancel={closeForm} onDirtyChange={onDirtyChange} />
        )}
      </Drawer>
    </div>
  );
}
