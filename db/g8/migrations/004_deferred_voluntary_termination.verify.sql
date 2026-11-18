BEGIN READ ONLY;
-- Run as the application role: validates shape and effective runtime column grants.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute
    WHERE attrelid = to_regclass('g8_retiros.termino_servicio') AND attname = 'termino_comercial_en'
      AND NOT attnotnull AND NOT attisdropped) THEN
    RAISE EXCEPTION 'DEFERRED_TERMINATION_SCHEMA_NOT_READY';
  END IF;
  IF NOT has_column_privilege(current_user, 'g8_retiros.termino_servicio', 'termino_comercial_en', 'UPDATE')
    OR NOT has_column_privilege(current_user, 'g8_retiros.termino_servicio', 'cierre_tecnico_en', 'UPDATE') THEN
    RAISE EXCEPTION 'DEFERRED_TERMINATION_GRANTS_NOT_READY';
  END IF;
END;
$$;
ROLLBACK;
