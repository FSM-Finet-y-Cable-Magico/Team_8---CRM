import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react';
import './toast-notice.css';

export function ToastNotice({ message, onDismiss, tone = 'success' }: { message: string; onDismiss: () => void; tone?: 'success' | 'info' | 'error' }) {
  if (!message) return null;
  const Icon = tone === 'error' ? CircleAlert : tone === 'info' ? Info : CheckCircle2;
  return <div className={tone === 'error' ? 'toast-notice toast-notice-error' : 'toast-notice'} role="status" aria-live="polite">
    <Icon size={21} aria-hidden="true" />
    <span>{message}</span>
    <button type="button" onClick={onDismiss} aria-label="Cerrar aviso"><X size={16} aria-hidden="true" /></button>
  </div>;
}
