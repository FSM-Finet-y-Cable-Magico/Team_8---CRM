-- Migration prepared for coordinated G2/G8 approval. Do not apply automatically.

ALTER TABLE prospecto
  ADD COLUMN IF NOT EXISTS id_plan_interes INTEGER;

DO $$ BEGIN
  ALTER TABLE prospecto ADD CONSTRAINT prospecto_id_plan_interes_fkey
    FOREIGN KEY (id_plan_interes) REFERENCES plan(id_plan)
    ON UPDATE CASCADE ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS prospecto_id_empresa_id_plan_interes_idx
  ON prospecto (id_empresa, id_plan_interes);

ALTER TABLE pago
  ADD COLUMN IF NOT EXISTS codigo_autorizacion VARCHAR(100),
  ADD COLUMN IF NOT EXISTS comprobante_estado VARCHAR(20);

UPDATE pago
SET comprobante_estado = CASE
  WHEN comprobante_pdf_url IS NOT NULL AND btrim(comprobante_pdf_url) <> '' THEN 'GENERADO'
  ELSE 'PENDIENTE'
END
WHERE comprobante_estado IS NULL;

ALTER TABLE pago
  ALTER COLUMN comprobante_estado SET DEFAULT 'PENDIENTE',
  ALTER COLUMN comprobante_estado SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE pago ADD CONSTRAINT pago_comprobante_estado_check
    CHECK (comprobante_estado IN ('PENDIENTE', 'GENERADO', 'FALLIDO'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT nombre FROM categoria_falla GROUP BY nombre HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'categoria_falla contiene nombres duplicados; resolver antes de crear la unicidad';
  END IF;
END $$;

INSERT INTO categoria_falla (nombre, sla_horas)
SELECT 'CAMBIO_CREDENCIALES_WIFI', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM categoria_falla WHERE nombre = 'CAMBIO_CREDENCIALES_WIFI'
);

CREATE UNIQUE INDEX IF NOT EXISTS categoria_falla_nombre_key
  ON categoria_falla (nombre);

CREATE TABLE IF NOT EXISTS integracion_resultado_wifi_g2 (
  id_resultado BIGSERIAL PRIMARY KEY,
  request_id VARCHAR(100) NOT NULL,
  trace_id VARCHAR(100),
  id_empresa INTEGER NOT NULL,
  id_ticket INTEGER NOT NULL,
  payload_hash VARCHAR(64) NOT NULL,
  exito BOOLEAN NOT NULL,
  resultado_tecnico TEXT NOT NULL,
  estado_ticket_resultante VARCHAR(20) NOT NULL,
  fecha_recepcion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT integracion_resultado_wifi_g2_estado_check
    CHECK (estado_ticket_resultante IN ('Resuelto', 'Escalado')),
  CONSTRAINT integracion_resultado_wifi_g2_id_empresa_fkey
    FOREIGN KEY (id_empresa) REFERENCES empresa(id_empresa)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT integracion_resultado_wifi_g2_id_ticket_fkey
    FOREIGN KEY (id_ticket) REFERENCES ticket(id_ticket)
    ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS integracion_resultado_wifi_g2_request_id_key
  ON integracion_resultado_wifi_g2 (request_id);

CREATE INDEX IF NOT EXISTS integracion_resultado_wifi_g2_empresa_fecha_idx
  ON integracion_resultado_wifi_g2 (id_empresa, fecha_recepcion);

CREATE INDEX IF NOT EXISTS integracion_resultado_wifi_g2_ticket_fecha_idx
  ON integracion_resultado_wifi_g2 (id_ticket, fecha_recepcion);
