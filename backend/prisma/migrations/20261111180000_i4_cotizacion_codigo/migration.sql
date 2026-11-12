BEGIN;

ALTER TABLE cotizacion ADD COLUMN IF NOT EXISTS codigo VARCHAR(20);
ALTER TABLE cotizacion
  ALTER COLUMN codigo SET DEFAULT ('COT-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 16)));

UPDATE cotizacion
SET codigo = DEFAULT
WHERE fecha_envio IS NOT NULL AND codigo IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cotizacion_codigo_key ON cotizacion (codigo);

COMMIT;
