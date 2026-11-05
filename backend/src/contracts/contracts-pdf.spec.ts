import { createHash } from 'crypto';
import fs from 'fs';
import fsPromises from 'fs/promises';
import { Readable } from 'stream';
import { inflateSync } from 'zlib';
import PDFDocument from 'pdfkit';
import { ContractsService } from './contracts.service';

const user = { idUsuario: 5, idEmpresa: 1, email: 'test@example.invalid', nombreCompleto: 'Test', roles: ['Comercial'] };

function setup() {
  const contract = {
    idContrato: 87654321, idCliente: 654321, idEmpresa: 1, idPlan: 7, idZonaPago: null,
    diaVencimiento: 5, estado: 'Activo', direccionInstalacion: 'Calle QA 123',
    cliente: { nombreCompleto: 'María QA', rut: '12345678-5', email: 'qa@example.invalid', telefono: '+56912345678', empresa: { nombre: 'FiNet QA' } },
    prospecto: null, plan: { nombreComercial: 'Fibra QA 600', velocidadMbps: 600 }, zonaPago: { nombreZona: 'Zona QA' },
    servicios: [{
      idServicio: 7654321, tipoServicio: 'Internet', estadoOperativo: 'Activo', direccion: { direccionCompleta: 'Calle QA 123' },
      equipos: [{ numeroSerie: 'LEGACY-SERIAL-NO-PUBLICAR', modelo: 'Equipo local' }],
      datosTecnicos: {
        fechaCompletadaG3: '2026-10-07T12:30:00.000Z', potenciaOpticaDbm: -19.25,
        macAddress: 'AA:BB:CC:DD:EE:FF', puertoOlt: 'PON 1/2', idOtG3: '999888777', idTecnicoG3: 888777,
        resultadoInstalacion: { payload: 'PAYLOAD-NO-PUBLICAR', request_id: 'SECRET-REQUEST-ID' },
      },
    }],
  };
  let latest: any = { version: 3, idContratoDigital: 10, urlDocumento: 'generated/contracts/contrato-87654321-v3.pdf' };
  const digital = {
    findFirst: jest.fn().mockImplementation(async ({ where }) => where.urlDocumento && where.urlDocumento !== latest.urlDocumento ? null : latest),
    create: jest.fn().mockImplementation(async ({ data }) => { latest = { idContratoDigital: 11, ...data }; return latest; }),
  };
  const tx = {
    empresa: { findUnique: jest.fn().mockResolvedValue({ nombre: 'FiNet QA' }) },
    contrato: { findUnique: jest.fn().mockResolvedValue(contract) },
    plan: { findUnique: jest.fn().mockResolvedValue({ precioMensual: '15990' }) },
    planZonaPrecio: { findFirst: jest.fn().mockResolvedValue({ precioMensual: '15990' }) },
    contratoDigital: digital, $queryRaw: jest.fn(),
  };
  const prisma = {
    empresa: { findUnique: jest.fn().mockResolvedValue({ nombre: 'FiNet QA' }) },
    contrato: { findUnique: jest.fn().mockResolvedValue(contract) },
    plan: { findUnique: jest.fn().mockResolvedValue({ precioMensual: '15990' }) }, contratoDigital: digital,
    $transaction: jest.fn().mockImplementation(async (callback) => {
      const previous = latest;
      try { return await callback(tx); } catch (error) { latest = previous; throw error; }
    }),
  };
  const audit = { record: jest.fn() };
  const service = new ContractsService(prisma as never, audit as never, {} as never);
  const render = () => service['renderDigitalContract'](contract as never, 4);
  return { contract, prisma, tx, audit, service, render };
}

function mockFiles() {
  jest.spyOn(fsPromises, 'mkdir').mockResolvedValue(undefined);
  const writes = jest.fn().mockResolvedValue(undefined), closes = jest.fn().mockResolvedValue(undefined);
  const opens = jest.spyOn(fsPromises, 'open').mockResolvedValue({ writeFile: writes, close: closes } as never);
  const removes = jest.spyOn(fsPromises, 'unlink').mockResolvedValue(undefined);
  return { writes, closes, opens, removes };
}

// Extract text from the real PDFKit content streams (WinAnsi standard fonts), not mocked render calls.
function pdfText(buffer: Buffer) {
  const lines: string[] = [];
  for (const match of buffer.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    const content = inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1');
    for (const text of content.matchAll(/\[([^\]]*)\]\s*TJ/g)) {
      lines.push([...text[1].matchAll(/<([\da-f]+)>/gi)].map(hex => Buffer.from(hex[1], 'hex').toString('latin1')).join(''));
    }
  }
  return lines.join('\n');
}

describe('Contenido y conservación de contratos PDF', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([['Cable Magico QA', 'FiNet QA'], ['FiNet QA', 'Cable Magico QA']])(
    'identifica la empresa contractual %s aunque la identidad compartida pertenezca a %s', async (contractCompany, mainCompany) => {
      const ctx = setup(); const files = mockFiles();
      ctx.contract.idEmpresa = contractCompany === 'Cable Magico QA' ? 2 : 1;
      ctx.tx.empresa.findUnique.mockResolvedValue({ nombre: contractCompany });
      ctx.contract.cliente.empresa.nombre = mainCompany;
      await ctx.service.generateDigitalContract(ctx.contract.idContrato, { ...user, idEmpresa: ctx.contract.idEmpresa });
      expect(ctx.tx.empresa.findUnique).toHaveBeenCalledWith({ where: { idEmpresa: ctx.contract.idEmpresa }, select: { nombre: true } });
      expect(ctx.prisma.empresa.findUnique).not.toHaveBeenCalled();
      const content = pdfText(files.writes.mock.calls[0][0] as Buffer);
      expect(content).toContain(`Empresa: ${contractCompany}`);
      expect(content).not.toContain(`Empresa: ${mainCompany}`);
    },
  );

  it('genera un PDF legible con etiquetas españolas sin identificadores ni payloads', async () => {
    const buffer = await setup().render();
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    const content = pdfText(buffer);
    for (const value of ['María QA', 'FiNet QA', 'Fibra QA 600', '600 Mbps', '$15.990', 'Potencia óptica registrada: -19.25 dBm',
      'MAC registrada: AA:BB:CC:DD:EE:FF', 'Puerto OLT registrado: PON 1/2', 'Finalización de instalación (Chile):', '07-10-2026']) {
      expect(content).toContain(value);
    }
    for (const forbidden of ['87654321', '7654321', '654321', '999888777', '888777', 'PAYLOAD', 'SECRET-REQUEST', 'LEGACY-SERIAL', 'resultadoInstalacion', 'idOtG3', 'G1', 'G3', 'G8', '{', '}']) {
      expect(content).not.toContain(forbidden);
    }
  });

  it('omite valores técnicos inválidos y no crea información para contratos sin servicio', async () => {
    const ctx = setup();
    ctx.contract.servicios[0].datosTecnicos = {
      fechaCompletadaG3: '2026-02-30T00:00:00Z', potenciaOpticaDbm: Infinity,
      macAddress: 'invalid-MAC', puertoOlt: 'invalid\nOLT', resultadoInstalacion: { payload: 'no' },
    } as never;
    const invalid = pdfText(await ctx.render());
    expect(invalid).toContain('Sin información técnica validada');
    expect(invalid).not.toMatch(/Infinity|invalid-MAC|invalid\nOLT|30-02-2026/);
    ctx.contract.servicios = [];
    ctx.contract.prospecto = ctx.contract.cliente as never;
    ctx.contract.cliente = null as never;
    const pending = pdfText(await ctx.render());
    expect(pending).toContain('María QA');
    expect(pending).toContain('Dirección de instalación: Calle QA 123');
    expect(pending).toContain('Todavía no registrados');
  });

  it('envuelve texto extenso y pagina sin cortar filas ni desbordar los márgenes', async () => {
    const ctx = setup();
    ctx.contract.servicios = Array.from({ length: 8 }, () => ({
      ...ctx.contract.servicios[0], direccion: { direccionCompleta: 'Dirección extensa '.repeat(12) + 'X'.repeat(70) },
    }));
    const originalText = PDFDocument.prototype.text;
    const bounds: { bottom: number; limit: number }[] = [];
    const placements: { text: string; page: unknown }[] = [];
    jest.spyOn(PDFDocument.prototype, 'text').mockImplementation(function (this: PDFKit.PDFDocument, ...args: any[]) {
      const options = typeof args[1] === 'object' ? args[1] : args[3];
      bounds.push({ bottom: this.y + this.heightOfString(args[0], options), limit: this.page.height - this.page.margins.bottom });
      placements.push({ text: args[0], page: this.page });
      return originalText.apply(this, args as never);
    });
    const buffer = await ctx.render();
    expect((buffer.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(2);
    for (const bound of bounds) expect(bound.bottom).toBeLessThanOrEqual(bound.limit);
    expect(pdfText(buffer)).toContain('Servicio contratado 8');
    const blocks = placements.filter(item => /^Servicio contratado \d|^Información del documento$/.test(item.text));
    for (let index = 0; index < blocks.length; index++) {
      const start = placements.indexOf(blocks[index]);
      const end = index + 1 < blocks.length ? placements.indexOf(blocks[index + 1]) : placements.length;
      expect(placements.slice(start, end).every(item => item.page === blocks[index].page)).toBe(true);
    }
  });

  it('crea nuevas versiones y hashes sin escribir ni regenerar versiones previas', async () => {
    const ctx = setup();
    const { writes, opens, closes } = mockFiles();
    const first = await ctx.service.generateDigitalContract(ctx.contract.idContrato, user);
    const second = await ctx.service.generateDigitalContract(ctx.contract.idContrato, user);
    expect([first.version, second.version]).toEqual([4, 5]);
    expect(opens.mock.calls.map(call => String(call[0]))).toEqual([
      expect.stringMatching(/contrato-87654321-v4-[\da-f-]+\.pdf$/), expect.stringMatching(/contrato-87654321-v5-[\da-f-]+\.pdf$/),
    ]);
    expect(opens.mock.calls.every(call => call[1] === 'wx')).toBe(true);
    expect(closes).toHaveBeenCalledTimes(2);
    expect(first.hashDocumento).toBe(createHash('sha256').update(writes.mock.calls[0][0] as Buffer).digest('hex'));
    expect(pdfText(writes.mock.calls[1][0] as Buffer)).toContain('Versión: 5');
  });

  it.each([null, 7])('usa la transacción para precio y auditoría (zona %s)', async zone => {
    const ctx = setup(); mockFiles(); ctx.contract.idZonaPago = zone as never;
    await ctx.service.generateDigitalContract(ctx.contract.idContrato, user);
    expect(ctx.prisma.plan.findUnique).not.toHaveBeenCalled();
    expect(zone ? ctx.tx.planZonaPrecio.findFirst : ctx.tx.plan.findUnique).toHaveBeenCalled();
    expect(ctx.tx.contrato.findUnique).toHaveBeenCalledTimes(1);
    expect(ctx.audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'GENERAR_CONTRATO_DIGITAL' }), ctx.tx);
  });

  it('rechaza empresa ajena antes de lock, archivo y auditoría', async () => {
    const ctx = setup(); const files = mockFiles();
    await expect(ctx.service.generateDigitalContract(ctx.contract.idContrato, { ...user, idEmpresa: 2 })).rejects.toThrow('empresa');
    expect(ctx.prisma.$transaction).not.toHaveBeenCalled(); expect(files.opens).not.toHaveBeenCalled(); expect(ctx.audit.record).not.toHaveBeenCalled();
  });

  it('cierra y elimina únicamente el archivo parcial propio cuando falla la escritura', async () => {
    const ctx = setup(); const files = mockFiles(); const failure = new Error('disk failure');
    files.writes.mockRejectedValue(failure);
    await expect(ctx.service.generateDigitalContract(ctx.contract.idContrato, user)).rejects.toBe(failure);
    expect(files.closes).toHaveBeenCalledTimes(1); expect(ctx.tx.contratoDigital.create).not.toHaveBeenCalled();
    expect(files.removes).toHaveBeenCalledWith(files.opens.mock.calls[0][0]);
  });

  it.each(['persistence', 'audit'])('limpia el archivo tras rollback de %s sin consumir versión', async target => {
    const ctx = setup(); const files = mockFiles(); const failure = new Error(target);
    if (target === 'persistence') ctx.tx.contratoDigital.create.mockRejectedValueOnce(failure);
    else ctx.audit.record.mockRejectedValueOnce(failure);
    await expect(ctx.service.generateDigitalContract(ctx.contract.idContrato, user)).rejects.toBe(failure);
    expect(files.removes).toHaveBeenCalledWith(files.opens.mock.calls[0][0]);
    const next = await ctx.service.generateDigitalContract(ctx.contract.idContrato, user);
    expect(next.version).toBe(4);expect(files.opens.mock.calls[0][0]).not.toBe(files.opens.mock.calls[1][0]);
  });

  it('no elimina un archivo ajeno si falla su apertura exclusiva', async () => {
    const ctx = setup(); const files = mockFiles(); files.opens.mockRejectedValue(Object.assign(new Error('exists'), { code: 'EEXIST' }));
    await expect(ctx.service.generateDigitalContract(ctx.contract.idContrato, user)).rejects.toThrow('exists');
    expect(files.removes).not.toHaveBeenCalled();
  });

  it('conserva el PDF si la confirmación del commit falla pero existe su registro', async () => {
    const ctx = setup(); const files = mockFiles(); const failure = new Error('commit acknowledgement lost');
    ctx.prisma.$transaction.mockImplementation(async callback => { await callback(ctx.tx); throw failure; });
    await expect(ctx.service.generateDigitalContract(ctx.contract.idContrato, user)).rejects.toBe(failure);
    expect(files.removes).not.toHaveBeenCalled();
    expect(ctx.prisma.contratoDigital.findFirst).toHaveBeenLastCalledWith({where:{urlDocumento:expect.any(String)},select:{idContratoDigital:true}});
  });

  it('no interpreta una lectura sin fila como rollback cuando el commit sigue incierto', async () => {
    const ctx = setup(); const files = mockFiles(); const failure = new Error('commit result unknown');
    ctx.prisma.$transaction.mockImplementation(async callback => { await callback(ctx.tx); throw failure; });
    ctx.prisma.contratoDigital.findFirst.mockResolvedValue(null);
    await expect(ctx.service.generateDigitalContract(ctx.contract.idContrato, user)).rejects.toBe(failure);
    expect(files.removes).not.toHaveBeenCalled();
  });

  it('descarga los bytes existentes de una versión histórica sin volver a renderizar', async () => {
    const ctx = setup();
    const original = Buffer.from('%PDF-historical-unchanged');
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'createReadStream').mockReturnValue(Readable.from([original]) as never);
    const render = jest.spyOn(ctx.service as any, 'renderDigitalContract');
    const file = await ctx.service.downloadDigitalContract(ctx.contract.idContrato, user, { setHeader: jest.fn() } as never, 3);
    const chunks: Buffer[] = [];
    for await (const chunk of file.getStream()) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks)).toEqual(original);
    expect(ctx.prisma.contratoDigital.findFirst).toHaveBeenCalledWith({ where: { idContrato: ctx.contract.idContrato, version: 3 }, orderBy: { version: 'desc' } });
    expect(render).not.toHaveBeenCalled();
    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
  });
});
