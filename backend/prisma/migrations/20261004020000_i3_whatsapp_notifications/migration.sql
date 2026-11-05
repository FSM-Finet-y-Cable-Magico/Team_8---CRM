-- Additive proposal; coordinate with the shared schema owner before deployment.
ALTER TABLE log_notificacion
  ALTER COLUMN estado_envio TYPE VARCHAR(30),
  ADD COLUMN id_empresa INTEGER REFERENCES empresa(id_empresa) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD COLUMN proveedor VARCHAR(20),
  ADD COLUMN correlation_id UUID,
  ADD COLUMN payload_hash CHAR(64),
  ADD COLUMN provider_message_id VARCHAR(512),
  ADD COLUMN mensaje JSONB,
  ADD COLUMN intentos INTEGER NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  ADD COLUMN fecha_inicio TIMESTAMPTZ(3),
  ADD COLUMN ultimo_error VARCHAR(64);
CREATE UNIQUE INDEX log_notificacion_correlation_id_key ON log_notificacion(correlation_id);
CREATE UNIQUE INDEX log_notificacion_provider_message_id_key ON log_notificacion(provider_message_id);
CREATE INDEX log_notificacion_proveedor_estado_envio_fecha_envio_idx ON log_notificacion(proveedor,estado_envio,fecha_envio);
