export function StatusBadge({ value }: { value?: string | null }) {
  const normalized = (value ?? 'Sin dato').toLowerCase();
  const tone = normalized.includes('crÃ­tica') || normalized.includes('critica')
    ? 'critical'
    : normalized.includes('cerrad') || normalized.includes('completad') || normalized.includes('resuelt') || normalized.includes('activ')
      ? 'success'
      : normalized.includes('alta') || normalized.includes('urgente') || normalized.includes('escalado') || normalized.includes('perdido') || normalized.includes('cancelad')
        ? 'danger'
        : normalized.includes('media') || normalized.includes('pendiente') || normalized.includes('programada') || normalized.includes('abierto') || normalized.includes('progreso')
          ? 'warning'
          : 'neutral';

  return <span className={`status-badge ${tone}`}>{value ?? 'Sin dato'}</span>;
}
