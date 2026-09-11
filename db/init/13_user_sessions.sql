-- Revoca sesiones al cambiar el acceso del usuario. Conserva las cuentas y su auditoría.
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS version_sesion integer NOT NULL DEFAULT 0;
