import { useEffect, useRef, useState } from 'react';
import { api, G3HistoricalClosure } from '../../api';
import { formatDateTime } from '../../lib';

export function HistoricalG3Closure({ idServicio }: { idServicio: number }) {
  const [result, setResult] = useState<G3HistoricalClosure | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    setResult(null);
    setError('');
    setLoading(false);
    return () => { request.current?.abort(); request.current = null; };
  }, [idServicio]);

  async function consult() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setResult(null);
    setError('');
    try {
      const { data } = await api.get<G3HistoricalClosure>(`/integrations/g3/services/${idServicio}/historical-closure`, {
        signal: controller.signal,
      });
      if (!controller.signal.aborted) setResult(data);
    } catch {
      if (!controller.signal.aborted) setError('No se pudo consultar G3. La instalación confirmada y los datos guardados en G8 no cambian.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  const data = result?.estadoConsulta === 'DISPONIBLE' ? result.datos : null;
  return <section className="customer-service-history">
    <header><h3>Cierre histórico consultado en G3</h3></header>
    <p>Consulta temporal de solo lectura. No reemplaza los datos guardados en G8. El inventario físico se consulta exclusivamente en G1.</p>
    <button type="button" className="secondary compact" disabled={loading} onClick={consult}>
      {loading ? 'Consultando cierre…' : 'Consultar datos históricos G3'}
    </button>
    <div aria-live="polite">
      {error && <p className="inline-status">{error}</p>}
      {result && <p className="inline-status">{result.mensaje}</p>}
      {data && <>
        <p>Fuente: G3 · No persistido · Consultado: {formatDateTime(result!.consultadoEn)}</p>
        <dl className="customer-readonly-details">
          <div><dt>Fecha real de finalización</dt><dd>{data.fechaCompletada ? formatDateTime(data.fechaCompletada) : 'No informada por G3'}</dd></div>
          <div><dt>Identificador del técnico G3</dt><dd>{data.idTecnicoG3 ?? 'No informado por G3'}</dd></div>
          <div><dt>Potencia óptica</dt><dd>{data.potenciaOpticaDbm !== null ? `${data.potenciaOpticaDbm} dBm` : 'No informada por G3'}</dd></div>
          <div><dt>Resultado de llamada</dt><dd>{data.resultadoLlamada ?? 'No informado por G3'}</dd></div>
          <div><dt>Resuelto remotamente</dt><dd>{data.resueltoRemotamente === null ? 'No informado por G3' : data.resueltoRemotamente ? 'Sí' : 'No'}</dd></div>
          <div><dt>Registros de materiales en el cierre</dt><dd>{data.cantidadMateriales ?? 'No informados por G3'}</dd></div>
          <div><dt>Registros de equipos en el cierre (no inventario)</dt><dd>{data.cantidadEquiposInformados ?? 'No informados por G3'}</dd></div>
        </dl>
      </>}
    </div>
  </section>;
}
