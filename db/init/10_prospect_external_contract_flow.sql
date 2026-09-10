-- Flujo prospecto -> cliente pendiente de firma con contrato externo.
-- Idempotente para bases locales y contenedores nuevos.

ALTER TABLE cliente
  ALTER COLUMN estado TYPE VARCHAR(40);

ALTER TABLE contrato
  ALTER COLUMN estado TYPE VARCHAR(40);

ALTER TABLE prospecto
  ADD COLUMN IF NOT EXISTS observacion_perdida TEXT,
  ADD COLUMN IF NOT EXISTS fecha_perdida TIMESTAMP,
  ADD COLUMN IF NOT EXISTS id_usuario_perdida INTEGER;

ALTER TABLE contrato
  ADD COLUMN IF NOT EXISTS proveedor_contrato VARCHAR(40),
  ADD COLUMN IF NOT EXISTS numero_contrato_externo VARCHAR(80),
  ADD COLUMN IF NOT EXISTS folio_contrato_externo VARCHAR(80),
  ADD COLUMN IF NOT EXISTS url_contrato_pdf TEXT,
  ADD COLUMN IF NOT EXISTS fecha_generacion_contrato DATE,
  ADD COLUMN IF NOT EXISTS fecha_envio_cliente DATE,
  ADD COLUMN IF NOT EXISTS observacion_contrato TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_prospecto_id_usuario_perdida') THEN
    ALTER TABLE prospecto
      ADD CONSTRAINT fk_prospecto_id_usuario_perdida FOREIGN KEY (id_usuario_perdida) REFERENCES usuario(id_usuario);
  END IF;
END $$;
