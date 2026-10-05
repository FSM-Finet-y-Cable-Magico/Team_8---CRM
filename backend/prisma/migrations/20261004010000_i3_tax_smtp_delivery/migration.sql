-- Additive SMTP delivery state. Apply only to the isolated local QA database;
-- the shared-schema owner must review it before any shared deployment.
ALTER TABLE tax_emission_intent
  ADD COLUMN email_intentos INTEGER NOT NULL DEFAULT 0 CHECK (email_intentos >= 0),
  ADD COLUMN fecha_proximo_email TIMESTAMPTZ(3),
  ADD COLUMN ultimo_error_email VARCHAR(64);
ALTER TABLE tax_emission_intent DROP CONSTRAINT tax_intent_email_check;
ALTER TABLE tax_emission_intent ADD CONSTRAINT tax_intent_email_check CHECK
  (email_estado IN ('PENDIENTE','NO_CONFIGURADO','SIN_DESTINATARIO','EN_PROCESO',
    'ENVIADO','RESULTADO_INDETERMINADO','REINTENTO_PENDIENTE','FALLIDO'));
CREATE INDEX tax_intent_email_pending_idx
  ON tax_emission_intent(id_empresa,email_estado,fecha_proximo_email)
  WHERE estado='GENERADO';
