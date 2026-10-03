import { BuiltTaxDocument } from './facturacion-cl-document-builder';
import { FacturacionClReadClient, FacturacionClReadError, FacturacionClReadOptions, FacturacionClRequest } from './facturacion-cl-read-client';
import { TaxDispatchResult, TaxEmissionDispatchPort, TaxIntentStore, taxIntentFingerprint } from './tax-emission-intent.service';

export type FacturacionClApprovedTestContract = {
  idEmpresa: number; approved: boolean; environment: 'sandbox'; policyVersion: string;
  allowedDteTypes: Array<33 | 34 | 39 | 41>;
};

/** Prepared but UNREGISTERED. No real company has an approved emission contract. */
export class FacturacionClSandboxDispatcher extends FacturacionClReadClient implements TaxEmissionDispatchPort {
  private readonly contracts = new Map<number, FacturacionClApprovedTestContract>();
  private readonly emissionEnabled: boolean;

  constructor(
    options: FacturacionClReadOptions,
    private readonly store: TaxIntentStore,
    contracts: FacturacionClApprovedTestContract[] = [],
    emissionEnabled = false,
    request?: FacturacionClRequest,
  ) {
    super(options, request);
    if (typeof emissionEnabled !== 'boolean') throw new Error('EMISSION_CONFIGURATION_INVALID');
    this.emissionEnabled = emissionEnabled;
    for (const contract of contracts) {
      if (contract.environment !== 'sandbox' || !Number.isSafeInteger(contract.idEmpresa) || contract.idEmpresa < 1 ||
          typeof contract.approved !== 'boolean' || typeof contract.policyVersion !== 'string' ||
          !/^[A-Za-z0-9:_-]{1,64}$/.test(contract.policyVersion) || !Array.isArray(contract.allowedDteTypes) || !contract.allowedDteTypes.length ||
          contract.allowedDteTypes.some(type => ![33, 34, 39, 41].includes(type)) || this.contracts.has(contract.idEmpresa)) {
        throw new Error('EMISSION_CONFIGURATION_INVALID');
      }
      this.contracts.set(contract.idEmpresa, Object.freeze({ ...contract, allowedDteTypes: [...contract.allowedDteTypes] }));
    }
  }

  canIssue(idEmpresa: number) {
    return this.emissionEnabled && this.companyEnabled(idEmpresa) && this.contracts.get(idEmpresa)?.approved === true;
  }

  async dispatch(input: { intentId: string; claimId: string; idEmpresa: number; document: BuiltTaxDocument }): Promise<TaxDispatchResult> {
    if (!this.canIssue(input.idEmpresa)) return { state: 'FALLIDO', code: 'CONFIRMED_NOT_SENT' };
    const document = { ...input.document, bytes: Buffer.from(input.document.bytes) };
    const contract = this.contracts.get(input.idEmpresa)!;
    const record = await this.store.find(input.idEmpresa, input.intentId);
    if (record.idEmpresa !== input.idEmpresa || record.ambiente !== 'sandbox' || record.estado !== 'EN_PROCESO' || record.intentos !== 1 ||
        record.claimId !== input.claimId || !input.claimId || record.policyVersion !== contract.policyVersion ||
        !contract.allowedDteTypes.includes(document.tipoDte) || record.tipoDte !== document.tipoDte ||
        record.formato !== document.formato || record.folioEsperado !== document.folio ||
        record.fingerprint !== taxIntentFingerprint({ idEmpresa: record.idEmpresa, idFactura: record.idFactura,
          idPago: record.idPago ?? undefined, businessKey: record.businessKey, policyVersion: record.policyVersion, ambiente: 'sandbox', document })) {
      return { state: 'FALLIDO', code: 'CONFIRMED_NOT_SENT' };
    }
    // One-way durable marker also protects direct replays of this claimed job.
    try {
      if (!await this.store.beginDispatch(record, input.claimId)) return { state: 'RESULTADO_INDETERMINADO' };
    } catch { return { state: 'RESULTADO_INDETERMINADO' }; }
    // Resolve authentication before handing the emission request to the transport.
    try { await this.authenticate(input.idEmpresa); }
    catch (error) {
      if (error instanceof FacturacionClReadError) return { state: 'FALLIDO', code: 'CONFIRMED_NOT_SENT' };
      throw error;
    }
    const url = new URL('https://rest.facturacion.cl/wsds/procesar');
    url.searchParams.set('file', document.bytes.toString('base64'));
    url.searchParams.set('formato', String(document.formato));
    try {
      const response = await this.authorizedRequest(input.idEmpresa, url);
      if (!response.ok) return { state: 'RESULTADO_INDETERMINADO' };
      const body = await response.json() as { WSPLANO?: { Resultado?: unknown; Detalle?: { Documento?: unknown } } } | null;
      const raw = body?.WSPLANO?.Detalle?.Documento;
      const documents = Array.isArray(raw) ? raw : [raw];
      if (documents.length !== 1) return { state: 'RESULTADO_INDETERMINADO' };
      const issued = documents[0] as { Resultado?: unknown; Folio?: unknown; TipoDte?: unknown } | null;
      if (body?.WSPLANO?.Resultado !== 'True' || issued?.Resultado !== 'True' ||
          issued.Folio !== record.folioEsperado || String(issued.TipoDte) !== String(record.tipoDte)) {
        return { state: 'RESULTADO_INDETERMINADO' };
      }
      return { state: 'GENERADO', folio: record.folioEsperado, tipoDte: record.tipoDte };
    } catch {
      // Any failure after handing off a processing request remains uncertain.
      return { state: 'RESULTADO_INDETERMINADO' };
    }
  }
}
