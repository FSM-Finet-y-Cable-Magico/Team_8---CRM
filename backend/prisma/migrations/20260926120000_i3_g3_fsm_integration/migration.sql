ALTER TABLE "servicio_contratado"
  ADD COLUMN "fecha_activacion" TIMESTAMP(3);

CREATE TABLE "integracion_instalacion_g3" (
  "id_integracion" SERIAL NOT NULL,
  "id_empresa" INTEGER NOT NULL,
  "id_prospecto" INTEGER,
  "id_cliente" INTEGER,
  "id_contrato" INTEGER NOT NULL,
  "id_plan" INTEGER NOT NULL,
  "id_servicio" INTEGER,
  "request_id" UUID NOT NULL,
  "trace_id" UUID NOT NULL,
  "id_ot_g3" VARCHAR(100),
  "codigo_ot_g3" VARCHAR(100),
  "estado_integracion" VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE_ENVIO',
  "estado_ot_g3" VARCHAR(50),
  "estado_original_g3" VARCHAR(100),
  "fecha_solicitud" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ultimo_intento" TIMESTAMP(3),
  "fecha_ultima_sincronizacion" TIMESTAMP(3),
  "intentos" INTEGER NOT NULL DEFAULT 0,
  "ultimo_error_sanitizado" TEXT,
  "payload_hash" CHAR(64) NOT NULL,
  "payload_snapshot" JSONB NOT NULL,
  "fecha_cierre_procesado" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "integracion_instalacion_g3_pkey" PRIMARY KEY ("id_integracion"),
  CONSTRAINT "integracion_instalacion_g3_estado_check" CHECK ("estado_integracion" IN ('PENDIENTE_ENVIO', 'ENVIADA', 'EN_SEGUIMIENTO', 'COMPLETADA', 'FALLIDA_REINTENTABLE', 'FALLIDA_DEFINITIVA')),
  CONSTRAINT "integracion_instalacion_g3_intentos_check" CHECK ("intentos" >= 0)
);

CREATE TABLE "integracion_evento_entrante" (
  "id_evento" SERIAL NOT NULL,
  "id_integracion" INTEGER NOT NULL,
  "source" VARCHAR(30) NOT NULL,
  "event_type" VARCHAR(50) NOT NULL,
  "external_reference" VARCHAR(120) NOT NULL,
  "payload_hash" CHAR(64) NOT NULL,
  "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "result" JSONB,
  CONSTRAINT "integracion_evento_entrante_pkey" PRIMARY KEY ("id_evento")
);

CREATE TABLE "solicitud_retiro_servicio" (
  "id_solicitud_retiro" SERIAL NOT NULL,
  "id_empresa" INTEGER NOT NULL,
  "id_cliente" INTEGER NOT NULL,
  "id_servicio" INTEGER NOT NULL,
  "id_contrato" INTEGER,
  "motivo" TEXT NOT NULL,
  "fecha_solicitada" DATE NOT NULL,
  "estado" VARCHAR(30) NOT NULL DEFAULT 'REGISTRADA',
  "estado_despacho_tecnico" VARCHAR(40) NOT NULL DEFAULT 'BLOQUEADO_CONTRATO_G3',
  "id_usuario_responsable" INTEGER NOT NULL,
  "observaciones" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "solicitud_retiro_servicio_pkey" PRIMARY KEY ("id_solicitud_retiro"),
  CONSTRAINT "solicitud_retiro_servicio_estado_check" CHECK ("estado" IN ('REGISTRADA', 'EN_GESTION', 'CANCELADA', 'CERRADA')),
  CONSTRAINT "solicitud_retiro_servicio_despacho_check" CHECK ("estado_despacho_tecnico" = 'BLOQUEADO_CONTRATO_G3'),
  CONSTRAINT "solicitud_retiro_servicio_motivo_check" CHECK (length(trim("motivo")) > 0)
);

CREATE UNIQUE INDEX "integracion_instalacion_g3_request_id_key" ON "integracion_instalacion_g3"("request_id");
CREATE INDEX "integracion_instalacion_g3_id_empresa_estado_integracion_fecha_solicitud_idx" ON "integracion_instalacion_g3"("id_empresa", "estado_integracion", "fecha_solicitud");
CREATE INDEX "integracion_instalacion_g3_id_empresa_id_ot_g3_idx" ON "integracion_instalacion_g3"("id_empresa", "id_ot_g3");
CREATE INDEX "integracion_instalacion_g3_id_empresa_codigo_ot_g3_idx" ON "integracion_instalacion_g3"("id_empresa", "codigo_ot_g3");
CREATE INDEX "integracion_instalacion_g3_id_contrato_fecha_solicitud_idx" ON "integracion_instalacion_g3"("id_contrato", "fecha_solicitud");
CREATE UNIQUE INDEX "integracion_evento_entrante_id_integracion_event_type_key" ON "integracion_evento_entrante"("id_integracion", "event_type");
CREATE INDEX "integracion_evento_entrante_external_reference_payload_hash_idx" ON "integracion_evento_entrante"("external_reference", "payload_hash");
CREATE INDEX "solicitud_retiro_empresa_estado_fecha_idx" ON "solicitud_retiro_servicio"("id_empresa", "estado", "fecha_solicitada");
CREATE INDEX "solicitud_retiro_servicio_id_servicio_created_at_idx" ON "solicitud_retiro_servicio"("id_servicio", "created_at");

ALTER TABLE "integracion_instalacion_g3" ADD CONSTRAINT "integracion_instalacion_g3_id_empresa_fkey" FOREIGN KEY ("id_empresa") REFERENCES "empresa"("id_empresa") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "integracion_instalacion_g3" ADD CONSTRAINT "integracion_instalacion_g3_id_prospecto_fkey" FOREIGN KEY ("id_prospecto") REFERENCES "prospecto"("id_prospecto") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "integracion_instalacion_g3" ADD CONSTRAINT "integracion_instalacion_g3_id_cliente_fkey" FOREIGN KEY ("id_cliente") REFERENCES "cliente"("id_cliente") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "integracion_instalacion_g3" ADD CONSTRAINT "integracion_instalacion_g3_id_contrato_fkey" FOREIGN KEY ("id_contrato") REFERENCES "contrato"("id_contrato") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "integracion_instalacion_g3" ADD CONSTRAINT "integracion_instalacion_g3_id_plan_fkey" FOREIGN KEY ("id_plan") REFERENCES "plan"("id_plan") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "integracion_instalacion_g3" ADD CONSTRAINT "integracion_instalacion_g3_id_servicio_fkey" FOREIGN KEY ("id_servicio") REFERENCES "servicio_contratado"("id_servicio") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "integracion_evento_entrante" ADD CONSTRAINT "integracion_evento_entrante_id_integracion_fkey" FOREIGN KEY ("id_integracion") REFERENCES "integracion_instalacion_g3"("id_integracion") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "solicitud_retiro_servicio" ADD CONSTRAINT "solicitud_retiro_servicio_id_empresa_fkey" FOREIGN KEY ("id_empresa") REFERENCES "empresa"("id_empresa") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "solicitud_retiro_servicio" ADD CONSTRAINT "solicitud_retiro_servicio_id_cliente_fkey" FOREIGN KEY ("id_cliente") REFERENCES "cliente"("id_cliente") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "solicitud_retiro_servicio" ADD CONSTRAINT "solicitud_retiro_servicio_id_servicio_fkey" FOREIGN KEY ("id_servicio") REFERENCES "servicio_contratado"("id_servicio") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "solicitud_retiro_servicio" ADD CONSTRAINT "solicitud_retiro_servicio_id_contrato_fkey" FOREIGN KEY ("id_contrato") REFERENCES "contrato"("id_contrato") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "solicitud_retiro_servicio" ADD CONSTRAINT "solicitud_retiro_servicio_id_usuario_responsable_fkey" FOREIGN KEY ("id_usuario_responsable") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
