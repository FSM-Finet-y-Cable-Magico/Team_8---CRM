BEGIN;
-- G8 additive proposal: withdrawal for morosity (BAJA) integrated with G3 and G1. PENDING APPROVAL.
-- DO NOT RUN on finet_global_validacion (G8's effective database on the VPS, finet-postgres-global, confirmed
-- 13-11-2026; shared with G1/G2/G3) or on any VPS database without explicit authorization of the schema owner.
-- First application: isolated QA with a prior backup and 002_service_withdrawal.verify.sql before and after.
-- No data and no backfill: historical requests stay unlinked; nothing is inferred from texts or audit rows.
--
-- Owner: G8 (CRM). Private schema, same policy as g8_contratos (001_contract_signatures.sql):
--   * does not alter shared public tables (ticket, solicitud_retiro_servicio, unidad_equipo, orden_trabajo);
--   * no FK or trigger towards public: creating these tables takes no lock on G1/G2/G3 tables;
--   * grants nothing to PUBLIC; runtime permissions are in 002_service_withdrawal.grants.sql (no DELETE).
-- Idempotent: IF NOT EXISTS for schema, tables and indexes; re-running it changes nothing.
-- Revision 2026-11-13 (supersedes PR #81 draft): stores the exact G3 request snapshot + trace_id for
-- idempotent retries, dispatch/OT state read by GET, BAJA closure evidence (key baja:{id_ot}) and the
-- G1 receptions as an insert-only history per clave_evento. No CHECK on G1 inventory states: the
-- reception result (RECIBIDO / RECIBIDO_CON_DANO / NO_RECIBIDO) is what the contract certifies.
-- Recovery: if unused, DROP SCHEMA g8_retiros CASCADE (only objects of this file). If used, do not drop:
--   pg_dump --schema=g8_retiros and archive. The application returns to BLOCKED mode without the schema.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE SCHEMA IF NOT EXISTS g8_retiros AUTHORIZATION CURRENT_USER;
REVOKE ALL ON SCHEMA g8_retiros FROM PUBLIC;

-- Request <-> previous notice <-> CRM ticket "Baja de servicio" (1:1:1).
CREATE TABLE IF NOT EXISTS g8_retiros.solicitud_ticket (
  id_solicitud_retiro INTEGER NOT NULL,
  id_ticket INTEGER NOT NULL,
  id_aviso INTEGER NOT NULL,
  id_empresa INTEGER NOT NULL,
  id_cliente INTEGER NOT NULL,
  id_servicio INTEGER NOT NULL,
  id_contrato INTEGER NOT NULL,
  id_usuario_responsable INTEGER NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT solicitud_ticket_pkey PRIMARY KEY (id_solicitud_retiro),
  CONSTRAINT solicitud_ticket_id_ticket_key UNIQUE (id_ticket),
  CONSTRAINT solicitud_ticket_ids_check CHECK (id_solicitud_retiro > 0 AND id_ticket > 0 AND id_aviso > 0
    AND id_empresa > 0 AND id_cliente > 0 AND id_servicio > 0 AND id_contrato > 0 AND id_usuario_responsable > 0)
);
CREATE INDEX IF NOT EXISTS solicitud_ticket_servicio_idx ON g8_retiros.solicitud_ticket (id_empresa, id_servicio);

-- G3 dispatch, OT state and technical closure evidence (one row per request).
CREATE TABLE IF NOT EXISTS g8_retiros.solicitud_g3 (
  id_solicitud_retiro INTEGER NOT NULL,
  id_empresa INTEGER NOT NULL,
  request_id VARCHAR(150) NOT NULL,
  trace_id UUID NOT NULL,
  payload_snapshot JSONB NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  estado_despacho VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE',
  intentos INTEGER NOT NULL DEFAULT 0,
  ultimo_intento_en TIMESTAMPTZ(3),
  ultimo_error_codigo VARCHAR(60),
  ultimo_error_status INTEGER,
  id_ot_g3 INTEGER,
  estado_ot VARCHAR(30),
  estado_ot_leido_en TIMESTAMPTZ(3),
  fecha_completada_g3 TIMESTAMPTZ(3),
  cierre_clave VARCHAR(100),
  cierre_hash CHAR(64),
  cierre_recibido_en TIMESTAMPTZ(3),
  equipos_retirados JSONB NOT NULL DEFAULT '[]'::jsonb,
  equipos_faltantes JSONB NOT NULL DEFAULT '[]'::jsonb,
  recepcion_clave_evento VARCHAR(150),
  recepcion_sincronizada_en TIMESTAMPTZ(3),
  aplicado_en TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT solicitud_g3_pkey PRIMARY KEY (id_solicitud_retiro),
  CONSTRAINT solicitud_g3_request_key UNIQUE (request_id),
  CONSTRAINT solicitud_g3_ot_key UNIQUE (id_empresa, id_ot_g3),
  CONSTRAINT solicitud_g3_request_check CHECK (request_id = 'g8-retiro-' || id_empresa || '-' || id_solicitud_retiro),
  CONSTRAINT solicitud_g3_hash_check CHECK (payload_hash ~ '^[0-9a-f]{64}$' AND (cierre_hash IS NULL OR cierre_hash ~ '^[0-9a-f]{64}$')),
  CONSTRAINT solicitud_g3_despacho_check CHECK (estado_despacho IN ('PENDIENTE', 'ENVIANDO', 'REINTENTABLE', 'ACEPTADA', 'RECHAZADA',
    'INCONSISTENTE', 'CANCELADA', 'CANCELACION_NO_APLICABLE')),
  CONSTRAINT solicitud_g3_estado_ot_check CHECK (estado_ot IS NULL OR estado_ot IN ('PENDIENTE', 'ASIGNADA', 'EN_CURSO',
    'PENDIENTE_CLIENTE_AUSENTE', 'PENDIENTE_APROBACION', 'COMPLETADA', 'CANCELADA')),
  CONSTRAINT solicitud_g3_cierre_check CHECK (cierre_clave IS NULL OR (id_ot_g3 IS NOT NULL AND cierre_clave = 'baja:' || id_ot_g3)),
  CONSTRAINT solicitud_g3_aplicado_check CHECK (aplicado_en IS NULL OR (estado_ot = 'COMPLETADA' AND cierre_clave IS NOT NULL
    AND recepcion_clave_evento IS NOT NULL)),
  CONSTRAINT solicitud_g3_intentos_check CHECK (intentos >= 0),
  CONSTRAINT solicitud_g3_equipos_check CHECK (jsonb_typeof(equipos_retirados) = 'array' AND jsonb_typeof(equipos_faltantes) = 'array')
);

-- G1 receptions: insert-only history per clave_evento (G1 changes the key when a closure is corrected).
-- solicitud_g3.recepcion_clave_evento points to the version in force; older versions stay as evidence.
CREATE TABLE IF NOT EXISTS g8_retiros.recepcion_g1 (
  id_solicitud_retiro INTEGER NOT NULL,
  id_empresa INTEGER NOT NULL,
  id_ot_g3 INTEGER NOT NULL,
  clave_evento VARCHAR(150) NOT NULL,
  numero_serie VARCHAR(100) NOT NULL,
  resultado VARCHAR(30) NOT NULL,
  -- NULL only when G1 does not know the serial for the company (G1 2131b7f5): it can then only be NO_RECIBIDO.
  estado_g1 VARCHAR(60),
  fecha_recepcion TIMESTAMPTZ(3),
  id_servicio_externo INTEGER,
  detalle VARCHAR(1000),
  estado_recepcion VARCHAR(30) NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT recepcion_g1_pkey PRIMARY KEY (id_solicitud_retiro, clave_evento, numero_serie),
  CONSTRAINT recepcion_g1_ot_serie_key UNIQUE (id_empresa, id_ot_g3, clave_evento, numero_serie),
  CONSTRAINT recepcion_g1_serie_check CHECK (numero_serie = upper(btrim(numero_serie)) AND numero_serie <> ''),
  CONSTRAINT recepcion_g1_resultado_check CHECK (resultado IN ('RECIBIDO', 'RECIBIDO_CON_DANO', 'NO_RECIBIDO')),
  CONSTRAINT recepcion_g1_estado_g1_check CHECK (estado_g1 IS NOT NULL OR resultado = 'NO_RECIBIDO'),
  CONSTRAINT recepcion_g1_clave_check CHECK (clave_evento ~ '^g1-recepcion-[1-9][0-9]*-[1-9][0-9]*-[1-9][0-9]*$'),
  CONSTRAINT recepcion_g1_estado_check CHECK (estado_recepcion IN ('COMPLETA', 'PARCIAL', 'NO_RECIBIDA', 'SIN_EQUIPOS_RETIRADOS'))
);
CREATE INDEX IF NOT EXISTS recepcion_g1_ot_idx ON g8_retiros.recepcion_g1 (id_empresa, id_ot_g3);

REVOKE ALL ON ALL TABLES IN SCHEMA g8_retiros FROM PUBLIC;
COMMIT;

-- OPTIONAL hardening (owner decision; touches a public table owned by G8 and takes a lock):
-- prevents two active requests for the same service at database level. Check first that there are no
-- duplicates (V5 of 002_service_withdrawal.verify.sql). CONCURRENTLY cannot run inside BEGIN/COMMIT.
-- CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS solicitud_retiro_servicio_activa_key
--   ON public.solicitud_retiro_servicio (id_servicio) WHERE estado NOT IN ('CANCELADA', 'CERRADA');
