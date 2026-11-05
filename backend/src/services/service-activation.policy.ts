export type ServiceActivationIntent =
  | 'INSTALLATION_COMPLETION'
  | 'MANUAL_SERVICE_CHANGE'
  | 'HISTORICAL_IMPORT'
  | 'COMMERCIAL_PAYMENT_REACTIVATION'
  | 'REPAIR_COMPLETION';

type ServiceActivationContext = {
  intent: ServiceActivationIntent;
  targetStatus: string;
  currentStatus?: string | null;
  contractStatus?: string | null;
  installationCompleted?: boolean;
  historicalImport?: boolean;
  serviceExists?: boolean;
};

function normalizeStatus(value?: string | null) {
  return (value ?? '')
    .trim()
    .toLocaleLowerCase('es-CL')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/_/g, ' ');
}

/**
 * Centraliza las únicas razones aceptadas para llevar un servicio a Activo.
 * Cada excepción al flujo nuevo exige una intención de negocio explícita.
 */
export function canActivateService(context: ServiceActivationContext) {
  if (normalizeStatus(context.targetStatus) !== 'activo') {
    return true;
  }

  switch (context.intent) {
    case 'INSTALLATION_COMPLETION':
      return context.installationCompleted === true;
    case 'MANUAL_SERVICE_CHANGE':
      return context.installationCompleted === true;
    case 'HISTORICAL_IMPORT':
      return context.historicalImport === true;
    case 'COMMERCIAL_PAYMENT_REACTIVATION':
      return context.serviceExists === true
        && normalizeStatus(context.currentStatus) === 'suspendido'
        && normalizeStatus(context.contractStatus) === 'suspendido'
        && (context.installationCompleted === true || context.historicalImport === true);
    case 'REPAIR_COMPLETION':
      return context.serviceExists === true;
    default:
      return false;
  }
}
