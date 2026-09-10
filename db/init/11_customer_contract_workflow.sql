-- Customer management workflow: manual contract signature before service creation.
ALTER TABLE contrato
  ADD COLUMN IF NOT EXISTS fecha_firma_manual DATE,
  ADD COLUMN IF NOT EXISTS id_usuario_firma_manual INTEGER,
  ADD COLUMN IF NOT EXISTS observacion_firma_manual TEXT;

CREATE INDEX IF NOT EXISTS idx_contrato_estado_cliente
  ON contrato (id_cliente, estado);
