-- Pre/post verification of 002_service_withdrawal.sql. READ ONLY: runs inside a READ ONLY transaction
-- and ends in ROLLBACK. Returns no RUT, names, amounts or credentials.
-- Run BEFORE applying (keep the output) and AFTER (compare): public table fingerprints must match.
-- Works when the schema does NOT exist yet: no ::regnamespace cast (it fails on a missing schema);
-- to_regnamespace() returns NULL instead.
BEGIN TRANSACTION READ ONLY;

-- V1. Target: database, role and server (confirm it is the authorized environment before continuing).
SELECT current_database() AS base, current_user AS rol, inet_server_addr() AS servidor, inet_server_port() AS puerto, version() AS version;

-- V2. Private schema and tables (before: schema absent; after: 3 tables).
SELECT to_regnamespace('g8_retiros') IS NOT NULL AS esquema_existe,
       (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = 'g8_retiros') AS propietario;
SELECT c.relname AS tabla FROM pg_class c
WHERE c.relnamespace = to_regnamespace('g8_retiros') AND c.relkind = 'r' ORDER BY c.relname;

-- V3. Constraints (after: PK, UNIQUE and CHECK; NO foreign keys).
SELECT conrelid::regclass AS tabla, conname, contype FROM pg_constraint
WHERE connamespace = to_regnamespace('g8_retiros') ORDER BY 1, 2;
SELECT count(*) AS claves_foraneas FROM pg_constraint WHERE connamespace = to_regnamespace('g8_retiros') AND contype = 'f';

-- V4. Nothing granted to PUBLIC inside the schema (after: no rows).
SELECT table_name, privilege_type FROM information_schema.role_table_grants
WHERE table_schema = 'g8_retiros' AND grantee = 'PUBLIC';

-- V5. Duplicated active requests per service (must be 0 before the optional hardening).
SELECT count(*) AS servicios_con_solicitudes_activas_duplicadas FROM (
  SELECT id_servicio FROM public.solicitud_retiro_servicio WHERE estado NOT IN ('CANCELADA', 'CERRADA')
  GROUP BY id_servicio HAVING count(*) > 1) d;

-- V6. Fingerprints of related public tables: identical before and after (the migration does not touch them).
SELECT 'solicitud_retiro_servicio' AS tabla, count(*) AS filas, md5(COALESCE(string_agg(x::text, '|' ORDER BY x::text), '')) AS huella FROM public.solicitud_retiro_servicio x
UNION ALL SELECT 'ticket', count(*), md5(COALESCE(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public.ticket x
UNION ALL SELECT 'evento_gestion_comercial', count(*), md5(COALESCE(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public.evento_gestion_comercial x
UNION ALL SELECT 'servicio_contratado', count(*), md5(COALESCE(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public.servicio_contratado x
UNION ALL SELECT 'contrato', count(*), md5(COALESCE(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public.contrato x
UNION ALL SELECT 'cliente', count(*), md5(COALESCE(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public.cliente x
UNION ALL SELECT 'prospecto', count(*), md5(COALESCE(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public.prospecto x
UNION ALL SELECT 'unidad_equipo', count(*), md5(COALESCE(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public.unidad_equipo x;

-- V7. Dependencies of objects outside g8_retiros on it (must be 0).
SELECT count(*) AS dependencias_externas FROM pg_depend d
JOIN pg_class c ON c.oid = d.refobjid
WHERE c.relnamespace = to_regnamespace('g8_retiros') AND d.classid = 'pg_class'::regclass
  AND d.objid NOT IN (SELECT oid FROM pg_class WHERE relnamespace = to_regnamespace('g8_retiros'));

-- V8. G3's own table, informative only (it belongs to G3; G8 never creates or alters it).
SELECT to_regclass('public.solicitud_baja_integracion') IS NOT NULL AS tabla_g3_solicitud_baja_existe;

ROLLBACK;
