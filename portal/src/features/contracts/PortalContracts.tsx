import { PortalContract } from '../../api';

function formatDate(value?: string | null) {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleDateString('es-CL');
}

function formatMoney(value?: string | number | null) {
  if (value === null || value === undefined) {
    return '-';
  }

  return Number(value).toLocaleString('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  });
}

export function PortalContracts({ contracts }: { contracts: PortalContract[] }) {
  return (
    <article className="portal-panel portal-stack">
      <div>
        <span className="portal-eyebrow">Mis contratos</span>
        <h2>Plan contratado</h2>
      </div>

      {!contracts.length && <p className="portal-muted">No hay contratos visibles para este cliente.</p>}

      {contracts.map((contract) => {
        const latestInvoice = contract.facturas?.[0];

        return (
          <section className="portal-list-item" key={contract.idContrato}>
            <div className="portal-item-heading">
              <strong>Contrato {contract.idContrato}</strong>
              <span className="portal-chip">{contract.estado}</span>
            </div>
            <span>Plan: {contract.plan?.nombreComercial ?? 'Sin plan asociado'}</span>
            <span>Tipo: {contract.plan?.tipoPlan ?? '-'}</span>
            <span>Inicio: {formatDate(contract.fechaInicio)}</span>
            <span>Día de vencimiento: {contract.diaVencimiento ?? '-'}</span>
            <span>Servicios asociados: {contract.servicios?.length ?? 0}</span>

            {latestInvoice && (
              <div className="portal-soft-box">
                <strong>Última factura visible</strong>
                <span>
                  {latestInvoice.periodoMes}/{latestInvoice.periodoAnio} · {latestInvoice.estado} · {formatMoney(latestInvoice.monto)}
                </span>
                <span>Vence: {formatDate(latestInvoice.fechaLimitePago)}</span>
              </div>
            )}
          </section>
        );
      })}
    </article>
  );
}
