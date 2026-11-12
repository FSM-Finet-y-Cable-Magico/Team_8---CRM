-- Verificación previa y posterior de 002_service_withdrawal.sql. SOLO LECTURA: se ejecuta dentro de una
-- transacción READ ONLY y termina en ROLLBACK. No devuelve RUT, nombres, montos ni credenciales.
-- Ejecutar ANTES de aplicar (guardar la salida) y DESPUÉS (comparar): las huellas de tablas públicas deben coincidir.
BEGIN TRANSACTION READ ONLY;

-- V1. Destino: base, rol y servidor (confirmar que es el ambiente autorizado antes de seguir).
SELECT current_database() AS base, current_user AS rol, inet_server_addr() AS servidor, inet_server_port() AS puerto, version() AS version;

-- V2. Estado del esquema privado y de sus tablas (antes: sin filas o vacío; después: 3 tablas).
SELECT n.nspname AS esquema, c.relname AS tabla
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'g8_retiros' AND c.relkind = 'r' ORDER BY c.relname;

-- V3. Restricciones creadas (después: PK, UNIQUE y CHECK esperados; ninguna FK).
SELECT conrelid::regclass AS tabla, conname, contype
FROM pg_constraint WHERE connamespace = 'g8_retiros'::regnamespace ORDER BY 1, 2;

-- V4. Nada concedido a PUBLIC dentro del esquema (después: sin filas).
SELECT table_name, privilege_type FROM information_schema.role_table_grants
WHERE table_schema = 'g8_retiros' AND grantee = 'PUBLIC';

-- V5. Solicitudes activas duplicadas por servicio (debe ser 0 antes del endurecimiento opcional).
SELECT count(*) AS servicios_con_solicitudes_activas_duplicadas FROM (
  SELECT id_servicio FROM public.solicitud_retiro_servicio WHERE estado NOT IN ('CANCELADA', 'CERRADA')
  GROUP BY id_servicio HAVING count(*) > 1) d;

-- V6. Huellas de las tablas públicas relacionadas: deben ser idénticas antes y después (la migración no las toca).
SELECT 'solicitud_retiro_servicio' AS tabla, count(*) AS filas, md5(COALESCE(string_agg(x::text, '|' ORDER BY x::text), '')) AS huella FROM public.solicitud_retiro_servicio x
UNION ALL SELECT 'ticket', count(*), md5(COALESCE(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public.ticket x
UNION ALL SELECT 'evento_gestion_comercial', count(*), md5(COALESCE(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public.evento_gestion_comercial x
UNION ALL SELECT 'servicio_contratado', count(*), md5(COALESCE(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public.servicio_contratado x
UNION ALL SELECT 'prospecto', count(*), md5(COALESCE(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public.prospecto x
UNION ALL SELECT 'unidad_equipo', count(*), md5(COALESCE(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public.unidad_equipo x;

-- V7. Dependencias de objetos públicos hacia g8_retiros (debe ser 0: nadie fuera de G8 depende del esquema).
SELECT count(*) AS dependencias_externas FROM pg_depend d
JOIN pg_class c ON c.oid = d.refobjid JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'g8_retiros' AND d.classid = 'pg_class'::regclass
  AND d.objid NOT IN (SELECT oid FROM pg_class WHERE relnamespace = 'g8_retiros'::regnamespace);

ROLLBACK;
