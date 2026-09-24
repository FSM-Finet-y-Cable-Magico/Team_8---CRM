ALTER TABLE usuario
  ADD COLUMN IF NOT EXISTS es_password_temporal BOOLEAN DEFAULT TRUE;

ALTER TABLE usuario
  ADD COLUMN IF NOT EXISTS intentos_fallidos INTEGER DEFAULT 0;

ALTER TABLE cliente
  ADD COLUMN IF NOT EXISTS obs_conflictivo TEXT;

ALTER TABLE cliente
  ADD COLUMN IF NOT EXISTS importado_masivo BOOLEAN DEFAULT FALSE;

ALTER TABLE cliente
  ADD COLUMN IF NOT EXISTS origen_contacto VARCHAR(40);

ALTER TABLE cliente
  ADD COLUMN IF NOT EXISTS datos_tecnicos JSONB;

ALTER TABLE prospecto
  ADD COLUMN IF NOT EXISTS origen_contacto VARCHAR(40);

CREATE TABLE IF NOT EXISTS servicio_contratado (
    id_servicio                    SERIAL         PRIMARY KEY,
    id_cliente                     INTEGER        NOT NULL,
    id_empresa                     INTEGER,
    id_contrato                    INTEGER,
    id_direccion                   INTEGER,
    tipo_servicio                  VARCHAR(40)    NOT NULL,
    estado_operativo               VARCHAR(30)    NOT NULL,
    observaciones                  TEXT,
    datos_tecnicos                 JSONB,
    fecha_creacion                 TIMESTAMP      DEFAULT NOW()
);

ALTER TABLE ticket
  ADD COLUMN IF NOT EXISTS id_servicio INTEGER;

ALTER TABLE unidad_equipo
  ADD COLUMN IF NOT EXISTS id_servicio INTEGER;

ALTER TABLE orden_trabajo
  ADD COLUMN IF NOT EXISTS id_servicio INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_servicio_contratado_id_cliente') THEN
    ALTER TABLE servicio_contratado
      ADD CONSTRAINT fk_servicio_contratado_id_cliente FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_servicio_contratado_id_empresa') THEN
    ALTER TABLE servicio_contratado
      ADD CONSTRAINT fk_servicio_contratado_id_empresa FOREIGN KEY (id_empresa) REFERENCES empresa(id_empresa);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_servicio_contratado_id_contrato') THEN
    ALTER TABLE servicio_contratado
      ADD CONSTRAINT fk_servicio_contratado_id_contrato FOREIGN KEY (id_contrato) REFERENCES contrato(id_contrato);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_servicio_contratado_id_direccion') THEN
    ALTER TABLE servicio_contratado
      ADD CONSTRAINT fk_servicio_contratado_id_direccion FOREIGN KEY (id_direccion) REFERENCES direccion_servicio(id_direccion);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ticket_id_servicio') THEN
    ALTER TABLE ticket
      ADD CONSTRAINT fk_ticket_id_servicio FOREIGN KEY (id_servicio) REFERENCES servicio_contratado(id_servicio);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_unidad_equipo_id_servicio') THEN
    ALTER TABLE unidad_equipo
      ADD CONSTRAINT fk_unidad_equipo_id_servicio FOREIGN KEY (id_servicio) REFERENCES servicio_contratado(id_servicio);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_orden_trabajo_id_servicio') THEN
    ALTER TABLE orden_trabajo
      ADD CONSTRAINT fk_orden_trabajo_id_servicio FOREIGN KEY (id_servicio) REFERENCES servicio_contratado(id_servicio);
  END IF;
END $$;

-- Una misma cuenta de cliente puede originarse en procesos comerciales de
-- FiNet y Cable Magico. Cada prospecto conserva su empresa y comparte cliente.
ALTER TABLE prospecto
  DROP CONSTRAINT IF EXISTS prospecto_id_cliente_key;

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
