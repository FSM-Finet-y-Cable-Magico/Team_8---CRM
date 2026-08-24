export function workOrderCodePrefix(tipoOt?: string | null) {
  const normalized = (tipoOt ?? '')
    .trim()
    .toLocaleLowerCase('es-CL')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (normalized.includes('instalacion')) {
    return 'INS';
  }

  if (normalized.includes('reparacion')) {
    return 'REP';
  }

  if (normalized.includes('soporte')) {
    return 'SOP';
  }

  return 'OTR';
}

export function generateWorkOrderCode(tipoOt: string, idOt: number) {
  return `OT-${workOrderCodePrefix(tipoOt)}-${String(idOt).padStart(6, '0')}`;
}
