BEGIN;

-- Datos demo de Cable Magico Litoral para bases nuevas y ya inicializadas.
-- El script es idempotente y puede ejecutarse manualmente sin borrar datos.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM empresa WHERE id_empresa = 2) THEN
    RAISE EXCEPTION 'No existe la empresa Cable Magico Litoral (id_empresa = 2)';
  END IF;
END $$;

-- Railway puede tener un catalogo de fallas distinto al seed local.
INSERT INTO categoria_falla (nombre, sla_horas)
SELECT 'Falla de internet', 24
WHERE NOT EXISTS (
  SELECT 1 FROM categoria_falla WHERE nombre = 'Falla de internet'
);

-- Planes activos para cotizar y contratar servicios desde la vista Cable Magico.
INSERT INTO plan (
  id_empresa,
  nombre_comercial,
  tipo_plan,
  tipo_cliente,
  velocidad_mbps,
  precio_mensual,
  descripcion,
  activo
)
SELECT values_to_insert.*
FROM (
  VALUES
    (2, 'Cable 200 Hogar',        'Internet',    'Hogar', 200, 17990.00, 'Internet hogar 200 Mbps',        TRUE),
    (2, 'Pack TV + Internet 400', 'Internet+TV', 'Hogar', 400, 29990.00, 'Internet 400 Mbps + TV digital', TRUE)
) AS values_to_insert (
  id_empresa,
  nombre_comercial,
  tipo_plan,
  tipo_cliente,
  velocidad_mbps,
  precio_mensual,
  descripcion,
  activo
)
WHERE NOT EXISTS (
  SELECT 1
  FROM plan existing_plan
  WHERE existing_plan.id_empresa = values_to_insert.id_empresa
    AND existing_plan.nombre_comercial = values_to_insert.nombre_comercial
);

UPDATE plan existing_plan
SET
  tipo_plan = plan_data.tipo_plan,
  tipo_cliente = plan_data.tipo_cliente,
  velocidad_mbps = plan_data.velocidad_mbps,
  precio_mensual = plan_data.precio_mensual,
  descripcion = plan_data.descripcion,
  activo = TRUE
FROM (
  VALUES
    ('Cable 200 Hogar',        'Internet',    'Hogar', 200, 17990.00, 'Internet hogar 200 Mbps'),
    ('Pack TV + Internet 400', 'Internet+TV', 'Hogar', 400, 29990.00, 'Internet 400 Mbps + TV digital')
) AS plan_data (
  nombre_comercial,
  tipo_plan,
  tipo_cliente,
  velocidad_mbps,
  precio_mensual,
  descripcion
)
WHERE existing_plan.id_empresa = 2
  AND existing_plan.nombre_comercial = plan_data.nombre_comercial;

-- Usuarios de prueba para validar permisos por rol.
INSERT INTO usuario (
  id_empresa,
  nombre_completo,
  nombre_usuario,
  email,
  password_hash,
  activo,
  es_password_temporal
)
VALUES
  (2, 'Comercial Cable Magico', 'comercial.cable', 'comercial@cable.local', '$2b$12$2N88Ad5Xg13UfkmVRM6wG.LqCvvl78OMgsEEqc.dqXZnmMzLbfTKG', TRUE, TRUE),
  (2, 'Soporte Cable Magico',   'soporte.cable',   'soporte@cable.local',   '$2b$12$2N88Ad5Xg13UfkmVRM6wG.LqCvvl78OMgsEEqc.dqXZnmMzLbfTKG', TRUE, TRUE),
  (2, 'Terreno Cable Magico',   'terreno.cable',   'terreno@cable.local',   '$2b$12$2N88Ad5Xg13UfkmVRM6wG.LqCvvl78OMgsEEqc.dqXZnmMzLbfTKG', TRUE, TRUE)
ON CONFLICT (nombre_usuario) DO UPDATE SET
  id_empresa = EXCLUDED.id_empresa,
  nombre_completo = EXCLUDED.nombre_completo,
  email = EXCLUDED.email,
  password_hash = EXCLUDED.password_hash,
  activo = EXCLUDED.activo;

INSERT INTO usuario_rol (id_usuario, id_rol)
SELECT user_data.id_usuario, role_data.id_rol
FROM (
  VALUES
    ('comercial.cable', 'Comercial'),
    ('soporte.cable',   'Soporte'),
    ('terreno.cable',   'Terreno')
) AS assignments (nombre_usuario, nombre_rol)
JOIN usuario user_data ON user_data.nombre_usuario = assignments.nombre_usuario
JOIN rol role_data ON role_data.nombre_rol = assignments.nombre_rol
ON CONFLICT DO NOTHING;

-- Clientes para busqueda, contratos, tickets y cambio de estado.
INSERT INTO cliente (
  id_empresa,
  rut,
  nombre_completo,
  email,
  telefono,
  estado,
  es_conflictivo,
  importado_masivo,
  obs_conflictivo
)
VALUES
  (2, '33333333-3', 'Cliente Cable Activo',     'cliente.activo@cable.demo',     '+56933333333', 'Activo',     FALSE, FALSE, NULL),
  (2, '44444444-4', 'Cliente Cable Suspendido', 'cliente.suspendido@cable.demo', '+56944444444', 'Suspendido', FALSE, FALSE, 'Cliente demo para probar reactivacion')
ON CONFLICT (rut) DO UPDATE SET
  id_empresa = EXCLUDED.id_empresa,
  nombre_completo = EXCLUDED.nombre_completo,
  email = EXCLUDED.email,
  telefono = EXCLUDED.telefono,
  estado = EXCLUDED.estado,
  es_conflictivo = EXCLUDED.es_conflictivo,
  importado_masivo = EXCLUDED.importado_masivo,
  obs_conflictivo = EXCLUDED.obs_conflictivo;

INSERT INTO direccion_servicio (id_cliente, direccion_completa, comuna, ciudad, es_principal)
SELECT customer.id_cliente, address_data.direccion, address_data.comuna, address_data.ciudad, TRUE
FROM (
  VALUES
    ('33333333-3', 'Av. Carlos Alessandri 850', 'Algarrobo',   'Valparaiso'),
    ('44444444-4', 'Av. Isidoro Dubournais 420', 'El Quisco', 'Valparaiso')
) AS address_data (rut, direccion, comuna, ciudad)
JOIN cliente customer ON customer.rut = address_data.rut
WHERE NOT EXISTS (
  SELECT 1
  FROM direccion_servicio existing_address
  WHERE existing_address.id_cliente = customer.id_cliente
    AND existing_address.direccion_completa = address_data.direccion
);

INSERT INTO contrato (id_cliente, id_plan, id_empresa, fecha_inicio, dia_vencimiento, estado, fecha_suspension)
SELECT
  customer.id_cliente,
  selected_plan.id_plan,
  2,
  contract_data.fecha_inicio,
  contract_data.dia_vencimiento,
  contract_data.estado,
  contract_data.fecha_suspension
FROM (
  VALUES
    ('33333333-3', 'Cable 200 Hogar',        (CURRENT_DATE - 45), 10::SMALLINT, 'Activo',     NULL::DATE),
    ('44444444-4', 'Pack TV + Internet 400', (CURRENT_DATE - 70),  5::SMALLINT, 'Suspendido', (CURRENT_DATE - 3))
) AS contract_data (rut, plan_name, fecha_inicio, dia_vencimiento, estado, fecha_suspension)
JOIN cliente customer ON customer.rut = contract_data.rut
JOIN plan selected_plan
  ON selected_plan.id_empresa = 2
 AND selected_plan.nombre_comercial = contract_data.plan_name
WHERE NOT EXISTS (
  SELECT 1
  FROM contrato existing_contract
  WHERE existing_contract.id_cliente = customer.id_cliente
    AND existing_contract.id_empresa = 2
    AND existing_contract.id_plan = selected_plan.id_plan
);

-- Prospectos listos para probar cotizacion, contrato y reactivacion de perdidos.
INSERT INTO prospecto (
  id_empresa,
  id_usuario_comercial,
  id_cliente,
  rut,
  nombre_completo,
  email,
  telefono,
  direccion,
  estado_pipeline,
  motivo_perdida,
  tiempo_conversion_dias,
  fecha_creacion,
  fecha_conversion
)
SELECT
  2,
  sales_user.id_usuario,
  NULL,
  prospect_data.rut,
  prospect_data.nombre_completo,
  prospect_data.email,
  prospect_data.telefono,
  prospect_data.direccion,
  prospect_data.estado_pipeline,
  prospect_data.motivo_perdida,
  NULL,
  prospect_data.fecha_creacion,
  NULL
FROM (
  VALUES
    ('55555555-5', 'Prospecto Cable Factible', 'prospecto.factible@cable.demo', '+56955555555', 'Costanera 350, Algarrobo', 'En Factibilidad', NULL::VARCHAR(30), CURRENT_TIMESTAMP - INTERVAL '4 days'),
    ('66666666-6', 'Prospecto Cable Perdido',  'prospecto.perdido@cable.demo',  '+56966666666', 'Los Aromos 125, El Quisco', 'Perdido',        'Sin cobertura'::VARCHAR(30), CURRENT_TIMESTAMP - INTERVAL '8 days')
) AS prospect_data (
  rut,
  nombre_completo,
  email,
  telefono,
  direccion,
  estado_pipeline,
  motivo_perdida,
  fecha_creacion
)
JOIN usuario sales_user ON sales_user.nombre_usuario = 'comercial.cable'
WHERE NOT EXISTS (
  SELECT 1
  FROM prospecto existing_prospect
  WHERE existing_prospect.id_empresa = 2
    AND existing_prospect.rut = prospect_data.rut
);

-- Cuenta compartida para comprobar que el mismo RUT puede contratar en ambas empresas (CU12).
INSERT INTO prospecto (
  id_empresa,
  id_usuario_comercial,
  id_cliente,
  rut,
  nombre_completo,
  email,
  telefono,
  direccion,
  estado_pipeline,
  fecha_creacion
)
SELECT
  2,
  sales_user.id_usuario,
  NULL,
  finet_customer.rut,
  'Prospecto Cuenta Compartida Cable',
  finet_customer.email,
  finet_customer.telefono,
  'Av. Demo 100, Valparaiso',
  'En Factibilidad',
  CURRENT_TIMESTAMP - INTERVAL '2 days'
FROM cliente finet_customer
JOIN usuario sales_user ON sales_user.nombre_usuario = 'comercial.cable'
WHERE finet_customer.rut = '11111111-1'
  AND finet_customer.id_empresa = 1
  AND NOT EXISTS (
    SELECT 1
    FROM prospecto existing_prospect
    WHERE existing_prospect.id_empresa = 2
      AND existing_prospect.rut = finet_customer.rut
  );

INSERT INTO cotizacion (id_prospecto, id_plan, pdf_url, fecha_envio, factibilidad_verificada)
SELECT
  prospect.id_prospecto,
  selected_plan.id_plan,
  'demo://cable-magico/cotizacion-factible',
  CURRENT_TIMESTAMP - INTERVAL '1 day',
  TRUE
FROM prospecto prospect
JOIN plan selected_plan
  ON selected_plan.id_empresa = 2
 AND selected_plan.nombre_comercial = 'Cable 200 Hogar'
WHERE prospect.id_empresa = 2
  AND prospect.rut = '55555555-5'
  AND NOT EXISTS (
    SELECT 1
    FROM cotizacion existing_quote
    WHERE existing_quote.id_prospecto = prospect.id_prospecto
      AND existing_quote.id_plan = selected_plan.id_plan
  );

-- Inventario disponible e instalado para la empresa Cable Magico.
INSERT INTO tipo_equipo (id_empresa, nombre, categoria, requiere_serie_individual, activo)
SELECT type_data.*
FROM (
  VALUES
    (2, 'Router WiFi 6 Cable Magico', 'Router/ONU', TRUE, TRUE),
    (2, 'ONU GPON Cable Magico',      'Router/ONU', TRUE, TRUE)
) AS type_data (id_empresa, nombre, categoria, requiere_serie_individual, activo)
WHERE NOT EXISTS (
  SELECT 1
  FROM tipo_equipo existing_type
  WHERE existing_type.id_empresa = type_data.id_empresa
    AND existing_type.nombre = type_data.nombre
);

INSERT INTO unidad_equipo (
  id_tipo_equipo,
  id_empresa,
  numero_serie,
  modelo,
  estado,
  fecha_adquisicion,
  fecha_venc_garantia,
  diagnostico_tecnico,
  id_cliente_instalado
)
SELECT
  equipment_type.id_tipo_equipo,
  2,
  unit_data.numero_serie,
  unit_data.modelo,
  unit_data.estado,
  CURRENT_DATE - 30,
  CURRENT_DATE + 335,
  unit_data.diagnostico,
  installed_customer.id_cliente
FROM (
  VALUES
    ('Router WiFi 6 Cable Magico', 'DEMO-CABLE-RTR-001', 'TP-Link Archer AX55', 'Disponible', NULL::TEXT,                         NULL::VARCHAR(12)),
    ('ONU GPON Cable Magico',      'DEMO-CABLE-ONU-001', 'FiberHome AN5506',   'Disponible', NULL::TEXT,                         NULL::VARCHAR(12)),
    ('ONU GPON Cable Magico',      'DEMO-CABLE-ONU-002', 'FiberHome AN5506',   'Instalado',  'MAC: AA:BB:CC:DD:02:01; OLT: CM-1', '33333333-3'::VARCHAR(12))
) AS unit_data (type_name, numero_serie, modelo, estado, diagnostico, rut_cliente)
JOIN tipo_equipo equipment_type
  ON equipment_type.id_empresa = 2
 AND equipment_type.nombre = unit_data.type_name
LEFT JOIN cliente installed_customer ON installed_customer.rut = unit_data.rut_cliente
ON CONFLICT (numero_serie) DO UPDATE SET
  id_tipo_equipo = EXCLUDED.id_tipo_equipo,
  id_empresa = EXCLUDED.id_empresa,
  modelo = EXCLUDED.modelo,
  estado = EXCLUDED.estado,
  fecha_adquisicion = EXCLUDED.fecha_adquisicion,
  fecha_venc_garantia = EXCLUDED.fecha_venc_garantia,
  diagnostico_tecnico = EXCLUDED.diagnostico_tecnico,
  id_cliente_instalado = EXCLUDED.id_cliente_instalado;

-- Ticket y ordenes para validar soporte y trabajo en terreno.
INSERT INTO ticket (
  id_cliente,
  id_empresa,
  id_usuario_asignado,
  id_categoria,
  codigo_seguimiento,
  prioridad,
  estado,
  descripcion,
  fecha_creacion,
  origen,
  resuelto_remotamente
)
SELECT
  customer.id_cliente,
  2,
  support_user.id_usuario,
  category.id_categoria,
  'TK-CABLE-DEMO-001',
  'Alta',
  'Abierto',
  'Intermitencia de servicio. Ticket demo de Cable Magico.',
  CURRENT_TIMESTAMP - INTERVAL '6 hours',
  'Telefono',
  FALSE
FROM cliente customer
JOIN usuario support_user ON support_user.nombre_usuario = 'soporte.cable'
JOIN categoria_falla category ON category.nombre = 'Falla de internet'
WHERE customer.rut = '33333333-3'
ON CONFLICT (codigo_seguimiento) DO UPDATE SET
  id_cliente = EXCLUDED.id_cliente,
  id_empresa = EXCLUDED.id_empresa,
  id_usuario_asignado = EXCLUDED.id_usuario_asignado,
  id_categoria = EXCLUDED.id_categoria,
  prioridad = EXCLUDED.prioridad,
  estado = EXCLUDED.estado,
  descripcion = EXCLUDED.descripcion,
  origen = EXCLUDED.origen,
  resuelto_remotamente = EXCLUDED.resuelto_remotamente;

INSERT INTO orden_trabajo (
  id_empresa,
  id_cliente,
  id_tecnico,
  id_direccion,
  id_ticket,
  tipo_ot,
  prioridad,
  estado,
  fecha_creacion,
  fecha_programada,
  observaciones,
  resuelto_remotamente
)
SELECT
  2,
  customer.id_cliente,
  field_user.id_usuario,
  customer_address.id_direccion,
  support_ticket.id_ticket,
  'Reparacion',
  'Alta',
  'Pendiente',
  CURRENT_TIMESTAMP - INTERVAL '4 hours',
  CURRENT_DATE + 1,
  '[SEED CABLE] Reparacion asociada al ticket demo.',
  FALSE
FROM cliente customer
JOIN direccion_servicio customer_address
  ON customer_address.id_cliente = customer.id_cliente
 AND customer_address.es_principal = TRUE
JOIN ticket support_ticket ON support_ticket.codigo_seguimiento = 'TK-CABLE-DEMO-001'
JOIN usuario field_user ON field_user.nombre_usuario = 'terreno.cable'
WHERE customer.rut = '33333333-3'
  AND NOT EXISTS (
    SELECT 1 FROM orden_trabajo existing_order WHERE existing_order.id_ticket = support_ticket.id_ticket
  )
LIMIT 1;

INSERT INTO orden_trabajo (
  id_empresa,
  id_cliente,
  id_tecnico,
  id_direccion,
  tipo_ot,
  prioridad,
  estado,
  fecha_creacion,
  fecha_programada,
  observaciones,
  resuelto_remotamente
)
SELECT
  2,
  customer.id_cliente,
  field_user.id_usuario,
  customer_address.id_direccion,
  'Instalacion',
  'Media',
  'Pendiente',
  CURRENT_TIMESTAMP - INTERVAL '1 day',
  CURRENT_DATE + 2,
  '[SEED CABLE] Instalacion demo pendiente.',
  FALSE
FROM cliente customer
JOIN direccion_servicio customer_address
  ON customer_address.id_cliente = customer.id_cliente
 AND customer_address.es_principal = TRUE
JOIN usuario field_user ON field_user.nombre_usuario = 'terreno.cable'
WHERE customer.rut = '33333333-3'
  AND NOT EXISTS (
    SELECT 1
    FROM orden_trabajo existing_order
    WHERE existing_order.id_empresa = 2
      AND existing_order.observaciones = '[SEED CABLE] Instalacion demo pendiente.'
  )
LIMIT 1;

COMMIT;
