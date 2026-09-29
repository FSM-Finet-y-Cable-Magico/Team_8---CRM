import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateExternalTaxDocumentDto, ExternalTaxDocumentQueryDto } from './external-tax-documents.dto';

const valid = {
  idEmpresa: 1,
  tipoDocumento: 'BOLETA',
  folioONumero: 'B-1',
  emisorProveedor: 'Proveedor',
  fechaEmision: '2026-09-27',
  montoTotal: 1000,
};

async function errors(type: new () => object, value: object) {
  return validate(plainToInstance(type, value));
}

describe('Etapa 5 - DTO de documentos tributarios', () => {
  it.each(['BOLETA', 'FACTURA'])('acepta tipo mínimo ratificado %s', async (tipoDocumento) => {
    await expect(errors(CreateExternalTaxDocumentDto, { ...valid, tipoDocumento })).resolves.toHaveLength(0);
  });

  it.each(['OTRO', 'NOTA_CREDITO', 'ACEPTADO_SII'])('rechaza catálogo no ratificado %s', async (tipoDocumento) => {
    expect(await errors(CreateExternalTaxDocumentDto, { ...valid, tipoDocumento })).not.toHaveLength(0);
  });

  it('exige folio', async () => {
    expect(await errors(CreateExternalTaxDocumentDto, { ...valid, folioONumero: undefined })).not.toHaveLength(0);
  });

  it('exige emisor/proveedor', async () => {
    expect(await errors(CreateExternalTaxDocumentDto, { ...valid, emisorProveedor: undefined })).not.toHaveLength(0);
  });

  it('exige monto total', async () => {
    expect(await errors(CreateExternalTaxDocumentDto, { ...valid, montoTotal: undefined })).not.toHaveLength(0);
  });

  it('rechaza monto negativo', async () => {
    expect(await errors(CreateExternalTaxDocumentDto, { ...valid, montoTotal: -0.01 })).not.toHaveLength(0);
  });

  it('rechaza más de dos decimales', async () => {
    expect(await errors(CreateExternalTaxDocumentDto, { ...valid, montoTotal: 1.001 })).not.toHaveLength(0);
  });

  it('rechaza fecha sintácticamente inválida', async () => {
    expect(await errors(CreateExternalTaxDocumentDto, { ...valid, fechaEmision: 'no-fecha' })).not.toHaveLength(0);
  });

  it('rechaza estado tributario no conocido por el CRM', async () => {
    expect(await errors(CreateExternalTaxDocumentDto, { ...valid, estado: 'ACEPTADO_SII' })).not.toHaveLength(0);
  });

  it('transforma y limita paginación', async () => {
    const dto = plainToInstance(ExternalTaxDocumentQueryDto, { page: '2', pageSize: '101' });
    expect(dto.page).toBe(2);
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
