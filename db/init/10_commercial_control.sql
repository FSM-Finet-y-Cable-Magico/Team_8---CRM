CREATE TABLE IF NOT EXISTS evento_gestion_comercial (
    id_evento                     BIGSERIAL      PRIMARY KEY,
    id_cliente                    INTEGER        NOT NULL REFERENCES cliente(id_cliente),
    id_contrato                   INTEGER        REFERENCES contrato(id_contrato),
    id_factura                    INTEGER        REFERENCES factura(id_factura),
    id_pago                       INTEGER        REFERENCES pago(id_pago),
    id_servicio                   INTEGER        REFERENCES servicio_contratado(id_servicio),
    id_usuario                    INTEGER        REFERENCES usuario(id_usuario),
    id_empresa                    INTEGER        REFERENCES empresa(id_empresa),
    tipo_evento                   VARCHAR(40)    NOT NULL,
    canal                         VARCHAR(30)    NOT NULL DEFAULT 'MANUAL',
    estado                        VARCHAR(20)    NOT NULL DEFAULT 'REGISTRADO',
    mensaje_generado              TEXT,
    respuesta_cliente             TEXT,
    observacion                   TEXT,
    monto_relacionado             DECIMAL(10,2),
    fecha_compromiso              DATE,
    fecha_evento                  TIMESTAMP      NOT NULL DEFAULT NOW(),
    metadata_json                 JSONB,
    created_at                    TIMESTAMP      NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evento_gestion_comercial_id_cliente
  ON evento_gestion_comercial(id_cliente);

CREATE INDEX IF NOT EXISTS idx_evento_gestion_comercial_id_contrato
  ON evento_gestion_comercial(id_contrato);

CREATE INDEX IF NOT EXISTS idx_evento_gestion_comercial_id_factura
  ON evento_gestion_comercial(id_factura);

CREATE INDEX IF NOT EXISTS idx_evento_gestion_comercial_id_servicio
  ON evento_gestion_comercial(id_servicio);

CREATE INDEX IF NOT EXISTS idx_evento_gestion_comercial_id_empresa
  ON evento_gestion_comercial(id_empresa);

CREATE INDEX IF NOT EXISTS idx_evento_gestion_comercial_tipo_evento
  ON evento_gestion_comercial(tipo_evento);

CREATE INDEX IF NOT EXISTS idx_evento_gestion_comercial_fecha_evento
  ON evento_gestion_comercial(fecha_evento);

CREATE INDEX IF NOT EXISTS idx_evento_gestion_comercial_id_usuario
  ON evento_gestion_comercial(id_usuario);
