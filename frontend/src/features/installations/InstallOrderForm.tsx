import { type Prospect } from '../../api';
import { G3InstallationStatus } from './G3InstallationStatus';
import { prospectStageLabel } from '../prospects/prospect-coverage';

export function InstallOrderForm({ prospect, onChanged }: { prospect: Prospect; onChanged: () => void }) {
  const hasSignedContract = Boolean(
    prospect.contratos?.some((contract) => ['Firmado', 'Activo'].includes(contract.estado ?? '')),
  );
  return <div className="install-order-form">
    <h3>Instalación técnica</h3>
    <p className="detail-line">Prospecto: {prospect.nombreCompleto} · Estado comercial: {prospectStageLabel(prospect)}</p>
    <G3InstallationStatus prospectId={prospect.idProspecto} canRequest={hasSignedContract} onChanged={onChanged} />
  </div>;
}
