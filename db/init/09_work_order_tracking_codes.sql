ALTER TABLE orden_trabajo
  ADD COLUMN IF NOT EXISTS codigo_seguimiento VARCHAR(32);

UPDATE orden_trabajo
SET codigo_seguimiento =
  CASE
    WHEN lower(tipo_ot) LIKE '%instalacion%' OR lower(tipo_ot) LIKE '%instalación%' THEN 'OT-INS-' || lpad(id_ot::text, 6, '0')
    WHEN lower(tipo_ot) LIKE '%reparacion%' OR lower(tipo_ot) LIKE '%reparación%' THEN 'OT-REP-' || lpad(id_ot::text, 6, '0')
    WHEN lower(tipo_ot) LIKE '%soporte%' THEN 'OT-SOP-' || lpad(id_ot::text, 6, '0')
    ELSE 'OT-OTR-' || lpad(id_ot::text, 6, '0')
  END
WHERE codigo_seguimiento IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orden_trabajo_codigo_seguimiento_key
  ON orden_trabajo(codigo_seguimiento);
