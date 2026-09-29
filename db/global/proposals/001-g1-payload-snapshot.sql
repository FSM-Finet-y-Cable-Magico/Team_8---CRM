-- GLOBAL_SCHEMA_CHANGE_PROPOSED / PREPARADO_NO_EJECUTADO
-- Requiere aprobacion G1/G2/G3/G8 posterior a reconciliacion del canonico.
-- No es parte de init-global.sql; no registrar como aplicada.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.integracion_activacion_g1 ADD COLUMN IF NOT EXISTS payload_snapshot JSONB;
-- No reconstruir snapshots historicos desde Cliente: no prueba el RUT original.
COMMIT;
