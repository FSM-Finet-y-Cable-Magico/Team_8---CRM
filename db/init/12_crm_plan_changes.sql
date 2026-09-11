-- Preserve historical changes: they were already applied by the old workflow.
ALTER TABLE historial_cambio_plan
  ADD COLUMN IF NOT EXISTS estado_cambio VARCHAR(20) NOT NULL DEFAULT 'Aplicado',
  ADD COLUMN IF NOT EXISTS fecha_aplicacion TIMESTAMP;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cambio_plan_pendiente
  ON historial_cambio_plan(id_contrato) WHERE estado_cambio = 'Pendiente';
CREATE INDEX IF NOT EXISTS idx_cambio_plan_ejecucion
  ON historial_cambio_plan(estado_cambio, fecha_efectiva);
