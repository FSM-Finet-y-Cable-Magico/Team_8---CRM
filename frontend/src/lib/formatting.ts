import type { WorkOrder } from '../api';

export function formatChileanMobileInput(value: string) {
  const digits = value.replace(/\D/g, '');
  // Deleting the prefix must allow clearing the field rather than restoring it forever.
  if (!digits || (value.trim().startsWith('+') && digits.length < 3)) return '';

  let subscriber = digits;
  if (digits.startsWith('569') && (value.trim().startsWith('+') || digits.length >= 11)) {
    subscriber = digits.slice(3);
  }
  // Accept the national mobile number, including when entered after the automatic prefix.
  if (subscriber.length === 9 && subscriber.startsWith('9')) subscriber = subscriber.slice(1);
  return `+569${subscriber}`;
}

export function formatConnectionType(value?: WorkOrder['tipoConexion']) {
  if (value === 'Fibra Optica') {
    return 'Fibra Óptica';
  }

  if (value === 'Television') {
    return 'Televisión';
  }

  return 'Sin dato';
}

export function normalizeWorkOrderValue(value?: string | null) {
  return (value ?? '')
    .trim()
    .toLocaleLowerCase('es-CL')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function formatWorkOrderValue(value?: string | null) {
  const normalized = normalizeWorkOrderValue(value);
  const knownLabels: Record<string, string> = {
    instalacion: 'Instalación',
    reparacion: 'Reparación',
    mantenimiento: 'Mantenimiento',
    soporte: 'Soporte',
    alta: 'Alta',
    media: 'Media',
    baja: 'Baja',
    critica: 'Crítica',
    urgente: 'Urgente',
    pendiente: 'Pendiente',
    abierto: 'Abierto',
    programada: 'Programada',
    escalado: 'Escalado',
    resuelto: 'Resuelto',
    cerrado: 'Cerrado',
    completada: 'Completada',
    cerrada: 'Cerrada',
    cancelada: 'Cancelada',
    'en progreso': 'En progreso',
  };

  if (!normalized) {
    return 'Sin dato';
  }

  return knownLabels[normalized] ?? normalized
    .split(/\s+/)
    .map((word) => `${word.charAt(0).toLocaleUpperCase('es-CL')}${word.slice(1)}`)
    .join(' ');
}
