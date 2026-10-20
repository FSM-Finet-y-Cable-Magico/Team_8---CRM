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
    findFirst: jest.fn().mockImplementation(async () => latest),
    create: jest.fn().mockImplementation(async ({ data }) => { latest = { idContratoDigital: 11, ...data }; return latest; }),
  };
  const prisma = {
    contrato: { findUnique: jest.fn().mockResolvedValue(contract) },
    plan: { findUnique: jest.fn().mockResolvedValue({ precioMensual: '15990' }) }, contratoDigital: digital,
    $transaction: jest.fn().mockImplementation(async (callback) => callback({ contratoDigital: digital, $queryRaw: jest.fn() })),
  };
  const service = new ContractsService(prisma as never, { record: jest.fn() } as never, {} as never);
  const render = () => service['renderDigitalContract'](contract as never, 4);
  return { contract, prisma, service, render };
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
    jest.spyOn(fsPromises, 'mkdir').mockResolvedValue(undefined);
    const writes = jest.spyOn(fsPromises, 'writeFile').mockResolvedValue();
    const first = await ctx.service.generateDigitalContract(ctx.contract.idContrato, user);
    const second = await ctx.service.generateDigitalContract(ctx.contract.idContrato, user);
    expect([first.version, second.version]).toEqual([4, 5]);
    expect(writes.mock.calls.map(call => String(call[0]))).toEqual([
      expect.stringContaining('contrato-87654321-v4.pdf'), expect.stringContaining('contrato-87654321-v5.pdf'),
    ]);
    expect(first.hashDocumento).toBe(createHash('sha256').update(writes.mock.calls[0][1] as Buffer).digest('hex'));
    expect(pdfText(writes.mock.calls[1][1] as Buffer)).toContain('Versión: 5');
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
