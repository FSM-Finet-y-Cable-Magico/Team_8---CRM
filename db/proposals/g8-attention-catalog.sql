-- PROPOSAL ONLY, 14-11-2026. NOT a seed/migration; requires owner approval and backup.
-- Preserve existing IDs/names/types/SLA, including G3 technical rows. No public DDL or fixed IDs.
-- Execute with ON_ERROR_STOP in an approved transaction with lock_timeout/statement_timeout.
-- Session-local owner inputs (NOT application configuration):
-- finet.attention_catalog_reviewed='on'
-- finet.attention_catalog_sla = JSON array of exactly seven objects:
-- {"nombre": <canonical name below>, "sla_horas": <approved SMALLINT or explicit null>, "fuente": <approval reference>}
-- No default manifest: fixture values are not an approved SLA source. Repeating with unchanged
-- data/approval inserts zero rows; sequence increments on a later failed transaction cannot be rolled back.
DO $catalog$
DECLARE
  category_name text;
  official_names text[] := ARRAY['Falla de Internet','Falla de TV','Cambio de plan','Mudanza',
    'Facturación y cobro','Consulta general','Baja de servicio'];
  manifest jsonb;
  entry jsonb;
  approved_sla smallint;
  existing_count integer;
  compatible_count integer;
  matched_sla smallint;
  id_sequence text;
  inserted_count integer := 0;
  space_pattern text := '[[:space:]' || chr(160) || chr(5760)
    || chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196)
    || chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201)
    || chr(8202) || chr(8232) || chr(8233) || chr(8239) || chr(8287)
    || chr(12288) || chr(65279) || ']+';
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'CATALOG_REQUIRES_READ_COMMITTED_FRESH_SNAPSHOT';
  END IF;
  IF current_setting('finet.attention_catalog_reviewed',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'ATTENTION_CATALOG_APPROVAL_REQUIRED';
  END IF;
  manifest := NULLIF(current_setting('finet.attention_catalog_sla',true),'')::jsonb;
  IF manifest IS NULL OR jsonb_typeof(manifest)<>'array' THEN
    RAISE EXCEPTION 'APPROVED_SEVEN_CATEGORY_SLA_MANIFEST_REQUIRED';
  END IF;
  IF jsonb_array_length(manifest)<>7 THEN RAISE EXCEPTION 'APPROVED_SEVEN_CATEGORY_SLA_MANIFEST_REQUIRED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.categoria_falla')
    AND attname='tipo' AND NOT attisdropped) THEN RAISE EXCEPTION 'SHARED_CATEGORY_TYPE_COLUMN_REQUIRED'; END IF;
  -- This conflicts with concurrent INSERT/UPDATE/DELETE and another execution, not ordinary SELECT.
  LOCK TABLE public.categoria_falla IN SHARE ROW EXCLUSIVE MODE;
  id_sequence := pg_get_serial_sequence('public.categoria_falla','id_categoria');
  IF id_sequence IS NULL THEN RAISE EXCEPTION 'EXISTING_CATEGORY_ID_SEQUENCE_REQUIRED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public.categoria_falla'::regclass
    AND a.attname='id_categoria' AND (a.attidentity IN ('a','d') OR EXISTS (
      SELECT 1 FROM pg_attrdef ad JOIN pg_depend d ON d.classid='pg_attrdef'::regclass AND d.objid=ad.oid
      WHERE ad.adrelid=a.attrelid AND ad.adnum=a.attnum AND d.refclassid='pg_class'::regclass
        AND d.refobjid=to_regclass(id_sequence)))) THEN RAISE EXCEPTION 'CATEGORY_DEFAULT_SEQUENCE_MISMATCH'; END IF;

  -- Validate all targets and approval inputs before the first insert.
  FOREACH category_name IN ARRAY official_names LOOP
    SELECT count(*) INTO existing_count FROM jsonb_array_elements(manifest) e WHERE e->>'nombre'=category_name;
    IF existing_count<>1 THEN RAISE EXCEPTION 'SLA_MANIFEST_MISSING_OR_DUPLICATE_CATEGORY: %',category_name; END IF;
    SELECT e INTO entry FROM jsonb_array_elements(manifest) e WHERE e->>'nombre'=category_name;
    IF jsonb_typeof(entry)<>'object' OR NOT (entry ? 'sla_horas')
      OR jsonb_typeof(entry->'fuente') IS DISTINCT FROM 'string' OR length(btrim(entry->>'fuente'))<5
      OR entry - ARRAY['nombre','sla_horas','fuente']::text[] <> '{}'::jsonb THEN
      RAISE EXCEPTION 'EXPLICIT_APPROVED_SLA_AND_SOURCE_REQUIRED: %',category_name;
    END IF;
    IF entry->'sla_horas'<>'null'::jsonb THEN
      IF jsonb_typeof(entry->'sla_horas')<>'number' OR (entry->>'sla_horas') !~ '^-?[0-9]+$' THEN
        RAISE EXCEPTION 'SLA_MUST_BE_APPROVED_SMALLINT_OR_EXPLICIT_NULL: %',category_name;
      END IF;
    END IF;
    approved_sla := (entry->>'sla_horas')::smallint; -- rejects overflow; never infer NULL.
    SELECT count(*),count(*) FILTER (WHERE c.tipo='ATENCION' AND c.id_categoria>0),min(c.sla_horas)
      INTO existing_count,compatible_count,matched_sla FROM public.categoria_falla c
    WHERE lower(btrim(regexp_replace(normalize(c.nombre,NFC),space_pattern,' ','g')))=lower(category_name)
      OR (category_name='Consulta general' AND lower(btrim(regexp_replace(normalize(c.nombre,NFC),space_pattern,' ','g')))='consulta');
    IF existing_count>1 THEN RAISE EXCEPTION 'AMBIGUOUS_ATTENTION_CATEGORY: %',category_name; END IF;
    IF existing_count=1 AND compatible_count<>1 THEN RAISE EXCEPTION 'EXISTING_CATEGORY_IS_NOT_VALID_ATTENTION: %',category_name; END IF;
    IF existing_count=1 AND matched_sla IS DISTINCT FROM approved_sla THEN
      RAISE EXCEPTION 'EXISTING_SLA_DIFFERS_FROM_APPROVAL_PRESERVE_AND_REVIEW: %',category_name;
    END IF;
  END LOOP;
  FOREACH category_name IN ARRAY official_names LOOP
    IF NOT EXISTS (SELECT 1 FROM public.categoria_falla c
      WHERE lower(btrim(regexp_replace(normalize(c.nombre,NFC),space_pattern,' ','g')))=lower(category_name)
        OR (category_name='Consulta general' AND lower(btrim(regexp_replace(normalize(c.nombre,NFC),space_pattern,' ','g')))='consulta')) THEN
      SELECT (e->>'sla_horas')::smallint INTO approved_sla FROM jsonb_array_elements(manifest) e WHERE e->>'nombre'=category_name;
      INSERT INTO public.categoria_falla (nombre,sla_horas,tipo) VALUES (category_name,approved_sla,'ATENCION');
      inserted_count := inserted_count+1;
    END IF;
  END LOOP;
  RAISE NOTICE 'ATTENTION_CATALOG_INSERTED=%',inserted_count;
END;
$catalog$;
