-- Datos demo para poder ejercitar los 28 casos de uso en una base recien creada.
-- Es aditivo: no modifica 01_schema.sql, 02_local_adjustments.sql ni 03_seed.sql.
-- Docker Compose lo carga despues del 03 por orden alfabetico.

-- Planes comerciales (necesarios para CU03 cotizacion, CU06 factibilidad y CU12 contrato).
INSERT INTO plan (id_plan, id_empresa, nombre_comercial, tipo_plan, tipo_cliente, velocidad_mbps, precio_mensual, descripcion, activo)
VALUES
  (1, 1, 'Fibra 300 Hogar',         'Internet',    'Hogar', 300, 19990, 'Internet hogar 300 Mbps',          TRUE),
  (2, 1, 'Fibra 600 Hogar',         'Internet',    'Hogar', 600, 24990, 'Internet hogar 600 Mbps',          TRUE),
  (3, 2, 'Cable 200 Hogar',         'Internet',    'Hogar', 200, 17990, 'Internet hogar 200 Mbps',          TRUE),
  (4, 2, 'Pack TV + Internet 400',  'Internet+TV', 'Hogar', 400, 29990, 'Internet 400 Mbps + TV digital',   TRUE)
ON CONFLICT (id_plan) DO UPDATE SET
  id_empresa       = EXCLUDED.id_empresa,
  nombre_comercial = EXCLUDED.nombre_comercial,
  tipo_plan        = EXCLUDED.tipo_plan,
  tipo_cliente     = EXCLUDED.tipo_cliente,
  velocidad_mbps   = EXCLUDED.velocidad_mbps,
  precio_mensual   = EXCLUDED.precio_mensual,
  descripcion      = EXCLUDED.descripcion,
  activo           = EXCLUDED.activo;

SELECT setval(pg_get_serial_sequence('plan', 'id_plan'), (SELECT MAX(id_plan) FROM plan));

-- Usuarios por rol para probar endpoints con permisos distintos.

INSERT INTO usuario (id_empresa, nombre_completo, nombre_usuario, email, password_hash, activo, es_password_temporal)
VALUES
  (1, 'Comercial FiNet', 'comercial.finet', 'comercial@finet.local', '$2b$12$2N88Ad5Xg13UfkmVRM6wG.LqCvvl78OMgsEEqc.dqXZnmMzLbfTKG', TRUE, TRUE),
  (1, 'Soporte FiNet',   'soporte.finet',   'soporte@finet.local',   '$2b$12$2N88Ad5Xg13UfkmVRM6wG.LqCvvl78OMgsEEqc.dqXZnmMzLbfTKG', TRUE, TRUE),
  (1, 'Terreno FiNet',   'terreno.finet',   'terreno@finet.local',   '$2b$12$2N88Ad5Xg13UfkmVRM6wG.LqCvvl78OMgsEEqc.dqXZnmMzLbfTKG', TRUE, TRUE)
ON CONFLICT (nombre_usuario) DO UPDATE SET
  email         = EXCLUDED.email,
  password_hash = EXCLUDED.password_hash,
  activo        = EXCLUDED.activo;

INSERT INTO usuario_rol (id_usuario, id_rol)
SELECT u.id_usuario, r.id_rol
FROM usuario u
JOIN rol r ON r.nombre_rol = 'Comercial'
WHERE u.nombre_usuario = 'comercial.finet'
ON CONFLICT DO NOTHING;

INSERT INTO usuario_rol (id_usuario, id_rol)
SELECT u.id_usuario, r.id_rol
FROM usuario u
JOIN rol r ON r.nombre_rol = 'Soporte'
WHERE u.nombre_usuario = 'soporte.finet'
ON CONFLICT DO NOTHING;

INSERT INTO usuario_rol (id_usuario, id_rol)
SELECT u.id_usuario, r.id_rol
FROM usuario u
JOIN rol r ON r.nombre_rol = 'Terreno'
WHERE u.nombre_usuario = 'terreno.finet'
ON CONFLICT DO NOTHING;

-- Cliente demo (RUT con digito verificador valido) para CU23 ticket por RUT, CU08, CU14 y RF-64..RF-71.
INSERT INTO cliente (id_empresa, rut, nombre_completo, email, telefono, estado, origen_contacto, datos_tecnicos)
VALUES (
  1,
  '11111111-1',
  'Cliente Demo',
  'cliente.demo@correo.local',
  '+56911111111',
  'Activo',
  'Demo local',
  jsonb_build_object('observacion', 'Cliente base para validar perfil de servicio y seguimiento comercial')
)
ON CONFLICT (rut) DO UPDATE SET
  nombre_completo = EXCLUDED.nombre_completo,
  email           = EXCLUDED.email,
  telefono        = EXCLUDED.telefono,
  estado          = EXCLUDED.estado,
  origen_contacto = EXCLUDED.origen_contacto,
  datos_tecnicos  = EXCLUDED.datos_tecnicos;

INSERT INTO direccion_servicio (id_cliente, direccion_completa, comuna, ciudad, es_principal)
SELECT cliente.id_cliente, 'Av. Demo 100, Santiago', 'Santiago', 'Santiago', TRUE
FROM cliente
WHERE cliente.rut = '11111111-1'
  AND NOT EXISTS (
    SELECT 1
    FROM direccion_servicio existing_address
    WHERE existing_address.id_cliente = cliente.id_cliente
      AND existing_address.direccion_completa = 'Av. Demo 100, Santiago'
  );

INSERT INTO contrato (id_cliente, id_plan, id_empresa, fecha_inicio, dia_vencimiento, estado)
SELECT cliente.id_cliente, plan.id_plan, 1, CURRENT_DATE - 30, 5, 'Activo'
FROM cliente
JOIN plan ON plan.id_empresa = 1 AND plan.nombre_comercial = 'Fibra 300 Hogar'
WHERE cliente.rut = '11111111-1'
  AND NOT EXISTS (
    SELECT 1
    FROM contrato existing_contract
    WHERE existing_contract.id_cliente = cliente.id_cliente
      AND existing_contract.id_empresa = 1
      AND existing_contract.id_plan = plan.id_plan
  );

INSERT INTO servicio_contratado (
  id_cliente,
  id_empresa,
  id_contrato,
  id_direccion,
  tipo_servicio,
  estado_operativo,
  observaciones,
  datos_tecnicos
)
SELECT
  cliente.id_cliente,
  1,
  contrato.id_contrato,
  direccion.id_direccion,
  'Internet',
  'Activo',
  'Servicio demo FiNet para perfil individual y seguimiento comercial',
  jsonb_build_object(
    'tecnologia', 'Fibra Optica',
    'velocidad', plan.velocidad_mbps::TEXT || ' Mbps',
    'plan', plan.nombre_comercial
  )
FROM cliente
JOIN contrato ON contrato.id_cliente = cliente.id_cliente AND contrato.id_empresa = 1
JOIN plan ON plan.id_plan = contrato.id_plan
LEFT JOIN direccion_servicio direccion
  ON direccion.id_cliente = cliente.id_cliente
 AND direccion.es_principal = TRUE
WHERE cliente.rut = '11111111-1'
  AND NOT EXISTS (
    SELECT 1
    FROM servicio_contratado existing_service
    WHERE existing_service.id_contrato = contrato.id_contrato
  );
