-- Preparation only: apply to shared environments solely after schema-owner review.
-- Keep financial ownership, id_pago uniqueness and existing sandbox rows unchanged.
BEGIN;
ALTER TABLE tax_payment_job DROP CONSTRAINT tax_payment_job_ambiente_check;
ALTER TABLE tax_payment_job ADD CONSTRAINT tax_job_environment_check
  CHECK (ambiente IN ('sandbox', 'production'));
DROP INDEX tax_job_reserved_folio_key;
CREATE UNIQUE INDEX tax_job_reserved_folio_key
  ON tax_payment_job (id_empresa, ambiente, tipo_dte, folio_esperado)
  WHERE folio_esperado <> '0';
COMMIT;
