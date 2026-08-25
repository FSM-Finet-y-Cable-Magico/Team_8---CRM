export type ExpiryAlertLike = {
  idContrato: number;
  fechaVencimiento: string;
};

export function expiryAlertKey(alert?: ExpiryAlertLike | null) {
  return alert ? `${alert.idContrato}-${alert.fechaVencimiento}` : '';
}

export function expiryUrgency(days: number) {
  if (days < 0) return 'overdue';
  if (days <= 1) return 'critical';
  if (days <= 3) return 'near';
  if (days <= 5) return 'soon';
  return 'scheduled';
}

export function expiryLabel(days: number) {
  if (days < 0) {
    const overdueDays = Math.abs(days);
    return `${overdueDays} día${overdueDays === 1 ? '' : 's'} vencido`;
  }

  if (days === 0) return 'Vence hoy';
  if (days === 1) return 'Vence mañana';
  return `Vence en ${days} días`;
}
