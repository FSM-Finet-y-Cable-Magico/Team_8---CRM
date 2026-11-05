CREATE TABLE "documento_tributario_externo" (
    "id_documento" SERIAL NOT NULL,
    "id_empresa" INTEGER NOT NULL,
    "tipo_documento" VARCHAR(20) NOT NULL,
    "folio_o_numero" VARCHAR(80) NOT NULL,
    "folio_normalizado" VARCHAR(80) NOT NULL,
    "emisor_proveedor" VARCHAR(160) NOT NULL,
    "emisor_normalizado" VARCHAR(160) NOT NULL,
    "fecha_emision" DATE NOT NULL,
    "monto_neto" DECIMAL(14,2),
    "monto_exento" DECIMAL(14,2),
    "iva" DECIMAL(14,2),
    "monto_total" DECIMAL(14,2) NOT NULL,
    "url_documento" TEXT,
    "referencia_externa" VARCHAR(200),
    "estado" VARCHAR(20) NOT NULL DEFAULT 'REGISTRADO',
    "fuente" VARCHAR(30) NOT NULL DEFAULT 'EXTERNO_MANUAL',
    "id_cliente" INTEGER,
    "id_contrato" INTEGER,
    "id_factura" INTEGER,
    "id_cargo_adicional" INTEGER,
    "id_usuario_registro" INTEGER NOT NULL,
    "fecha_registro" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "documento_tributario_externo_pkey" PRIMARY KEY ("id_documento"),
    CONSTRAINT "documento_tributario_externo_tipo_check" CHECK ("tipo_documento" IN ('BOLETA', 'FACTURA')),
    CONSTRAINT "documento_tributario_externo_estado_check" CHECK ("estado" IN ('REGISTRADO', 'ANULADO')),
    CONSTRAINT "documento_tributario_externo_fuente_check" CHECK ("fuente" = 'EXTERNO_MANUAL'),
    CONSTRAINT "documento_tributario_externo_montos_check" CHECK (
        "monto_total" >= 0
        AND ("monto_neto" IS NULL OR "monto_neto" >= 0)
        AND ("monto_exento" IS NULL OR "monto_exento" >= 0)
        AND ("iva" IS NULL OR "iva" >= 0)
    )
);

CREATE UNIQUE INDEX "documento_tributario_externo_identidad_key"
ON "documento_tributario_externo"("id_empresa", "tipo_documento", "emisor_normalizado", "folio_normalizado");

CREATE INDEX "documento_tributario_externo_empresa_fecha_idx"
ON "documento_tributario_externo"("id_empresa", "fecha_emision");

CREATE INDEX "documento_tributario_externo_cliente_fecha_idx"
ON "documento_tributario_externo"("id_cliente", "fecha_emision");

CREATE INDEX "documento_tributario_externo_contrato_idx"
ON "documento_tributario_externo"("id_contrato");

CREATE INDEX "documento_tributario_externo_factura_idx"
ON "documento_tributario_externo"("id_factura");

CREATE INDEX "documento_tributario_externo_cargo_idx"
ON "documento_tributario_externo"("id_cargo_adicional");

CREATE INDEX "documento_tributario_externo_empresa_estado_idx"
ON "documento_tributario_externo"("id_empresa", "estado");

ALTER TABLE "documento_tributario_externo"
ADD CONSTRAINT "documento_tributario_externo_empresa_fkey"
FOREIGN KEY ("id_empresa") REFERENCES "empresa"("id_empresa") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "documento_tributario_externo"
ADD CONSTRAINT "documento_tributario_externo_cliente_fkey"
FOREIGN KEY ("id_cliente") REFERENCES "cliente"("id_cliente") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "documento_tributario_externo"
ADD CONSTRAINT "documento_tributario_externo_contrato_fkey"
FOREIGN KEY ("id_contrato") REFERENCES "contrato"("id_contrato") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "documento_tributario_externo"
ADD CONSTRAINT "documento_tributario_externo_factura_fkey"
FOREIGN KEY ("id_factura") REFERENCES "factura"("id_factura") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "documento_tributario_externo"
ADD CONSTRAINT "documento_tributario_externo_cargo_fkey"
FOREIGN KEY ("id_cargo_adicional") REFERENCES "cargo_adicional"("id_cargo") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "documento_tributario_externo"
ADD CONSTRAINT "documento_tributario_externo_usuario_fkey"
FOREIGN KEY ("id_usuario_registro") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
