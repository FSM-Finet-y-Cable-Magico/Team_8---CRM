BEGIN READ ONLY;
SET LOCAL statement_timeout = '20s';

\echo '=== A. Identidad y tablas'
SELECT current_database() AS base, current_user AS ejecutor,
       to_regclass('public.categoria_falla') AS catalogo,
       to_regclass('public.ticket') AS tabla_tickets,
       to_regclass('public.orden_trabajo') AS tabla_ot;

\echo '=== B. Esquema real (incluye si existe tipo)'
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('categoria_falla', 'ticket', 'orden_trabajo')
  AND column_name IN ('id_categoria', 'id_categoria_falla', 'nombre', 'sla_horas', 'tipo')
ORDER BY table_name, ordinal_position;

\echo '=== C. Catalogo completo'
SELECT c.id_categoria, c.nombre, c.sla_horas,
       (to_jsonb(c) ? 'tipo') AS tipo_disponible,
       to_jsonb(c)->>'tipo' AS tipo
FROM public.categoria_falla AS c
ORDER BY c.id_categoria;

\echo '=== D. Nombres duplicados al normalizar mayusculas y espacios'
SELECT lower(regexp_replace(btrim(nombre), '[[:space:]]+', ' ', 'g')) AS clave,
       COUNT(*) AS filas,
       array_agg(id_categoria ORDER BY id_categoria) AS ids
FROM public.categoria_falla
GROUP BY 1 HAVING COUNT(*)>1 ORDER BY 1;

\echo '=== E. Uso por tickets y OT (se omite sola si faltan columnas)'
SELECT CASE WHEN
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND
     ((table_name='ticket' AND column_name IN ('id_ticket','id_categoria'))
   OR (table_name='orden_trabajo' AND column_name IN ('id_ot','id_categoria_falla')))) = 4
THEN $q$
  SELECT c.id_categoria, c.nombre, COUNT(DISTINCT t.id_ticket) AS tickets,
         COUNT(DISTINCT ot.id_ot) AS ordenes_trabajo
  FROM public.categoria_falla AS c
  LEFT JOIN public.ticket AS t ON t.id_categoria=c.id_categoria
  LEFT JOIN public.orden_trabajo AS ot ON ot.id_categoria_falla=c.id_categoria
  GROUP BY c.id_categoria, c.nombre ORDER BY c.id_categoria
$q$
ELSE $q$ SELECT 'E omitida: faltan columnas, revisar la salida de B' AS aviso $q$ END
\gexec

\echo '=== F. Indices y restricciones del catalogo (unicidad por nombre, FK entrantes)'
SELECT 'indice' AS tipo, indexname AS nombre, indexdef AS definicion
FROM pg_indexes WHERE schemaname='public' AND tablename='categoria_falla'
UNION ALL
SELECT 'restriccion', conname, pg_get_constraintdef(oid)
FROM pg_constraint WHERE conrelid='public.categoria_falla'::regclass
UNION ALL
SELECT 'fk_entrante', conrelid::regclass::text||' ('||conname||')', pg_get_constraintdef(oid)
FROM pg_constraint WHERE confrelid='public.categoria_falla'::regclass AND contype='f'
ORDER BY 1, 2;

COMMIT;
