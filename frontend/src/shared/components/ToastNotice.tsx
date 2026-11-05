import { CheckCircle2, X } from 'lucide-react';
import './toast-notice.css';

export function ToastNotice({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  if (!message) return null;
  return <div className="toast-notice" role="status" aria-live="polite">
    <CheckCircle2 size={21} aria-hidden="true" />
    <span>{message}</span>
    <button type="button" onClick={onDismiss} aria-label="Cerrar aviso"><X size={16} aria-hidden="true" /></button>
  </div>;
}
