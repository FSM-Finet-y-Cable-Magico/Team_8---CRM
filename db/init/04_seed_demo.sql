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

-- Cliente demo (RUT con digito verificador valido) para CU23 ticket por RUT, CU08 y CU14.
INSERT INTO cliente (id_empresa, rut, nombre_completo, email, telefono, estado)
VALUES (1, '11111111-1', 'Cliente Demo', 'cliente.demo@correo.local', '+56911111111', 'Activo')
ON CONFLICT (rut) DO UPDATE SET
  nombre_completo = EXCLUDED.nombre_completo,
  email           = EXCLUDED.email,
  telefono        = EXCLUDED.telefono,
  estado          = EXCLUDED.estado;
