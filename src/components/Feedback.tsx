import type { ReactNode } from 'react';
import { describeError } from '../api/http';

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <span className="spinner" role="progressbar" aria-label={label} />;
}

export function ErrorNotice({
  error,
  onRetry,
  entryId,
  compact,
}: {
  error: unknown;
  onRetry?: () => void;
  entryId?: number;
  compact?: boolean;
}) {
  const { title, detail } = describeError(error, { entryId });
  return (
    <div className={`notice notice--error${compact ? ' notice--compact' : ''}`} role="alert">
      <div>
        <strong>{title}</strong>
        {detail && <p>{detail}</p>}
      </div>
      {onRetry && (
        <button className="btn btn--sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children && <div>{children}</div>}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  if (status === 'active') return null;
  return <span className="badge">{status}</span>;
}
