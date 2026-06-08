ALTER TABLE usuario
  ADD COLUMN IF NOT EXISTS es_password_temporal BOOLEAN DEFAULT TRUE;

ALTER TABLE usuario
  ADD COLUMN IF NOT EXISTS intentos_fallidos INTEGER DEFAULT 0;

ALTER TABLE cliente
  ADD COLUMN IF NOT EXISTS obs_conflictivo TEXT;

ALTER TABLE cliente
  ADD COLUMN IF NOT EXISTS importado_masivo BOOLEAN DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'usuario_rol_id_usuario_id_rol_key'
  ) THEN
    ALTER TABLE usuario_rol
      ADD CONSTRAINT usuario_rol_id_usuario_id_rol_key UNIQUE (id_usuario, id_rol);
  END IF;
END $$;
