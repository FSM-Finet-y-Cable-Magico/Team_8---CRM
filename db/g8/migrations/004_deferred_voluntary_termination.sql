BEGIN;
-- G8 private schema only. Apply after 003 with authorization of the schema owner.
-- FINET 17-11-2026: both causes wait for G3's approved closure before commercial termination.
-- Existing completed commercial terminations retain their original timestamp and behavior.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE g8_retiros.termino_servicio ALTER COLUMN termino_comercial_en DROP NOT NULL;
-- Preserve the 003 default for an older backend during rollout; the new backend explicitly inserts NULL.
COMMIT;
