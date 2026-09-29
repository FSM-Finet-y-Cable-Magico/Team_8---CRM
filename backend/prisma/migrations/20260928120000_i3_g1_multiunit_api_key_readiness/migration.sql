ALTER TABLE "integracion_activacion_g1"
ADD COLUMN "numeros_serie" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "integracion_activacion_g1"
SET "numeros_serie" = ARRAY["numero_serie"]
WHERE "numero_serie" IS NOT NULL
  AND BTRIM("numero_serie") <> '';
