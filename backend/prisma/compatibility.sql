-- CU-12 permite reutilizar una cuenta de cliente en prospectos de empresas distintas.
-- Algunas bases creadas con el esquema inicial conservan esta restriccion unica.
ALTER TABLE prospecto
  DROP CONSTRAINT IF EXISTS prospecto_id_cliente_key;
