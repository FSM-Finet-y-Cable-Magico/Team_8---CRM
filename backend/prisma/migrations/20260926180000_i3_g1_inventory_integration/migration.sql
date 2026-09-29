CREATE TABLE "integracion_activacion_g1" (
    "id_integracion" SERIAL NOT NULL,
    "id_empresa" INTEGER NOT NULL,
    "id_cliente" INTEGER NOT NULL,
    "id_servicio" INTEGER NOT NULL,
    "id_contrato" INTEGER NOT NULL,
    "id_ot_g3" VARCHAR(100) NOT NULL,
    "numero_serie" VARCHAR(80),
    "event_id" VARCHAR(120) NOT NULL,
    "trace_id" VARCHAR(120) NOT NULL,
    "estado_integracion" VARCHAR(50) NOT NULL DEFAULT 'PENDIENTE_ENVIO',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "ultimo_intento" TIMESTAMP(3),
    "ultimo_error_sanitizado" VARCHAR(500),
    "payload_hash" CHAR(64) NOT NULL,
    "respuesta_estado_g1" JSONB,
    "fecha_completado" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "integracion_activacion_g1_pkey" PRIMARY KEY ("id_integracion")
);

CREATE UNIQUE INDEX "integracion_activacion_g1_event_id_key"
ON "integracion_activacion_g1"("event_id");

CREATE INDEX "integracion_activacion_g1_empresa_estado_created_idx"
ON "integracion_activacion_g1"("id_empresa", "estado_integracion", "created_at");

CREATE INDEX "integracion_activacion_g1_servicio_created_idx"
ON "integracion_activacion_g1"("id_servicio", "created_at");

ALTER TABLE "integracion_activacion_g1"
ADD CONSTRAINT "integracion_activacion_g1_empresa_fkey"
FOREIGN KEY ("id_empresa") REFERENCES "empresa"("id_empresa") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "integracion_activacion_g1"
ADD CONSTRAINT "integracion_activacion_g1_cliente_fkey"
FOREIGN KEY ("id_cliente") REFERENCES "cliente"("id_cliente") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "integracion_activacion_g1"
ADD CONSTRAINT "integracion_activacion_g1_servicio_fkey"
FOREIGN KEY ("id_servicio") REFERENCES "servicio_contratado"("id_servicio") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "integracion_activacion_g1"
ADD CONSTRAINT "integracion_activacion_g1_contrato_fkey"
FOREIGN KEY ("id_contrato") REFERENCES "contrato"("id_contrato") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "garantia_comercial" (
    "id_garantia" SERIAL NOT NULL,
    "id_empresa" INTEGER NOT NULL,
    "id_cliente" INTEGER NOT NULL,
    "id_servicio" INTEGER NOT NULL,
    "id_contrato" INTEGER NOT NULL,
    "numero_serie_equipo" VARCHAR(80),
    "tipo" VARCHAR(60) NOT NULL,
    "fecha_inicio" DATE NOT NULL,
    "fecha_termino" DATE NOT NULL,
    "cobertura" TEXT NOT NULL,
    "monto" DECIMAL(12,2),
    "observaciones" TEXT,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'ACTIVA',
    "id_usuario_responsable" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "garantia_comercial_pkey" PRIMARY KEY ("id_garantia")
);

CREATE INDEX "garantia_comercial_empresa_estado_fecha_idx"
ON "garantia_comercial"("id_empresa", "estado", "fecha_termino");

CREATE INDEX "garantia_comercial_cliente_fecha_idx"
ON "garantia_comercial"("id_cliente", "fecha_inicio");

CREATE INDEX "garantia_comercial_servicio_estado_idx"
ON "garantia_comercial"("id_servicio", "estado");

CREATE UNIQUE INDEX "garantia_comercial_activa_periodo_key"
ON "garantia_comercial"("id_servicio", "tipo", "fecha_inicio", "fecha_termino")
WHERE "estado" = 'ACTIVA';

ALTER TABLE "garantia_comercial"
ADD CONSTRAINT "garantia_comercial_empresa_fkey"
FOREIGN KEY ("id_empresa") REFERENCES "empresa"("id_empresa") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "garantia_comercial"
ADD CONSTRAINT "garantia_comercial_cliente_fkey"
FOREIGN KEY ("id_cliente") REFERENCES "cliente"("id_cliente") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "garantia_comercial"
ADD CONSTRAINT "garantia_comercial_servicio_fkey"
FOREIGN KEY ("id_servicio") REFERENCES "servicio_contratado"("id_servicio") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "garantia_comercial"
ADD CONSTRAINT "garantia_comercial_contrato_fkey"
FOREIGN KEY ("id_contrato") REFERENCES "contrato"("id_contrato") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "garantia_comercial"
ADD CONSTRAINT "garantia_comercial_responsable_fkey"
FOREIGN KEY ("id_usuario_responsable") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
