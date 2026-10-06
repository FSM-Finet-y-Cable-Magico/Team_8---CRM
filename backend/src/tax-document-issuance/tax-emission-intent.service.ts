import { createHash, randomUUID } from 'node:crypto';
import { BuiltTaxDocument, matchesIssuedFolio } from './facturacion-cl-document-builder';

export type TaxIntentState = 'PENDIENTE' | 'EN_PROCESO' | 'GENERADO' | 'FALLIDO' | 'RESULTADO_INDETERMINADO';
export type TaxIntentCompletion = { estado: 'GENERADO' | 'FALLIDO' | 'RESULTADO_INDETERMINADO'; folio?: string; ultimoError?: string };
export type TaxIntentInput = {
  idEmpresa: number; idFactura: number; idPago?: number;
  businessKey: string; policyVersion: string; ambiente: 'sandbox'; document: BuiltTaxDocument;
};
export type TaxIntentRecord = {
  idIntencion: string; idEmpresa: number; idFactura: number; idPago: number | null;
  businessKey: string; policyVersion: string; ambiente: string; tipoDte: number; formato: number;
  fingerprint: string; folioEsperado: string; estado: string; intentos: number;
  claimId: string | null; folio: string | null; ultimoError: string | null;
};
export type NewTaxIntent = Omit<TaxIntentRecord, 'idIntencion' | 'estado' | 'intentos' | 'claimId' | 'folio' | 'ultimoError'>;
export interface TaxIntentStore {
  prepare(data: NewTaxIntent): Promise<TaxIntentRecord>;
  claim(record: TaxIntentRecord, claimId: string): Promise<boolean>;
  beginDispatch(record: TaxIntentRecord, claimId: string): Promise<boolean>;
  finish(record: TaxIntentRecord, claimId: string, result: TaxIntentCompletion): Promise<void>;
  find(idEmpresa: number, idIntencion: string): Promise<TaxIntentRecord>;
}
export type TaxDispatchResult = { state: 'GENERADO'; folio: string; tipoDte: number } |
  { state: 'FALLIDO'; code: 'CONFIRMED_NOT_SENT' } | { state: 'RESULTADO_INDETERMINADO' };
/** Processing port; uncertainty never permits another processing request. */
export interface TaxEmissionDispatchPort {
  canIssue(idEmpresa: number): boolean;
  dispatch(input: { intentId: string; claimId: string; idEmpresa: number; document: BuiltTaxDocument }): Promise<TaxDispatchResult>;
}

export function taxIntentFingerprint(input: TaxIntentInput) {
  return createHash('sha256').update(JSON.stringify({
    idEmpresa: input.idEmpresa, idFactura: input.idFactura, idPago: input.idPago ?? null,
    businessKey: input.businessKey, policyVersion: input.policyVersion, ambiente: input.ambiente,
    tipoDte: input.document.tipoDte, formato: input.document.formato, folio: input.document.folio,
    folioMode: input.document.folioMode ?? 'explicit',
  })).update(input.document.bytes).digest('hex');
}

/** Durable intent lifecycle, invoked only after the financial commit. */
export class TaxEmissionIntentService {
  constructor(private readonly store: TaxIntentStore, private readonly dispatcher: TaxEmissionDispatchPort) {}

  async prepare(input: TaxIntentInput) {
    if (![input.idEmpresa, input.idFactura].every(value => Number.isSafeInteger(value) && value > 0) ||
        (input.idPago !== undefined && (!Number.isSafeInteger(input.idPago) || input.idPago < 1)) || input.ambiente !== 'sandbox' ||
        typeof input.businessKey !== 'string' || typeof input.policyVersion !== 'string' ||
        !/^[A-Za-z0-9:_-]{1,120}$/.test(input.businessKey) || !/^[A-Za-z0-9:_-]{1,64}$/.test(input.policyVersion) ||
        !Buffer.isBuffer(input.document.bytes) || !input.document.bytes.length ||
        !(input.document.folioMode === 'provider_auto' ? input.document.folio === '0' && [39, 41].includes(input.document.tipoDte) : /^[1-9]\d{0,9}$/.test(input.document.folio)) ||
        !([33, 34].includes(input.document.tipoDte) && input.document.formato === 2 || [39, 41].includes(input.document.tipoDte) && input.document.formato === 1)) {
      throw new Error('TAX_INTENT_INPUT_INVALID');
    }
    const { document, ...identity } = input;
    const fingerprint = taxIntentFingerprint(input);
    const record = await this.store.prepare({
      ...identity, idPago: identity.idPago ?? null, tipoDte: document.tipoDte, formato: document.formato,
      fingerprint, folioEsperado: document.folio,
    });
    if (record.fingerprint !== fingerprint) throw new Error('TAX_INTENT_CONTENT_CONFLICT');
    return record;
  }

  async execute(input: TaxIntentInput) {
    // Snapshot bytes before awaits: mutation by another caller must not change the send.
    const snapshot: TaxIntentInput = { ...input, document: { ...input.document, bytes: Buffer.from(input.document.bytes) } };
    const record = await this.prepare(snapshot);
    const eligible = record.estado === 'PENDIENTE' || record.estado === 'FALLIDO' && record.ultimoError === 'CONFIRMED_NOT_SENT';
    if (!eligible || !this.dispatcher.canIssue(input.idEmpresa)) return record;
    const claimId = randomUUID();
    // Durable atomic claim is committed before a dispatcher can send anything.
    if (!await this.store.claim(record, claimId)) return this.store.find(input.idEmpresa, record.idIntencion);
    let result: TaxDispatchResult;
    try { result = await this.dispatcher.dispatch({ intentId: record.idIntencion, claimId, idEmpresa: input.idEmpresa, document: snapshot.document }); }
    catch { result = { state: 'RESULTADO_INDETERMINADO' }; }
    if (result?.state === 'GENERADO' && matchesIssuedFolio(record.folioEsperado, result.folio, record.tipoDte) && result.tipoDte === record.tipoDte) {
      await this.store.finish(record, claimId, { estado: 'GENERADO', folio: result.folio });
    } else if (result?.state === 'FALLIDO' && result.code === 'CONFIRMED_NOT_SENT') {
      await this.store.finish(record, claimId, { estado: 'FALLIDO', ultimoError: 'CONFIRMED_NOT_SENT' });
    } else {
      await this.store.finish(record, claimId, { estado: 'RESULTADO_INDETERMINADO', ultimoError: 'RECONCILIATION_REQUIRED' });
    }
    return this.store.find(input.idEmpresa, record.idIntencion);
  }
}
