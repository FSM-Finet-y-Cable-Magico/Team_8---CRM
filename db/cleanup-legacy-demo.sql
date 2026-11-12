-- Local demo only. Run after restoring the legacy demo snapshot and applying the current schema.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(7102026);

DO $check$
BEGIN
  IF current_database() <> 'fsm_db' THEN
    RAISE EXCEPTION 'Esta limpieza es exclusiva de la base demo local fsm_db';
  END IF;
END
$check$;

CREATE TEMP TABLE legacy_demo_customers ON COMMIT DROP AS
SELECT c.id_cliente
FROM cliente c
JOIN (VALUES
  (4, 'e0d4883803577cf5404b35e610ce1310'), (7, '34ba926b359333348bb612e1c814275b'),
  (8, '63ad657005baab2d4ee2057b31ca2ca6'), (9, '5ede27368ac1be144c03032095806415'),
  (11, 'e6d01f6df6ea9291c32d2d791087d230'), (12, '5655e0dda453ad6aecda300a6e303b1c'),
  (15, '649b7c4975296a5bc194ea36316d195c'), (16, '10d69d10c3b3d4b235a64704a1dc48a3'),
  (17, '2cd4b44ab4e54dd1c6e9af86cc6b1960'), (18, 'df2ed9892ef45084e2e020bfb52b71dc'),
  (19, '062a8b09c3035016e7448f1a962fdb2c'), (22, '3c178774e14e3b9d65411cc4c2754cb7')
) AS fixture(id, rut_fingerprint) ON fixture.id = c.id_cliente AND fixture.rut_fingerprint = md5(c.rut)
WHERE c.id_empresa = 1
  AND coalesce(c.origen_contacto, 'Dato historico') = 'Dato historico'
  AND NOT EXISTS (SELECT FROM contrato t WHERE t.id_cliente = c.id_cliente)
  AND NOT EXISTS (SELECT FROM servicio_contratado s WHERE s.id_cliente = c.id_cliente);

SELECT c.id_cliente FROM cliente c JOIN legacy_demo_customers d USING (id_cliente) FOR UPDATE OF c;

DELETE FROM sesion_portal WHERE id_cliente IN (SELECT id_cliente FROM legacy_demo_customers);

DELETE FROM ticket
WHERE id_ticket = 6 AND id_cliente = 18 AND id_empresa = 1 AND id_servicio IS NULL AND estado = 'Cerrado'
  AND id_cliente IN (SELECT id_cliente FROM legacy_demo_customers)
  AND NOT EXISTS (SELECT FROM orden_trabajo WHERE id_ticket = 6)
  AND NOT EXISTS (SELECT FROM integracion_resultado_wifi_g2 WHERE id_ticket = 6);

UPDATE unidad_equipo
SET id_cliente_instalado = NULL, estado = 'Disponible'
WHERE id_unidad = 25 AND id_cliente_instalado = 22 AND id_empresa = 1 AND id_servicio IS NULL AND estado = 'Instalado'
  AND id_cliente_instalado IN (SELECT id_cliente FROM legacy_demo_customers);

DO $check$
DECLARE
  dependency record;
  linked boolean;
BEGIN
  FOR dependency IN
    SELECT DISTINCT fk.conrelid::regclass AS table_name, attr.attname AS column_name
    FROM pg_constraint fk JOIN pg_attribute attr ON attr.attrelid = fk.conrelid AND attr.attnum = fk.conkey[1]
    WHERE fk.contype = 'f' AND fk.confrelid = 'cliente'::regclass
  LOOP
    EXECUTE format('SELECT EXISTS (SELECT FROM %s WHERE %I IN (SELECT id_cliente FROM pg_temp.legacy_demo_customers))',
      dependency.table_name, dependency.column_name) INTO linked;
    IF linked THEN RAISE EXCEPTION 'Quedan relaciones inesperadas en %', dependency.table_name; END IF;
  END LOOP;
  IF EXISTS (SELECT FROM observacion_operativa o JOIN legacy_demo_customers d
    ON o.id_cliente = d.id_cliente OR (lower(o.tipo_entidad) = 'cliente' AND o.id_entidad = d.id_cliente))
  THEN RAISE EXCEPTION 'Quedan observaciones vinculadas'; END IF;
END
$check$;

DELETE FROM cliente c USING legacy_demo_customers d WHERE c.id_cliente = d.id_cliente
RETURNING c.id_cliente;

-- A retired service can retain invoices. Reconcile only the status of the known demo case.
UPDATE cliente c
SET estado = 'Baja'
WHERE c.origen_contacto = 'DEMO_LIBRO_CONTROL_V1' AND c.datos_tecnicos->>'caso' = 'monthly'
  AND c.estado IN ('Suspendido', 'Moroso')
  AND EXISTS (SELECT FROM contrato t WHERE t.id_cliente = c.id_cliente AND t.estado = 'Baja')
  AND NOT EXISTS (SELECT FROM contrato t WHERE t.id_cliente = c.id_cliente AND t.estado IS DISTINCT FROM 'Baja' AND t.estado IS DISTINCT FROM 'Anulado')
  AND NOT EXISTS (SELECT FROM servicio_contratado s WHERE s.id_cliente = c.id_cliente AND s.estado_operativo IS DISTINCT FROM 'Baja')
RETURNING c.id_cliente, c.estado;

COMMIT;
