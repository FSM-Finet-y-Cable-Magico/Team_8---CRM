import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { independentRepairAcknowledgement, installationClosure, installationClosureFromReconciliation } from './g3-closure-contract';
import { G3ClosureDto } from './g3-integration.dto';
import { sha256Payload } from './g3-integration.utils';
import { g3InstallationClosure, g3RepairClosure, g3WithdrawalClosure } from './__fixtures__/g3-closure-8a8e5dd0';

// Characterization of the shared G3 closure contract (G3 main @ 8a8e5dd0).
describe('contrato de cierre G3 compartido (INSTALACION / REPARACION)', () => {
  it('la REPARACION real recibe solo un acuse sin procesamiento', () => {
    expect(independentRepairAcknowledgement(g3RepairClosure() as unknown as G3ClosureDto)).toEqual({
      received: true, processed: false, activated: false, code: 'G3_REPAIR_OUT_OF_INSTALLATION_SCOPE',
      tipo_ot: 'REPARACION', id_ot: 912, id_empresa: 1,
    });
  });

  it('webhook y reconciliacion (GET cierre) del mismo payload real producen la misma huella', () => {
    const body = g3InstallationClosure();
    const fromWebhook = installationClosure(body);
    const fromReconciliation = installationClosureFromReconciliation({ ...body, estado: 'COMPLETADA' });
    expect(sha256Payload(fromReconciliation)).toBe(sha256Payload(fromWebhook));
  });

  it('los campos compartidos vacios no alteran la huella de un cierre historico', () => {
    const { equipos_faltantes, falla_reportada, solucion_aplicada, resultado, id_cliente_externo, id_servicio,
      id_solicitud_retiro, id_ticket_externo, ...legacy } = g3InstallationClosure();
    void [equipos_faltantes, falla_reportada, solucion_aplicada, resultado, id_cliente_externo, id_servicio, id_solicitud_retiro, id_ticket_externo];
    expect(sha256Payload(installationClosure(g3InstallationClosure()))).toBe(sha256Payload(installationClosure(legacy)));
  });

  it.each([
    ['instalacion con referencias de baja', () => installationClosure({ ...g3InstallationClosure(), id_solicitud_retiro: 15 })],
    ['instalacion con datos de reparacion', () => installationClosure({ ...g3InstallationClosure(), solucion_aplicada: 'X' })],
    ['reparacion con referencias de baja', () => independentRepairAcknowledgement({ ...g3RepairClosure(), id_servicio: 61 } as unknown as G3ClosureDto)],
    ['baja enviada al flujo de instalacion', () => installationClosure(g3WithdrawalClosure())],
  ])('rechaza %s', (_name, run) => {
    expect(run).toThrow(BadRequestException);
  });
});
