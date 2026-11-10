import { buildContractSnapshot, canonicalSnapshot } from './contract-snapshot';
function fixture() {
  const contract = { idContrato: 1, idEmpresa: 2, idPlan: 3, idZonaPago: null, diaVencimiento: 10,
    direccionInstalacion: 'Dirección ficticia', estado: 'Pendiente firma contrato',
    cliente: null, prospecto: { nombreCompleto: 'Persona QA', rut: '11111111-1', email: 'qa@example.invalid', telefono: null },
    plan: { nombreComercial: 'Plan QA', velocidadMbps: 300 }, zonaPago: null, servicios: [] as any[] };
  const tx = { contrato: { findUnique: jest.fn().mockResolvedValue(contract) },
    empresa: { findUnique: jest.fn().mockResolvedValue({ nombre: 'Empresa contractual QA' }) },
    plan: { findUnique: jest.fn().mockResolvedValue({ precioMensual: '19990' }) }, planZonaPrecio: { findFirst: jest.fn() } };
  return { contract, tx, snapshot: () => buildContractSnapshot(tx as never, 1, true) };
}
describe('Puerta de lectura y snapshot de contrato', () => {
  it('usa la empresa contractual y la identidad prospecto de G2 sin transportar datos privados', async () => {
    const f = fixture(); const result = await f.snapshot();
    expect(result).toMatchObject({ idEmpresa: 2, cliente: { nombre: 'Persona QA' }, comercial: { empresa: 'Empresa contractual QA', precio: 19990 } });
    expect(f.tx.empresa.findUnique).toHaveBeenCalledWith({ where: { idEmpresa: 2 }, select: { nombre: true } });
    expect(Object.keys(result)).toEqual(['schema','idEmpresa','idContrato','cliente','comercial','direccion','servicios']);
  });
  it.each(['nombreCompleto', 'rut', 'email'])('rechaza %s ausente antes de enviar a firma', async field => {
    const f = fixture(); (f.contract.prospecto as any)[field] = null;
    await expect(f.snapshot()).rejects.toThrow('Contrato incompleto');
  });
  it('no exige inventario ni datos de instalación cuando aún no hay servicios', async () => {
    expect((await fixture().snapshot()).servicios).toEqual([]);
  });
  it('conserva solo datos técnicos visibles y omite identificadores de G3 y equipos G1', async () => {
    const f = fixture(); f.contract.servicios = [{ tipoServicio: 'Internet', estadoOperativo: 'Pendiente',
      direccion: { direccionCompleta: 'Dirección ficticia' }, equipos: [{ numeroSerie: 'PRIVATE_SERIAL' }],
      datosTecnicos: { fechaCompletadaG3: '2026-11-09T12:00:00Z', macAddress: 'AA:BB:CC:DD:EE:FF',
        idOtG3: 'PRIVATE_OT', payload: 'PRIVATE_PAYLOAD' } }];
    const result = await f.snapshot();
    expect(JSON.stringify(result)).toContain('AA:BB:CC:DD:EE:FF');
    expect(JSON.stringify(result)).not.toContain('PRIVATE_');
  });
  it('rechaza datos técnicos mal formados para la firma y conserva tolerancia de PDF histórico', async () => {
    const f = fixture(); f.contract.servicios = [{ tipoServicio: 'Internet', estadoOperativo: 'Pendiente',
      direccion: { direccionCompleta: 'Dirección ficticia' }, datosTecnicos: { fechaCompletadaG3: 'no-es-fecha' } }];
    await expect(f.snapshot()).rejects.toThrow('Datos técnicos');
    await expect(buildContractSnapshot(f.tx as never, 1)).resolves.toBeDefined();
  });
  it('JSONB puede reordenar claves sin invalidar la solicitud; un cambio de valor sí cambia la huella', () => {
    expect(canonicalSnapshot({ b: 2, a: [{ y: 2, x: 1 }] })).toBe(canonicalSnapshot({ a: [{ x: 1, y: 2 }], b: 2 }));
    expect(canonicalSnapshot({ a: 1 })).not.toBe(canonicalSnapshot({ a: 2 }));
    expect(canonicalSnapshot([1,2])).not.toBe(canonicalSnapshot([2,1]));
  });
});
