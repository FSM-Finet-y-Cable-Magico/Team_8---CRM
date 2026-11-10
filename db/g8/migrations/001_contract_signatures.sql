BEGIN;
-- G8 additive proposal. Local QA only until the shared-schema reviewers approve.
CREATE SCHEMA IF NOT EXISTS g8_contratos AUTHORIZATION CURRENT_USER;
REVOKE ALL ON SCHEMA g8_contratos FROM PUBLIC;
CREATE TABLE IF NOT EXISTS g8_contratos.solicitud_firma (
  id_solicitud UUID NOT NULL,
  id_empresa INTEGER NOT NULL,
  id_contrato INTEGER NOT NULL,
  id_contrato_digital INTEGER NOT NULL,
  id_usuario_creador INTEGER NOT NULL,
  version INTEGER NOT NULL,
  token_hash CHAR(64) NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'BORRADOR',
  destinatario VARCHAR(120) NOT NULL,
  datos_snapshot JSONB NOT NULL,
  hash_original CHAR(64) NOT NULL,
  pdf_original BYTEA NOT NULL,
  fecha_creacion TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_expiracion TIMESTAMPTZ(3) NOT NULL,
  otp_hash CHAR(64),
  otp_expiracion TIMESTAMPTZ(3),
  otp_solicitado TIMESTAMPTZ(3),
  otp_envios INTEGER NOT NULL DEFAULT 0,
  otp_intentos INTEGER NOT NULL DEFAULT 0,
  pdf_visto TIMESTAMPTZ(3),
  correo_estado VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE',
  firma_fecha TIMESTAMPTZ(3),
  firma_ip VARCHAR(45),
  firma_user_agent VARCHAR(200),
  consentimiento_version VARCHAR(40),
  pdf_firmado BYTEA,
  hash_firmado CHAR(64),
  firma_correo_estado VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE',
  motivo_anulacion VARCHAR(40),
  CONSTRAINT solicitud_firma_pkey PRIMARY KEY (id_solicitud),
  CONSTRAINT firma_state_check CHECK (estado IN ('BORRADOR','PENDIENTE','FIRMADA','ANULADA','EXPIRADA')),
  CONSTRAINT firma_version_check CHECK (version >= 1),
  CONSTRAINT firma_hash_check CHECK (token_hash ~ '^[a-f0-9]{64}$' AND hash_original ~ '^[a-f0-9]{64}$'),
  CONSTRAINT firma_otp_check CHECK (otp_envios >= 0 AND otp_envios <= 5 AND otp_intentos >= 0 AND otp_intentos <= 5 AND (otp_hash IS NULL OR otp_hash ~ '^[a-f0-9]{64}$')),
  CONSTRAINT firma_pdf_check CHECK (octet_length(pdf_original) >= 5 AND octet_length(pdf_original) <= 4194304 AND (pdf_firmado IS NULL OR octet_length(pdf_firmado) >= 5 AND octet_length(pdf_firmado) <= 5242880)),
  CONSTRAINT firma_snapshot_check CHECK (jsonb_typeof(datos_snapshot) = 'object'),
  CONSTRAINT firma_expiry_check CHECK (fecha_expiracion > fecha_creacion),
  CONSTRAINT firma_signed_check CHECK (estado <> 'FIRMADA' OR (firma_fecha IS NOT NULL AND pdf_firmado IS NOT NULL AND hash_firmado IS NOT NULL AND hash_firmado ~ '^[a-f0-9]{64}$' AND consentimiento_version IS NOT NULL AND pdf_visto IS NOT NULL AND otp_hash IS NULL)),
  CONSTRAINT firma_mail_check CHECK (correo_estado IN ('PENDIENTE','EN_PROCESO','ENVIADO','SIMULADO','INDETERMINADO','FALLIDO') AND firma_correo_estado IN ('PENDIENTE','EN_PROCESO','ENVIADO','SIMULADO','INDETERMINADO','FALLIDO'))
);
CREATE UNIQUE INDEX IF NOT EXISTS firma_token_key ON g8_contratos.solicitud_firma (token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS firma_document_key ON g8_contratos.solicitud_firma (id_contrato_digital);
CREATE UNIQUE INDEX IF NOT EXISTS firma_pending_contract_key ON g8_contratos.solicitud_firma (id_contrato) WHERE estado = 'PENDIENTE';
CREATE INDEX IF NOT EXISTS firma_company_contract_idx ON g8_contratos.solicitud_firma (id_empresa, id_contrato);
CREATE UNIQUE INDEX IF NOT EXISTS firma_version_key ON g8_contratos.solicitud_firma (id_contrato, version);
REVOKE ALL ON ALL TABLES IN SCHEMA g8_contratos FROM PUBLIC;
COMMIT;
