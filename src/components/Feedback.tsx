import type { ReactNode } from 'react';
import { ApiError, describeError } from '../api/http';

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <span className="spinner" role="progressbar" aria-label={label} />;
}

export function ErrorNotice({
  error,
  onRetry,
  entryId,
  compact,
  partial,
}: {
  error: unknown;
  onRetry?: () => void;
  entryId?: number;
  compact?: boolean;
  /** Some of the data did load and is on screen. */
  partial?: boolean;
}) {
  // Stopping a load is the user's choice, not a failure, so it doesn't look like one.
  if (onRetry && error instanceof ApiError && error.kind === 'cancelled') {
    return (
      <div className="load-status" role="status">
        <span>{partial ? 'Showing what loaded before you stopped.' : 'Not loaded.'}</span>
        <button type="button" className="btn btn--sm" onClick={onRetry}>
          {partial ? 'Load the rest' : 'Load'}
        </button>
      </div>
    );
  }

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

/** Sits under a list that is on screen: says if more is coming, or if the list is incomplete. */
export function PartialStatus({
  query,
  label,
  as: Tag = 'div',
}: {
  query: { data: unknown; isFetching: boolean; isError: boolean; error: unknown; refetch: () => unknown };
  label: string;
  as?: 'div' | 'li';
}) {
  if (query.data === undefined || (!query.isFetching && !query.isError)) return null;
  return (
    <Tag className="tree__status">
      {query.isFetching ? (
        <>
          <Spinner /> Loading {label}…
        </>
      ) : (
        <ErrorNotice compact partial error={query.error} onRetry={() => query.refetch()} />
      )}
    </Tag>
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
  if (!status) return null;
  const label = status.replace(/[-_]/g, ' ');
  return <span className={`badge badge--${status.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`}>{label}</span>;
}
