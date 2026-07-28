-- Datos locales para probar Portal Cliente, TV IP y monitoreo tecnico basico.
-- Acceso demo portal: RUT 18765432-7 / clave portal123.

DO $$
DECLARE
  v_empresa INTEGER;
  v_plan INTEGER;
  v_cliente INTEGER;
  v_direccion INTEGER;
  v_contrato INTEGER;
  v_servicio INTEGER;
  v_tipo_equipo INTEGER;
  v_unidad INTEGER;
  v_olt INTEGER;
  v_tarjeta INTEGER;
  v_mufa INTEGER;
  v_caja INTEGER;
BEGIN
  SELECT id_empresa INTO v_empresa
  FROM empresa
  WHERE nombre ILIKE '%FiNet%'
  ORDER BY id_empresa
  LIMIT 1;

  IF v_empresa IS NULL THEN
    SELECT id_empresa INTO v_empresa FROM empresa ORDER BY id_empresa LIMIT 1;
  END IF;

  IF v_empresa IS NULL THEN
    RETURN;
  END IF;

  SELECT id_plan INTO v_plan
  FROM plan
  WHERE id_empresa = v_empresa AND nombre_comercial = 'Plan Portal Internet + TV 600 Mbps'
  LIMIT 1;

  IF v_plan IS NULL THEN
    INSERT INTO plan (id_empresa, nombre_comercial, tipo_plan, tipo_cliente, velocidad_mbps, precio_mensual, descripcion, activo)
    VALUES (v_empresa, 'Plan Portal Internet + TV 600 Mbps', 'Internet+TV', 'Residencial', 600, 28990, 'Plan demo para portal cliente y TV IP', TRUE)
    RETURNING id_plan INTO v_plan;
  END IF;

  INSERT INTO cliente (id_empresa, rut, nombre_completo, email, telefono, password_portal_hash, estado, origen_contacto, datos_tecnicos)
  VALUES (
    v_empresa,
    '18765432-7',
    'Cliente Portal Demo',
    'portal.demo@finet.local',
    '+56987654321',
    '$2a$10$T5w8RMOF8Nwc7rXBuurmbexzZ3zdV9xXvTG36VG51DBFcNjICKdx6',
    'Activo',
    'Portal demo',
    '{"direccion":"Av. Portal Demo 123"}'::jsonb
  )
  ON CONFLICT (rut) DO UPDATE SET
    password_portal_hash = EXCLUDED.password_portal_hash,
    estado = 'Activo'
  RETURNING id_cliente INTO v_cliente;

  SELECT id_direccion INTO v_direccion
  FROM direccion_servicio
  WHERE id_cliente = v_cliente AND direccion_completa = 'Av. Portal Demo 123'
  LIMIT 1;

  IF v_direccion IS NULL THEN
    INSERT INTO direccion_servicio (id_cliente, direccion_completa, comuna, ciudad, es_principal)
    VALUES (v_cliente, 'Av. Portal Demo 123', 'Santiago', 'Santiago', TRUE)
    RETURNING id_direccion INTO v_direccion;
  END IF;

  SELECT id_contrato INTO v_contrato
  FROM contrato
  WHERE id_cliente = v_cliente AND id_plan = v_plan
  LIMIT 1;

  IF v_contrato IS NULL THEN
    INSERT INTO contrato (id_cliente, id_plan, id_empresa, fecha_inicio, dia_vencimiento, estado)
    VALUES (v_cliente, v_plan, v_empresa, CURRENT_DATE - INTERVAL '30 days', 5, 'Activo')
    RETURNING id_contrato INTO v_contrato;
  END IF;

  SELECT id_servicio INTO v_servicio
  FROM servicio_contratado
  WHERE id_cliente = v_cliente AND id_contrato = v_contrato
  LIMIT 1;

  IF v_servicio IS NULL THEN
    INSERT INTO servicio_contratado (id_cliente, id_empresa, id_contrato, id_direccion, tipo_servicio, estado_operativo, observaciones, datos_tecnicos)
    VALUES (
      v_cliente,
      v_empresa,
      v_contrato,
      v_direccion,
      'Internet + Television',
      'Activo',
      'Servicio demo para portal cliente',
      '{"tecnologia":"Fibra Optica","velocidad":"600 Mbps","puertoOlt":"OLT-DEMO/1/1","ipAsignada":"100.64.10.20"}'::jsonb
    )
    RETURNING id_servicio INTO v_servicio;
  END IF;

  SELECT id_tipo_equipo INTO v_tipo_equipo
  FROM tipo_equipo
  WHERE id_empresa = v_empresa AND nombre = 'ONT Portal Demo'
  LIMIT 1;

  IF v_tipo_equipo IS NULL THEN
    INSERT INTO tipo_equipo (id_empresa, nombre, categoria, requiere_serie_individual, activo)
    VALUES (v_empresa, 'ONT Portal Demo', 'ONT', TRUE, TRUE)
    RETURNING id_tipo_equipo INTO v_tipo_equipo;
  END IF;

  SELECT id_olt INTO v_olt FROM olt WHERE id_empresa = v_empresa AND nombre = 'OLT Demo Portal' LIMIT 1;
  IF v_olt IS NULL THEN
    INSERT INTO olt (id_empresa, nombre, ubicacion, ip_gestion)
    VALUES (v_empresa, 'OLT Demo Portal', 'Nodo demo local', '10.10.10.1')
    RETURNING id_olt INTO v_olt;
  END IF;

  SELECT id_tarjeta INTO v_tarjeta FROM tarjeta_pon WHERE id_olt = v_olt AND numero_tarjeta = 1 LIMIT 1;
  IF v_tarjeta IS NULL THEN
    INSERT INTO tarjeta_pon (id_olt, numero_tarjeta, total_puertos)
    VALUES (v_olt, 1, 16)
    RETURNING id_tarjeta INTO v_tarjeta;
  END IF;

  SELECT id_mufa INTO v_mufa FROM mufa WHERE id_tarjeta_pon = v_tarjeta AND identificador = 'MUFA-PORTAL-DEMO' LIMIT 1;
  IF v_mufa IS NULL THEN
    INSERT INTO mufa (id_tarjeta_pon, identificador, ubicacion)
    VALUES (v_tarjeta, 'MUFA-PORTAL-DEMO', 'Sector demo portal')
    RETURNING id_mufa INTO v_mufa;
  END IF;

  INSERT INTO caja_nap (id_empresa, id_mufa, identificador_unico, numero_poste, zona, capacidad_puertos, latitud, longitud)
  VALUES (v_empresa, v_mufa, 'NAP-PORTAL-DEMO', 'POSTE-123', 'Zona Portal Demo', 8, -33.448900, -70.669300)
  ON CONFLICT (identificador_unico) DO UPDATE SET
    id_empresa = EXCLUDED.id_empresa,
    id_mufa = EXCLUDED.id_mufa,
    zona = EXCLUDED.zona
  RETURNING id_caja_nap INTO v_caja;

  IF NOT EXISTS (SELECT 1 FROM puerto_nap WHERE id_caja_nap = v_caja AND numero_puerto = 1) THEN
    INSERT INTO puerto_nap (id_caja_nap, numero_puerto, estado, id_cliente_asociado)
    VALUES (v_caja, 1, 'Ocupado', v_cliente);
  END IF;

  INSERT INTO unidad_equipo (id_tipo_equipo, id_empresa, numero_serie, modelo, estado, id_cliente_instalado, id_servicio, id_caja_nap, diagnostico_tecnico)
  VALUES (v_tipo_equipo, v_empresa, 'DEMO-PORTAL-ONT-001', 'ONT Demo X1', 'Instalado', v_cliente, v_servicio, v_caja, 'Equipo demo asociado al portal')
  ON CONFLICT (numero_serie) DO UPDATE SET
    id_empresa = EXCLUDED.id_empresa,
    id_cliente_instalado = EXCLUDED.id_cliente_instalado,
    id_servicio = EXCLUDED.id_servicio,
    id_caja_nap = EXCLUDED.id_caja_nap,
    estado = 'Instalado'
  RETURNING id_unidad INTO v_unidad;

  IF NOT EXISTS (SELECT 1 FROM monitoreo_ont WHERE id_unidad = v_unidad) THEN
    INSERT INTO monitoreo_ont (id_unidad, id_cliente, id_caja_nap, potencia_actual_dbm, timestamp_medicion, estado_conexion)
    VALUES (v_unidad, v_cliente, v_caja, -19.45, NOW() - INTERVAL '20 minutes', 'Online');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM historial_conexion_ont WHERE id_unidad = v_unidad) THEN
    INSERT INTO historial_conexion_ont (id_unidad, evento, timestamp)
    VALUES
      (v_unidad, 'Online', NOW() - INTERVAL '20 minutes'),
      (v_unidad, 'Offline', NOW() - INTERVAL '2 days'),
      (v_unidad, 'Online', NOW() - INTERVAL '2 days' + INTERVAL '10 minutes');
  END IF;
END $$;
