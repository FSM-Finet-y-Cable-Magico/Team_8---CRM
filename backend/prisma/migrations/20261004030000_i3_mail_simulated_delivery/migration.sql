-- Independent proposal: simulated delivery must never be represented as sent.
ALTER TABLE tax_emission_intent DROP CONSTRAINT tax_intent_email_check;
ALTER TABLE tax_emission_intent ADD CONSTRAINT tax_intent_email_check CHECK
  (email_estado IN ('PENDIENTE','NO_CONFIGURADO','SIN_DESTINATARIO','EN_PROCESO',
    'ENVIADO','RESULTADO_INDETERMINADO','REINTENTO_PENDIENTE','FALLIDO','SIMULADO'));
