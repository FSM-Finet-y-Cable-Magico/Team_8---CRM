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
