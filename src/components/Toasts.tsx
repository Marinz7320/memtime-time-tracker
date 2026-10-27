import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastInput {
  tone: ToastTone;
  title: string;
  detail?: ReactNode;
  action?: { label: string; onClick: () => void };
}

interface Toast extends ToastInput {
  id: number;
}

const ToastContext = createContext<(t: ToastInput) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (t: ToastInput) => {
      const id = nextId.current++;
      setToasts((ts) => [...ts.slice(-3), { ...t, id }]);
      // Errors stay until dismissed; confirmations fade on their own.
      if (t.tone !== 'error') setTimeout(() => dismiss(id), 7000);
    },
    [dismiss],
  );

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="region" aria-label="Notifications" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.tone}`} role={t.tone === 'error' ? 'alert' : 'status'}>
            <div className="toast__body">
              <strong>{t.title}</strong>
              {t.detail && <div className="toast__detail">{t.detail}</div>}
            </div>
            <div className="toast__actions">
              {t.action && (
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    t.action!.onClick();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <button className="icon-btn" aria-label="Dismiss notification" onClick={() => dismiss(t.id)}>
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
