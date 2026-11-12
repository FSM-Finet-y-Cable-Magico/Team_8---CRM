BEGIN;
-- G8 additive proposal: excepción comercial por equipos no recuperados. PENDIENTE DE APROBACIÓN. NO EJECUTAR.
-- Requiere 002_service_withdrawal.sql. Solo registra una decisión explícita y trazable de un responsable:
--   * no marca el equipo como recuperado ni disponible (eso pertenece a G1);
--   * no genera cargos ni modifica deuda, facturas o pagos;
--   * mientras UNRECOVERED_EQUIPMENT_EXCEPTION_ENABLED = false (backend), la aplicación no lee esta tabla.
-- Append-only: una decisión se revoca con otra fila (REVOCADA), nunca con UPDATE ni DELETE.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS g8_retiros.excepcion_no_recuperado (
  id_excepcion SERIAL NOT NULL,
  id_solicitud_retiro INTEGER NOT NULL,
  id_empresa INTEGER NOT NULL,
  id_ot_g3 INTEGER NOT NULL,
  numero_serie VARCHAR(80) NOT NULL,
  decision VARCHAR(20) NOT NULL,
  motivo VARCHAR(500) NOT NULL,
  id_usuario_autoriza INTEGER NOT NULL,
  id_auditoria BIGINT NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT excepcion_no_recuperado_pkey PRIMARY KEY (id_excepcion),
  CONSTRAINT excepcion_no_recuperado_auditoria_key UNIQUE (id_auditoria),
  CONSTRAINT excepcion_no_recuperado_decision_check CHECK (decision IN ('AUTORIZADA', 'REVOCADA')),
  CONSTRAINT excepcion_no_recuperado_motivo_check CHECK (btrim(motivo) <> ''),
  CONSTRAINT excepcion_no_recuperado_serie_check CHECK (numero_serie = upper(btrim(numero_serie)) AND numero_serie <> ''),
  CONSTRAINT excepcion_no_recuperado_ids_check CHECK (id_solicitud_retiro > 0 AND id_empresa > 0 AND id_ot_g3 > 0 AND id_usuario_autoriza > 0)
);
CREATE INDEX IF NOT EXISTS excepcion_no_recuperado_solicitud_idx ON g8_retiros.excepcion_no_recuperado (id_solicitud_retiro, numero_serie, id_excepcion);
REVOKE ALL ON ALL TABLES IN SCHEMA g8_retiros FROM PUBLIC;
COMMIT;
-- Permisos (cuando se apruebe): GRANT SELECT, INSERT ON g8_retiros.excepcion_no_recuperado y USAGE de su secuencia al rol de la aplicación.
