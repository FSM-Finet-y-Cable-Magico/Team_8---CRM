INSERT INTO empresa (id_empresa, nombre, rut_empresa, esquema_db)
VALUES
  (1, 'FiNet', '76.000.001-1', 'finet'),
  (2, 'Cable Magico Litoral', '76.000.002-K', 'cable_magico')
ON CONFLICT (id_empresa) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  rut_empresa = EXCLUDED.rut_empresa,
  esquema_db = EXCLUDED.esquema_db;

SELECT setval(pg_get_serial_sequence('empresa', 'id_empresa'), (SELECT MAX(id_empresa) FROM empresa));

INSERT INTO rol (id_rol, nombre_rol, descripcion)
VALUES
  (1, 'Administrador', 'Acceso completo al sistema'),
  (2, 'Comercial', 'Gestion comercial, prospectos y clientes'),
  (3, 'Soporte', 'Gestion de soporte tecnico y tickets'),
  (4, 'Terreno', 'Gestion de ordenes y trabajo en terreno')
ON CONFLICT (id_rol) DO UPDATE SET
  nombre_rol = EXCLUDED.nombre_rol,
  descripcion = EXCLUDED.descripcion;

SELECT setval(pg_get_serial_sequence('rol', 'id_rol'), (SELECT MAX(id_rol) FROM rol));

INSERT INTO usuario (
  id_empresa,
  nombre_completo,
  nombre_usuario,
  email,
  password_hash,
  activo,
  es_password_temporal
)
VALUES (
  1,
  'Administrador FiNet',
  'admin.finet',
  'admin@finet.local',
  '$2b$12$2N88Ad5Xg13UfkmVRM6wG.LqCvvl78OMgsEEqc.dqXZnmMzLbfTKG',
  TRUE,
  TRUE
)
ON CONFLICT (nombre_usuario) DO UPDATE SET
  email = EXCLUDED.email,
  password_hash = EXCLUDED.password_hash,
  activo = EXCLUDED.activo,
  es_password_temporal = EXCLUDED.es_password_temporal;

INSERT INTO usuario_rol (id_usuario, id_rol)
SELECT u.id_usuario, r.id_rol
FROM usuario u
JOIN rol r ON r.nombre_rol = 'Administrador'
WHERE u.nombre_usuario = 'admin.finet'
ON CONFLICT DO NOTHING;

INSERT INTO categoria_falla (nombre, sla_horas)
VALUES
  ('Falla de internet', 24),
  ('Falla de TV', 24),
  ('Consulta', 72),
  ('Cambio de plan', 72),
  ('Mudanza', 120)
ON CONFLICT DO NOTHING;
