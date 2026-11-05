-- Incremento 3, etapa 1: geolocalizacion y zonas comerciales.
-- Migracion aditiva: las zonas historicas pueden conservar geometria NULL.

ALTER TABLE "prospecto"
  ADD COLUMN "comuna" VARCHAR(80),
  ADD COLUMN "region" VARCHAR(80),
  ADD COLUMN "latitud" DOUBLE PRECISION,
  ADD COLUMN "longitud" DOUBLE PRECISION,
  ADD COLUMN "id_zona_pago" INTEGER;

ALTER TABLE "prospecto"
  ADD CONSTRAINT "prospecto_latitud_check"
    CHECK ("latitud" IS NULL OR "latitud" BETWEEN -90 AND 90),
  ADD CONSTRAINT "prospecto_longitud_check"
    CHECK ("longitud" IS NULL OR "longitud" BETWEEN -180 AND 180),
  ADD CONSTRAINT "prospecto_id_zona_pago_fkey"
    FOREIGN KEY ("id_zona_pago") REFERENCES "zona_pago"("id_zona_pago")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "zona_pago"
  ADD COLUMN "tipo_zona" VARCHAR(30) DEFAULT 'COBERTURA_GENERAL',
  ADD COLUMN "id_zona_padre" INTEGER,
  ADD COLUMN "poligono_geojson" JSONB,
  ADD COLUMN "centro_lat" DOUBLE PRECISION,
  ADD COLUMN "centro_lng" DOUBLE PRECISION,
  ADD COLUMN "prioridad" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "fuente_cobertura" VARCHAR(30) DEFAULT 'MANUAL',
  ADD COLUMN "fecha_inicio" DATE,
  ADD COLUMN "fecha_fin" DATE;

ALTER TABLE "zona_pago"
  ADD CONSTRAINT "zona_pago_tipo_zona_check"
    CHECK ("tipo_zona" IS NULL OR "tipo_zona" IN ('COBERTURA_GENERAL', 'MICROZONA_COMERCIAL')),
  ADD CONSTRAINT "zona_pago_centro_lat_check"
    CHECK ("centro_lat" IS NULL OR "centro_lat" BETWEEN -90 AND 90),
  ADD CONSTRAINT "zona_pago_centro_lng_check"
    CHECK ("centro_lng" IS NULL OR "centro_lng" BETWEEN -180 AND 180),
  ADD CONSTRAINT "zona_pago_vigencia_check"
    CHECK ("fecha_inicio" IS NULL OR "fecha_fin" IS NULL OR "fecha_inicio" <= "fecha_fin"),
  ADD CONSTRAINT "zona_pago_padre_distinto_check"
    CHECK ("id_zona_padre" IS NULL OR "id_zona_padre" <> "id_zona_pago"),
  ADD CONSTRAINT "zona_pago_id_zona_padre_fkey"
    FOREIGN KEY ("id_zona_padre") REFERENCES "zona_pago"("id_zona_pago")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "plan_zona_precio"
  ADD COLUMN "fecha_inicio" DATE,
  ADD COLUMN "fecha_fin" DATE;

ALTER TABLE "plan_zona_precio"
  ADD CONSTRAINT "plan_zona_precio_vigencia_check"
    CHECK ("fecha_inicio" IS NULL OR "fecha_fin" IS NULL OR "fecha_inicio" <= "fecha_fin");

CREATE INDEX "prospecto_id_empresa_id_zona_pago_idx"
  ON "prospecto"("id_empresa", "id_zona_pago");
CREATE INDEX "zona_pago_id_empresa_tipo_zona_activo_idx"
  ON "zona_pago"("id_empresa", "tipo_zona", "activo");
CREATE INDEX "zona_pago_id_zona_padre_idx"
  ON "zona_pago"("id_zona_padre");
CREATE INDEX "zona_pago_fecha_inicio_fecha_fin_idx"
  ON "zona_pago"("fecha_inicio", "fecha_fin");
CREATE INDEX "plan_zona_precio_id_plan_id_zona_pago_idx"
  ON "plan_zona_precio"("id_plan", "id_zona_pago");
CREATE INDEX "plan_zona_precio_id_zona_pago_activo_fechas_idx"
  ON "plan_zona_precio"("id_zona_pago", "activo", "fecha_inicio", "fecha_fin");
