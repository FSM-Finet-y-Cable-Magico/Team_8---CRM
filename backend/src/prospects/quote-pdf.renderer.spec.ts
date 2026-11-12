import { PDFDocument } from 'pdf-lib';
import { renderQuotePdfBuffer, resolveQuoteBrand } from './quote-pdf.renderer';

describe('plantillas PDF de cotización por empresa', () => {
  it.each([
    ['FiNet Limitada', 'finet.png'],
    ['Cable Mágico Litoral', 'cable-magico.png'],
  ])('elige la identidad de %s', (companyName, expectedLogo) => {
    expect(resolveQuoteBrand(companyName).logo).toContain(expectedLogo);
  });

  it('mantiene una marca neutral para empresas sin plantilla configurada', () => {
    expect(resolveQuoteBrand('Empresa nueva')).toEqual({});
  });

  it('genera un PDF de una página con el código y datos de la cotización', async () => {
    const buffer = await renderQuotePdfBuffer({
      codigo: 'COT-2026-QA-001',
      fechaEnvio: new Date('2026-11-11T15:30:00.000Z'),
      prospecto: {
        nombreCompleto: 'Catalina Rojas Fuentes', rut: '12.345.678-5',
        email: 'catalina@example.invalid', telefono: '+56912345678',
        direccion: 'Los Arrayanes 245', comuna: 'La Florida', region: 'Metropolitana',
        empresa: { nombre: 'FiNet Limitada', rutEmpresa: '76.543.210-3' },
        usuarioComercial: { nombreCompleto: 'Ejecutivo Comercial' },
      },
      plan: {
        nombreComercial: 'Fibra Hogar 600', tipoPlan: 'Internet', tipoCliente: 'Residencial',
        descripcion: 'Internet por fibra óptica · 600 Mbps', velocidadMbps: 600,
        precioMensual: { toString: () => '34990' },
      },
    });

    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    const pdf = await PDFDocument.load(buffer);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toContain('COT-2026-QA-001');
    expect(buffer.toString('latin1')).toContain('/Subtype /Image');
  });
});
