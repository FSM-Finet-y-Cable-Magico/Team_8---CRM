-- Read-only fingerprint of business tables: counts and md5 hashes, no rows printed.
-- Used before and after the G8 image swap; the swap must not change any of these lines.
BEGIN READ ONLY;
SELECT 'prospecto', count(*), md5(coalesce(string_agg(id_prospecto || ':' || coalesce(estado_pipeline, '') || ':' || coalesce(rut, ''), '|' ORDER BY id_prospecto), '')) FROM public.prospecto
UNION ALL SELECT 'cotizacion', count(*), md5(coalesce(string_agg(id_cotizacion::text, '|' ORDER BY id_cotizacion), '')) FROM public.cotizacion
UNION ALL SELECT 'contrato', count(*), md5(coalesce(string_agg(id_contrato || ':' || coalesce(estado, ''), '|' ORDER BY id_contrato), '')) FROM public.contrato
UNION ALL SELECT 'cliente', count(*), md5(coalesce(string_agg(id_cliente || ':' || estado || ':' || coalesce(rut, ''), '|' ORDER BY id_cliente), '')) FROM public.cliente
UNION ALL SELECT 'servicio_contratado', count(*), md5(coalesce(string_agg(id_servicio || ':' || estado_operativo, '|' ORDER BY id_servicio), '')) FROM public.servicio_contratado
UNION ALL SELECT 'integracion_instalacion_g3', count(*), md5(coalesce(string_agg(id_integracion::text, '|' ORDER BY id_integracion), '')) FROM public.integracion_instalacion_g3
UNION ALL SELECT 'orden_trabajo', count(*), md5(coalesce(string_agg(id_ot::text, '|' ORDER BY id_ot), '')) FROM public.orden_trabajo;
-- Columns read by the changed backend code (TK-02 / TK-04): must all exist.
SELECT 'columnas_requeridas', count(*) FILTER (WHERE c.column_name IS NULL), string_agg(r.t || '.' || r.c, ',') FILTER (WHERE c.column_name IS NULL)
FROM (VALUES ('servicio_contratado','id_empresa'), ('servicio_contratado','estado_operativo'), ('servicio_contratado','id_cliente'),
             ('prospecto','rut'), ('cliente','rut'), ('cliente','estado')) AS r(t, c)
LEFT JOIN information_schema.columns c ON c.table_schema = 'public' AND c.table_name = r.t AND c.column_name = r.c;
COMMIT;
