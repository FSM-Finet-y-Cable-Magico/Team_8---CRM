-- LOCAL ONLY. Synthetic UI examples; no outbound integration requests or real callbacks.
-- Run through scripts/seed-installations-ui.ps1 against the local Docker database.
-- Each scenario has its own DEMO identity. Re-running skips existing examples.
BEGIN;
-- The current read projection expects the canonical G3 field, absent in older local seeds.
ALTER TABLE public.orden_trabajo ADD COLUMN IF NOT EXISTS cierre_equipos JSONB;

DO $$
DECLARE
  demo record;
  company_id integer;
  plan_id integer;
  customer_id integer;
  prospect_id integer;
  contract_id integer;
  service_id integer;
  technician_id integer;
  order_id integer;
  technical_date timestamp;
  technical_data jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('demo_ui_instalaciones_v1'));
  FOR demo IN SELECT * FROM (VALUES
    (1, 'Sofía Demo', 1, 'COORDINAR'),
    (2, 'Martín Demo', 1, 'ASIGNADA'),
    (3, 'Valentina Demo', 2, 'EN_CURSO'),
    (4, 'Camila Demo', 1, 'G3_COMPLETADA'),
    (5, 'Diego Demo', 2, 'LOCAL_COMPLETADA'),
    (6, 'Antonia Demo', 1, 'G3_SIN_FECHA')
  ) AS scenarios(number, name, company, scenario)
  LOOP
    IF EXISTS (SELECT 1 FROM cliente WHERE email = 'instalacion-demo-' || demo.number || '@example.invalid') THEN
      SELECT id_cliente INTO customer_id FROM cliente WHERE email = 'instalacion-demo-' || demo.number || '@example.invalid' AND origen_contacto = 'DEMO_UI_INSTALACIONES';
      UPDATE cliente SET nombre_completo = 'DEMO · ' || demo.name WHERE id_cliente = customer_id;
      UPDATE prospecto SET nombre_completo = 'DEMO · ' || demo.name WHERE id_cliente = customer_id AND origen_contacto = 'DEMO_UI_INSTALACIONES';
      UPDATE prospecto SET direccion = 'Domicilio de demostración ' || demo.number
        WHERE id_cliente = customer_id AND origen_contacto = 'DEMO_UI_INSTALACIONES' AND direccion = 'Domicilio de demostraci?n ' || demo.number;
      UPDATE servicio_contratado SET estado_operativo = 'Pendiente Instalacion' WHERE id_cliente = customer_id AND estado_operativo = 'Pendiente' AND observaciones LIKE 'DEMO_UI_INSTALACIONES:%';
      IF demo.scenario = 'G3_SIN_FECHA' THEN
        UPDATE orden_trabajo SET fecha_programada = CURRENT_DATE - INTERVAL '2 days' + INTERVAL '13 hours'
          WHERE id_cliente = customer_id AND codigo_seguimiento = 'DEMO-INS-0006' AND fecha_programada > CURRENT_TIMESTAMP;
      END IF;
      CONTINUE;
    END IF;
    SELECT id_empresa INTO company_id FROM empresa WHERE id_empresa = demo.company;
    SELECT id_plan INTO plan_id FROM plan WHERE id_empresa = company_id ORDER BY id_plan LIMIT 1;
    IF company_id IS NULL OR plan_id IS NULL THEN RAISE EXCEPTION 'Falta empresa o plan local para la demo'; END IF;
    SELECT id_usuario INTO technician_id FROM usuario WHERE id_empresa = company_id AND nombre_completo ILIKE '%terreno%' ORDER BY id_usuario LIMIT 1;
    technical_date := CASE WHEN demo.scenario IN ('G3_COMPLETADA', 'LOCAL_COMPLETADA') THEN CURRENT_DATE - INTERVAL '2 days' + INTERVAL '15 hours' ELSE NULL END;
    INSERT INTO cliente (id_empresa, nombre_completo, email, estado, origen_contacto, datos_tecnicos)
      VALUES (company_id, 'DEMO · ' || demo.name, 'instalacion-demo-' || demo.number || '@example.invalid',
        CASE WHEN demo.scenario IN ('COORDINAR', 'ASIGNADA', 'EN_CURSO') THEN 'Pendiente Instalacion' ELSE 'Activo' END,
        'DEMO_UI_INSTALACIONES', '{"fixture":"demo_ui_instalaciones_v1"}') RETURNING id_cliente INTO customer_id;
    INSERT INTO prospecto (id_empresa, id_cliente, nombre_completo, email, telefono, direccion, comuna, region, estado_pipeline, origen_contacto, fecha_creacion)
      VALUES (company_id, customer_id, 'DEMO · ' || demo.name, 'instalacion-demo-' || demo.number || '@example.invalid',
        '+56900000000', 'Domicilio de demostración ' || demo.number, 'Puente Alto', 'Metropolitana de Santiago', 'Aceptado', 'DEMO_UI_INSTALACIONES', CURRENT_TIMESTAMP)
      RETURNING id_prospecto INTO prospect_id;
    INSERT INTO contrato (id_empresa, id_cliente, id_prospecto, id_plan, fecha_inicio, dia_vencimiento, estado, observacion_contrato)
      VALUES (company_id, customer_id, prospect_id, plan_id, CURRENT_DATE - 3, 10,
        CASE WHEN demo.scenario IN ('COORDINAR', 'ASIGNADA', 'EN_CURSO') THEN 'Firmado' ELSE 'Activo' END,
        'DEMO_UI_INSTALACIONES: ejemplo visual local, sin firma ni entrega reales') RETURNING id_contrato INTO contract_id;
    INSERT INTO servicio_contratado (id_empresa, id_cliente, id_contrato, tipo_servicio, estado_operativo, observaciones)
      VALUES (company_id, customer_id, contract_id, 'Internet',
        CASE WHEN demo.scenario IN ('COORDINAR', 'ASIGNADA', 'EN_CURSO') THEN 'Pendiente Instalacion' ELSE 'Activo' END,
        'DEMO_UI_INSTALACIONES: sin asignación real de inventario') RETURNING id_servicio INTO service_id;
    IF demo.scenario <> 'COORDINAR' THEN
      INSERT INTO orden_trabajo (id_empresa, id_cliente, id_prospecto, id_servicio, id_tecnico, tipo_ot, prioridad, estado,
        codigo_seguimiento, fecha_creacion, fecha_programada, fecha_completada, potencia_optica_dbm, observaciones, cierre_equipos)
      VALUES (company_id, customer_id, prospect_id, service_id, technician_id, 'Instalacion',
        CASE WHEN demo.scenario = 'EN_CURSO' THEN 'Alta' ELSE 'Media' END,
        CASE WHEN demo.scenario = 'ASIGNADA' THEN 'Asignada' WHEN demo.scenario = 'EN_CURSO' THEN 'En curso' ELSE 'Completada' END,
        'DEMO-INS-' || lpad(demo.number::text, 4, '0'), CURRENT_TIMESTAMP,
        CASE WHEN technical_date IS NOT NULL THEN technical_date
          WHEN demo.scenario = 'G3_SIN_FECHA' THEN CURRENT_DATE - INTERVAL '2 days' + INTERVAL '13 hours'
          ELSE CURRENT_DATE + INTERVAL '1 day' + INTERVAL '13 hours' END,
        technical_date, CASE WHEN technical_date IS NOT NULL THEN -21.5 ELSE NULL END,
        E'[CU17]\nTipoConexion=Fibra Optica\nHoraVisita=10:00\n[OBSERVACIONES_AGENDA]\nDEMO_UI_INSTALACIONES: ejemplo local\n[OBSERVACIONES_CIERRE]\n',
        CASE WHEN technical_date IS NOT NULL THEN jsonb_build_object('instalados', jsonb_build_array(jsonb_build_object('numero_serie', 'DEMO-ONT-' || demo.number)), 'retirados', '[]'::jsonb) ELSE NULL END)
      RETURNING id_ot INTO order_id;
    END IF;
    IF demo.scenario IN ('G3_COMPLETADA', 'G3_SIN_FECHA') THEN
      technical_data := jsonb_build_object('fixture', 'demo_ui_instalaciones_v1', 'fuenteInstalacion', 'G3', 'idOtG3', order_id::text);
      IF technical_date IS NOT NULL THEN
        technical_data := technical_data || jsonb_build_object('fechaCompletadaG3', to_char(technical_date, 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z');
      END IF;
      UPDATE servicio_contratado SET datos_tecnicos = technical_data WHERE id_servicio = service_id;
      INSERT INTO integracion_instalacion_g3 (id_empresa, id_prospecto, id_cliente, id_contrato, id_plan, id_servicio,
        request_id, trace_id, id_ot_g3, codigo_ot_g3, estado_integracion, estado_ot_g3, fecha_cierre_procesado,
        payload_hash, payload_snapshot, intentos, updated_at)
      VALUES (company_id, prospect_id, customer_id, contract_id, plan_id, service_id,
        md5('demo-ui-request-' || demo.number)::uuid, md5('demo-ui-trace-' || demo.number)::uuid, order_id::text,
        'DEMO-G3-' || demo.number, 'COMPLETADA', 'COMPLETADA', CURRENT_TIMESTAMP,
        repeat('0', 64), '{"fixture":"demo_ui_instalaciones_v1","simulado":true}', 0, CURRENT_TIMESTAMP);
    END IF;
  END LOOP;
END $$;
COMMIT;
SELECT 'Ejemplos locales de instalaciones' AS seed, count(*) AS clientes_demo
FROM cliente WHERE origen_contacto = 'DEMO_UI_INSTALACIONES';
