import type { WorkOrder } from '../api';

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
