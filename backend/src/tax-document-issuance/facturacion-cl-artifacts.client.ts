import { FacturacionClReadClient } from './facturacion-cl-read-client';

export function validateFacturacionClArtifactUrl(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('ARTIFACT_URL_INVALID'); }
  // The verified test API returns http://www.facturacion.cl/plano/descargar.php.
  // Upgrade this exact sandbox path before any request; never send its opaque
  // download parameters over plaintext or follow a redirect.
  if (url.origin === 'http://www.facturacion.cl' && url.pathname === '/plano/descargar.php') url.protocol='https:';
  if (url.origin !== 'https://www.facturacion.cl' || !['/sistema/descargar.php','/plano/descargar.php'].includes(url.pathname) || url.username || url.password || url.hash || raw.length > 4096) {
    throw new Error('ARTIFACT_URL_INVALID');
  }
  return url.href;
}

/** Read-only artifact calls. No processing request, redirects or provider token on downloads. */
export class FacturacionClArtifactsClient extends FacturacionClReadClient {
  async getLink(idEmpresa: number, tipoDte: number, folio: string) {
    if (![33,34,39,41].includes(tipoDte) || !/^[1-9]\d{0,9}$/.test(folio)) throw new Error('ARTIFACT_REFERENCE_INVALID');
    const url = new URL('https://rest.facturacion.cl/wsds/obtenerlink');
    url.searchParams.set('tpomov', [39,41].includes(tipoDte) ? 'B' : 'V');
    url.searchParams.set('tipo', String(tipoDte)); url.searchParams.set('folio', folio); url.searchParams.set('cedible','false');
    const response = await this.authorizedRequest(idEmpresa, url);
    if (!response.ok) throw new Error('ARTIFACT_HTTP_FAILED');
    const body = await response.json() as { WSPLANO?: { Mensaje?: unknown } } | null;
    const value = body?.WSPLANO?.Mensaje;
    if (typeof value !== 'string' || value.length > 6000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('ARTIFACT_RESPONSE_INVALID');
    const decoded = Buffer.from(value, 'base64');
    if (decoded.toString('base64').replace(/=+$/,'') !== value.replace(/=+$/,'') || !decoded.equals(Buffer.from(decoded.toString('utf8'),'utf8'))) throw new Error('ARTIFACT_RESPONSE_INVALID');
    return validateFacturacionClArtifactUrl(decoded.toString('utf8'));
  }

  async downloadPdf(rawUrl: string, download: typeof fetch = fetch) {
    const url = validateFacturacionClArtifactUrl(rawUrl);
    const response = await download(url, { redirect: 'error', cache:'no-store', signal:AbortSignal.timeout(15000) });
    const max = 5 * 1024 * 1024;
    if (!response.ok || !response.body || Number(response.headers.get('content-length') || 0) > max) throw new Error('ARTIFACT_DOWNLOAD_FAILED');
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length;
        if (size > max) throw new Error('ARTIFACT_TOO_LARGE'); chunks.push(chunk.value); }
    } finally { await reader.cancel().catch(() => undefined); }
    const pdf = Buffer.concat(chunks);
    if (pdf.length < 8 || pdf.subarray(0,5).toString() !== '%PDF-') throw new Error('ARTIFACT_NOT_PDF');
    return pdf;
  }
}
