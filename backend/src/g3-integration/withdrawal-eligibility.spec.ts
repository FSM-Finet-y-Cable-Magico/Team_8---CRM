import { DebtInvoice, WithdrawalFacts, evaluateWithdrawalEligibility, hasOverdueCollectibleDebt, overdueDebtSummary } from './withdrawal-eligibility';

const overdue = (extra: Partial<DebtInvoice> = {}): DebtInvoice => ({
  monto: 20000, estado: 'Vencida', fechaLimitePago: new Date('2020-01-10'), pagos: [], prorrogasPago: [], conveniosPago: [], ...extra,
});

function facts(over: Partial<WithdrawalFacts> = {}, invoices: DebtInvoice[] = [overdue()]): WithdrawalFacts {
  return {
    service: { idServicio: 50, idCliente: 30, idEmpresa: 1, idContrato: 20, estadoOperativo: 'Suspendido', contrato: { idContrato: 20, idCliente: 30, idEmpresa: 1 } },
    companyAllowed: true, activeRequest: null, debt: overdueDebtSummary(invoices), notice: { idEvento: 7 },
    rut: '12345678-5', address: { direccion: 'Calle QA 123', comuna: 'Ñuñoa' }, ...over,
  };
}

describe('Elegibilidad de baja por morosidad: reglas puras', () => {
  it('servicio suspendido con deuda vencida, contrato coherente y aviso previo es elegible', () => {
    const result = evaluateWithdrawalEligibility(facts());
    expect(result.eligible).toBe(true);
    expect(result.firstFailure).toBeNull();
    expect(result.checks.map(item => item.code)).toEqual(['SERVICIO', 'EMPRESA', 'SIN_BAJA_PREVIA', 'SIN_SOLICITUD_ACTIVA', 'SERVICIO_SUSPENDIDO', 'CONTRATO', 'DEUDA_VENCIDA', 'AVISO_PREVIO', 'RUT_CLIENTE', 'DIRECCION_RETIRO']);
  });

  it.each([
    ['servicio activo, no suspendido', { service: { ...facts().service!, estadoOperativo: 'Activo' } }, 'SERVICIO_SUSPENDIDO'],
    ['servicio ya de baja', { service: { ...facts().service!, estadoOperativo: 'Baja' } }, 'SIN_BAJA_PREVIA'],
    ['sin aviso previo', { notice: null }, 'AVISO_PREVIO'],
    ['solicitud activa duplicada', { activeRequest: { idSolicitudRetiro: 9, estado: 'REGISTRADA' } }, 'SIN_SOLICITUD_ACTIVA'],
    ['empresa ajena', { companyAllowed: false }, 'EMPRESA'],
    ['contrato de otro cliente', { service: { ...facts().service!, contrato: { idContrato: 20, idCliente: 999, idEmpresa: 1 } } }, 'CONTRATO'],
    ['contrato de otra empresa', { service: { ...facts().service!, contrato: { idContrato: 20, idCliente: 30, idEmpresa: 2 } } }, 'CONTRATO'],
    ['servicio sin contrato', { service: { ...facts().service!, idContrato: null, contrato: null } }, 'CONTRATO'],
    ['RUT con digito verificador invalido', { rut: '12345678-9' }, 'RUT_CLIENTE'],
    ['cliente sin RUT', { rut: null }, 'RUT_CLIENTE'],
    ['servicio sin comuna (G3 rechazaria la OT)', { address: { direccion: 'Calle QA 123', comuna: ' ' } }, 'DIRECCION_RETIRO'],
    ['servicio sin direccion', { address: null }, 'DIRECCION_RETIRO'],
  ] as const)('%s no es elegible y el primer fallo es %s', (_name, over, code) => {
    const result = evaluateWithdrawalEligibility(facts(over as Partial<WithdrawalFacts>));
    expect(result.eligible).toBe(false);
    expect(result.firstFailure?.code).toBe(code);
    expect(result.firstFailure?.message).not.toBe('');
  });

  it('un servicio inexistente o sin empresa devuelve un único fallo y no evalúa lo demás', () => {
    const result = evaluateWithdrawalEligibility(facts({ service: null }));
    expect(result.checks).toHaveLength(1);
    expect(result.firstFailure?.code).toBe('SERVICIO');
  });

  it('sin documentos vencidos no hay deuda exigible vencida', () => {
    const result = evaluateWithdrawalEligibility(facts({}, []));
    expect(result.firstFailure?.code).toBe('DEUDA_VENCIDA');
    expect(result.firstFailure?.message).toContain('deuda exigible vencida');
  });

  it('una prórroga aprobada vigente desplaza el vencimiento y la deuda deja de ser vencida', () => {
    const extension = overdue({ prorrogasPago: [{ nuevaFecha: new Date('2999-01-01'), estado: 'APROBADA' }] });
    expect(hasOverdueCollectibleDebt([extension])).toBe(false);
    expect(evaluateWithdrawalEligibility(facts({}, [extension])).firstFailure?.code).toBe('DEUDA_VENCIDA');
  });

  it('una prórroga vencida no protege al cliente', () => {
    const extension = overdue({ prorrogasPago: [{ nuevaFecha: new Date('2020-02-01'), estado: 'APROBADA' }] });
    expect(hasOverdueCollectibleDebt([extension])).toBe(true);
  });

  it('un convenio activo que cubre toda la deuda vencida bloquea con un mensaje propio', () => {
    for (const estado of ['APROBADO', 'ACTIVO']) {
      const covered = overdue({ conveniosPago: [{ estado }] });
      const result = evaluateWithdrawalEligibility(facts({}, [covered]));
      expect(result.firstFailure?.code).toBe('DEUDA_VENCIDA');
      expect(result.firstFailure?.message).toContain('convenio de pago activo');
    }
  });

  it('un convenio pendiente o rechazado no cambia la exigibilidad', () => {
    for (const estado of ['PENDIENTE', 'RECHAZADO', 'INCUMPLIDO', 'CANCELADO']) {
      expect(hasOverdueCollectibleDebt([overdue({ conveniosPago: [{ estado }] })])).toBe(true);
    }
  });

  it('el convenio de una factura no cubre otra factura vencida sin convenio', () => {
    const summary = overdueDebtSummary([overdue({ conveniosPago: [{ estado: 'ACTIVO' }] }), overdue({ monto: 10000 })]);
    expect(summary).toMatchObject({ overdueCount: 2, uncoveredCount: 1, coveredByAgreementCount: 1, totalExigible: 10000 });
    expect(evaluateWithdrawalEligibility(facts({}, [overdue({ conveniosPago: [{ estado: 'ACTIVO' }] }), overdue({ monto: 10000 })])).eligible).toBe(true);
  });

  it('facturas pagadas, anuladas, parciales ya saldadas o sin monto no son deuda vencida', () => {
    const paid = overdue({ estado: 'Pagada', pagos: [{ monto: 20000 }] });
    const cancelled = overdue({ estado: 'Anulada' });
    const settled = overdue({ pagos: [{ monto: 12000 }, { monto: 8000 }] });
    const unknownAmount = overdue({ monto: null });
    expect(hasOverdueCollectibleDebt([paid, cancelled, settled, unknownAmount])).toBe(false);
  });

  it('un pago parcial deja solo el saldo pendiente como deuda exigible', () => {
    const summary = overdueDebtSummary([overdue({ pagos: [{ monto: 5000 }] })]);
    expect(summary.totalExigible).toBe(15000);
    expect(summary.maxDiasAtraso).toBeGreaterThan(0);
  });

  it('cliente con varios servicios: la evaluación depende solo del servicio consultado', () => {
    const suspended = evaluateWithdrawalEligibility(facts());
    const other = evaluateWithdrawalEligibility(facts({ service: { ...facts().service!, idServicio: 51, estadoOperativo: 'Activo' } }));
    expect(suspended.eligible).toBe(true);
    expect(other.eligible).toBe(false);
    expect(other.firstFailure?.code).toBe('SERVICIO_SUSPENDIDO');
  });
});
