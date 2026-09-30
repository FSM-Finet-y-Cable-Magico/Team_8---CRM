-- HISTORICAL_PROPOSAL / APLICADA_POR_OPERADOR_Y_CANONIZADA_2026-09-29
-- La extension fue aplicada manualmente por el operador y ahora forma parte de
-- db/global/init-global.sql. Este archivo se conserva solo como trazabilidad.
-- NO VOLVER A EJECUTAR desde esta rama.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.integracion_activacion_g1 ADD COLUMN IF NOT EXISTS payload_snapshot JSONB;
-- No reconstruir snapshots historicos desde Cliente: no prueba el RUT original.
COMMIT;
