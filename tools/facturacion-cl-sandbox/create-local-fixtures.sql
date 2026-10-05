-- Synthetic records only. This is NOT a seed for production/shared databases.
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'fsm_facturacion_local' THEN RAISE EXCEPTION 'LOCAL_QA_DATABASE_REQUIRED'; END IF;
END $$;
INSERT INTO zona_pago(id_empresa,nombre_zona,comuna,tipo_zona,activo,poligono_geojson)
SELECT 2,'QA LOCAL G3 - NO INSTALAR','Valparaiso','COBERTURA_GENERAL',true,
  '{"type":"Polygon","coordinates":[[[-71.61,-33.06],[-71.59,-33.06],[-71.59,-33.04],[-71.61,-33.04],[-71.61,-33.06]]]}'::jsonb
WHERE NOT EXISTS(SELECT 1 FROM zona_pago WHERE nombre_zona='QA LOCAL G3 - NO INSTALAR');
INSERT INTO cliente(id_empresa,rut,nombre_completo,email,telefono,estado)
SELECT 2,'99999999-9','QA BOLETA SANDBOX - NO COBRAR','qa-boleta@example.invalid','+56900000000','Activo'
WHERE NOT EXISTS(SELECT 1 FROM cliente WHERE rut='99999999-9');
INSERT INTO contrato(id_empresa,id_cliente,fecha_inicio,dia_vencimiento,estado,direccion_instalacion,comuna_instalacion,ciudad_instalacion,observacion_contrato)
SELECT 2,id_cliente,CURRENT_DATE,28,'Activo','QA NO INSTALAR','PRUEBA','PRUEBA','FIXTURE LOCAL FACTURACION_CL'
FROM cliente WHERE rut='99999999-9'
AND NOT EXISTS(SELECT 1 FROM contrato WHERE observacion_contrato='FIXTURE LOCAL FACTURACION_CL');
INSERT INTO factura(id_contrato,periodo_mes,periodo_anio,monto,fecha_emision,fecha_limite_pago,estado,tipo_documento)
SELECT id_contrato,10,2026,200,CURRENT_DATE,'2026-10-28','Pendiente','BOLETA'
FROM contrato WHERE observacion_contrato='FIXTURE LOCAL FACTURACION_CL'
AND NOT EXISTS(SELECT 1 FROM factura WHERE id_contrato=contrato.id_contrato);
COMMIT;
SELECT id_factura,id_contrato,monto,estado FROM factura WHERE id_contrato IN
  (SELECT id_contrato FROM contrato WHERE observacion_contrato='FIXTURE LOCAL FACTURACION_CL');
