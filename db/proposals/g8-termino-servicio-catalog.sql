-- PROPOSAL ONLY, revised 14-11-2026. NOT a seed/migration; requires owner approval and backup.
-- Separate G8 flow, NOT an eighth generic G2/G8 category. Preserve Baja, technical IDs and historical SLA.
-- Four-column shared catalog only; explicit ATENCION and existing ID sequence/default. No public DDL.
-- Owner input: finet.catalog_termino_reviewed='on'.
-- If finet.catalog_termino_sla is absent, copy ONLY from one valid ATENCION Baja de servicio.
-- Approval of that copy includes preserving source NULL as unknown, never inventing a numeric SLA.
-- Alternatively supply {"sla_horas": <approved SMALLINT or explicit null>, "fuente": <approval reference>}.
-- No missing/duplicate/technical Baja is silently selected. No ORDER BY/LIMIT fallback.
-- Execute with ON_ERROR_STOP in an approved transaction with lock_timeout/statement_timeout.
DO $catalog$
DECLARE
  existing_count integer;
  attention_count integer;
  base_sla smallint;
  existing_sla smallint;
  approval jsonb;
  id_sequence text;
  space_pattern text := '[[:space:]' || chr(160) || chr(5760)
    || chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196)
    || chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201)
    || chr(8202) || chr(8232) || chr(8233) || chr(8239) || chr(8287)
    || chr(12288) || chr(65279) || ']+';
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'CATALOG_REQUIRES_READ_COMMITTED_FRESH_SNAPSHOT';
  END IF;
  IF current_setting('finet.catalog_termino_reviewed',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'TERMINATION_CATALOG_APPROVAL_REQUIRED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.categoria_falla')
    AND attname='tipo' AND NOT attisdropped) THEN RAISE EXCEPTION 'SHARED_CATEGORY_TYPE_COLUMN_REQUIRED'; END IF;
  LOCK TABLE public.categoria_falla IN SHARE ROW EXCLUSIVE MODE;
  id_sequence := pg_get_serial_sequence('public.categoria_falla','id_categoria');
  IF id_sequence IS NULL THEN RAISE EXCEPTION 'EXISTING_CATEGORY_ID_SEQUENCE_REQUIRED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public.categoria_falla'::regclass
    AND a.attname='id_categoria' AND (a.attidentity IN ('a','d') OR EXISTS (
      SELECT 1 FROM pg_attrdef ad JOIN pg_depend d ON d.classid='pg_attrdef'::regclass AND d.objid=ad.oid
      WHERE ad.adrelid=a.attrelid AND ad.adnum=a.attnum AND d.refclassid='pg_class'::regclass
        AND d.refobjid=to_regclass(id_sequence)))) THEN RAISE EXCEPTION 'CATEGORY_DEFAULT_SEQUENCE_MISMATCH'; END IF;
  approval := NULLIF(current_setting('finet.catalog_termino_sla',true),'')::jsonb;
  IF approval IS NOT NULL THEN
    IF jsonb_typeof(approval)<>'object' OR NOT (approval ? 'sla_horas')
      OR jsonb_typeof(approval->'fuente') IS DISTINCT FROM 'string' OR length(btrim(approval->>'fuente'))<5
      OR approval - ARRAY['sla_horas','fuente']::text[] <> '{}'::jsonb THEN
      RAISE EXCEPTION 'EXPLICIT_APPROVED_TERMINATION_SLA_AND_SOURCE_REQUIRED';
    END IF;
    IF approval->'sla_horas'<>'null'::jsonb THEN
      IF jsonb_typeof(approval->'sla_horas')<>'number' OR (approval->>'sla_horas') !~ '^-?[0-9]+$' THEN
        RAISE EXCEPTION 'TERMINATION_SLA_MUST_BE_APPROVED_SMALLINT_OR_EXPLICIT_NULL';
      END IF;
    END IF;
    base_sla := (approval->>'sla_horas')::smallint;
  ELSE
    SELECT count(*),count(*) FILTER (WHERE c.tipo='ATENCION' AND c.id_categoria>0),min(c.sla_horas)
      INTO existing_count,attention_count,base_sla FROM public.categoria_falla c
    WHERE lower(btrim(regexp_replace(normalize(c.nombre,NFC),space_pattern,' ','g')))=lower('Baja de servicio');
    IF existing_count<>1 OR attention_count<>1 THEN
      RAISE EXCEPTION 'UNIQUE_ATTENTION_BAJA_OR_EXPLICIT_APPROVED_SLA_REQUIRED';
    END IF;
  END IF;
  SELECT count(*),count(*) FILTER (WHERE c.tipo='ATENCION' AND c.id_categoria>0),min(c.sla_horas)
    INTO existing_count,attention_count,existing_sla FROM public.categoria_falla c
  WHERE lower(btrim(regexp_replace(normalize(c.nombre,NFC),space_pattern,' ','g')))=lower('Término de servicio');
  IF existing_count>1 OR (existing_count=1 AND attention_count<>1) THEN
    RAISE EXCEPTION 'TERMINATION_CATEGORY_AMBIGUOUS_OR_INCOMPATIBLE';
  END IF;
  IF existing_count=1 THEN
    IF existing_sla IS DISTINCT FROM base_sla THEN
      RAISE EXCEPTION 'EXISTING_TERMINATION_SLA_DIFFERS_PRESERVE_AND_REVIEW';
    END IF;
    RAISE NOTICE 'TERMINATION_CATALOG_INSERTED=0';
    RETURN;
  END IF;
  INSERT INTO public.categoria_falla (nombre,sla_horas,tipo) VALUES ('Término de servicio',base_sla,'ATENCION');
  RAISE NOTICE 'TERMINATION_CATALOG_INSERTED=1';
END;
$catalog$;
