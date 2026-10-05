import { ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export function ControlBookActionModal({ title, description, icon, busy, dark, onClose, children }: {
  title: string; description: string; icon: ReactNode; busy: boolean; dark: boolean; onClose: () => void; children: ReactNode;
}) {
  const dialog = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const busyRef = useRef(busy);
  useEffect(() => { busyRef.current = busy; }, [busy]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    titleRef.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation();
        if (!busyRef.current) onClose();
      }
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex="0"]') ?? []).filter(element => !element.matches(':disabled') && element.getClientRects().length > 0);
      const first = controls[0]; const last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); titleRef.current?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement as HTMLElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement as HTMLElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keyboard, true);
    return () => {
      document.removeEventListener('keydown', keyboard, true);
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = rootOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, [onClose]);

  return createPortal(<div className={dark ? 'theme-dark' : undefined}>
    <div className="control-book-workspace control-action-modal">
      <div className="modal-backdrop" role="presentation" onMouseDown={() => { if (!busy) onClose(); }}>
        <section ref={dialog} className="modal-card" role="dialog" aria-modal="true" aria-labelledby="control-action-title" aria-busy={busy} onMouseDown={event => event.stopPropagation()}>
          <header className="modal-header"><div className="control-modal-heading"><span className="control-modal-symbol" aria-hidden="true">{icon}</span><div><span className="control-modal-eyebrow">Gestión comercial</span><h2 id="control-action-title" ref={titleRef} tabIndex={-1}>{title}</h2></div></div><button type="button" className="modal-close-button" aria-label="Cerrar formulario" disabled={busy} onClick={onClose}><X size={20}/></button></header>
          <p className="control-modal-description">{description}</p>
          <div className="modal-content">{children}</div>
        </section>
      </div>
    </div>
  </div>, document.body);
}
