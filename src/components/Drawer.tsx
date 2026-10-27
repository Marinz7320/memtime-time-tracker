import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  title: string;
  subtitle?: ReactNode;
  /** Called on Escape, backdrop click or the close button; the parent decides whether to close. */
  onRequestClose: () => void;
  children: ReactNode;
}

/**
 * Side sheet built on the native <dialog> element: focus is trapped, Escape works,
 * and the page behind becomes inert without extra libraries.
 */
export function Drawer({ open, title, subtitle, onRequestClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close?.();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="drawer"
      aria-labelledby="drawer-title"
      onCancel={(e) => {
        e.preventDefault();
        onRequestClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onRequestClose();
      }}
    >
      {open && (
        <div className="drawer__panel">
          <header className="drawer__header">
            <div>
              <h2 id="drawer-title">{title}</h2>
              {subtitle && <div className="drawer__subtitle">{subtitle}</div>}
            </div>
            <button className="icon-btn" onClick={onRequestClose} aria-label="Close">
              ×
            </button>
          </header>
          <div className="drawer__body">{children}</div>
        </div>
      )}
    </dialog>
  );
}
