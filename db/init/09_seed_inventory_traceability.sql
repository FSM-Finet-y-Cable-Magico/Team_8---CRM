-- Equipos demo adicionales para probar disponibilidad y trazabilidad.
-- Idempotente por numero_serie: nunca restablece un equipo que ya fue utilizado.

WITH equipment_data(company_name, type_name, serial, model, state, diagnosis, acquired_days_ago) AS (
  VALUES
    ('FiNet Limitada', 'ONU HUAWEI', 'TRACE-FINET-ONT-1001', 'Huawei EG8145V5', 'Disponible', 'MAC: 02:10:00:00:10:01; Puerto OLT: Pendiente', 80),
    ('FiNet Limitada', 'ONU HUAWEI', 'TRACE-FINET-ONT-1002', 'Huawei HG8245W5', 'Disponible', 'MAC: 02:10:00:00:10:02; Puerto OLT: Pendiente', 72),
    ('FiNet Limitada', 'Router A', 'TRACE-FINET-RTR-1003', 'Huawei WiFi AX3', 'Disponible', 'MAC: 02:10:00:00:10:03', 64),
    ('FiNet Limitada', 'Router B', 'TRACE-FINET-RTR-1004', 'TP-Link Archer AX55', 'Disponible', 'MAC: 02:10:00:00:10:04', 58),
    ('FiNet Limitada', 'ONU HUAWEI', 'TRACE-FINET-ONT-1005', 'ZTE F670L', 'En Revision', 'Diagnostico demo: potencia optica inestable', 110),
    ('FiNet Limitada', 'Router A', 'TRACE-FINET-RTR-1006', 'Huawei WiFi AX2', 'Bloqueado', 'Bloqueo demo por auditoria de inventario', 130),
    ('Cable Mágico Litoral', 'ONU GPON Cable Magico', 'TRACE-CABLE-ONT-2001', 'FiberHome AN5506-04', 'Disponible', 'MAC: 02:20:00:00:20:01; Puerto OLT: Pendiente', 76),
    ('Cable Mágico Litoral', 'ONU GPON Cable Magico', 'TRACE-CABLE-ONT-2002', 'ZTE F6600P', 'Disponible', 'MAC: 02:20:00:00:20:02; Puerto OLT: Pendiente', 69),
    ('Cable Mágico Litoral', 'Router WiFi 6 Cable Magico', 'TRACE-CABLE-RTR-2003', 'TP-Link Archer AX55', 'Disponible', 'MAC: 02:20:00:00:20:03', 61),
    ('Cable Mágico Litoral', 'Router WiFi 6 Cable Magico', 'TRACE-CABLE-RTR-2004', 'Mercusys MR80X', 'Disponible', 'MAC: 02:20:00:00:20:04', 53),
    ('Cable Mágico Litoral', 'ONU GPON Cable Magico', 'TRACE-CABLE-ONT-2005', 'FiberHome HG6145F', 'En Revision', 'Diagnostico demo: conector optico danado', 95)
)
INSERT INTO unidad_equipo (
  id_tipo_equipo,
  id_empresa,
  numero_serie,
  modelo,
  estado,
  fecha_adquisicion,
  fecha_venc_garantia,
  diagnostico_tecnico,
  id_cliente_instalado,
  id_servicio,
  id_bodega_actual
)
SELECT
  COALESCE(
    (SELECT te.id_tipo_equipo FROM tipo_equipo te WHERE te.id_empresa = e.id_empresa AND te.nombre = d.type_name LIMIT 1),
    (SELECT te.id_tipo_equipo FROM tipo_equipo te WHERE te.id_empresa = e.id_empresa AND COALESCE(te.activo, TRUE) LIMIT 1)
  ),
  e.id_empresa,
  d.serial,
  d.model,
  d.state,
  CURRENT_DATE - d.acquired_days_ago,
  CURRENT_DATE + (365 - d.acquired_days_ago),
  d.diagnosis,
  NULL,
  NULL,
  (SELECT b.id_bodega FROM bodega b WHERE b.id_empresa = e.id_empresa AND COALESCE(b.activa, TRUE) ORDER BY b.id_bodega LIMIT 1)
FROM equipment_data d
JOIN empresa e ON e.nombre = d.company_name
ON CONFLICT (numero_serie) DO NOTHING;

INSERT INTO movimiento_inventario (
  id_tipo_equipo, id_unidad, id_empresa_origen, id_empresa_destino,
  id_bodega_origen, id_bodega_destino, id_usuario, tipo_movimiento,
  cantidad, fecha, referencia_id
)
SELECT
  u.id_tipo_equipo, u.id_unidad, NULL, u.id_empresa,
  NULL, u.id_bodega_actual,
  (SELECT us.id_usuario FROM usuario us WHERE us.id_empresa = u.id_empresa ORDER BY us.id_usuario LIMIT 1),
  'Compra', 1, COALESCE(u.fecha_adquisicion::timestamp, CURRENT_TIMESTAMP - INTERVAL '60 days'), NULL
FROM unidad_equipo u
WHERE u.numero_serie LIKE 'TRACE-%'
  AND NOT EXISTS (
    SELECT 1 FROM movimiento_inventario m
    WHERE m.id_unidad = u.id_unidad AND m.tipo_movimiento = 'Compra'
  );

INSERT INTO movimiento_inventario (
  id_tipo_equipo, id_unidad, id_empresa_origen, id_empresa_destino,
  id_bodega_origen, id_bodega_destino, id_usuario, tipo_movimiento,
  cantidad, fecha, referencia_id
)
SELECT
  u.id_tipo_equipo, u.id_unidad, u.id_empresa, u.id_empresa,
  NULL, u.id_bodega_actual,
  (SELECT us.id_usuario FROM usuario us WHERE us.id_empresa = u.id_empresa ORDER BY us.id_usuario LIMIT 1),
  'Transferencia', 1, CURRENT_TIMESTAMP - INTERVAL '20 days', NULL
FROM unidad_equipo u
WHERE u.numero_serie IN ('TRACE-FINET-ONT-1002', 'TRACE-CABLE-RTR-2003')
  AND NOT EXISTS (
    SELECT 1 FROM movimiento_inventario m
    WHERE m.id_unidad = u.id_unidad AND m.tipo_movimiento = 'Transferencia'
  );

INSERT INTO historial_estado_equipo (
  id_unidad, id_usuario, estado_anterior, estado_nuevo, motivo, fecha_hora
)
SELECT
  u.id_unidad,
  (SELECT us.id_usuario FROM usuario us WHERE us.id_empresa = u.id_empresa ORDER BY us.id_usuario LIMIT 1),
  'Sin registro', 'Disponible', 'Ingreso demo para trazabilidad',
  COALESCE(u.fecha_adquisicion::timestamp, CURRENT_TIMESTAMP - INTERVAL '60 days')
FROM unidad_equipo u
WHERE u.numero_serie LIKE 'TRACE-%'
  AND NOT EXISTS (
    SELECT 1 FROM historial_estado_equipo h
    WHERE h.id_unidad = u.id_unidad AND h.motivo = 'Ingreso demo para trazabilidad'
  );

INSERT INTO historial_estado_equipo (
  id_unidad, id_usuario, estado_anterior, estado_nuevo, motivo, fecha_hora
)
SELECT
  u.id_unidad,
  (SELECT us.id_usuario FROM usuario us WHERE us.id_empresa = u.id_empresa ORDER BY us.id_usuario LIMIT 1),
  'Disponible', u.estado,
  CASE WHEN u.estado = 'Bloqueado'
    THEN 'Bloqueo demo por control de inventario'
    ELSE 'Revision tecnica demo para trazabilidad'
  END,
  CURRENT_TIMESTAMP - INTERVAL '5 days'
FROM unidad_equipo u
WHERE u.numero_serie IN ('TRACE-FINET-ONT-1005', 'TRACE-FINET-RTR-1006', 'TRACE-CABLE-ONT-2005')
  AND NOT EXISTS (
    SELECT 1 FROM historial_estado_equipo h
    WHERE h.id_unidad = u.id_unidad
      AND h.motivo IN ('Bloqueo demo por control de inventario', 'Revision tecnica demo para trazabilidad')
  );

SELECT setval(
  pg_get_serial_sequence('unidad_equipo', 'id_unidad'),
  GREATEST((SELECT COALESCE(MAX(id_unidad), 1) FROM unidad_equipo), 1),
  TRUE
);
