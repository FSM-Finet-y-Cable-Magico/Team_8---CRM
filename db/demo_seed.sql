BEGIN;

-- Datos demo para probar localmente el primer incremento.
-- No se ejecuta automaticamente: aplicar manualmente contra la base Docker/local.
-- Idempotente por ids fijos para poder repetirlo sin duplicar los registros principales.

INSERT INTO plan (id_plan, id_empresa, nombre_comercial, tipo_plan, tipo_cliente, velocidad_mbps, precio_mensual, descripcion, activo)
VALUES
  (101, 1, 'Fibra Hogar 600', 'Internet', 'Residencial', 600, 19990.00, 'Plan demo residencial FiNet 600 Mbps', TRUE),
  (102, 1, 'Fibra Pyme 900', 'Internet', 'Empresa', 900, 39990.00, 'Plan demo pyme FiNet 900 Mbps', TRUE),
  (201, 2, 'Litoral Hogar 500', 'Internet', 'Residencial', 500, 18990.00, 'Plan demo residencial Cable Magico Litoral', TRUE),
  (202, 2, 'Litoral TV + Internet', 'Duo', 'Residencial', 600, 25990.00, 'Plan demo duo TV e internet', TRUE)
ON CONFLICT (id_plan) DO UPDATE SET
  id_empresa = EXCLUDED.id_empresa,
  nombre_comercial = EXCLUDED.nombre_comercial,
  tipo_plan = EXCLUDED.tipo_plan,
  tipo_cliente = EXCLUDED.tipo_cliente,
  velocidad_mbps = EXCLUDED.velocidad_mbps,
  precio_mensual = EXCLUDED.precio_mensual,
  descripcion = EXCLUDED.descripcion,
  activo = EXCLUDED.activo;

INSERT INTO cliente (id_cliente, id_empresa, rut, nombre_completo, email, telefono, estado, es_conflictivo, importado_masivo, obs_conflictivo)
VALUES
  (101, 1, '11111111-1', 'Cliente Demo Activo FiNet', 'cliente.activo@demo.local', '+56911111111', 'Activo', FALSE, FALSE, NULL),
  (102, 1, '22222222-2', 'Cliente Demo Soporte FiNet', 'cliente.soporte@demo.local', '+56922222222', 'Activo', FALSE, FALSE, NULL),
  (201, 2, '33333333-3', 'Cliente Demo Cable Magico', 'cliente.litoral@demo.local', '+56933333333', 'Suspendido', FALSE, FALSE, 'Demo de cliente con servicio suspendido')
ON CONFLICT (id_cliente) DO UPDATE SET
  id_empresa = EXCLUDED.id_empresa,
  rut = EXCLUDED.rut,
  nombre_completo = EXCLUDED.nombre_completo,
  email = EXCLUDED.email,
  telefono = EXCLUDED.telefono,
  estado = EXCLUDED.estado,
  es_conflictivo = EXCLUDED.es_conflictivo,
  importado_masivo = EXCLUDED.importado_masivo,
  obs_conflictivo = EXCLUDED.obs_conflictivo;

INSERT INTO direccion_servicio (id_direccion, id_cliente, direccion_completa, comuna, ciudad, es_principal)
VALUES
  (101, 101, 'Av. Santa Rosa 1234', 'La Pintana', 'Santiago', TRUE),
  (102, 102, 'Pasaje Los Tecnicos 456', 'Puente Alto', 'Santiago', TRUE),
  (201, 201, 'Av. Carlos Alessandri 789', 'Algarrobo', 'Valparaiso', TRUE)
ON CONFLICT (id_direccion) DO UPDATE SET
  id_cliente = EXCLUDED.id_cliente,
  direccion_completa = EXCLUDED.direccion_completa,
  comuna = EXCLUDED.comuna,
  ciudad = EXCLUDED.ciudad,
  es_principal = EXCLUDED.es_principal;

INSERT INTO contrato (id_contrato, id_cliente, id_plan, id_empresa, fecha_inicio, dia_vencimiento, estado, fecha_suspension)
VALUES
  (101, 101, 101, 1, CURRENT_DATE - INTERVAL '45 days', 10, 'Activo', NULL),
  (102, 102, 102, 1, CURRENT_DATE - INTERVAL '20 days', 15, 'Activo', NULL),
  (201, 201, 201, 2, CURRENT_DATE - INTERVAL '70 days', 5, 'Suspendido', CURRENT_DATE - INTERVAL '3 days')
ON CONFLICT (id_contrato) DO UPDATE SET
  id_cliente = EXCLUDED.id_cliente,
  id_plan = EXCLUDED.id_plan,
  id_empresa = EXCLUDED.id_empresa,
  fecha_inicio = EXCLUDED.fecha_inicio,
  dia_vencimiento = EXCLUDED.dia_vencimiento,
  estado = EXCLUDED.estado,
  fecha_suspension = EXCLUDED.fecha_suspension;

INSERT INTO prospecto (id_prospecto, id_empresa, id_usuario_comercial, id_cliente, rut, nombre_completo, email, telefono, direccion, estado_pipeline, motivo_perdida, tiempo_conversion_dias, fecha_creacion, fecha_conversion)
VALUES
  (101, 1, 1, NULL, '12345678-5', 'Prospecto Demo Nuevo', 'prospecto.nuevo@demo.local', '+56912345678', 'Los Olmos 100, La Pintana', 'Prospecto Nuevo', NULL, NULL, CURRENT_TIMESTAMP - INTERVAL '2 days', NULL),
  (102, 1, 1, NULL, '14567890-0', 'Prospecto Demo Factible', 'prospecto.factible@demo.local', '+56914567890', 'El Roble 220, La Pintana', 'En Factibilidad', NULL, NULL, CURRENT_TIMESTAMP - INTERVAL '4 days', NULL),
  (201, 2, 1, NULL, '16666666-6', 'Prospecto Demo Litoral', 'prospecto.litoral@demo.local', '+56916666666', 'Costanera 350, Algarrobo', 'Contactado', NULL, NULL, CURRENT_TIMESTAMP - INTERVAL '1 day', NULL)
ON CONFLICT (id_prospecto) DO UPDATE SET
  id_empresa = EXCLUDED.id_empresa,
  id_usuario_comercial = EXCLUDED.id_usuario_comercial,
  id_cliente = EXCLUDED.id_cliente,
  rut = EXCLUDED.rut,
  nombre_completo = EXCLUDED.nombre_completo,
  email = EXCLUDED.email,
  telefono = EXCLUDED.telefono,
  direccion = EXCLUDED.direccion,
  estado_pipeline = EXCLUDED.estado_pipeline,
  motivo_perdida = EXCLUDED.motivo_perdida,
  tiempo_conversion_dias = EXCLUDED.tiempo_conversion_dias,
  fecha_creacion = EXCLUDED.fecha_creacion,
  fecha_conversion = EXCLUDED.fecha_conversion;

INSERT INTO tipo_equipo (id_tipo_equipo, id_empresa, nombre, categoria, requiere_serie_individual, activo)
VALUES
  (101, 1, 'Router WiFi 6 Demo', 'Router/ONU', TRUE, TRUE),
  (102, 1, 'ONU GPON Demo', 'Router/ONU', TRUE, TRUE),
  (201, 2, 'Router Litoral Demo', 'Router/ONU', TRUE, TRUE)
ON CONFLICT (id_tipo_equipo) DO UPDATE SET
  id_empresa = EXCLUDED.id_empresa,
  nombre = EXCLUDED.nombre,
  categoria = EXCLUDED.categoria,
  requiere_serie_individual = EXCLUDED.requiere_serie_individual,
  activo = EXCLUDED.activo;

INSERT INTO unidad_equipo (id_unidad, id_tipo_equipo, id_empresa, numero_serie, modelo, estado, fecha_adquisicion, fecha_venc_garantia, diagnostico_tecnico, id_cliente_instalado)
VALUES
  (101, 101, 1, 'DEMO-FINET-RTR-001', 'Huawei AX3 Demo', 'Disponible', CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE + INTERVAL '335 days', NULL, NULL),
  (102, 102, 1, 'DEMO-FINET-ONU-001', 'FiberHome ONU Demo', 'Instalado', CURRENT_DATE - INTERVAL '60 days', CURRENT_DATE + INTERVAL '305 days', 'Instalacion demo - MAC: AA:BB:CC:DD:EE:01; Puerto OLT: OLT-1/1/3', 101),
  (201, 201, 2, 'DEMO-LITORAL-RTR-001', 'TP-Link Demo', 'Disponible', CURRENT_DATE - INTERVAL '15 days', CURRENT_DATE + INTERVAL '350 days', NULL, NULL)
ON CONFLICT (id_unidad) DO UPDATE SET
  id_tipo_equipo = EXCLUDED.id_tipo_equipo,
  id_empresa = EXCLUDED.id_empresa,
  numero_serie = EXCLUDED.numero_serie,
  modelo = EXCLUDED.modelo,
  estado = EXCLUDED.estado,
  fecha_adquisicion = EXCLUDED.fecha_adquisicion,
  fecha_venc_garantia = EXCLUDED.fecha_venc_garantia,
  diagnostico_tecnico = EXCLUDED.diagnostico_tecnico,
  id_cliente_instalado = EXCLUDED.id_cliente_instalado;

INSERT INTO ticket (id_ticket, id_cliente, id_empresa, id_usuario_asignado, id_categoria, codigo_seguimiento, prioridad, estado, descripcion, fecha_creacion, origen, resuelto_remotamente)
VALUES
  (101, 102, 1, 1, (SELECT id_categoria FROM categoria_falla WHERE nombre = 'Falla de internet' LIMIT 1), 'TK-DEMO-001', 'Alta', 'Abierto', 'Cliente reporta intermitencia en fibra. Ticket demo para flujo de soporte.', CURRENT_TIMESTAMP - INTERVAL '6 hours', 'Telefono', FALSE),
  (201, 201, 2, 1, (SELECT id_categoria FROM categoria_falla WHERE nombre = 'Consulta' LIMIT 1), 'TK-DEMO-002', 'Media', 'En progreso', 'Consulta demo sobre estado de servicio suspendido.', CURRENT_TIMESTAMP - INTERVAL '1 day', 'WhatsApp', TRUE)
ON CONFLICT (id_ticket) DO UPDATE SET
  id_cliente = EXCLUDED.id_cliente,
  id_empresa = EXCLUDED.id_empresa,
  id_usuario_asignado = EXCLUDED.id_usuario_asignado,
  id_categoria = EXCLUDED.id_categoria,
  codigo_seguimiento = EXCLUDED.codigo_seguimiento,
  prioridad = EXCLUDED.prioridad,
  estado = EXCLUDED.estado,
  descripcion = EXCLUDED.descripcion,
  fecha_creacion = EXCLUDED.fecha_creacion,
  origen = EXCLUDED.origen,
  resuelto_remotamente = EXCLUDED.resuelto_remotamente;

INSERT INTO orden_trabajo (id_ot, id_empresa, id_cliente, id_tecnico, id_direccion, id_ticket, tipo_ot, prioridad, estado, fecha_creacion, fecha_programada, observaciones, resuelto_remotamente)
VALUES
  (101, 1, 101, 1, 101, NULL, 'Instalacion', 'Media', 'Pendiente', CURRENT_TIMESTAMP - INTERVAL '1 day', CURRENT_DATE + INTERVAL '1 day', 'OT demo de instalacion pendiente.', FALSE),
  (102, 1, 102, 1, 102, 101, 'Reparacion', 'Alta', 'En progreso', CURRENT_TIMESTAMP - INTERVAL '5 hours', CURRENT_DATE, 'OT demo asociada al ticket TK-DEMO-001.', FALSE)
ON CONFLICT (id_ot) DO UPDATE SET
  id_empresa = EXCLUDED.id_empresa,
  id_cliente = EXCLUDED.id_cliente,
  id_tecnico = EXCLUDED.id_tecnico,
  id_direccion = EXCLUDED.id_direccion,
  id_ticket = EXCLUDED.id_ticket,
  tipo_ot = EXCLUDED.tipo_ot,
  prioridad = EXCLUDED.prioridad,
  estado = EXCLUDED.estado,
  fecha_creacion = EXCLUDED.fecha_creacion,
  fecha_programada = EXCLUDED.fecha_programada,
  observaciones = EXCLUDED.observaciones,
  resuelto_remotamente = EXCLUDED.resuelto_remotamente;

INSERT INTO log_auditoria (id_usuario, accion, entidad_afectada, id_entidad_afectada, valor_nuevo, fecha_hora)
VALUES
  (1, 'CARGAR_SEMILLA_DEMO_LOCAL', 'demo_seed', 1, '{"origen":"db/demo_seed.sql","nota":"Datos locales para pruebas del primer incremento"}'::jsonb, CURRENT_TIMESTAMP);

SELECT setval(pg_get_serial_sequence('plan', 'id_plan'), GREATEST((SELECT MAX(id_plan) FROM plan), 1));
SELECT setval(pg_get_serial_sequence('cliente', 'id_cliente'), GREATEST((SELECT MAX(id_cliente) FROM cliente), 1));
SELECT setval(pg_get_serial_sequence('direccion_servicio', 'id_direccion'), GREATEST((SELECT MAX(id_direccion) FROM direccion_servicio), 1));
SELECT setval(pg_get_serial_sequence('contrato', 'id_contrato'), GREATEST((SELECT MAX(id_contrato) FROM contrato), 1));
SELECT setval(pg_get_serial_sequence('prospecto', 'id_prospecto'), GREATEST((SELECT MAX(id_prospecto) FROM prospecto), 1));
SELECT setval(pg_get_serial_sequence('tipo_equipo', 'id_tipo_equipo'), GREATEST((SELECT MAX(id_tipo_equipo) FROM tipo_equipo), 1));
SELECT setval(pg_get_serial_sequence('unidad_equipo', 'id_unidad'), GREATEST((SELECT MAX(id_unidad) FROM unidad_equipo), 1));
SELECT setval(pg_get_serial_sequence('ticket', 'id_ticket'), GREATEST((SELECT MAX(id_ticket) FROM ticket), 1));
SELECT setval(pg_get_serial_sequence('orden_trabajo', 'id_ot'), GREATEST((SELECT MAX(id_ot) FROM orden_trabajo), 1));

COMMIT;
