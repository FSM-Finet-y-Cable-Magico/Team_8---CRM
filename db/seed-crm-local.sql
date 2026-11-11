-- Base local reproducible para Clientes, Prospectos, Instalaciones, Tickets y Libro de control.
-- Desde la raíz del repositorio, con el Docker Compose local levantado:
-- docker compose exec -T db psql -X -U postgres -d fsm_db -v aplicar=true < db/seed-crm-local.sql
-- Sin aplicar=true, ejecuta y valida la carga dentro de una transacción que se revierte.
\set ON_ERROR_STOP on
\encoding UTF8
\if :{?aplicar}
\else
  \set aplicar false
\endif
BEGIN;
SET LOCAL search_path = public, pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL TIME ZONE 'America/Santiago';
SELECT pg_advisory_xact_lock(7102026);

DO $reset$
DECLARE
  tables_to_reset text;
BEGIN
  IF current_database() <> 'fsm_db' OR inet_client_addr() IS NOT NULL THEN
    RAISE EXCEPTION 'Ejecuta esta seed dentro del contenedor db del Compose local, en fsm_db';
  END IF;
  IF (SELECT count(*) FROM empresa WHERE nombre IN ('FiNet Limitada', 'Cable Mágico Litoral')) <> 2 THEN
    RAISE EXCEPTION 'Faltan las empresas del catálogo local';
  END IF;

  -- RESTRICT evita alcanzar catálogos por cascada. Una dependencia nueva no listada aborta toda la carga.
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ' ORDER BY tablename)
  INTO tables_to_reset
  FROM pg_tables
  WHERE schemaname = 'public' AND tablename IN (
    'baja_equipo', 'cambio_condicion_pago', 'cargo_adicional', 'cliente', 'consentimiento_cookies',
    'contrato', 'contrato_digital', 'contrato_firma_solicitud', 'convenio_pago', 'conversacion_bot',
    'cotizacion', 'credenciales_tvip', 'cuota_convenio_pago', 'detalle_orden_ingreso', 'direccion_servicio',
    'documento_tributario_externo', 'evento_gestion_comercial', 'evidencia_foto', 'factura',
    'garantia_comercial', 'historial_cambio_plan', 'historial_conexion_ont', 'historial_estado_equipo',
    'historial_ot', 'imputacion_cuota', 'integracion_activacion_g1', 'integracion_evento_entrante',
    'integracion_instalacion_g3', 'integracion_resultado_wifi_g2', 'intento_fallido', 'lista_negra',
    'llamada_cortes', 'log_auditoria', 'log_notificacion', 'mensaje_bot', 'mensaje_whatsapp',
    'monitoreo_ont', 'movimiento_inventario', 'operacion_imputacion_cuota', 'orden_ingreso',
    'orden_trabajo', 'pago', 'prestamo_externo', 'prorroga_pago', 'prospecto', 'sesion_portal',
    'solicitud_cliente', 'solicitud_retiro_servicio', 'stock_consumible', 'servicio_contratado',
    'tax_emission_intent', 'tax_payment_job', 'ticket', 'transferencia_equipo', 'unidad_equipo',
    'uso_material_ot'
  );

  -- Los puertos pertenecen al catálogo de red. Se libera la asignación comercial anterior.
  LOCK TABLE puerto_nap IN ACCESS EXCLUSIVE MODE;
  UPDATE puerto_nap SET id_cliente_asociado = NULL, estado = 'Disponible' WHERE id_cliente_asociado IS NOT NULL;
  -- PostgreSQL exige incluir incluso los puertos sin asignación al truncar clientes.
  CREATE TEMP TABLE crm_seed_ports ON COMMIT DROP AS SELECT * FROM puerto_nap;
  EXECUTE 'TRUNCATE ' || tables_to_reset || ', public.puerto_nap CONTINUE IDENTITY RESTRICT';
  INSERT INTO puerto_nap SELECT * FROM crm_seed_ports;
  IF to_regclass('g8_contratos.solicitud_firma') IS NOT NULL THEN
    TRUNCATE g8_contratos.solicitud_firma;
  END IF;
END
$reset$;

CREATE FUNCTION pg_temp.seed_rut(number integer) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  WITH check_digit AS (
    SELECT 11 - sum(substr(reverse(number::text), i, 1)::integer * (2 + (i - 1) % 6)) % 11 AS digit
    FROM generate_series(1, length(number::text)) i
  )
  SELECT number || '-' || CASE digit WHEN 11 THEN '0' WHEN 10 THEN 'K' ELSE digit::text END FROM check_digit
$$;

-- Mismo orden de claves y formato compacto que el hash de snapshots de G3.
CREATE FUNCTION pg_temp.seed_canonical_json(value jsonb) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE jsonb_typeof(value) WHEN 'object' THEN (
    SELECT '{' || coalesce(string_agg(to_json(key)::text || ':' || pg_temp.seed_canonical_json(val), ',' ORDER BY key COLLATE "C"), '') || '}'
    FROM jsonb_each(value) AS properties(key, val)
  ) ELSE value::text END
$$;

CREATE TEMP TABLE crm_seed_case (
  slot integer PRIMARY KEY, scenario text NOT NULL UNIQUE,
  finet_name text NOT NULL, cable_name text NOT NULL
) ON COMMIT DROP;

INSERT INTO crm_seed_case VALUES
  ( 1, 'nuevo',        'Martina Rivas Salgado',       'Isabel Arancibia Pino'),
  ( 2, 'factible',     'Tomás Larraín Soto',          'Benjamín Cifuentes Godoy'),
  ( 3, 'cotizada',     'Josefa Cisternas Parra',      'Olivia Bustamante Jara'),
  ( 4, 'sin-cobertura','Ignacio Sanhueza Moya',       'Joaquín Varela Pinto'),
  ( 5, 'perdida',      'Daniela Figueroa Mella',      'Camila Aguirre Rojas'),
  ( 6, 'firma',        'Gabriel Saavedra Leiva',      'Rafael Contreras Ortiz'),
  ( 7, 'por-solicitar','Paula Valdés Vera',           'Florencia Muñoz Araya'),
  ( 8, 'asignada',     'Catalina Yáñez Riquelme',     'Sebastián Uribe Moraga'),
  ( 9, 'en-curso',     'Nicolás Olivares Lagos',      'Emilia Palma Farías'),
  (10, 'ausente',      'Fernanda Correa Bustos',      'Matías Quezada Acuña'),
  (11, 'al-dia',       'Andrés Salinas Cea',          'Valentina Carrasco Ruiz'),
  (12, 'deuda',        'Constanza Molina Paredes',    'Pablo Fuentes Donoso'),
  (13, 'parcial',      'Felipe Rojas Navarrete',      'Antonia Silva Hidalgo'),
  (14, 'convenio',     'Francisca Mora Villalobos',   'Diego Loyola Godoy'),
  (15, 'prorroga',     'Álvaro Barrientos Ríos',      'Sofía Jorquera Campos'),
  (16, 'ultimo-aviso', 'Verónica Céspedes Díaz',     'Vicente Farias Toro'),
  (17, 'suspendido',   'Cristóbal Pizarro Peña',      'Natalia Reyes Segura'),
  (18, 'retiro',       'Macarena Ortega Gálvez',     'Claudio Escobar Neira'),
  (19, 'por-vencer',   'Javier Valenzuela Rubio',     'Carolina Olmos Vega'),
  (20, 'sin-factura',  'Javiera Henríquez Vidal',     'Esteban Carrizo Vergara'),
  (21, 'multi-plan',   'Rodrigo Cárdenas Poblete',    'Alejandra Bravo Cerda'),
  (22, 'wifi-remoto',  'María Paz Araya Muñoz',       'Renato Jara Mancilla'),
  (23, 'visita',       'Marcelo Riquelme Reyes',      'Claudia Sepúlveda Tapia'),
  (24, 'orden-local',  'Lorena Salazar Rivas',        'Héctor Cordero Mena');

DO $seed$
DECLARE
  company record;
  fixture record;
  selected_plan plan%ROWTYPE;
  alternative plan%ROWTYPE;
  plans integer[];
  seller integer;
  admin_user integer;
  technician integer;
  support_user integer;
  warehouse integer;
  equipment_type integer;
  fault_category integer;
  wifi_category integer;
  customer_id integer;
  prospect_id integer;
  contract_id integer;
  service_id integer;
  address_id integer;
  tracking_id integer;
  ticket_id integer;
  invoice_id integer;
  agreement_id integer;
  rut text;
  full_name text;
  email text;
  phone text;
  address text;
  city text;
  commune text;
  origin text;
  code text;
  serial_number text;
  external_order text;
  g3_state text;
  pipeline text;
  request uuid;
  trace uuid;
  snapshot jsonb;
  technical jsonb;
  equipment jsonb;
  active_relationship boolean;
  service_state text;
  contract_state text;
  service_type text;
  invoice_state text;
  issue_date date;
  due_date date;
  start_date date;
  closed_at timestamp;
  requested_at timestamp;
  utc_now timestamp := CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
  price numeric;
  payment numeric;
  installment numeric;
  invoice_count integer;
  wifi_result text;
  wifi_detail text;
BEGIN
  SELECT id_categoria INTO fault_category FROM categoria_falla ORDER BY (nombre ILIKE '%internet%') DESC, id_categoria LIMIT 1;
  SELECT id_categoria INTO wifi_category FROM categoria_falla WHERE nombre = 'CAMBIO_CREDENCIALES_WIFI';
  IF fault_category IS NULL OR wifi_category IS NULL THEN RAISE EXCEPTION 'Faltan categorías de soporte o WiFi'; END IF;
  FOR company IN
    SELECT id_empresa, nombre, CASE WHEN nombre = 'FiNet Limitada' THEN 1 ELSE 2 END AS slot
    FROM empresa WHERE nombre IN ('FiNet Limitada', 'Cable Mágico Litoral') ORDER BY slot
  LOOP
    SELECT array_agg(id_plan ORDER BY precio_mensual DESC, id_plan) INTO plans FROM (
      SELECT id_plan, precio_mensual FROM plan
      WHERE id_empresa = company.id_empresa AND activo IS DISTINCT FROM false AND precio_mensual >= 10000
        AND tipo_plan ~* '(internet|fibra)' ORDER BY precio_mensual DESC, id_plan LIMIT 3
    ) AS eligible_plans;
    SELECT min(u.id_usuario) FILTER (WHERE r.nombre_rol = 'Comercial'),
           min(u.id_usuario) FILTER (WHERE r.nombre_rol = 'Administrador'),
           min(u.id_usuario) FILTER (WHERE r.nombre_rol = 'Terreno'),
           min(u.id_usuario) FILTER (WHERE r.nombre_rol = 'Soporte')
    INTO seller, admin_user, technician, support_user
    FROM usuario u JOIN usuario_rol ur USING (id_usuario) JOIN rol r USING (id_rol)
    WHERE u.id_empresa = company.id_empresa AND u.activo IS DISTINCT FROM false;
    SELECT id_bodega INTO warehouse FROM bodega WHERE id_empresa = company.id_empresa AND activa IS DISTINCT FROM false ORDER BY id_bodega LIMIT 1;
    SELECT id_tipo_equipo INTO equipment_type FROM tipo_equipo
      WHERE id_empresa = company.id_empresa AND activo IS DISTINCT FROM false AND requiere_serie_individual
      ORDER BY (nombre ~* '(ONT|ONU)') DESC, id_tipo_equipo LIMIT 1;
    IF coalesce(cardinality(plans), 0) < 2 OR seller IS NULL OR admin_user IS NULL OR technician IS NULL
      OR support_user IS NULL OR warehouse IS NULL OR equipment_type IS NULL THEN
      RAISE EXCEPTION 'Catálogo incompleto en %. Se requieren dos planes, los roles locales, una bodega y un tipo de equipo serializado', company.nombre;
    END IF;

    city := CASE WHEN company.slot = 1 THEN 'Valparaíso' ELSE 'San Antonio' END;
    commune := city;
    FOR fixture IN SELECT * FROM crm_seed_case ORDER BY slot LOOP
      SELECT * INTO STRICT selected_plan FROM plan WHERE id_plan = plans[1 + (fixture.slot - 1) % cardinality(plans)];
      SELECT * INTO STRICT alternative FROM plan WHERE id_plan = plans[1 + fixture.slot % cardinality(plans)];
      code := company.slot || '-' || lpad(fixture.slot::text, 3, '0');
      rut := pg_temp.seed_rut(99900000 + company.slot * 1000 + fixture.slot);
      full_name := CASE WHEN company.slot = 1 THEN fixture.finet_name ELSE fixture.cable_name END;
      email := 'contacto.' || code || '@crm.example.invalid';
      phone := '+5690000' || lpad((company.slot * 100 + fixture.slot)::text, 4, '0');
      address := (ARRAY['Pasaje Las Calandrias', 'Calle Vista del Estero', 'Paseo del Arrayán', 'Camino Alto del Faro'])[1 + fixture.slot % 4] || ' ' || (100 + fixture.slot * 13);
      origin := (ARRAY['Sucursal', 'Teléfono', 'Sitio web', 'Referido'])[1 + fixture.slot % 4];
      active_relationship := fixture.slot >= 11;
      start_date := CURRENT_DATE - CASE WHEN fixture.scenario = 'sin-factura' THEN 9 WHEN active_relationship THEN 160 ELSE 8 END;
      requested_at := start_date::timestamp + interval '2 days 15 hours';
      closed_at := requested_at + interval '4 days 4 hours';
      pipeline := CASE fixture.scenario
        WHEN 'nuevo' THEN 'Prospecto Nuevo' WHEN 'factible' THEN 'Factible'
        WHEN 'cotizada' THEN 'Cotizacion Enviada' WHEN 'sin-cobertura' THEN 'No Factible' WHEN 'perdida' THEN 'Perdido'
        WHEN 'firma' THEN 'Pendiente firma contrato' WHEN 'por-solicitar' THEN 'Pendiente activacion'
        WHEN 'ausente' THEN 'Cliente ausente' WHEN 'asignada' THEN 'Instalacion en G3' WHEN 'en-curso' THEN 'Instalacion en G3'
        ELSE 'Servicio Activo' END;
      service_state := CASE fixture.scenario WHEN 'suspendido' THEN 'Suspendido' WHEN 'retiro' THEN 'Baja' ELSE 'Activo' END;
      contract_state := CASE WHEN fixture.scenario = 'firma' THEN 'Pendiente firma contrato'
        WHEN NOT active_relationship THEN 'Firmado'
        WHEN fixture.scenario = 'suspendido' THEN 'Suspendido' WHEN fixture.scenario = 'retiro' THEN 'Baja'
        WHEN fixture.scenario IN ('deuda', 'parcial', 'convenio', 'prorroga', 'ultimo-aviso') THEN 'Moroso'
        ELSE 'Activo' END;
      customer_id := NULL;
      service_id := NULL;
      address_id := NULL;
      price := selected_plan.precio_mensual;
      service_type := CASE WHEN selected_plan.tipo_plan ~* '(tv|televisi)' THEN 'Internet + Television' ELSE 'Internet' END;

      INSERT INTO prospecto (id_empresa, id_usuario_comercial, rut, nombre_completo, email, telefono, direccion, comuna, region,
        id_plan_interes, origen_contacto, fecha_creacion, estado_pipeline, motivo_perdida, observacion_perdida, fecha_perdida,
        id_usuario_perdida, clasificacion_comercial, disponible_remarketing)
      VALUES (company.id_empresa, seller, rut, full_name, email, phone, address, commune, 'Valparaíso',
        selected_plan.id_plan, origin, start_date - 2 + time '14:00', pipeline,
        CASE WHEN fixture.scenario = 'perdida' THEN 'OTRO' END,
        CASE WHEN fixture.scenario = 'perdida' THEN 'La persona decidió conservar su conexión actual.' END,
        CASE WHEN fixture.scenario = 'perdida' THEN utc_now - interval '2 days' END,
        CASE WHEN fixture.scenario = 'perdida' THEN seller END, 'PROSPECTO', fixture.scenario = 'perdida')
      RETURNING id_prospecto INTO prospect_id;

      IF fixture.slot = 3 OR fixture.slot >= 6 THEN
        INSERT INTO cotizacion (id_prospecto, id_plan, fecha_envio, factibilidad_verificada)
        VALUES (prospect_id, selected_plan.id_plan, start_date - 1 + time '16:00', true);
      END IF;
      IF fixture.slot < 6 THEN CONTINUE; END IF;

      INSERT INTO contrato (id_empresa, id_prospecto, id_plan, fecha_inicio, dia_vencimiento, estado, numero_contrato_externo,
        fecha_firma_manual, id_usuario_firma_manual, direccion_instalacion, comuna_instalacion, ciudad_instalacion, fecha_suspension)
      VALUES (company.id_empresa, prospect_id, selected_plan.id_plan, start_date, 10, contract_state, 'CT-' || code,
        CASE WHEN fixture.scenario <> 'firma' THEN start_date END, CASE WHEN fixture.scenario <> 'firma' THEN seller END,
        address, commune, city, CASE WHEN fixture.scenario = 'suspendido' THEN CURRENT_DATE - 9 END)
      RETURNING id_contrato INTO contract_id;
      IF fixture.slot < 8 THEN CONTINUE; END IF;

      external_order := (99000000 + company.slot * 1000 + fixture.slot)::text;
      serial_number := 'ONT-' || code;
      equipment := jsonb_build_object('instalados', jsonb_build_array(jsonb_build_object('numero_serie', serial_number)), 'retirados', '[]'::jsonb);
      technical := jsonb_build_object('fecha_completada', to_char(closed_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'id_tecnico', 9000 + company.slot, 'potencia_optica_dbm', -18.5 - (fixture.slot % 5),
        'resuelto_remotamente', false, 'equipos_instalados', equipment->'instalados', 'equipos_retirados', equipment->'retirados');
      IF active_relationship THEN
        INSERT INTO cliente (id_empresa, rut, nombre_completo, email, telefono, estado, origen_contacto, fecha_creacion, importado_masivo)
        VALUES (company.id_empresa, rut, full_name, email, phone,
          CASE WHEN service_state <> 'Activo' THEN service_state WHEN contract_state = 'Moroso' THEN 'Moroso' ELSE 'Activo' END,
          origin, closed_at, false)
        RETURNING id_cliente INTO customer_id;
        INSERT INTO direccion_servicio (id_cliente, direccion_completa, comuna, ciudad, es_principal)
        VALUES (customer_id, address, commune, city, true) RETURNING id_direccion INTO address_id;
        UPDATE prospecto SET id_cliente = customer_id, fecha_conversion = closed_at::date,
          tiempo_conversion_dias = closed_at::date - (start_date - 2) WHERE id_prospecto = prospect_id;
        UPDATE contrato SET id_cliente = customer_id WHERE id_contrato = contract_id;
        INSERT INTO servicio_contratado (id_empresa, id_cliente, id_contrato, id_direccion, tipo_servicio,
          estado_operativo, fecha_creacion, fecha_activacion, datos_tecnicos)
        VALUES (company.id_empresa, customer_id, contract_id, address_id, service_type, service_state, closed_at, closed_at,
          CASE WHEN fixture.scenario <> 'orden-local' THEN jsonb_build_object(
            'fuenteInstalacion', 'G3', 'idOtG3', external_order, 'codigoOtG3', 'INST-' || code,
            'fechaCompletadaG3', technical->>'fecha_completada', 'idTecnicoG3', technical->'id_tecnico',
            'potenciaOpticaDbm', technical->'potencia_optica_dbm', 'resultadoInstalacion', technical) END)
        RETURNING id_servicio INTO service_id;
      END IF;

      IF fixture.scenario <> 'orden-local' THEN
        g3_state := CASE fixture.scenario WHEN 'asignada' THEN 'ASIGNADA' WHEN 'en-curso' THEN 'EN_CURSO'
          WHEN 'ausente' THEN 'PENDIENTE_CLIENTE_AUSENTE' ELSE 'COMPLETADA' END;
        request := md5('crm-local-installation-' || code)::uuid;
        trace := md5('crm-local-trace-' || code)::uuid;
        snapshot := jsonb_build_object('request_id', request, 'trace_id', trace, 'id_empresa', company.id_empresa,
          'id_prospecto', prospect_id, 'id_contrato', contract_id, 'id_plan', selected_plan.id_plan,
          'persona', jsonb_build_object('rut', rut, 'nombre_completo', full_name, 'email', email, 'telefono', phone),
          'direccion', jsonb_build_object('direccion_completa', address, 'comuna', commune));
        INSERT INTO integracion_instalacion_g3 (id_empresa, id_prospecto, id_cliente, id_contrato, id_plan, id_servicio,
          request_id, trace_id, id_ot_g3, codigo_ot_g3, estado_integracion, estado_ot_g3, fecha_solicitud, ultimo_intento,
          fecha_ultima_sincronizacion, intentos, payload_hash, payload_snapshot, fecha_cierre_procesado, created_at, updated_at)
        VALUES (company.id_empresa, prospect_id, customer_id, contract_id, selected_plan.id_plan, service_id,
          request, trace, external_order, 'INST-' || code, CASE WHEN active_relationship THEN 'COMPLETADA' ELSE 'ENVIADA' END,
          g3_state, requested_at, requested_at, CASE WHEN active_relationship THEN closed_at ELSE utc_now - interval '1 hour' END,
          1, encode(sha256(convert_to(pg_temp.seed_canonical_json(snapshot), 'UTF8')), 'hex'), snapshot,
          CASE WHEN active_relationship THEN closed_at END, requested_at, utc_now)
        RETURNING id_integracion INTO tracking_id;
        IF active_relationship THEN
          INSERT INTO integracion_evento_entrante (id_integracion, source, event_type, external_reference, payload_hash, processed_at, result)
          VALUES (tracking_id, 'G3', 'WORK_ORDER_COMPLETADA', request::text,
            encode(sha256(convert_to(technical::text, 'UTF8')), 'hex'), closed_at,
            jsonb_build_object('estado', 'COMPLETADA', 'activated', true, 'idCliente', customer_id, 'idServicio', service_id));
        END IF;
      END IF;

      -- El historial unifica el reflejo local y el cierre G3 por empresa e ID de orden.
      INSERT INTO orden_trabajo (id_ot, id_empresa, id_cliente, id_prospecto, id_servicio, id_direccion, id_tecnico, tipo_ot,
        prioridad, estado, codigo_seguimiento, fecha_creacion, fecha_programada, fecha_completada, potencia_optica_dbm, cierre_equipos)
      VALUES (CASE WHEN fixture.scenario = 'orden-local' THEN nextval(pg_get_serial_sequence('orden_trabajo', 'id_ot')) ELSE external_order::integer END,
        company.id_empresa, customer_id, prospect_id, service_id, address_id, technician, 'Instalacion', 'Media',
        CASE WHEN active_relationship THEN 'Completada' WHEN fixture.scenario = 'asignada' THEN 'Asignada'
          WHEN fixture.scenario = 'en-curso' THEN 'En curso' ELSE 'Pendiente' END, 'OT-INS-' || code, requested_at,
        CASE WHEN active_relationship THEN (closed_at - interval '1 hour') AT TIME ZONE 'UTC'
          WHEN fixture.scenario = 'asignada' THEN CURRENT_TIMESTAMP + interval '1 day'
          ELSE CURRENT_TIMESTAMP - interval '1 hour' END,
        CASE WHEN active_relationship THEN closed_at END,
        CASE WHEN active_relationship THEN (technical->>'potencia_optica_dbm')::numeric END,
        CASE WHEN active_relationship THEN equipment END);

      IF NOT active_relationship THEN CONTINUE; END IF;
      -- Inventario local con asignación explícita solo en el caso de orden histórica local.
      IF fixture.scenario = 'orden-local' THEN
        INSERT INTO unidad_equipo (id_tipo_equipo, id_empresa, numero_serie, estado, fecha_adquisicion,
          id_cliente_instalado, id_servicio, fecha_inicio_asignacion)
        VALUES (equipment_type, company.id_empresa, serial_number, 'Instalado', start_date - 30,
          customer_id, service_id, closed_at::date);
      END IF;

      IF fixture.scenario IN ('wifi-remoto', 'visita', 'orden-local') THEN
        INSERT INTO ticket (id_empresa, id_cliente, id_servicio, id_usuario_asignado, id_categoria, codigo_seguimiento,
          prioridad, estado, descripcion, fecha_creacion, fecha_cierre, origen, resuelto_remotamente)
        VALUES (company.id_empresa, customer_id, service_id, support_user,
          CASE WHEN fixture.scenario IN ('wifi-remoto', 'visita') THEN wifi_category ELSE fault_category END,
          'TK-' || code, CASE WHEN fixture.scenario = 'visita' THEN 'Alta' ELSE 'Media' END,
          CASE fixture.scenario WHEN 'wifi-remoto' THEN 'Resuelto' WHEN 'visita' THEN 'Escalado' ELSE 'Abierto' END,
          CASE fixture.scenario WHEN 'wifi-remoto' THEN 'Solicita cambiar el nombre de su red inalámbrica.'
            WHEN 'visita' THEN 'Solicita un cambio de red WiFi. El equipo dejó de responder durante el diagnóstico.' ELSE 'Consulta por baja velocidad en el segundo piso.' END,
          utc_now - interval '3 days', CASE WHEN fixture.scenario = 'wifi-remoto' THEN utc_now - interval '2 days' END,
          'Telefono', fixture.scenario = 'wifi-remoto')
        RETURNING id_ticket INTO ticket_id;
        IF fixture.scenario IN ('wifi-remoto', 'visita') THEN
          request := md5('crm-local-wifi-' || code)::uuid;
          trace := md5('crm-local-wifi-trace-' || code)::uuid;
          wifi_result := CASE WHEN fixture.scenario = 'wifi-remoto' THEN 'APLICADO' ELSE 'REQUIERE_ATENCION_MANUAL' END;
          wifi_detail := CASE WHEN fixture.scenario = 'wifi-remoto' THEN 'Actualización de la red inalámbrica confirmada.'
            ELSE 'El equipo no responde a la gestión remota. Requiere una visita.' END;
          INSERT INTO integracion_resultado_wifi_g2 (request_id, trace_id, id_empresa, id_ticket, payload_hash,
            exito, resultado_tecnico, estado_ticket_resultante, fecha_recepcion)
          VALUES (request::text, trace::text, company.id_empresa, ticket_id,
            encode(sha256(convert_to(
              '{"id_ticket":' || ticket_id || ',"id_empresa":' || company.id_empresa || ',"id_servicio":' || service_id
              || ',"resultado_tecnico":' || to_json(wifi_detail)::text || ',"resultado":' || to_json(wifi_result)::text
              || ',"request_id":' || to_json(request::text)::text || ',"trace_id":' || to_json(trace::text)::text || '}', 'UTF8')), 'hex'),
            fixture.scenario = 'wifi-remoto', wifi_detail,
            CASE WHEN fixture.scenario = 'wifi-remoto' THEN 'Resuelto' ELSE 'Escalado' END, CURRENT_TIMESTAMP - interval '2 days');
        END IF;
        IF fixture.scenario = 'visita' THEN
          INSERT INTO orden_trabajo (id_empresa, id_cliente, id_servicio, id_direccion, id_ticket, id_tecnico,
            tipo_ot, prioridad, estado, codigo_seguimiento, fecha_creacion, fecha_programada)
          VALUES (company.id_empresa, customer_id, service_id, address_id, ticket_id, technician,
            'Reparacion', 'Alta', 'Asignada', 'OT-REP-' || code, utc_now - interval '2 days', CURRENT_TIMESTAMP + interval '1 day');
        END IF;
      END IF;

      IF fixture.scenario = 'multi-plan' THEN
        -- Segunda contratación iniciada desde la ficha de un cliente ya activo.
        INSERT INTO contrato (id_empresa, id_cliente, id_plan, fecha_inicio, dia_vencimiento, estado, numero_contrato_externo,
          direccion_instalacion, comuna_instalacion, ciudad_instalacion)
        VALUES (company.id_empresa, customer_id, alternative.id_plan, CURRENT_DATE - 1, 10, 'Pendiente firma contrato',
          'CT-' || code || '-B', address, commune, city);
      END IF;
      IF fixture.scenario = 'sin-factura' THEN CONTINUE; END IF;

      invoice_count := CASE WHEN fixture.scenario IN ('deuda', 'al-dia') THEN 4 ELSE 1 END;
      FOR period IN REVERSE invoice_count..1 LOOP
        issue_date := (date_trunc('month', CURRENT_DATE) - make_interval(months => period))::date;
        due_date := issue_date + 9;
        IF fixture.scenario = 'por-vencer' THEN
          issue_date := CURRENT_DATE - 3;
          due_date := CURRENT_DATE + 7;
        END IF;
        invoice_state := CASE WHEN fixture.scenario IN ('al-dia', 'wifi-remoto', 'visita', 'orden-local', 'multi-plan') THEN 'Pagada'
          WHEN fixture.scenario = 'por-vencer' THEN 'Pendiente' WHEN fixture.scenario IN ('parcial', 'convenio') THEN 'Parcial' ELSE 'Vencida' END;
        INSERT INTO factura (id_contrato, periodo_mes, periodo_anio, monto, fecha_emision, fecha_limite_pago, estado, tipo_documento, folio_externo)
        VALUES (contract_id, extract(month FROM issue_date), extract(year FROM issue_date), price, issue_date, due_date,
          invoice_state, 'BOLETA', 'B-' || code || '-' || (invoice_count - period + 1))
        RETURNING id_factura INTO invoice_id;
        payment := CASE WHEN invoice_state = 'Pagada' THEN price WHEN invoice_state = 'Parcial' THEN trunc(price / 3) ELSE 0 END;
        IF payment > 0 THEN
          INSERT INTO pago (id_factura, id_cliente, monto, fecha_pago, pasarela, codigo_transaccion)
          VALUES (invoice_id, customer_id, payment,
            CASE WHEN invoice_state = 'Parcial' THEN utc_now - interval '2 hours' ELSE least(due_date, CURRENT_DATE - 1) + time '15:00' END,
            'Transferencia', 'TR-' || code || '-' || (invoice_count - period + 1));
        END IF;
      END LOOP;

      INSERT INTO evento_gestion_comercial (id_empresa, id_cliente, id_servicio, id_contrato, id_factura, tipo, canal, fecha, observacion, id_usuario_responsable)
      VALUES (company.id_empresa, customer_id, service_id, contract_id, invoice_id,
        'CONTACTO_CLIENTE', 'PRESENCIAL', CURRENT_TIMESTAMP - interval '2 days', 'Se revisó el estado de la cuenta con el titular.', seller);
      IF fixture.scenario IN ('ultimo-aviso', 'suspendido', 'retiro') THEN
        INSERT INTO evento_gestion_comercial (id_empresa, id_cliente, id_servicio, id_contrato, id_factura, tipo, canal, fecha, observacion, id_usuario_responsable)
        VALUES (company.id_empresa, customer_id, service_id, contract_id, invoice_id,
          CASE WHEN fixture.scenario = 'retiro' THEN 'AVISO_PREVIO_RETIRO' ELSE 'ULTIMO_AVISO_CORTE' END,
          'PRESENCIAL', CURRENT_TIMESTAMP - interval '10 days', 'Se informó el plazo para regularizar el saldo.', seller);
        IF fixture.scenario = 'retiro' THEN
          INSERT INTO solicitud_retiro_servicio (id_empresa, id_cliente, id_servicio, id_contrato, motivo,
            fecha_solicitada, id_usuario_responsable, observaciones)
          VALUES (company.id_empresa, customer_id, service_id, contract_id, 'Retiro del equipo al término del servicio.',
            CURRENT_DATE + 4, seller, 'El titular indicó disponibilidad en la tarde.');
        END IF;
      ELSIF fixture.scenario = 'convenio' THEN
        INSERT INTO convenio_pago (id_empresa, id_cliente, id_servicio, id_contrato, id_factura, monto_comprometido, cantidad_cuotas,
          condiciones, fecha_inicio, estado, id_usuario_responsable, id_usuario_aprobador, fecha_registro, fecha_aprobacion)
        VALUES (company.id_empresa, customer_id, service_id, contract_id, invoice_id, price, 3, 'Tres cuotas mensuales por transferencia.',
          CURRENT_DATE - 1, 'APROBADO', seller, admin_user, CURRENT_TIMESTAMP - interval '2 days', CURRENT_TIMESTAMP - interval '1 day')
        RETURNING id_convenio INTO agreement_id;
        installment := trunc(price / 3);
        INSERT INTO cuota_convenio_pago (id_convenio, numero, monto, fecha_vencimiento)
        SELECT agreement_id, n, CASE WHEN n = 3 THEN price - 2 * installment ELSE installment END, CURRENT_DATE + 7 + 30 * (n - 1)
        FROM generate_series(1, 3) n;
      ELSIF fixture.scenario = 'prorroga' THEN
        INSERT INTO prorroga_pago (id_empresa, id_cliente, id_contrato, id_factura, fecha_original, nueva_fecha, motivo, id_usuario_responsable)
        VALUES (company.id_empresa, customer_id, contract_id, invoice_id, due_date, CURRENT_DATE + 7, 'La persona solicitó pagar al término de la semana.', seller);
      ELSIF fixture.scenario = 'al-dia' THEN
        INSERT INTO cargo_adicional (id_empresa, id_cliente, id_contrato, id_servicio, tipo, monto, fecha, observacion, id_usuario_responsable)
        VALUES (company.id_empresa, customer_id, contract_id, service_id, 'REPOSICION', 5000, CURRENT_DATE, 'Reposición de adaptador en próxima facturación.', seller);
        INSERT INTO documento_tributario_externo (id_empresa, id_cliente, id_contrato, tipo_documento, folio_o_numero, folio_normalizado,
          emisor_proveedor, emisor_normalizado, fecha_emision, monto_total, id_usuario_registro)
        VALUES (company.id_empresa, customer_id, contract_id, 'BOLETA', 'EXT-' || code, 'EXT-' || code,
          'Servicios Mirador', 'SERVICIOS MIRADOR', CURRENT_DATE - 5, 12990, seller);
      END IF;
    END LOOP;

    INSERT INTO unidad_equipo (id_empresa, id_tipo_equipo, id_bodega_actual, numero_serie, estado, fecha_adquisicion)
    SELECT company.id_empresa, equipment_type, warehouse, 'ONT-ST-' || company.slot || '-' || n,
      'Disponible', CURRENT_DATE - 30 FROM generate_series(1, 5) n;
  END LOOP;
END
$seed$;

DO $validate$
BEGIN
  IF (SELECT count(*) FROM prospecto) <> 48 OR (SELECT count(*) FROM cliente) <> 28
    OR (SELECT count(*) FROM contrato) <> 40 OR (SELECT count(*) FROM servicio_contratado) <> 28
    OR (SELECT count(*) FROM orden_trabajo) <> 36 OR (SELECT count(*) FROM ticket) <> 6
    OR (SELECT count(*) FROM factura) <> 38 OR (SELECT count(*) FROM integracion_instalacion_g3) <> 32
    OR (SELECT count(*) FROM integracion_resultado_wifi_g2) <> 4 THEN
    RAISE EXCEPTION 'Faltan registros de los casos esperados';
  END IF;
  IF EXISTS (
    SELECT FROM cliente c WHERE NOT EXISTS (SELECT FROM contrato t WHERE t.id_cliente = c.id_cliente AND t.id_empresa = c.id_empresa)
      OR NOT EXISTS (SELECT FROM prospecto p WHERE p.id_cliente = c.id_cliente AND p.rut = c.rut AND p.id_empresa = c.id_empresa)
  ) OR EXISTS (
    SELECT FROM contrato t LEFT JOIN plan p USING (id_plan)
    LEFT JOIN prospecto pr USING (id_prospecto)
    WHERE p.id_plan IS NULL OR t.id_empresa IS DISTINCT FROM p.id_empresa
      OR (t.id_cliente IS NULL AND pr.id_prospecto IS NULL)
      OR (pr.id_prospecto IS NOT NULL AND (t.id_cliente IS DISTINCT FROM pr.id_cliente OR t.id_empresa IS DISTINCT FROM pr.id_empresa))
  ) OR EXISTS (
    SELECT FROM servicio_contratado s LEFT JOIN contrato t USING (id_contrato)
    LEFT JOIN direccion_servicio d USING (id_direccion)
    WHERE t.id_contrato IS NULL OR d.id_direccion IS NULL OR s.fecha_activacion IS NULL
      OR s.id_cliente IS DISTINCT FROM t.id_cliente OR s.id_empresa IS DISTINCT FROM t.id_empresa OR s.id_cliente IS DISTINCT FROM d.id_cliente
  ) OR EXISTS (
    SELECT FROM prospecto p WHERE (p.estado_pipeline = 'Servicio Activo') IS DISTINCT FROM (p.id_cliente IS NOT NULL)
      OR (p.id_cliente IS NOT NULL AND p.fecha_conversion IS NULL)
  ) THEN RAISE EXCEPTION 'Ruptura en la relación prospecto, cliente, contrato, plan, dirección o servicio'; END IF;

  IF EXISTS (
    SELECT FROM integracion_instalacion_g3 g JOIN contrato t USING (id_contrato)
    LEFT JOIN servicio_contratado s USING (id_servicio)
    LEFT JOIN orden_trabajo o ON o.id_empresa = g.id_empresa AND o.id_ot::text = g.id_ot_g3
    WHERE g.id_empresa IS DISTINCT FROM t.id_empresa OR g.id_prospecto IS DISTINCT FROM t.id_prospecto
      OR g.id_plan IS DISTINCT FROM t.id_plan OR g.id_cliente IS DISTINCT FROM t.id_cliente
      OR o.id_ot IS NULL OR o.id_servicio IS DISTINCT FROM g.id_servicio OR o.id_prospecto IS DISTINCT FROM g.id_prospecto
      OR g.payload_hash <> encode(sha256(convert_to(pg_temp.seed_canonical_json(g.payload_snapshot), 'UTF8')), 'hex')
      OR (g.estado_integracion = 'COMPLETADA' AND (s.id_servicio IS NULL OR s.id_contrato <> t.id_contrato OR g.fecha_cierre_procesado IS NULL))
      OR (g.estado_integracion <> 'COMPLETADA' AND (g.id_cliente IS NOT NULL OR g.id_servicio IS NOT NULL OR g.fecha_cierre_procesado IS NOT NULL))
  ) OR EXISTS (
    SELECT FROM orden_trabajo o JOIN ticket t USING (id_ticket)
    WHERE o.id_empresa IS DISTINCT FROM t.id_empresa OR o.id_cliente IS DISTINCT FROM t.id_cliente OR o.id_servicio IS DISTINCT FROM t.id_servicio
  ) OR EXISTS (
    SELECT FROM ticket t LEFT JOIN servicio_contratado s USING (id_servicio)
    WHERE s.id_servicio IS NULL OR t.id_empresa IS DISTINCT FROM s.id_empresa OR t.id_cliente IS DISTINCT FROM s.id_cliente
      OR (t.estado IN ('Resuelto', 'Cerrado')) IS DISTINCT FROM (t.fecha_cierre IS NOT NULL)
  ) OR EXISTS (
    SELECT FROM integracion_resultado_wifi_g2 g JOIN ticket t USING (id_ticket)
    WHERE g.id_empresa IS DISTINCT FROM t.id_empresa OR g.estado_ticket_resultante <> t.estado
  ) THEN RAISE EXCEPTION 'Orden o resultado de soporte sin correlación válida'; END IF;

  IF EXISTS (
    SELECT FROM factura f JOIN contrato t USING (id_contrato) LEFT JOIN pago p USING (id_factura)
    GROUP BY f.id_factura, t.id_cliente
    HAVING f.fecha_emision > f.fecha_limite_pago OR f.monto <= 0
      OR count(p.id_pago) FILTER (WHERE p.id_cliente IS DISTINCT FROM t.id_cliente OR p.fecha_pago::date < f.fecha_emision) > 0
      OR coalesce(sum(p.monto), 0) > f.monto OR (f.estado = 'Pagada') IS DISTINCT FROM (coalesce(sum(p.monto), 0) = f.monto)
      OR (f.estado = 'Parcial') IS DISTINCT FROM (coalesce(sum(p.monto), 0) BETWEEN 0.01 AND f.monto - 0.01)
  ) OR EXISTS (
    SELECT FROM convenio_pago cp LEFT JOIN cuota_convenio_pago cc USING (id_convenio)
    GROUP BY cp.id_convenio HAVING count(cc.id_cuota) <> cp.cantidad_cuotas OR sum(cc.monto) IS DISTINCT FROM cp.monto_comprometido
  ) THEN RAISE EXCEPTION 'Factura, pago o convenio con importes o fechas incoherentes'; END IF;
END
$validate$;

SELECT e.nombre AS empresa,
  (SELECT count(*) FROM prospecto p WHERE p.id_empresa = e.id_empresa) AS prospectos,
  (SELECT count(*) FROM cliente c WHERE c.id_empresa = e.id_empresa) AS clientes,
  (SELECT count(*) FROM contrato t WHERE t.id_empresa = e.id_empresa) AS contratos,
  (SELECT count(*) FROM servicio_contratado s WHERE s.id_empresa = e.id_empresa) AS servicios,
  (SELECT count(*) FROM orden_trabajo o WHERE o.id_empresa = e.id_empresa) AS ordenes,
  (SELECT count(*) FROM ticket t WHERE t.id_empresa = e.id_empresa) AS tickets,
  (SELECT count(*) FROM factura f JOIN contrato t USING (id_contrato) WHERE t.id_empresa = e.id_empresa) AS facturas
FROM empresa e WHERE e.nombre IN ('FiNet Limitada', 'Cable Mágico Litoral') ORDER BY e.id_empresa;

\if :aplicar
  COMMIT;
  \echo Carga local aplicada y validada.
\else
  ROLLBACK;
  \echo Validacion completa. La base anterior se conserva.
\endif
