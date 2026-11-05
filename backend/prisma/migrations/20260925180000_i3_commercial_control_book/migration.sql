ALTER TABLE "prospecto"
  ADD COLUMN "clasificacion_comercial" VARCHAR(40) NOT NULL DEFAULT 'PROSPECTO',
  ADD COLUMN "disponible_remarketing" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "factura"
  ADD COLUMN "tipo_documento" VARCHAR(30),
  ADD COLUMN "folio_externo" VARCHAR(80);

CREATE TABLE "evento_gestion_comercial" (
  "id_evento" SERIAL NOT NULL,
  "id_empresa" INTEGER NOT NULL,
  "id_cliente" INTEGER NOT NULL,
  "id_servicio" INTEGER,
  "id_contrato" INTEGER,
  "id_factura" INTEGER,
  "tipo" VARCHAR(40) NOT NULL,
  "canal" VARCHAR(20) NOT NULL,
  "estado_gestion" VARCHAR(30) NOT NULL DEFAULT 'REGISTRADO',
  "fecha" TIMESTAMPTZ(3) NOT NULL,
  "observacion" TEXT,
  "id_usuario_responsable" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "evento_gestion_comercial_pkey" PRIMARY KEY ("id_evento"),
  CONSTRAINT "evento_gestion_comercial_tipo_check" CHECK ("tipo" IN ('AVISO_PREVENTIVO', 'ULTIMO_AVISO_CORTE', 'AVISO_PREVIO_RETIRO', 'CONTACTO_CLIENTE', 'OTRO_EVENTO_COMERCIAL')),
  CONSTRAINT "evento_gestion_comercial_canal_check" CHECK ("canal" IN ('TELEFONO', 'EMAIL', 'WHATSAPP', 'PRESENCIAL', 'OTRO'))
);

CREATE TABLE "convenio_pago" (
  "id_convenio" SERIAL NOT NULL,
  "id_empresa" INTEGER NOT NULL,
  "id_cliente" INTEGER NOT NULL,
  "id_servicio" INTEGER,
  "id_contrato" INTEGER,
  "id_factura" INTEGER,
  "monto_comprometido" DECIMAL(12,2) NOT NULL,
  "cantidad_cuotas" SMALLINT NOT NULL,
  "condiciones" TEXT NOT NULL,
  "fecha_inicio" DATE NOT NULL,
  "estado" VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  "id_usuario_responsable" INTEGER NOT NULL,
  "id_usuario_aprobador" INTEGER,
  "fecha_registro" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fecha_aprobacion" TIMESTAMPTZ(3),
  CONSTRAINT "convenio_pago_pkey" PRIMARY KEY ("id_convenio"),
  CONSTRAINT "convenio_pago_monto_check" CHECK ("monto_comprometido" > 0),
  CONSTRAINT "convenio_pago_cuotas_check" CHECK ("cantidad_cuotas" > 0),
  CONSTRAINT "convenio_pago_estado_check" CHECK ("estado" IN ('PENDIENTE', 'APROBADO', 'ACTIVO', 'CUMPLIDO', 'INCUMPLIDO', 'CANCELADO'))
);

CREATE TABLE "cuota_convenio_pago" (
  "id_cuota" SERIAL NOT NULL,
  "id_convenio" INTEGER NOT NULL,
  "numero" SMALLINT NOT NULL,
  "monto" DECIMAL(12,2) NOT NULL,
  "fecha_vencimiento" DATE NOT NULL,
  "estado" VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  "fecha_pago" DATE,
  CONSTRAINT "cuota_convenio_pago_pkey" PRIMARY KEY ("id_cuota"),
  CONSTRAINT "cuota_convenio_pago_numero_check" CHECK ("numero" > 0),
  CONSTRAINT "cuota_convenio_pago_monto_check" CHECK ("monto" > 0),
  CONSTRAINT "cuota_convenio_pago_estado_check" CHECK ("estado" IN ('PENDIENTE', 'PAGADA', 'VENCIDA', 'CANCELADA'))
);

CREATE TABLE "prorroga_pago" (
  "id_prorroga" SERIAL NOT NULL,
  "id_empresa" INTEGER NOT NULL,
  "id_cliente" INTEGER NOT NULL,
  "id_contrato" INTEGER,
  "id_factura" INTEGER NOT NULL,
  "fecha_original" DATE NOT NULL,
  "nueva_fecha" DATE NOT NULL,
  "motivo" TEXT NOT NULL,
  "estado" VARCHAR(20) NOT NULL DEFAULT 'APROBADA',
  "id_usuario_responsable" INTEGER NOT NULL,
  "fecha_registro" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "prorroga_pago_pkey" PRIMARY KEY ("id_prorroga"),
  CONSTRAINT "prorroga_pago_fecha_check" CHECK ("nueva_fecha" > "fecha_original"),
  CONSTRAINT "prorroga_pago_estado_check" CHECK ("estado" IN ('PENDIENTE', 'APROBADA', 'CUMPLIDA', 'VENCIDA', 'CANCELADA'))
);

CREATE TABLE "cambio_condicion_pago" (
  "id_cambio" SERIAL NOT NULL,
  "id_empresa" INTEGER NOT NULL,
  "id_cliente" INTEGER NOT NULL,
  "id_contrato" INTEGER,
  "id_factura" INTEGER,
  "tipo_cambio" VARCHAR(30) NOT NULL,
  "valor_anterior" VARCHAR(40) NOT NULL,
  "valor_nuevo" VARCHAR(40) NOT NULL,
  "justificacion" TEXT NOT NULL,
  "id_usuario_responsable" INTEGER NOT NULL,
  "fecha_registro" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cambio_condicion_pago_pkey" PRIMARY KEY ("id_cambio"),
  CONSTRAINT "cambio_condicion_pago_tipo_check" CHECK ("tipo_cambio" IN ('DIA_PAGO', 'FECHA_COMPROMETIDA'))
);

CREATE TABLE "cargo_adicional" (
  "id_cargo" SERIAL NOT NULL,
  "id_empresa" INTEGER NOT NULL,
  "id_cliente" INTEGER NOT NULL,
  "id_contrato" INTEGER,
  "id_servicio" INTEGER,
  "tipo" VARCHAR(30) NOT NULL,
  "monto" DECIMAL(12,2) NOT NULL,
  "fecha" DATE NOT NULL,
  "estado" VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE_FACTURACION',
  "afecta_saldo" BOOLEAN NOT NULL DEFAULT false,
  "observacion" TEXT,
  "id_usuario_responsable" INTEGER NOT NULL,
  "fecha_registro" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cargo_adicional_pkey" PRIMARY KEY ("id_cargo"),
  CONSTRAINT "cargo_adicional_monto_check" CHECK ("monto" > 0),
  CONSTRAINT "cargo_adicional_tipo_check" CHECK ("tipo" IN ('REPOSICION', 'RECONEXION', 'RETIRO', 'OTRO')),
  CONSTRAINT "cargo_adicional_estado_check" CHECK ("estado" IN ('PENDIENTE_FACTURACION', 'FACTURADO', 'ANULADO'))
);

CREATE UNIQUE INDEX "cuota_convenio_pago_id_convenio_numero_key" ON "cuota_convenio_pago"("id_convenio", "numero");
CREATE INDEX "evento_gestion_comercial_id_empresa_tipo_fecha_idx" ON "evento_gestion_comercial"("id_empresa", "tipo", "fecha");
CREATE INDEX "evento_gestion_comercial_id_cliente_fecha_idx" ON "evento_gestion_comercial"("id_cliente", "fecha");
CREATE INDEX "evento_gestion_comercial_id_factura_idx" ON "evento_gestion_comercial"("id_factura");
CREATE INDEX "convenio_pago_id_empresa_estado_fecha_inicio_idx" ON "convenio_pago"("id_empresa", "estado", "fecha_inicio");
CREATE INDEX "convenio_pago_id_cliente_estado_idx" ON "convenio_pago"("id_cliente", "estado");
CREATE INDEX "convenio_pago_id_factura_idx" ON "convenio_pago"("id_factura");
CREATE INDEX "cuota_convenio_pago_fecha_vencimiento_estado_idx" ON "cuota_convenio_pago"("fecha_vencimiento", "estado");
CREATE INDEX "prorroga_pago_id_empresa_estado_nueva_fecha_idx" ON "prorroga_pago"("id_empresa", "estado", "nueva_fecha");
CREATE INDEX "prorroga_pago_id_factura_fecha_registro_idx" ON "prorroga_pago"("id_factura", "fecha_registro");
CREATE INDEX "cambio_condicion_pago_id_empresa_tipo_cambio_fecha_registro_idx" ON "cambio_condicion_pago"("id_empresa", "tipo_cambio", "fecha_registro");
CREATE INDEX "cambio_condicion_pago_id_cliente_fecha_registro_idx" ON "cambio_condicion_pago"("id_cliente", "fecha_registro");
CREATE INDEX "cargo_adicional_id_empresa_estado_fecha_idx" ON "cargo_adicional"("id_empresa", "estado", "fecha");
CREATE INDEX "cargo_adicional_id_cliente_fecha_registro_idx" ON "cargo_adicional"("id_cliente", "fecha_registro");
CREATE INDEX "prospecto_id_empresa_clasificacion_comercial_idx" ON "prospecto"("id_empresa", "clasificacion_comercial");
CREATE INDEX "factura_folio_externo_idx" ON "factura"("folio_externo");

ALTER TABLE "evento_gestion_comercial" ADD CONSTRAINT "evento_gestion_comercial_id_empresa_fkey" FOREIGN KEY ("id_empresa") REFERENCES "empresa"("id_empresa") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evento_gestion_comercial" ADD CONSTRAINT "evento_gestion_comercial_id_cliente_fkey" FOREIGN KEY ("id_cliente") REFERENCES "cliente"("id_cliente") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evento_gestion_comercial" ADD CONSTRAINT "evento_gestion_comercial_id_servicio_fkey" FOREIGN KEY ("id_servicio") REFERENCES "servicio_contratado"("id_servicio") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "evento_gestion_comercial" ADD CONSTRAINT "evento_gestion_comercial_id_contrato_fkey" FOREIGN KEY ("id_contrato") REFERENCES "contrato"("id_contrato") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "evento_gestion_comercial" ADD CONSTRAINT "evento_gestion_comercial_id_factura_fkey" FOREIGN KEY ("id_factura") REFERENCES "factura"("id_factura") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "evento_gestion_comercial" ADD CONSTRAINT "evento_gestion_comercial_id_usuario_responsable_fkey" FOREIGN KEY ("id_usuario_responsable") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "convenio_pago" ADD CONSTRAINT "convenio_pago_id_empresa_fkey" FOREIGN KEY ("id_empresa") REFERENCES "empresa"("id_empresa") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "convenio_pago" ADD CONSTRAINT "convenio_pago_id_cliente_fkey" FOREIGN KEY ("id_cliente") REFERENCES "cliente"("id_cliente") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "convenio_pago" ADD CONSTRAINT "convenio_pago_id_servicio_fkey" FOREIGN KEY ("id_servicio") REFERENCES "servicio_contratado"("id_servicio") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "convenio_pago" ADD CONSTRAINT "convenio_pago_id_contrato_fkey" FOREIGN KEY ("id_contrato") REFERENCES "contrato"("id_contrato") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "convenio_pago" ADD CONSTRAINT "convenio_pago_id_factura_fkey" FOREIGN KEY ("id_factura") REFERENCES "factura"("id_factura") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "convenio_pago" ADD CONSTRAINT "convenio_pago_id_usuario_responsable_fkey" FOREIGN KEY ("id_usuario_responsable") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "convenio_pago" ADD CONSTRAINT "convenio_pago_id_usuario_aprobador_fkey" FOREIGN KEY ("id_usuario_aprobador") REFERENCES "usuario"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cuota_convenio_pago" ADD CONSTRAINT "cuota_convenio_pago_id_convenio_fkey" FOREIGN KEY ("id_convenio") REFERENCES "convenio_pago"("id_convenio") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "prorroga_pago" ADD CONSTRAINT "prorroga_pago_id_empresa_fkey" FOREIGN KEY ("id_empresa") REFERENCES "empresa"("id_empresa") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "prorroga_pago" ADD CONSTRAINT "prorroga_pago_id_cliente_fkey" FOREIGN KEY ("id_cliente") REFERENCES "cliente"("id_cliente") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "prorroga_pago" ADD CONSTRAINT "prorroga_pago_id_contrato_fkey" FOREIGN KEY ("id_contrato") REFERENCES "contrato"("id_contrato") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "prorroga_pago" ADD CONSTRAINT "prorroga_pago_id_factura_fkey" FOREIGN KEY ("id_factura") REFERENCES "factura"("id_factura") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "prorroga_pago" ADD CONSTRAINT "prorroga_pago_id_usuario_responsable_fkey" FOREIGN KEY ("id_usuario_responsable") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cambio_condicion_pago" ADD CONSTRAINT "cambio_condicion_pago_id_empresa_fkey" FOREIGN KEY ("id_empresa") REFERENCES "empresa"("id_empresa") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cambio_condicion_pago" ADD CONSTRAINT "cambio_condicion_pago_id_cliente_fkey" FOREIGN KEY ("id_cliente") REFERENCES "cliente"("id_cliente") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cambio_condicion_pago" ADD CONSTRAINT "cambio_condicion_pago_id_contrato_fkey" FOREIGN KEY ("id_contrato") REFERENCES "contrato"("id_contrato") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cambio_condicion_pago" ADD CONSTRAINT "cambio_condicion_pago_id_factura_fkey" FOREIGN KEY ("id_factura") REFERENCES "factura"("id_factura") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cambio_condicion_pago" ADD CONSTRAINT "cambio_condicion_pago_id_usuario_responsable_fkey" FOREIGN KEY ("id_usuario_responsable") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cargo_adicional" ADD CONSTRAINT "cargo_adicional_id_empresa_fkey" FOREIGN KEY ("id_empresa") REFERENCES "empresa"("id_empresa") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cargo_adicional" ADD CONSTRAINT "cargo_adicional_id_cliente_fkey" FOREIGN KEY ("id_cliente") REFERENCES "cliente"("id_cliente") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cargo_adicional" ADD CONSTRAINT "cargo_adicional_id_contrato_fkey" FOREIGN KEY ("id_contrato") REFERENCES "contrato"("id_contrato") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cargo_adicional" ADD CONSTRAINT "cargo_adicional_id_servicio_fkey" FOREIGN KEY ("id_servicio") REFERENCES "servicio_contratado"("id_servicio") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cargo_adicional" ADD CONSTRAINT "cargo_adicional_id_usuario_responsable_fkey" FOREIGN KEY ("id_usuario_responsable") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
