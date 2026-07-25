BEGIN;

-- Datos demo del Incremento 2 para pruebas locales de cobranza,
-- inventario avanzado y dashboard operativo. Es idempotente.

INSERT INTO plantilla_notificacion (tipo_evento, canal, contenido_texto, activa)
SELECT template_data.tipo_evento, template_data.canal, template_data.contenido_texto, TRUE
FROM (
  VALUES
    ('COBRO_PREVENTIVO', 'Sistema', 'Aviso preventivo de cobranza registrado por CRM.'),
    ('ULTIMO_AVISO_CORTE', 'Sistema', 'Ultimo aviso previo al corte registrado por CRM.')
) AS template_data (tipo_evento, canal, contenido_texto)
WHERE NOT EXISTS (
  SELECT 1
  FROM plantilla_notificacion existing_template
  WHERE existing_template.tipo_evento = template_data.tipo_evento
    AND existing_template.canal = template_data.canal
);

INSERT INTO factura (id_contrato, periodo_mes, periodo_anio, monto, fecha_emision, fecha_limite_pago, estado)
SELECT contract.id_contrato, EXTRACT(MONTH FROM CURRENT_DATE)::SMALLINT, EXTRACT(YEAR FROM CURRENT_DATE)::SMALLINT,
       COALESCE(plan.precio_mensual, 19990), CURRENT_DATE - 25, CURRENT_DATE - 10, 'Vencida'
FROM contrato contract
LEFT JOIN plan ON plan.id_plan = contract.id_plan
WHERE contract.estado IN ('Activo', 'Moroso', 'Suspendido')
  AND NOT EXISTS (
    SELECT 1
    FROM factura existing_invoice
    WHERE existing_invoice.id_contrato = contract.id_contrato
      AND existing_invoice.periodo_mes = EXTRACT(MONTH FROM CURRENT_DATE)::SMALLINT
      AND existing_invoice.periodo_anio = EXTRACT(YEAR FROM CURRENT_DATE)::SMALLINT
  );

INSERT INTO bodega (id_empresa, nombre, direccion, activa)
SELECT company.id_empresa, 'Bodega principal ' || company.nombre, NULL, TRUE
FROM empresa company
WHERE NOT EXISTS (
  SELECT 1
  FROM bodega existing_warehouse
  WHERE existing_warehouse.id_empresa = company.id_empresa
    AND existing_warehouse.nombre = 'Bodega principal ' || company.nombre
);

INSERT INTO tipo_equipo (id_empresa, nombre, categoria, requiere_serie_individual, activo)
SELECT data.id_empresa, data.nombre, 'Consumible', FALSE, TRUE
FROM (
  SELECT company.id_empresa, 'Cable drop fibra' AS nombre FROM empresa company
  UNION ALL
  SELECT company.id_empresa, 'Conector SC/APC' AS nombre FROM empresa company
) AS data
WHERE NOT EXISTS (
  SELECT 1
  FROM tipo_equipo existing_type
  WHERE existing_type.id_empresa = data.id_empresa
    AND existing_type.nombre = data.nombre
);

INSERT INTO stock_consumible (id_tipo_equipo, id_bodega, cantidad_disponible, umbral_minimo)
SELECT equipment_type.id_tipo_equipo, warehouse.id_bodega,
       CASE WHEN equipment_type.nombre = 'Cable drop fibra' THEN 120 ELSE 18 END,
       CASE WHEN equipment_type.nombre = 'Cable drop fibra' THEN 30 ELSE 20 END
FROM tipo_equipo equipment_type
JOIN bodega warehouse ON warehouse.id_empresa = equipment_type.id_empresa
WHERE equipment_type.categoria = 'Consumible'
  AND warehouse.nombre = 'Bodega principal ' || (SELECT nombre FROM empresa WHERE id_empresa = equipment_type.id_empresa)
  AND NOT EXISTS (
    SELECT 1
    FROM stock_consumible existing_stock
    WHERE existing_stock.id_tipo_equipo = equipment_type.id_tipo_equipo
      AND existing_stock.id_bodega = warehouse.id_bodega
  );

INSERT INTO caja_nap (id_empresa, identificador_unico, numero_poste, zona, capacidad_puertos, latitud, longitud)
SELECT company.id_empresa,
       CASE WHEN company.id_empresa = 1 THEN 'NAP-FINET-DEMO-001' ELSE 'NAP-CABLE-DEMO-001' END,
       CASE WHEN company.id_empresa = 1 THEN 'P-100' ELSE 'P-200' END,
       CASE WHEN company.id_empresa = 1 THEN 'Santiago Centro' ELSE 'Litoral Central' END,
       8,
       NULL,
       NULL
FROM empresa company
WHERE NOT EXISTS (
  SELECT 1
  FROM caja_nap existing_nap
  WHERE existing_nap.identificador_unico =
    CASE WHEN company.id_empresa = 1 THEN 'NAP-FINET-DEMO-001' ELSE 'NAP-CABLE-DEMO-001' END
);

INSERT INTO uso_material_ot (id_ot, id_tipo_equipo, cantidad)
SELECT selected_order.id_ot, selected_type.id_tipo_equipo, 2
FROM orden_trabajo selected_order
JOIN LATERAL (
  SELECT equipment_type.id_tipo_equipo
  FROM tipo_equipo equipment_type
  WHERE equipment_type.id_empresa = selected_order.id_empresa
    AND equipment_type.nombre = 'Conector SC/APC'
  LIMIT 1
) selected_type ON TRUE
WHERE NOT EXISTS (
  SELECT 1
  FROM uso_material_ot existing_usage
  WHERE existing_usage.id_ot = selected_order.id_ot
    AND existing_usage.id_tipo_equipo = selected_type.id_tipo_equipo
)
LIMIT 10;

COMMIT;
