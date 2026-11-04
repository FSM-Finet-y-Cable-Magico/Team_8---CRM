-- Local/isolated QA only until approved shared-schema deployment.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- F3 manual allocations. G8-owned append-only ledger; no historical repair.
CREATE TABLE IF NOT EXISTS operacion_imputacion_cuota (
  id_operacion SERIAL PRIMARY KEY,
  id_empresa INTEGER NOT NULL,
  id_pago INTEGER NOT NULL,
  id_convenio INTEGER NOT NULL,
  id_factura INTEGER NOT NULL,
  id_usuario INTEGER NOT NULL,
  id_auditoria BIGINT NOT NULL,
  clave VARCHAR(100) NOT NULL,
  hash CHAR(64) NOT NULL,
  tipo VARCHAR(10) NOT NULL,
  motivo VARCHAR(250) NOT NULL,
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT operacion_imputacion_cuota_tipo_check CHECK (tipo IN ('APLICAR', 'REVERSAR')),
  CONSTRAINT operacion_imputacion_cuota_clave_check CHECK (length(clave) >= 8),
  CONSTRAINT operacion_imputacion_cuota_motivo_check CHECK (motivo <> '')
);
CREATE TABLE IF NOT EXISTS imputacion_cuota (
  id_imputacion SERIAL PRIMARY KEY,
  id_operacion INTEGER NOT NULL,
  id_cuota INTEGER NOT NULL,
  monto NUMERIC(12,2) NOT NULL,
  id_original INTEGER,
  CONSTRAINT imputacion_cuota_monto_check CHECK (monto > 0),
  CONSTRAINT imputacion_cuota_original_check CHECK (id_original IS NULL OR id_original <> id_imputacion)
);
CREATE UNIQUE INDEX IF NOT EXISTS operacion_imputacion_cuota_id_empresa_clave_key ON operacion_imputacion_cuota (id_empresa, clave);
CREATE UNIQUE INDEX IF NOT EXISTS operacion_imputacion_cuota_id_auditoria_key ON operacion_imputacion_cuota (id_auditoria);
CREATE INDEX IF NOT EXISTS operacion_imputacion_cuota_id_pago_idx ON operacion_imputacion_cuota (id_pago);
CREATE INDEX IF NOT EXISTS operacion_imputacion_cuota_id_convenio_idx ON operacion_imputacion_cuota (id_convenio);
CREATE INDEX IF NOT EXISTS operacion_imputacion_cuota_id_factura_idx ON operacion_imputacion_cuota (id_factura);
CREATE UNIQUE INDEX IF NOT EXISTS imputacion_cuota_id_operacion_id_cuota_key ON imputacion_cuota (id_operacion, id_cuota);
CREATE INDEX IF NOT EXISTS imputacion_cuota_id_cuota_idx ON imputacion_cuota (id_cuota);
CREATE INDEX IF NOT EXISTS imputacion_cuota_id_original_idx ON imputacion_cuota (id_original);
DO $$ BEGIN ALTER TABLE operacion_imputacion_cuota ADD CONSTRAINT operacion_imputacion_cuota_id_empresa_fkey FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa) ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE operacion_imputacion_cuota ADD CONSTRAINT operacion_imputacion_cuota_id_pago_fkey FOREIGN KEY (id_pago) REFERENCES pago (id_pago) ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE operacion_imputacion_cuota ADD CONSTRAINT operacion_imputacion_cuota_id_convenio_fkey FOREIGN KEY (id_convenio) REFERENCES convenio_pago (id_convenio) ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE operacion_imputacion_cuota ADD CONSTRAINT operacion_imputacion_cuota_id_factura_fkey FOREIGN KEY (id_factura) REFERENCES factura (id_factura) ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE operacion_imputacion_cuota ADD CONSTRAINT operacion_imputacion_cuota_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES usuario (id_usuario) ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE operacion_imputacion_cuota ADD CONSTRAINT operacion_imputacion_cuota_id_auditoria_fkey FOREIGN KEY (id_auditoria) REFERENCES log_auditoria (id_log) ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE imputacion_cuota ADD CONSTRAINT imputacion_cuota_id_operacion_fkey FOREIGN KEY (id_operacion) REFERENCES operacion_imputacion_cuota (id_operacion) ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE imputacion_cuota ADD CONSTRAINT imputacion_cuota_id_cuota_fkey FOREIGN KEY (id_cuota) REFERENCES cuota_convenio_pago (id_cuota) ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE imputacion_cuota ADD CONSTRAINT imputacion_cuota_id_original_fkey FOREIGN KEY (id_original) REFERENCES imputacion_cuota (id_imputacion) ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMIT;
