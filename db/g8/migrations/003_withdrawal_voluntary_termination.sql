BEGIN;
-- G8 additive proposal (complements 002_service_withdrawal.sql). PENDING APPROVAL by the schema owner.
-- DO NOT RUN on finet_global_validacion or any VPS database without explicit authorization; same procedure as 002:
-- isolated QA first, prior backup, 003_withdrawal_voluntary_termination.verify.sql before and after.
-- Private schema g8_retiros only: no public table is altered, no FK/trigger towards public, nothing granted to PUBLIC.
-- Idempotent: re-running it changes nothing. No data and no backfill.
--
-- Why (FINET 13-11-2026, adjustment to Documento 2):
--   1. The commercial baja for morosity is applied once G3 approves the BAJA OT (COMPLETADA) and the closure is
--      correlated; the G1 warehouse reception is informative. 002's solicitud_g3_aplicado_check still required
--      recepcion_clave_evento, so marking the request as applied would FAIL in PostgreSQL without a G1 reception
--      (in-memory tests cannot see it). It is replaced by the same check without the reception.
--   2. One withdrawal engine, two causes: MOROSIDAD (previous notice mandatory, as in 002) and VOLUNTARIA (customer's own
--      termination, started from Tickets: there is NO collection notice and none is fabricated). solicitud_ticket gets
--      the cause, and id_aviso becomes required only for MOROSIDAD.
--   3. termino_servicio records the voluntary commercial termination (applied immediately, without waiting for the
--      technical visit, G1 or G3), the requirement date/time, channel, requester type and evidence reference, and the
--      technical withdrawal it relies on. Debt, invoices and payments stay in their public tables, untouched.
-- Recovery: if unused, DROP TABLE g8_retiros.termino_servicio; restore the two 002 constraints (see 002). If used, do
--   not drop: pg_dump --schema=g8_retiros and archive. Without this file the application answers BLOCKED.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- 1. Commercial baja does not require a G1 reception (identity, approval and closure evidence still required).
ALTER TABLE g8_retiros.solicitud_g3 DROP CONSTRAINT IF EXISTS solicitud_g3_aplicado_check;
ALTER TABLE g8_retiros.solicitud_g3 ADD CONSTRAINT solicitud_g3_aplicado_check
  CHECK (aplicado_en IS NULL OR (estado_ot = 'COMPLETADA' AND cierre_clave IS NOT NULL));

-- 2. Cause of the request; the collection notice is mandatory only for MOROSIDAD.
ALTER TABLE g8_retiros.solicitud_ticket ADD COLUMN IF NOT EXISTS causa VARCHAR(20) NOT NULL DEFAULT 'MOROSIDAD';
ALTER TABLE g8_retiros.solicitud_ticket ALTER COLUMN id_aviso DROP NOT NULL;
ALTER TABLE g8_retiros.solicitud_ticket DROP CONSTRAINT IF EXISTS solicitud_ticket_ids_check;
ALTER TABLE g8_retiros.solicitud_ticket ADD CONSTRAINT solicitud_ticket_ids_check CHECK (id_solicitud_retiro > 0 AND id_ticket > 0
  AND (id_aviso IS NULL OR id_aviso > 0) AND id_empresa > 0 AND id_cliente > 0 AND id_servicio > 0 AND id_contrato > 0 AND id_usuario_responsable > 0);
ALTER TABLE g8_retiros.solicitud_ticket DROP CONSTRAINT IF EXISTS solicitud_ticket_causa_check;
ALTER TABLE g8_retiros.solicitud_ticket ADD CONSTRAINT solicitud_ticket_causa_check CHECK (
  (causa = 'MOROSIDAD' AND id_aviso IS NOT NULL) OR (causa = 'VOLUNTARIA' AND id_aviso IS NULL));

-- 3. Voluntary commercial termination (one per service: a terminated service is never reopened; a new contract creates a new service).
CREATE TABLE IF NOT EXISTS g8_retiros.termino_servicio (
  id_servicio INTEGER NOT NULL,
  id_empresa INTEGER NOT NULL,
  id_cliente INTEGER NOT NULL,
  id_contrato INTEGER NOT NULL,
  -- CRM ticket «Término de servicio» registered with the requirement.
  id_ticket INTEGER NOT NULL,
  -- Technical withdrawal (OT BAJA) this termination relies on: its own VOLUNTARIA request, or an active MOROSIDAD request
  -- already sent to G3 (no second OT). NULL only when the withdrawal data (address, RUT) is incomplete.
  id_solicitud_retiro INTEGER,
  requerimiento_en TIMESTAMPTZ(3) NOT NULL,
  canal VARCHAR(20) NOT NULL,
  solicitante VARCHAR(20) NOT NULL,
  evidencia VARCHAR(500) NOT NULL,
  id_usuario_responsable INTEGER NOT NULL,
  termino_comercial_en TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cierre_tecnico_en TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT termino_servicio_pkey PRIMARY KEY (id_servicio),
  CONSTRAINT termino_servicio_ticket_key UNIQUE (id_ticket),
  CONSTRAINT termino_servicio_solicitud_key UNIQUE (id_solicitud_retiro),
  CONSTRAINT termino_servicio_ids_check CHECK (id_servicio > 0 AND id_empresa > 0 AND id_cliente > 0 AND id_contrato > 0 AND id_ticket > 0
    AND (id_solicitud_retiro IS NULL OR id_solicitud_retiro > 0) AND id_usuario_responsable > 0),
  CONSTRAINT termino_servicio_canal_check CHECK (canal IN ('PRESENCIAL', 'TELEFONO', 'CORREO', 'WHATSAPP', 'PORTAL', 'OTRO')),
  CONSTRAINT termino_servicio_solicitante_check CHECK (solicitante IN ('TITULAR', 'REPRESENTANTE')),
  CONSTRAINT termino_servicio_evidencia_check CHECK (length(btrim(evidencia)) >= 5),
  CONSTRAINT termino_servicio_cierre_check CHECK (cierre_tecnico_en IS NULL OR id_solicitud_retiro IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS termino_servicio_empresa_idx ON g8_retiros.termino_servicio (id_empresa, id_cliente);

REVOKE ALL ON ALL TABLES IN SCHEMA g8_retiros FROM PUBLIC;
COMMIT;
