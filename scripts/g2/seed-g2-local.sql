-- Datos de prueba para el smoke local de los endpoints S2S de G2 (docs/g2/smoke-g2.http).
-- SOLO base local creada con scripts/bootstrap-local-db.ps1. Nunca ejecutar contra Railway.
-- Es repetible: borra y recrea únicamente sus propias filas (ids 990001 en adelante).

DO $$
BEGIN
  IF current_database() NOT IN ('fsm_i3_baseline_test', 'fsm_db') THEN
    RAISE EXCEPTION 'seed-g2-local.sql solo se ejecuta en la base local (base actual: %)', current_database();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM categoria_falla WHERE nombre = 'CAMBIO_CREDENCIALES_WIFI') THEN
    RAISE EXCEPTION 'Falta la categoria CAMBIO_CREDENCIALES_WIFI: aplicar antes las migraciones locales';
  END IF;
END $$;

-- Reinicio de las filas propias del smoke.
DELETE FROM integracion_resultado_wifi_g2 WHERE id_ticket BETWEEN 990001 AND 990099;
DELETE FROM ticket WHERE id_ticket BETWEEN 990001 AND 990099;
DELETE FROM pago WHERE id_pago BETWEEN 990001 AND 990099 OR codigo_transaccion LIKE 'G2-SMOKE-%';
DELETE FROM factura WHERE id_factura BETWEEN 990001 AND 990999;
DELETE FROM servicio_contratado WHERE id_servicio BETWEEN 990001 AND 990099;
DELETE FROM contrato WHERE id_contrato BETWEEN 990001 AND 990099;
DELETE FROM cliente WHERE id_cliente BETWEEN 990001 AND 990099;

INSERT INTO empresa (id_empresa, nombre, rut_empresa, esquema_db)
VALUES (1, 'FiNet', '76.000.001-1', 'finet'), (2, 'Cable Magico Litoral', '76.000.002-K', 'cable_magico')
ON CONFLICT (id_empresa) DO NOTHING;

-- Un cliente por empresa.
INSERT INTO cliente (id_cliente, id_empresa, rut, nombre_completo, estado) VALUES
  (990001, 1, '99000001-8', 'Cliente Smoke G2 Empresa 1', 'Activo'),
  (990002, 2, '99000002-6', 'Cliente Smoke G2 Empresa 2', 'Activo');

INSERT INTO contrato (id_contrato, id_cliente, id_empresa, fecha_inicio, dia_vencimiento, estado) VALUES
  (990001, 990001, 1, DATE '2016-01-01', 10, 'Activo'),
  (990002, 990002, 2, DATE '2026-01-01', 10, 'Activo');

INSERT INTO servicio_contratado (id_servicio, id_cliente, id_empresa, id_contrato, tipo_servicio, estado_operativo) VALUES
  (990001, 990001, 1, 990001, 'Internet', 'Activo');

-- Empresa 1: 120 facturas vencidas de 10.000 (más de una página de 100).
INSERT INTO factura (id_factura, id_contrato, periodo_mes, periodo_anio, monto, fecha_emision, fecha_limite_pago, estado)
SELECT 990000 + n, 990001,
  EXTRACT(MONTH FROM d)::smallint, EXTRACT(YEAR FROM d)::smallint, 10000,
  d::date, (d + INTERVAL '9 days')::date, 'Pendiente'
FROM generate_series(1, 120) AS n,
  LATERAL (SELECT DATE '2026-01-01' - (n || ' months')::interval AS d) AS periodo;

INSERT INTO factura (id_factura, id_contrato, periodo_mes, periodo_anio, monto, fecha_emision, fecha_limite_pago, estado) VALUES
  (990121, 990001, 1, 2026, NULL,  DATE '2026-01-01', DATE '2026-01-10', 'Pendiente'), -- sin monto
  (990122, 990001, 2, 2026, 12000, DATE '2026-02-01', DATE '2026-02-10', 'Pagada'),    -- pagada completa
  (990123, 990001, 3, 2026, 19990, DATE '2026-03-01', DATE '2026-03-10', 'Pendiente'), -- pago parcial
  (990124, 990001, 4, 2026, 8000,  DATE '2026-04-01', DATE '2099-12-31', 'Pendiente'); -- para POST payments

INSERT INTO pago (id_pago, id_factura, id_cliente, monto, fecha_pago, codigo_transaccion, pasarela) VALUES
  (990001, 990122, 990001, 12000, TIMESTAMP '2026-02-05 12:00:00', 'G2-SMOKE-PAGADA', 'Caja local'),
  (990002, 990123, 990001, 5000,  TIMESTAMP '2026-03-05 12:00:00', 'G2-SMOKE-PARCIAL', 'Caja local');

-- Empresa 2: una factura al día.
INSERT INTO factura (id_factura, id_contrato, periodo_mes, periodo_anio, monto, fecha_emision, fecha_limite_pago, estado) VALUES
  (990201, 990002, 10, 2026, 15000, DATE '2026-10-01', DATE '2099-12-31', 'Pendiente');

-- Tickets WiFi: G2 los crea con estado 'abierto' en minúscula.
INSERT INTO ticket (id_ticket, id_cliente, id_empresa, id_servicio, id_categoria, codigo_seguimiento, prioridad, estado, descripcion, origen)
SELECT t.id_ticket, 990001, 1, 990001, c.id_categoria, t.codigo, 'Media', t.estado, 'Smoke G2: cambio de credenciales WiFi', 'PORTAL'
FROM categoria_falla c,
  (VALUES (990001, 'G2SMK-ABIERTO', 'abierto'), (990002, 'G2SMK-CERRADO', 'Cerrado'), (990003, 'G2SMK-APLICADO', 'abierto')) AS t(id_ticket, codigo, estado)
WHERE c.nombre = 'CAMBIO_CREDENCIALES_WIFI';

-- Saldo exigible esperado del cliente 990001: 120 x 10.000 + 0 + 0 + 14.990 + 8.000 = 1.222.990 en 124 facturas.
