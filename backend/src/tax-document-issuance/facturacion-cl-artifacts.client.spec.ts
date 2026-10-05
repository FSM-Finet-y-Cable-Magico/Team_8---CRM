import { FacturacionClArtifactsClient, validateFacturacionClArtifactUrl } from './facturacion-cl-artifacts.client';
import { FacturacionClRequest } from './facturacion-cl-read-client';
const link='https://www.facturacion.cl/sistema/descargar.php?fixture=FAKE';
describe('FacturacionCl read-only artifacts (fake HTTP)',()=>{
  const options={enabled:true,companies:[{idEmpresa:2,enabled:true,environment:'sandbox' as const}],credentials:async()=>({usuario:'FAKE',rut:'FAKE',clave:'FAKE'})};
  it.each(['http://www.facturacion.cl/sistema/descargar.php','https://evil.example/sistema/descargar.php','https://www.facturacion.cl@evil.example/sistema/descargar.php','https://www.facturacion.cl/other','https://user:pass@www.facturacion.cl/sistema/descargar.php','https://www.facturacion.cl/sistema/descargar.php#x'])('rejects destination %s',url=>expect(()=>validateFacturacionClArtifactUrl(url)).toThrow('ARTIFACT_URL_INVALID'));
  it('reads documented Base64 link with B movement for receipts, never calls processing',async()=>{
    const request=jest.fn<ReturnType<FacturacionClRequest>,Parameters<FacturacionClRequest>>().mockImplementation(async url=>({ok:true,status:200,json:async()=>url.endsWith('/login')?{token:'FAKE'}:{WSPLANO:{Mensaje:Buffer.from(link).toString('base64')}}}));
    expect(await new FacturacionClArtifactsClient(options,request).getLink(2,39,'7')).toBe(link);
    const url=new URL(request.mock.calls[1][0]);expect(url.pathname).toBe('/wsds/obtenerlink');expect(url.searchParams.get('tpomov')).toBe('B');
    expect(request.mock.calls.some(([url])=>url.includes('/procesar'))).toBe(false);
  });
  it('upgrades only the observed sandbox download path to HTTPS without allowing plaintext requests',()=>{
    expect(validateFacturacionClArtifactUrl('http://www.facturacion.cl/plano/descargar.php?FAKE')).toBe('https://www.facturacion.cl/plano/descargar.php?FAKE');
    expect(()=>validateFacturacionClArtifactUrl('http://www.facturacion.cl/other?FAKE')).toThrow();
  });
  it('downloads bounded PDF without Authorization and rejects HTML and oversized files',async()=>{
    const client=new FacturacionClArtifactsClient(options);
    const download=jest.fn().mockResolvedValue(new Response('%PDF-FAKE')) as unknown as jest.MockedFunction<typeof fetch>;
    expect((await client.downloadPdf(link,download)).toString()).toBe('%PDF-FAKE');
    expect(download.mock.calls[0][1]).toMatchObject({redirect:'error',cache:'no-store'});
    expect(download.mock.calls[0][1]?.headers).toBeUndefined();
    download.mockResolvedValue(new Response('<html>error</html>'));await expect(client.downloadPdf(link,download)).rejects.toThrow('ARTIFACT_NOT_PDF');
    download.mockResolvedValue(new Response('%PDF-FAKE',{headers:{'content-length':String(6*1024*1024)}}));await expect(client.downloadPdf(link,download)).rejects.toThrow('ARTIFACT_DOWNLOAD_FAILED');
  });
});
