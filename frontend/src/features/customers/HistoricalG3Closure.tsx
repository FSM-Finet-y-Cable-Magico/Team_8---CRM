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
      if (!controller.signal.aborted) setError('No se pudieron consultar los antecedentes. La instalación confirmada conserva sus datos.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  const data = result?.estadoConsulta === 'DISPONIBLE' ? result.datos : null;
  return <section className="customer-service-history">
    <header><h3>Antecedentes del cierre técnico</h3></header>
    <p>Consulta los detalles del cierre de la instalación. Esta consulta es de solo lectura.</p>
    <button type="button" className="secondary compact" disabled={loading} onClick={consult}>
      {loading ? 'Consultando…' : 'Consultar antecedentes'}
    </button>
    <div aria-live="polite">
      {error && <p className="inline-status">{error}</p>}
      {result && <p className="inline-status">{result.estadoConsulta === 'DISPONIBLE' ? 'Antecedentes disponibles.' : result.estadoConsulta === 'NO_VALIDADO' ? 'No se pudo verificar la información del cierre.' : 'No hay antecedentes disponibles para esta instalación.'}</p>}
      {data && <>
        <p>Consultado: {formatDateTime(result!.consultadoEn)}</p>
        <dl className="customer-readonly-details">
          <div><dt>Fecha de finalización</dt><dd>{data.fechaCompletada ? formatDateTime(data.fechaCompletada) : 'No registrada'}</dd></div>
          <div><dt>Identificador del técnico</dt><dd>{data.idTecnicoG3 ?? 'No registrado'}</dd></div>
          <div><dt>Potencia óptica</dt><dd>{data.potenciaOpticaDbm !== null ? `${data.potenciaOpticaDbm} dBm` : 'No registrada'}</dd></div>
          <div><dt>Resultado de llamada</dt><dd>{data.resultadoLlamada ?? 'No registrado'}</dd></div>
          <div><dt>Resuelto remotamente</dt><dd>{data.resueltoRemotamente === null ? 'No registrado' : data.resueltoRemotamente ? 'Sí' : 'No'}</dd></div>
          <div><dt>Materiales informados en el cierre</dt><dd>{data.cantidadMateriales ?? 'No registrados'}</dd></div>
          <div><dt>Equipos informados en el cierre</dt><dd>{data.cantidadEquiposInformados ?? 'No registrados'}</dd></div>
        </dl>
      </>}
    </div>
  </section>;
}
