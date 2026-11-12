BEGIN;
-- G8 additive proposal: baja por morosidad. PENDIENTE DE APROBACIÓN.
-- NO EJECUTAR en finet_global_validacion ni en la VPS sin autorización explícita del propietario del esquema.
-- Solo QA aislada y autorizada. Sin datos, sin backfill: las solicitudes históricas quedan sin vínculo.
--
-- Propietario: G8 (CRM). Esquema privado, igual que g8_contratos (001_contract_signatures.sql):
--   * no altera tablas públicas compartidas (ticket, solicitud_retiro_servicio, unidad_equipo, orden_trabajo);
--   * no declara FK ni triggers hacia public: crear estas tablas no toma locks sobre tablas de G1/G2/G3;
--   * la aplicación valida, bajo FOR UPDATE del servicio, que empresa, cliente, contrato, servicio, aviso y
--     ticket coinciden antes de insertar (src/g3-integration/service-withdrawal.service.ts).
-- Rollback: si no hubo uso, DROP SCHEMA g8_retiros CASCADE. Si hubo uso, no borrar: exportar y archivar.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE SCHEMA IF NOT EXISTS g8_retiros AUTHORIZATION CURRENT_USER;
REVOKE ALL ON SCHEMA g8_retiros FROM PUBLIC;

-- Relación estructurada solicitud ↔ aviso previo ↔ ticket CRM «Baja de servicio» (1:1:1).
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
    AND id_empresa > 0 AND id_cliente > 0 AND id_servicio > 0 AND id_contrato > 0)
);
CREATE INDEX IF NOT EXISTS solicitud_ticket_servicio_idx ON g8_retiros.solicitud_ticket (id_empresa, id_servicio);

-- Correlación con la OT de retiro de G3 y evidencia técnica recibida (una fila por solicitud).
-- Se escribe SOLO cuando exista el contrato S2S ratificado; G8 nunca la llena con datos inventados.
CREATE TABLE IF NOT EXISTS g8_retiros.solicitud_g3 (
  id_solicitud_retiro INTEGER NOT NULL,
  id_empresa INTEGER NOT NULL,
  clave_solicitud VARCHAR(100) NOT NULL,
  id_ot_g3 INTEGER,
  estado_despacho VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE',
  estado_ot VARCHAR(30),
  cierre_aprobado BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_cierre TIMESTAMPTZ(3),
  equipos_retirados JSONB NOT NULL DEFAULT '[]'::jsonb,
  equipos_faltantes JSONB NOT NULL DEFAULT '[]'::jsonb,
  ultima_clave_evento VARCHAR(100),
  aplicado_en TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT solicitud_g3_pkey PRIMARY KEY (id_solicitud_retiro),
  CONSTRAINT solicitud_g3_clave_key UNIQUE (clave_solicitud),
  CONSTRAINT solicitud_g3_ot_key UNIQUE (id_empresa, id_ot_g3),
  CONSTRAINT solicitud_g3_despacho_check CHECK (estado_despacho IN ('PENDIENTE', 'ENVIADA', 'ACEPTADA', 'RECHAZADA', 'ERROR')),
  CONSTRAINT solicitud_g3_aprobacion_check CHECK (NOT cierre_aprobado OR estado_ot = 'COMPLETADA'),
  CONSTRAINT solicitud_g3_equipos_check CHECK (jsonb_typeof(equipos_retirados) = 'array' AND jsonb_typeof(equipos_faltantes) = 'array')
);

COMMIT;

-- Endurecimiento OPCIONAL (decisión del propietario; toca una tabla pública propiedad de G8 y toma lock):
-- impide a nivel de base dos solicitudes activas del mismo servicio. Verificar antes que no existan duplicados.
-- CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS solicitud_retiro_servicio_activa_key
--   ON public.solicitud_retiro_servicio (id_servicio) WHERE estado NOT IN ('CANCELADA', 'CERRADA');
