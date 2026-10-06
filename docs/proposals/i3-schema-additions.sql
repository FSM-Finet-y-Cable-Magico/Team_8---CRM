-- PROPOSAL ONLY. Requires reviewed G2/global baseline; not an idempotent bootstrap.
-- Do not execute against a shared database without coordinated migration review.

-- 20261003010000_i3_tax_emission_intents; SHA256-LF 8801ae316408ab19e28d96a4b4057a52f6b85e6bee42f65908765485e413935f
-- Proposed independently of G2. Do not apply until the owning team reviews it.
CREATE TABLE "tax_emission_intent" (
    "id_intencion" UUID NOT NULL,
    "id_empresa" INTEGER NOT NULL,
    "id_factura" INTEGER NOT NULL,
    "id_pago" INTEGER,
    "business_key" VARCHAR(120) NOT NULL,
    "policy_version" VARCHAR(64) NOT NULL,
    "ambiente" VARCHAR(20) NOT NULL,
    "proveedor" VARCHAR(30) NOT NULL DEFAULT 'FACTURACION_CL',
    "tipo_dte" INTEGER NOT NULL,
    "formato" INTEGER NOT NULL,
    "fingerprint" CHAR(64) NOT NULL,
    "folio_esperado" VARCHAR(10) NOT NULL,
    "estado" VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "claim_id" UUID,
    "folio" VARCHAR(10),
    "ultimo_error" VARCHAR(64),
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_inicio" TIMESTAMPTZ(3),
    "fecha_envio" TIMESTAMPTZ(3),
    "fecha_actualizacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tax_emission_intent_pkey" PRIMARY KEY ("id_intencion"),
    CONSTRAINT "tax_intent_company_fk" FOREIGN KEY ("id_empresa") REFERENCES "empresa"("id_empresa") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "tax_intent_invoice_fk" FOREIGN KEY ("id_factura") REFERENCES "factura"("id_factura") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "tax_intent_payment_fk" FOREIGN KEY ("id_pago") REFERENCES "pago"("id_pago") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "tax_intent_environment_check" CHECK ("ambiente" IN ('sandbox', 'production')),
    CONSTRAINT "tax_intent_provider_check" CHECK ("proveedor" = 'FACTURACION_CL'),
    CONSTRAINT "tax_intent_type_check" CHECK ("tipo_dte" IN (33, 34, 39, 41)),
    CONSTRAINT "tax_intent_format_check" CHECK (("tipo_dte" IN (33, 34) AND "formato" = 2) OR ("tipo_dte" IN (39, 41) AND "formato" = 1)),
    CONSTRAINT "tax_intent_fingerprint_check" CHECK ("fingerprint" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "tax_intent_expected_folio_check" CHECK ("folio_esperado" ~ '^[1-9][0-9]{0,9}$'),
    CONSTRAINT "tax_intent_state_check" CHECK ("estado" IN ('PENDIENTE', 'EN_PROCESO', 'GENERADO', 'FALLIDO', 'RESULTADO_INDETERMINADO')),
    CONSTRAINT "tax_intent_attempts_check" CHECK ("intentos" >= 0),
    CONSTRAINT "tax_intent_claim_check" CHECK ("estado" <> 'EN_PROCESO' OR ("claim_id" IS NOT NULL AND "fecha_inicio" IS NOT NULL)),
    CONSTRAINT "tax_intent_generated_check" CHECK ("estado" <> 'GENERADO' OR ("folio" IS NOT NULL AND "folio" = "folio_esperado"))
);
CREATE UNIQUE INDEX "tax_emission_intent_id_empresa_ambiente_business_key_key" ON "tax_emission_intent"("id_empresa", "ambiente", "business_key");
CREATE INDEX "tax_emission_intent_id_empresa_estado_fecha_actualizacion_idx" ON "tax_emission_intent"("id_empresa", "estado", "fecha_actualizacion");

-- 20261003020000_i3_tax_payment_pipeline; SHA256-LF e22e56b7a5ec22cbbea3875383e279e0426e3d71cd54fa6c47d2beecc345e46a
-- Additive G8 proposal. Apply only to an explicitly isolated QA database until
-- the shared-schema owner incorporates it. No G2 migration/global DDL is edited.
ALTER TABLE tax_emission_intent DROP CONSTRAINT tax_intent_expected_folio_check;
ALTER TABLE tax_emission_intent ADD CONSTRAINT tax_intent_expected_folio_check
  CHECK (folio_esperado ~ '^[1-9][0-9]{0,9}$' OR (folio_esperado = '0' AND tipo_dte IN (39,41)));
ALTER TABLE tax_emission_intent DROP CONSTRAINT tax_intent_generated_check;
ALTER TABLE tax_emission_intent ADD CONSTRAINT tax_intent_generated_check
  CHECK (estado <> 'GENERADO' OR (folio IS NOT NULL AND folio ~ '^[1-9][0-9]{0,9}$' AND (folio = folio_esperado OR (folio_esperado = '0' AND tipo_dte IN (39,41)))));
ALTER TABLE tax_emission_intent
  ADD COLUMN artefacto_url TEXT,
  ADD COLUMN artefacto_estado VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE',
  ADD COLUMN email_estado VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE',
  ADD COLUMN fecha_email_inicio TIMESTAMPTZ(3);
ALTER TABLE tax_emission_intent ADD CONSTRAINT tax_intent_artifact_check
  CHECK (artefacto_estado IN ('PENDIENTE','DISPONIBLE','FALLIDO'));
ALTER TABLE tax_emission_intent ADD CONSTRAINT tax_intent_email_check
  CHECK (email_estado IN ('PENDIENTE','NO_CONFIGURADO','SIN_DESTINATARIO','EN_PROCESO','ENVIADO','RESULTADO_INDETERMINADO'));
CREATE UNIQUE INDEX tax_intent_generated_folio_key
  ON tax_emission_intent (id_empresa,ambiente,tipo_dte,folio) WHERE estado='GENERADO';

CREATE TABLE tax_payment_job (
  id_trabajo UUID PRIMARY KEY,
  id_empresa INTEGER NOT NULL REFERENCES empresa(id_empresa) ON DELETE RESTRICT ON UPDATE CASCADE,
  id_factura INTEGER NOT NULL REFERENCES factura(id_factura) ON DELETE RESTRICT ON UPDATE CASCADE,
  id_pago INTEGER NOT NULL UNIQUE REFERENCES pago(id_pago) ON DELETE RESTRICT ON UPDATE CASCADE,
  id_cliente INTEGER NOT NULL,
  monto NUMERIC(10,2) NOT NULL CHECK (monto > 0),
  ambiente VARCHAR(20) NOT NULL DEFAULT 'sandbox' CHECK (ambiente='sandbox'),
  policy_version VARCHAR(64) NOT NULL,
  profile_hash CHAR(64) NOT NULL CHECK (profile_hash ~ '^[a-f0-9]{64}$'),
  documento BYTEA,
  tipo_dte INTEGER CHECK (tipo_dte IN (33,34,39,41)),
  formato INTEGER CHECK (formato IN (1,2)),
  folio_esperado VARCHAR(10),
  email VARCHAR(120),
  nombre_cliente VARCHAR(120) NOT NULL,
  estado VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','DATOS_REQUERIDOS','PROCESADO')),
  ultimo_error VARCHAR(64),
  fecha_creacion TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT tax_job_pending_document_check CHECK (estado <> 'PENDIENTE' OR
    (documento IS NOT NULL AND octet_length(documento)>0 AND tipo_dte IS NOT NULL AND formato IS NOT NULL AND folio_esperado IS NOT NULL)),
  CONSTRAINT tax_job_document_format_check CHECK ((tipo_dte IN (33,34) AND formato=2) OR (tipo_dte IN (39,41) AND formato=1)),
  CONSTRAINT tax_job_folio_check CHECK (folio_esperado ~ '^[1-9][0-9]{0,9}$' OR (folio_esperado='0' AND tipo_dte IN (39,41)))
);
CREATE INDEX tax_payment_job_estado_fecha_creacion_idx ON tax_payment_job(estado,fecha_creacion);
CREATE UNIQUE INDEX tax_job_reserved_folio_key ON tax_payment_job(id_empresa,tipo_dte,folio_esperado)
  WHERE folio_esperado <> '0';

-- 20261004010000_i3_tax_smtp_delivery; SHA256-LF 795ed81c082689b9dd8100736232913b60bbf98dbf73244395a523dac4544be8
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

-- 20261004020000_i3_whatsapp_notifications; SHA256-LF bc449f08c51fe23b4e0d0e3825d4d0293fdeb726917c6f37c6f7218d742b20a7
-- Additive proposal; coordinate with the shared schema owner before deployment.
ALTER TABLE log_notificacion
  ALTER COLUMN estado_envio TYPE VARCHAR(30),
  ADD COLUMN id_empresa INTEGER REFERENCES empresa(id_empresa) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD COLUMN proveedor VARCHAR(20),
  ADD COLUMN correlation_id UUID,
  ADD COLUMN payload_hash CHAR(64),
  ADD COLUMN provider_message_id VARCHAR(512),
  ADD COLUMN mensaje JSONB,
  ADD COLUMN intentos INTEGER NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  ADD COLUMN fecha_inicio TIMESTAMPTZ(3),
  ADD COLUMN ultimo_error VARCHAR(64);
CREATE UNIQUE INDEX log_notificacion_correlation_id_key ON log_notificacion(correlation_id);
CREATE UNIQUE INDEX log_notificacion_provider_message_id_key ON log_notificacion(provider_message_id);
CREATE INDEX log_notificacion_proveedor_estado_envio_fecha_envio_idx ON log_notificacion(proveedor,estado_envio,fecha_envio);

-- 20261004030000_i3_mail_simulated_delivery; SHA256-LF bd9f4e46130758548d1d35264e6a43e2b223b22fac1d3d58c88a1890f49c7b2c
-- Independent proposal: simulated delivery must never be represented as sent.
ALTER TABLE tax_emission_intent DROP CONSTRAINT tax_intent_email_check;
ALTER TABLE tax_emission_intent ADD CONSTRAINT tax_intent_email_check CHECK
  (email_estado IN ('PENDIENTE','NO_CONFIGURADO','SIN_DESTINATARIO','EN_PROCESO',
    'ENVIADO','RESULTADO_INDETERMINADO','REINTENTO_PENDIENTE','FALLIDO','SIMULADO'));
