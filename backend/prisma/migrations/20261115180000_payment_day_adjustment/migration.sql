ALTER TABLE "cambio_condicion_pago" ADD COLUMN "reajuste" JSONB;

CREATE INDEX "convenio_pago_id_cliente_fecha_registro_idx" ON "convenio_pago"("id_cliente", "fecha_registro");
CREATE INDEX "prorroga_pago_id_cliente_fecha_registro_idx" ON "prorroga_pago"("id_cliente", "fecha_registro");
