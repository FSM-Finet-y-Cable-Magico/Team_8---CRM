-- Propuesta manual para QA. No forma parte del seed ni de las migraciones.
-- Revisar primero el catálogo con sus responsables. Solo después habilitar
-- finet.qa_catalog_reviewed = 'on' en la sesión que ejecute este archivo.
-- Conserva IDs, nombres, SLA y tipos existentes; las dos altas usan el serial.
DO $catalog$
DECLARE
  category_name text;
  existing_count integer;
  attention_count integer;
  has_type boolean;
  space_pattern text := '[[:space:]' || chr(160) || chr(5760)
    || chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196)
    || chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201)
    || chr(8202) || chr(8232) || chr(8233) || chr(8239) || chr(8287)
    || chr(12288) || chr(65279) || ']+';
BEGIN
  IF current_setting('finet.qa_catalog_reviewed', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'El catálogo QA requiere revisión explícita antes de agregar categorías';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'categoria_falla'
  ) THEN
    RAISE EXCEPTION 'No existe el catálogo categoria_falla';
  END IF;

  LOCK TABLE public.categoria_falla IN SHARE ROW EXCLUSIVE MODE;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'categoria_falla' AND column_name = 'tipo'
  ) INTO has_type;

  FOREACH category_name IN ARRAY ARRAY['Facturación y cobro', 'Baja de servicio'] LOOP
    SELECT count(*), count(*) FILTER (
      WHERE NOT has_type OR to_jsonb(c)->>'tipo' = 'ATENCION'
    ) INTO existing_count, attention_count
    FROM public.categoria_falla c
    WHERE lower(btrim(regexp_replace(normalize(c.nombre, NFC), space_pattern, ' ', 'g')))
      = lower(category_name);

    IF existing_count > 1 THEN
      RAISE EXCEPTION 'Categoría ambigua: %', category_name;
    ELSIF existing_count = 1 AND attention_count <> 1 THEN
      RAISE EXCEPTION 'La categoría existente no es de atención: %', category_name;
    ELSIF existing_count = 0 THEN
      IF has_type THEN
        EXECUTE 'INSERT INTO public.categoria_falla (nombre, tipo) VALUES ($1, $2)'
          USING category_name, 'ATENCION';
      ELSE
        INSERT INTO public.categoria_falla (nombre) VALUES (category_name);
      END IF;
    END IF;
  END LOOP;
END;
$catalog$;
