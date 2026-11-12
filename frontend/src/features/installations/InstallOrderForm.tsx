import { type Prospect } from '../../api';
import { G3InstallationStatus } from './G3InstallationStatus';

export function InstallOrderForm({ prospect, contractId, canRequest, onChanged }: { prospect: Prospect; contractId: number | null; canRequest: boolean; onChanged: () => void }) {
  const contract = prospect.contratos?.find(item => item.idContrato === contractId);
  if (!contract) return <p role="alert">No existe un contrato asociado a esta instalación.</p>;
  const eligible = ['Firmado', 'Activo'].includes(contract.estado ?? '');
  const blockedReason = !canRequest ? 'No tienes permisos para solicitar instalaciones.'
    : !eligible ? `El estado del contrato (${contract.estado ?? 'sin estado'}) no permite solicitar la instalación.` : undefined;
  return <div className="install-order-form">
    <h3>Instalación técnica</h3>
    <G3InstallationStatus key={contract.idContrato} compact contractId={contract.idContrato} canRequest={canRequest && eligible} blockedReason={blockedReason} onChanged={onChanged} />
  </div>;
}
