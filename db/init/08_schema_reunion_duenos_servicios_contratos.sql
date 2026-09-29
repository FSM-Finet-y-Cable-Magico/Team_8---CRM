-- Incremento reunion duenos: servicios multiples, solicitudes, observaciones,
-- planes administrables, zonas de pago, cambios de plan y contratos digitales.
-- Idempotente para bases locales y contenedores nuevos.

ALTER TABLE unidad_equipo
  ADD COLUMN IF NOT EXISTS modalidad_asignacion VARCHAR(30),
  ADD COLUMN IF NOT EXISTS valor_arriendo_mensual NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS fecha_inicio_asignacion DATE;

ALTER TABLE contrato
  ADD COLUMN IF NOT EXISTS id_zona_pago INTEGER;

ALTER TABLE servicio_contratado
  ADD COLUMN IF NOT EXISTS id_zona_pago INTEGER;

CREATE TABLE IF NOT EXISTS solicitud_cliente (
    id_solicitud                  SERIAL        PRIMARY KEY,
    id_cliente                    INTEGER,
    id_prospecto                  INTEGER,
    id_servicio                   INTEGER,
    id_empresa                    INTEGER,
    tipo_solicitud                VARCHAR(60)   NOT NULL,
    canal_origen                  VARCHAR(40),
    estado                        VARCHAR(30)   NOT NULL,
    factible                      BOOLEAN,
    motivo_no_factible            TEXT,
    descripcion                   TEXT,
    observaciones                 TEXT,
    id_usuario_registro           INTEGER,
    fecha_creacion                TIMESTAMP     DEFAULT NOW(),
    fecha_cierre                  TIMESTAMP
);

CREATE TABLE IF NOT EXISTS observacion_operativa (
    id_observacion                SERIAL        PRIMARY KEY,
    tipo_entidad                  VARCHAR(40)   NOT NULL,
    id_entidad                    INTEGER       NOT NULL,
    id_cliente                    INTEGER,
    id_empresa                    INTEGER,
    id_usuario                    INTEGER,
    observacion                   TEXT          NOT NULL,
    visibilidad                   VARCHAR(20)   DEFAULT 'Interna',
    fecha_creacion                TIMESTAMP     DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS zona_pago (
    id_zona_pago                  SERIAL        PRIMARY KEY,
    id_empresa                    INTEGER,
    nombre_zona                   VARCHAR(80)   NOT NULL,
    comuna                        VARCHAR(80),
    descripcion                   TEXT,
    dia_vencimiento_sugerido      SMALLINT,
    activo                        BOOLEAN       DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS plan_zona_precio (
    id_plan_zona_precio           SERIAL        PRIMARY KEY,
    id_plan                       INTEGER       NOT NULL,
    id_zona_pago                  INTEGER       NOT NULL,
    precio_mensual                NUMERIC(10,2) NOT NULL,
    valor_instalacion             NUMERIC(10,2),
    activo                        BOOLEAN       DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS historial_cambio_plan (
    id_cambio_plan                SERIAL        PRIMARY KEY,
    id_contrato                   INTEGER       NOT NULL,
    id_cliente                    INTEGER,
    id_empresa                    INTEGER,
    id_plan_anterior              INTEGER,
    id_plan_nuevo                 INTEGER       NOT NULL,
    fecha_efectiva                DATE          NOT NULL,
    motivo                        TEXT          NOT NULL,
    observaciones                 TEXT,
    precio_anterior               NUMERIC(10,2),
    precio_nuevo                  NUMERIC(10,2),
    id_usuario_registro           INTEGER,
    fecha_registro                TIMESTAMP     DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contrato_digital (
    id_contrato_digital           SERIAL        PRIMARY KEY,
    id_contrato                   INTEGER       NOT NULL,
    id_cliente                    INTEGER,
    id_empresa                    INTEGER,
    url_documento                 TEXT          NOT NULL,
    hash_documento                VARCHAR(128)  NOT NULL,
    estado_firma                  VARCHAR(30)   NOT NULL,
    fecha_generacion              TIMESTAMP     DEFAULT NOW(),
    fecha_firma                   TIMESTAMP,
    id_usuario_generador          INTEGER,
    version                       INTEGER       NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_zona_pago_empresa_nombre
  ON zona_pago (COALESCE(id_empresa, 0), LOWER(nombre_zona));

CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_zona_precio_activo
  ON plan_zona_precio (id_plan, id_zona_pago)
  WHERE activo = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_contrato_digital_version
  ON contrato_digital (id_contrato, version);

CREATE INDEX IF NOT EXISTS idx_solicitud_cliente_cliente ON solicitud_cliente (id_cliente);
CREATE INDEX IF NOT EXISTS idx_solicitud_cliente_servicio ON solicitud_cliente (id_servicio);
CREATE INDEX IF NOT EXISTS idx_observacion_operativa_entidad ON observacion_operativa (tipo_entidad, id_entidad);
CREATE INDEX IF NOT EXISTS idx_historial_cambio_plan_contrato ON historial_cambio_plan (id_contrato);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_contrato_id_zona_pago') THEN
    ALTER TABLE contrato ADD CONSTRAINT fk_contrato_id_zona_pago FOREIGN KEY (id_zona_pago) REFERENCES zona_pago(id_zona_pago);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_servicio_contratado_id_zona_pago') THEN
    ALTER TABLE servicio_contratado ADD CONSTRAINT fk_servicio_contratado_id_zona_pago FOREIGN KEY (id_zona_pago) REFERENCES zona_pago(id_zona_pago);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_solicitud_cliente_id_cliente') THEN
    ALTER TABLE solicitud_cliente ADD CONSTRAINT fk_solicitud_cliente_id_cliente FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_solicitud_cliente_id_servicio') THEN
    ALTER TABLE solicitud_cliente ADD CONSTRAINT fk_solicitud_cliente_id_servicio FOREIGN KEY (id_servicio) REFERENCES servicio_contratado(id_servicio);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_solicitud_cliente_id_empresa') THEN
    ALTER TABLE solicitud_cliente ADD CONSTRAINT fk_solicitud_cliente_id_empresa FOREIGN KEY (id_empresa) REFERENCES empresa(id_empresa);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_solicitud_cliente_id_usuario_registro') THEN
    ALTER TABLE solicitud_cliente ADD CONSTRAINT fk_solicitud_cliente_id_usuario_registro FOREIGN KEY (id_usuario_registro) REFERENCES usuario(id_usuario);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_observacion_operativa_id_usuario') THEN
    ALTER TABLE observacion_operativa ADD CONSTRAINT fk_observacion_operativa_id_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_zona_pago_id_empresa') THEN
    ALTER TABLE zona_pago ADD CONSTRAINT fk_zona_pago_id_empresa FOREIGN KEY (id_empresa) REFERENCES empresa(id_empresa);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_plan_zona_precio_id_plan') THEN
    ALTER TABLE plan_zona_precio ADD CONSTRAINT fk_plan_zona_precio_id_plan FOREIGN KEY (id_plan) REFERENCES plan(id_plan);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_plan_zona_precio_id_zona_pago') THEN
    ALTER TABLE plan_zona_precio ADD CONSTRAINT fk_plan_zona_precio_id_zona_pago FOREIGN KEY (id_zona_pago) REFERENCES zona_pago(id_zona_pago);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_historial_cambio_plan_id_contrato') THEN
    ALTER TABLE historial_cambio_plan ADD CONSTRAINT fk_historial_cambio_plan_id_contrato FOREIGN KEY (id_contrato) REFERENCES contrato(id_contrato);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_historial_cambio_plan_id_cliente') THEN
    ALTER TABLE historial_cambio_plan ADD CONSTRAINT fk_historial_cambio_plan_id_cliente FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_historial_cambio_plan_id_plan_anterior') THEN
    ALTER TABLE historial_cambio_plan ADD CONSTRAINT fk_historial_cambio_plan_id_plan_anterior FOREIGN KEY (id_plan_anterior) REFERENCES plan(id_plan);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_historial_cambio_plan_id_plan_nuevo') THEN
    ALTER TABLE historial_cambio_plan ADD CONSTRAINT fk_historial_cambio_plan_id_plan_nuevo FOREIGN KEY (id_plan_nuevo) REFERENCES plan(id_plan);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_contrato_digital_id_contrato') THEN
    ALTER TABLE contrato_digital ADD CONSTRAINT fk_contrato_digital_id_contrato FOREIGN KEY (id_contrato) REFERENCES contrato(id_contrato);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_contrato_digital_id_cliente') THEN
    ALTER TABLE contrato_digital ADD CONSTRAINT fk_contrato_digital_id_cliente FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_contrato_digital_id_usuario_generador') THEN
    ALTER TABLE contrato_digital ADD CONSTRAINT fk_contrato_digital_id_usuario_generador FOREIGN KEY (id_usuario_generador) REFERENCES usuario(id_usuario);
  END IF;
END $$;

