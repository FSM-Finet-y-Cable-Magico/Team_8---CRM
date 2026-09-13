ALTER TABLE contrato
  ADD COLUMN IF NOT EXISTS id_prospecto INTEGER,
  ADD COLUMN IF NOT EXISTS direccion_instalacion VARCHAR(200),
  ADD COLUMN IF NOT EXISTS comuna_instalacion VARCHAR(80),
  ADD COLUMN IF NOT EXISTS ciudad_instalacion VARCHAR(80);

ALTER TABLE contrato
  ADD CONSTRAINT fk_contrato_id_prospecto
  FOREIGN KEY (id_prospecto) REFERENCES prospecto(id_prospecto);

CREATE INDEX IF NOT EXISTS idx_contrato_id_prospecto ON contrato(id_prospecto);