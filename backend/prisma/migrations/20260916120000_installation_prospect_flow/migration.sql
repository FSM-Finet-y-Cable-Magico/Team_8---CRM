ALTER TABLE orden_trabajo
  ADD COLUMN IF NOT EXISTS id_prospecto INTEGER;

ALTER TABLE orden_trabajo
  ADD CONSTRAINT fk_orden_trabajo_id_prospecto
  FOREIGN KEY (id_prospecto) REFERENCES prospecto(id_prospecto);

CREATE INDEX IF NOT EXISTS idx_orden_trabajo_id_prospecto ON orden_trabajo(id_prospecto);
