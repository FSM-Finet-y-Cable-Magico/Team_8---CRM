-- PROPOSAL (FINET 13-11-2026): additive insertion of the G8 attention category «Término de servicio» in the existing
-- public.categoria_falla catalogue. NOT a migration and NOT part of any seed. DO NOT RUN without explicit authorization
-- of the catalogue owner (shared with G2/G3) and a prior backup; same review procedure as c2-tk-01-attention-categories-qa.sql.
--
-- * Structure is not changed: only one row, using the table's own serial (no fixed ID).
-- * «Baja de servicio» is NOT renamed and its ID is NOT reused: it stays as the morosity category.
-- * SLA: copied from the existing «Baja de servicio» row (no invented value); the owner may adjust it before running.
-- * tipo: 'ATENCION' only when the column exists (finet_global_validacion: tipo VARCHAR(20) NOT NULL DEFAULT 'INTERNA').
-- * Idempotent: if an equivalent name already exists (any capitalization/spaces), nothing is inserted; if it exists with
--   another type, it aborts so the owner reviews it (G8 never picks among duplicates).
-- Usage (owner only): SET finet.catalog_termino_reviewed = 'on'; \i g8-termino-servicio-catalog.sql
DO $catalog$
DECLARE
  has_type boolean;
  existing_count integer;
  attention_count integer;
  base_sla smallint;
BEGIN
  IF current_setting('finet.catalog_termino_reviewed', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'El catálogo requiere revisión y autorización explícitas antes de agregar «Término de servicio»';
  END IF;
  LOCK TABLE public.categoria_falla IN SHARE ROW EXCLUSIVE MODE;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'categoria_falla' AND column_name = 'tipo') INTO has_type;
  SELECT count(*), count(*) FILTER (WHERE NOT has_type OR to_jsonb(c)->>'tipo' = 'ATENCION')
    INTO existing_count, attention_count
    FROM public.categoria_falla c
    WHERE lower(btrim(regexp_replace(normalize(c.nombre, NFC), '[[:space:]]+', ' ', 'g'))) = lower('Término de servicio');
  IF existing_count > 0 THEN
    IF existing_count <> 1 OR attention_count <> 1 THEN
      RAISE EXCEPTION '«Término de servicio» ya existe duplicada o con otro tipo; requiere revisión del propietario';
    END IF;
    RAISE NOTICE '«Término de servicio» ya existe como ATENCION; no se modifica nada';
    RETURN;
  END IF;
  SELECT c.sla_horas INTO base_sla FROM public.categoria_falla c
    WHERE lower(btrim(normalize(c.nombre, NFC))) = lower('Baja de servicio') ORDER BY c.id_categoria LIMIT 1;
  IF has_type THEN
    EXECUTE 'INSERT INTO public.categoria_falla (nombre, sla_horas, tipo) VALUES ($1, $2, ''ATENCION'')' USING 'Término de servicio', base_sla;
  ELSE
    INSERT INTO public.categoria_falla (nombre, sla_horas) VALUES ('Término de servicio', base_sla);
  END IF;
END
$catalog$;
