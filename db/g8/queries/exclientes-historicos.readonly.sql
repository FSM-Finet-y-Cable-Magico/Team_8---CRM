-- Exclientes históricos por empresa: SOLO LECTURA (transacción READ ONLY que termina en ROLLBACK).
-- Objetivo (FINET 13-11-2026): contar, ANTES de cualquier activación, a quienes la vista derivada de Prospectos ya
-- mostraría como excliente. No escribe, no crea objetos y no devuelve RUT, nombres, montos ni credenciales: solo conteos.
--
-- Misma condición que backend/src/common/returning-customer.ts (formerCustomerInCompanyWhere): en la empresa E, el
-- cliente NO tiene servicio con estado_operativo <> 'Baja' NI contrato fuera de ('Baja', 'Anulado'), y SÍ tiene al
-- menos un servicio en 'Baja' o un contrato en 'Baja'. Quien conserva otra relación operativa en E no cuenta.
-- La situación de deuda (etiqueta) se calcula en la aplicación con facturas, pagos y prórrogas; no se replica aquí.
--
-- Uso (lo ejecuta quien tenga acceso de lectura; reconfirmar antes la identidad de la base):
--   psql -X -v ON_ERROR_STOP=1 -d <base> -f exclientes-historicos.readonly.sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '60s';

-- Q0. Identidad del destino (confirmar que es la base autorizada antes de leer resultados).
SELECT current_database() AS base, current_user AS rol, inet_server_addr() AS servidor, inet_server_port() AS puerto;

-- Q1. Conteos por empresa.
WITH con_baja AS (
  SELECT id_empresa, id_cliente FROM public.servicio_contratado WHERE estado_operativo = 'Baja' AND id_empresa IS NOT NULL
  UNION
  SELECT id_empresa, id_cliente FROM public.contrato WHERE estado = 'Baja' AND id_empresa IS NOT NULL AND id_cliente IS NOT NULL
),
exclientes AS (
  SELECT b.id_empresa, b.id_cliente FROM con_baja b
  WHERE NOT EXISTS (SELECT 1 FROM public.servicio_contratado s
                    WHERE s.id_cliente = b.id_cliente AND s.id_empresa = b.id_empresa AND s.estado_operativo <> 'Baja')
    AND NOT EXISTS (SELECT 1 FROM public.contrato k
                    WHERE k.id_cliente = b.id_cliente AND k.id_empresa = b.id_empresa AND k.estado NOT IN ('Baja', 'Anulado'))
),
detalle AS (
  SELECT x.id_empresa, x.id_cliente,
    (SELECT count(*) FROM public.prospecto p WHERE p.id_cliente = x.id_cliente AND p.id_empresa = x.id_empresa) AS prospectos_vinculados,
    EXISTS (
      SELECT 1 FROM public.prospecto p JOIN public.cliente c ON c.id_cliente = x.id_cliente
      WHERE p.id_empresa = x.id_empresa AND p.id_cliente IS NULL AND c.rut IS NOT NULL
        AND upper(regexp_replace(p.rut, '[^0-9kK]', '', 'g')) = upper(regexp_replace(c.rut, '[^0-9kK]', '', 'g'))
    ) AS prospecto_mismo_rut_sin_vinculo
  FROM exclientes x
)
SELECT e.id_empresa,
       e.nombre AS empresa,
       count(d.id_cliente) AS exclientes_total,
       count(d.id_cliente) FILTER (WHERE d.prospectos_vinculados > 0) AS visibles_hoy_en_prospectos,
       COALESCE(sum(d.prospectos_vinculados), 0)::bigint AS filas_de_prospecto_visibles,
       count(d.id_cliente) FILTER (WHERE d.prospectos_vinculados = 0) AS sin_prospecto_vinculado,
       count(d.id_cliente) FILTER (WHERE d.prospectos_vinculados = 0 AND d.prospecto_mismo_rut_sin_vinculo) AS revision_mismo_rut_sin_vinculo
FROM public.empresa e
LEFT JOIN detalle d ON d.id_empresa = e.id_empresa
GROUP BY e.id_empresa, e.nombre
ORDER BY e.id_empresa;

ROLLBACK;
