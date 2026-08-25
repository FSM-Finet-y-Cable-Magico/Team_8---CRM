import { TvipCredentialSummary } from '../../api';

export function PortalTvip({
  credentials,
  temporaryPassword,
  onRegenerate,
}: {
  credentials: TvipCredentialSummary[];
  temporaryPassword: { idContrato: number; password: string } | null;
  onRegenerate: (idContrato: number) => void;
}) {
  return (
    <article className="portal-panel portal-stack">
      <div>
        <span className="portal-eyebrow">TV IP</span>
        <h2>Credenciales TV IP</h2>
      </div>
      {!credentials.length && <p className="portal-muted">Tu plan actual no incluye TV IP.</p>}
      {credentials.map((credential) => (
        <section className="portal-list-item" key={credential.idContrato}>
          <strong>{credential.plan?.nombreComercial ?? `Contrato ${credential.idContrato}`}</strong>
          <span>Usuario: {credential.credencial?.usuarioTvip ?? 'Sin generar'}</span>
          <button type="button" className="portal-secondary-button" onClick={() => onRegenerate(credential.idContrato)}>
            {credential.credencial ? 'Regenerar credencial' : 'Generar credencial'}
          </button>
          {temporaryPassword?.idContrato === credential.idContrato && (
            <p className="portal-status">
              Password temporal: <strong>{temporaryPassword.password}</strong>. Guardar ahora; no se volverá a mostrar.
            </p>
          )}
        </section>
      ))}
    </article>
  );
}
