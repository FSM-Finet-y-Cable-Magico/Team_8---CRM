import { type Prospect } from '../../api';
import { G3InstallationStatus } from './G3InstallationStatus';

export function InstallOrderForm({ prospect, canRequest, onChanged }: { prospect: Prospect; canRequest: boolean; onChanged: () => void }) {
  const hasSignedContract = Boolean(
    prospect.contratos?.some((contract) => ['Firmado', 'Activo'].includes(contract.estado ?? '')),
  );
  return <div className="install-order-form">
    <h3>Instalación técnica</h3>
    <G3InstallationStatus compact prospectId={prospect.idProspecto} canRequest={canRequest && hasSignedContract} onChanged={onChanged} />
  </div>;
}
