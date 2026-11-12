import { type ReactNode, useId, useLayoutEffect, useRef } from 'react';
import { X } from 'lucide-react';

export function ControlBookModal({ title, open = true, busy = false, record = false, headerDetails, navigation, onClose, children }: {
  title: string; open?: boolean; busy?: boolean; record?: boolean; headerDetails?: ReactNode; navigation?: ReactNode;
  onClose: () => void; children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const startedOnBackdrop = useRef(false);

  useLayoutEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    element.showModal();
    return () => { element.close(); };
  }, [open]);

  if (!open) return null;

  return <dialog ref={dialog} className={`modal-card control-book-modal ${record ? 'control-record-modal' : 'control-action-modal'}`} aria-labelledby={titleId} aria-busy={busy}
    onCancel={event => {
      if (event.target !== event.currentTarget) return;
      event.preventDefault();
      if (!busy) onClose();
    }}
    onPointerDown={event => { startedOnBackdrop.current = event.target === event.currentTarget; }}
    onClick={event => {
      if (startedOnBackdrop.current && event.target === event.currentTarget && !busy) onClose();
      startedOnBackdrop.current = false;
    }}>
    <header className="control-book-modal-header">
      <div className="control-book-modal-heading">
        <div><h2 id={titleId}>{title}</h2>{headerDetails}</div>
        <button type="button" className="modal-close-button" aria-label={record ? 'Cerrar ficha del cliente' : 'Cerrar modal'} disabled={busy} onClick={onClose}><X size={20} aria-hidden="true"/></button>
      </div>
      {navigation}
    </header>
    <div className="control-book-modal-content">{children}</div>
  </dialog>;
}
