CREATE TABLE empresa (
    id_empresa                     SERIAL         PRIMARY KEY,
    nombre                         VARCHAR(100)   NOT NULL,
    rut_empresa                    VARCHAR(12)    UNIQUE,
    esquema_db                     VARCHAR(50)
);

CREATE TABLE usuario (
    id_usuario                     SERIAL         PRIMARY KEY,
    id_empresa                     INTEGER       ,
    nombre_completo                VARCHAR(80)    NOT NULL,
    nombre_usuario                 VARCHAR(50)    UNIQUE,
    email                          VARCHAR(120)   UNIQUE,
    password_hash                  VARCHAR(72)    NOT NULL,
    activo                         BOOLEAN        DEFAULT TRUE,
    fecha_creacion                 TIMESTAMP      DEFAULT NOW()
);

CREATE TABLE rol (
    id_rol                         SERIAL         PRIMARY KEY,
    nombre_rol                     VARCHAR(50)    NOT NULL UNIQUE,
    descripcion                    TEXT
);

CREATE TABLE usuario_rol (
    id_usuario_rol                 SERIAL         PRIMARY KEY,
    id_usuario                     INTEGER       ,
    id_rol                         INTEGER        NOT NULL,
    fecha_asignacion               DATE           DEFAULT NOW()
);

CREATE TABLE log_auditoria (
    id_log                         BIGSERIAL      PRIMARY KEY,
    id_usuario                     INTEGER       ,
    accion                         VARCHAR(100)   NOT NULL,
    entidad_afectada               VARCHAR(80)   ,
    id_entidad_afectada            INTEGER       ,
    valor_anterior                 JSONB         ,
    valor_nuevo                    JSONB         ,
    ip_origen                      INET          ,
    fecha_hora                     TIMESTAMP      DEFAULT NOW()
);

CREATE TABLE cliente (
    id_cliente                     SERIAL         PRIMARY KEY,
    id_empresa                     INTEGER       ,
    rut                            VARCHAR(12)    UNIQUE,
    nombre_completo                VARCHAR(120)   NOT NULL,
    email                          VARCHAR(120)  ,
    telefono                       VARCHAR(20)   ,
    password_portal_hash           VARCHAR(72)   ,
    estado                         VARCHAR(20)    NOT NULL,
    es_conflictivo                 BOOLEAN        DEFAULT FALSE,
    importado_masivo               BOOLEAN        DEFAULT FALSE,
    fecha_creacion                 TIMESTAMP      DEFAULT NOW()
);

CREATE TABLE direccion_servicio (
    id_direccion                   SERIAL         PRIMARY KEY,
    id_cliente                     INTEGER       ,
    direccion_completa             VARCHAR(200)   NOT NULL,
    comuna                         VARCHAR(80)    NOT NULL,
    ciudad                         VARCHAR(80)   ,
    es_principal                   BOOLEAN        DEFAULT TRUE
);

CREATE TABLE plan (
    id_plan                        SERIAL         PRIMARY KEY,
    id_empresa                     INTEGER       ,
    nombre_comercial               VARCHAR(100)   NOT NULL,
    tipo_plan                      VARCHAR(20)    NOT NULL,
    tipo_cliente                   VARCHAR(20)    NOT NULL,
    velocidad_mbps                 INTEGER       ,
    precio_mensual                 NUMERIC(10,2)  NOT NULL,
    descripcion                    TEXT          ,
    activo                         BOOLEAN        DEFAULT TRUE
);

CREATE TABLE contrato (
    id_contrato                    SERIAL         PRIMARY KEY,
    id_cliente                     INTEGER       ,
    id_plan                        INTEGER       ,
    id_empresa                     INTEGER       ,
    fecha_inicio                   DATE           NOT NULL,
    dia_vencimiento                SMALLINT       NOT NULL,
    estado                         VARCHAR(20)    NOT NULL,
    fecha_suspension               DATE
);

CREATE TABLE factura (
    id_factura                     SERIAL         PRIMARY KEY,
    id_contrato                    INTEGER       ,
    periodo_mes                    SMALLINT       NOT NULL,
    periodo_anio                   SMALLINT       NOT NULL,
    monto                          NUMERIC(10,2) ,
    fecha_emision                  DATE          ,
    fecha_limite_pago              DATE           NOT NULL,
    estado                         VARCHAR(20)    NOT NULL
);

CREATE TABLE pago (
    id_pago                        SERIAL         PRIMARY KEY,
    id_factura                     INTEGER       ,
    id_cliente                     INTEGER       ,
    monto                          NUMERIC(10,2)  NOT NULL,
    fecha_pago                     TIMESTAMP      NOT NULL,
    codigo_transaccion             VARCHAR(100)   UNIQUE,
    pasarela                       VARCHAR(30)    NOT NULL,
    token_transaccional            VARCHAR(200)  ,
    comprobante_pdf_url            TEXT
);

CREATE TABLE ticket (
    id_ticket                      SERIAL         PRIMARY KEY,
    id_cliente                     INTEGER       ,
    id_empresa                     INTEGER       ,
    id_usuario_asignado            INTEGER       ,
    id_categoria                   INTEGER        NOT NULL,
    id_conversacion_bot            INTEGER        UNIQUE,
    codigo_seguimiento             VARCHAR(20)    UNIQUE,
    prioridad                      VARCHAR(10)    NOT NULL,
    estado                         VARCHAR(20)    NOT NULL,
    descripcion                    TEXT          ,
    fecha_creacion                 TIMESTAMP      DEFAULT NOW(),
    fecha_cierre                   TIMESTAMP     ,
    origen                         VARCHAR(20)   ,
    resuelto_remotamente           BOOLEAN        DEFAULT FALSE
);

CREATE TABLE plantilla_notificacion (
    id_plantilla                   SERIAL         PRIMARY KEY,
    tipo_evento                    VARCHAR(60)   ,
    canal                          VARCHAR(20)    NOT NULL,
    contenido_texto                TEXT          ,
    activa                         BOOLEAN        DEFAULT TRUE
);

CREATE TABLE log_notificacion (
    id_notificacion                BIGSERIAL      PRIMARY KEY,
    id_cliente                     INTEGER       ,
    id_plantilla                   INTEGER       ,
    canal                          VARCHAR(20)   ,
    fecha_envio                    TIMESTAMP     ,
    estado_envio                   VARCHAR(20)
);

CREATE TABLE tipo_equipo (
    id_tipo_equipo                 SERIAL         PRIMARY KEY,
    id_empresa                     INTEGER       ,
    nombre                         VARCHAR(100)   NOT NULL,
    categoria                      VARCHAR(40)   ,
    requiere_serie_individual      BOOLEAN       ,
    ficha_tecnica_pdf_url          TEXT          ,
    activo                         BOOLEAN        DEFAULT TRUE
);

CREATE TABLE unidad_equipo (
    id_unidad                      SERIAL         PRIMARY KEY,
    id_tipo_equipo                 INTEGER       ,
    id_empresa                     INTEGER       ,
    numero_serie                   VARCHAR(80)    NOT NULL UNIQUE,
    modelo                         VARCHAR(80)   ,
    estado                         VARCHAR(30)    NOT NULL,
    fecha_adquisicion              DATE          ,
    fecha_venc_garantia            DATE          ,
    diagnostico_tecnico            TEXT          ,
    id_cliente_instalado           INTEGER       ,
    id_bodega_actual               INTEGER       ,
    numero_poste                   VARCHAR(30)   ,
    id_caja_nap                    INTEGER
);

CREATE TABLE caja_nap (
    id_caja_nap                    SERIAL         PRIMARY KEY,
    id_empresa                     INTEGER       ,
    id_mufa                        INTEGER       ,
    identificador_unico            VARCHAR(50)    UNIQUE,
    numero_poste                   VARCHAR(30)   ,
    zona                           VARCHAR(80)   ,
    capacidad_puertos              SMALLINT      ,
    latitud                        DECIMAL(9,6)  ,
    longitud                       DECIMAL(9,6)
);

CREATE TABLE orden_trabajo (
    id_ot                          SERIAL         PRIMARY KEY,
    id_empresa                     INTEGER       ,
    id_cliente                     INTEGER       ,
    id_tecnico                     INTEGER       ,
    id_tecnico_externo             INTEGER       ,
    id_direccion                   INTEGER       ,
    id_ticket                      INTEGER        UNIQUE,
    tipo_ot                        VARCHAR(20)    NOT NULL,
    prioridad                      VARCHAR(10)    NOT NULL,
    estado                         VARCHAR(25)    NOT NULL,
    fecha_creacion                 TIMESTAMP     ,
    fecha_programada               DATE          ,
    fecha_completada               TIMESTAMP     ,
    potencia_optica_dbm            DECIMAL(5,2)  ,
    observaciones                  TEXT          ,
    resuelto_remotamente           BOOLEAN        DEFAULT FALSE
);

CREATE TABLE conversacion_bot (
    id_conversacion                SERIAL         PRIMARY KEY,
    id_cliente                     INTEGER       ,
    id_canal_wa                    INTEGER       ,
    plataforma                     VARCHAR(20)   ,
    fecha_inicio                   TIMESTAMP     ,
    fecha_fin                      TIMESTAMP     ,
    derivada_humano                BOOLEAN        DEFAULT FALSE
);

CREATE TABLE mensaje_bot (
    id_mensaje                     BIGSERIAL      PRIMARY KEY,
    id_conversacion                INTEGER       ,
    rol                            VARCHAR(15)   ,
    contenido                      TEXT          ,
    timestamp                      TIMESTAMP      DEFAULT NOW(),
    datos_sensibles                BOOLEAN
);

CREATE TABLE bodega (
    id_bodega                      SERIAL         PRIMARY KEY,
    id_empresa                     INTEGER       ,
    nombre                         VARCHAR(60)    NOT NULL,
    direccion                      VARCHAR(200)  ,
    activa                         BOOLEAN        DEFAULT TRUE
);

CREATE TABLE stock_consumible (
    id_stock                       SERIAL         PRIMARY KEY,
    id_tipo_equipo                 INTEGER       ,
    id_bodega                      INTEGER       ,
    cantidad_disponible            NUMERIC(10,2)  NOT NULL,
    umbral_minimo                  NUMERIC(10,2)
);

CREATE TABLE proveedor (
    id_proveedor                   SERIAL         PRIMARY KEY,
    nombre_comercial               VARCHAR(100)   NOT NULL,
    rut_proveedor                  VARCHAR(12)   ,
    contacto                       VARCHAR(80)   ,
    telefono                       VARCHAR(20)   ,
    email                          VARCHAR(120)
);

CREATE TABLE orden_ingreso (
    id_orden                       SERIAL         PRIMARY KEY,
    id_proveedor                   INTEGER       ,
    id_bodega                      INTEGER       ,
    id_empresa                     INTEGER       ,
    id_usuario_registro            INTEGER       ,
    fecha_creacion                 DATE          ,
    fecha_recepcion                DATE          ,
    estado                         VARCHAR(25)   ,
    factura_proveedor              VARCHAR(50)
);

CREATE TABLE detalle_orden_ingreso (
    id_detalle                     SERIAL         PRIMARY KEY,
    id_orden                       INTEGER       ,
    id_tipo_equipo                 INTEGER       ,
    cantidad_solicitada            INTEGER        NOT NULL,
    cantidad_recibida              INTEGER        DEFAULT 0
);

CREATE TABLE historial_estado_equipo (
    id_historial                   BIGSERIAL      PRIMARY KEY,
    id_unidad                      INTEGER       ,
    id_usuario                     INTEGER       ,
    estado_anterior                VARCHAR(30)   ,
    estado_nuevo                   VARCHAR(30)   ,
    motivo                         TEXT          ,
    fecha_hora                     TIMESTAMP      DEFAULT NOW()
);

CREATE TABLE movimiento_inventario (
    id_movimiento                  BIGSERIAL      PRIMARY KEY,
    id_tipo_equipo                 INTEGER       ,
    id_unidad                      INTEGER       ,
    id_empresa_origen              INTEGER       ,
    id_empresa_destino             INTEGER       ,
    id_bodega_origen               INTEGER       ,
    id_bodega_destino              INTEGER       ,
    id_usuario                     INTEGER       ,
    tipo_movimiento                VARCHAR(30)   ,
    cantidad                       NUMERIC(10,2)  DEFAULT 1,
    fecha                          TIMESTAMP     ,
    referencia_id                  INTEGER
);

CREATE TABLE prestamo_externo (
    id_prestamo                    SERIAL         PRIMARY KEY,
    id_unidad                      INTEGER       ,
    id_empresa_prestamista         INTEGER       ,
    destinatario                   VARCHAR(100)  ,
    motivo                         TEXT          ,
    fecha_salida                   DATE          ,
    fecha_retorno_esperada         DATE          ,
    fecha_retorno_real             DATE          ,
    estado                         VARCHAR(20)   ,
    condicion_retorno              TEXT
);

CREATE TABLE baja_equipo (
    id_baja                        SERIAL         PRIMARY KEY,
    id_unidad                      INTEGER       ,
    id_usuario                     INTEGER       ,
    motivo_baja                    TEXT           NOT NULL,
    tipo_baja                      VARCHAR(20)   ,
    donacion_destinatario          VARCHAR(150)  ,
    fecha_baja                     DATE
);

CREATE TABLE sesion_portal (
    id_sesion                      BIGSERIAL      PRIMARY KEY,
    id_cliente                     INTEGER       ,
    token                          VARCHAR(255)   NOT NULL,
    fecha_inicio                   TIMESTAMP     ,
    fecha_expiracion               TIMESTAMP     ,
    ip_origen                      INET
);

CREATE TABLE intento_fallido (
    id_intento                     BIGSERIAL      PRIMARY KEY,
    id_empresa                     INTEGER       ,
    ip_address                     INET           NOT NULL,
    rut_intentado                  VARCHAR(12)   ,
    timestamp                      TIMESTAMP      DEFAULT NOW(),
    bloqueado_hasta                TIMESTAMP
);

CREATE TABLE punto_cobertura (
    id_punto                       SERIAL         PRIMARY KEY,
    id_empresa                     INTEGER       ,
    latitud                        DECIMAL(9,6)   NOT NULL,
    longitud                       DECIMAL(9,6)   NOT NULL,
    densidad_cobertura             DECIMAL(5,2)  ,
    tipo_cobertura                 VARCHAR(20)
);

CREATE TABLE consentimiento_cookies (
    id_consentimiento              BIGSERIAL      PRIMARY KEY,
    id_cliente                     INTEGER       ,
    ip_anonimizada                 VARCHAR(45)   ,
    version_documento              VARCHAR(20)   ,
    fecha_aceptacion               TIMESTAMP     ,
    acepto                         BOOLEAN        NOT NULL
);

CREATE TABLE configuracion_seo (
    id_seo                         SERIAL         PRIMARY KEY,
    id_empresa                     INTEGER        NOT NULL,
    seccion_url                    VARCHAR(200)   NOT NULL,
    meta_titulo                    VARCHAR(70)   ,
    meta_descripcion               VARCHAR(160)  ,
    og_tags                        JSONB         ,
    fecha_actualizacion            TIMESTAMP      DEFAULT NOW(),
    UNIQUE (id_empresa, seccion_url)
);

CREATE TABLE tecnico_externo (
    id_tecnico_ext                 SERIAL         PRIMARY KEY,
    nombre_completo                VARCHAR(120)   NOT NULL,
    empresa                        VARCHAR(100)  ,
    telefono                       VARCHAR(20)   ,
    activo                         BOOLEAN        DEFAULT TRUE
);

CREATE TABLE historial_ot (
    id_historial_ot                BIGSERIAL      PRIMARY KEY,
    id_ot                          INTEGER       ,
    id_usuario                     INTEGER       ,
    estado_anterior                VARCHAR(25)   ,
    estado_nuevo                   VARCHAR(25)   ,
    observaciones                  TEXT          ,
    fecha_hora                     TIMESTAMP
);

CREATE TABLE categoria_falla (
    id_categoria                   SERIAL         PRIMARY KEY,
    nombre                         VARCHAR(80)    NOT NULL,
    sla_horas                      SMALLINT
);

CREATE TABLE uso_material_ot (
    id_uso                         SERIAL         PRIMARY KEY,
    id_ot                          INTEGER       ,
    id_tipo_equipo                 INTEGER       ,
    id_unidad                      INTEGER       ,
    cantidad                       NUMERIC(10,2)  NOT NULL
);

CREATE TABLE evidencia_foto (
    id_foto                        SERIAL         PRIMARY KEY,
    id_ot                          INTEGER       ,
    url_cloudinary                 TEXT           NOT NULL,
    formato                        VARCHAR(5)    ,
    tamano_kb                      INTEGER       ,
    fecha_subida                   TIMESTAMP
);

CREATE TABLE llamada_cortes (
    id_llamada                     SERIAL         PRIMARY KEY,
    id_ot                          INTEGER        UNIQUE,
    resultado                      VARCHAR(15)    NOT NULL,
    observaciones                  TEXT          ,
    fecha_llamada                  TIMESTAMP
);

CREATE TABLE lista_negra (
    id_vetado                      SERIAL         PRIMARY KEY,
    id_cliente                     INTEGER       ,
    rut_vetado                     VARCHAR(12)    NOT NULL,
    direccion_vetada               TEXT          ,
    motivo                         TEXT           NOT NULL,
    fecha_registro                 DATE          ,
    id_usuario_registro            INTEGER
);

CREATE TABLE olt (
    id_olt                         SERIAL         PRIMARY KEY,
    id_empresa                     INTEGER       ,
    nombre                         VARCHAR(80)   ,
    ubicacion                      VARCHAR(200)  ,
    ip_gestion                     INET
);

CREATE TABLE tarjeta_pon (
    id_tarjeta                     SERIAL         PRIMARY KEY,
    id_olt                         INTEGER       ,
    numero_tarjeta                 SMALLINT      ,
    total_puertos                  SMALLINT
);

CREATE TABLE mufa (
    id_mufa                        SERIAL         PRIMARY KEY,
    id_tarjeta_pon                 INTEGER       ,
    identificador                  VARCHAR(50)   ,
    ubicacion                      VARCHAR(200)
);

CREATE TABLE puerto_nap (
    id_puerto                      SERIAL         PRIMARY KEY,
    id_caja_nap                    INTEGER       ,
    numero_puerto                  SMALLINT      ,
    estado                         VARCHAR(10)   ,
    id_cliente_asociado            INTEGER
);

CREATE TABLE monitoreo_ont (
    id_monitoreo                   BIGSERIAL      PRIMARY KEY,
    id_unidad                      INTEGER       ,
    id_cliente                     INTEGER       ,
    id_caja_nap                    INTEGER       ,
    potencia_actual_dbm            DECIMAL(5,2)  ,
    timestamp_medicion             TIMESTAMP      DEFAULT NOW(),
    estado_conexion                VARCHAR(15)
);

CREATE TABLE historial_conexion_ont (
    id_historial_ont               BIGSERIAL      PRIMARY KEY,
    id_unidad                      INTEGER       ,
    evento                         VARCHAR(15)   ,
    timestamp                      TIMESTAMP      DEFAULT NOW()
);

CREATE TABLE prospecto (
    id_prospecto                   SERIAL         PRIMARY KEY,
    id_empresa                     INTEGER       ,
    id_usuario_comercial           INTEGER       ,
    id_cliente                     INTEGER        UNIQUE,
    rut                            VARCHAR(12)   ,
    nombre_completo                VARCHAR(120)  ,
    email                          VARCHAR(120)  ,
    telefono                       VARCHAR(20)   ,
    direccion                      VARCHAR(200)  ,
    estado_pipeline                VARCHAR(30)   ,
    motivo_perdida                 VARCHAR(30)   ,
    tiempo_conversion_dias         INTEGER       ,
    fecha_creacion                 TIMESTAMP     ,
    fecha_conversion               DATE
);

CREATE TABLE cotizacion (
    id_cotizacion                  SERIAL         PRIMARY KEY,
    id_prospecto                   INTEGER       ,
    id_plan                        INTEGER       ,
    pdf_url                        TEXT          ,
    fecha_envio                    TIMESTAMP     ,
    factibilidad_verificada        BOOLEAN        DEFAULT FALSE
);

CREATE TABLE canal_whatsapp (
    id_canal                       SERIAL         PRIMARY KEY,
    id_empresa                     INTEGER       ,
    numero_telefono                VARCHAR(20)    UNIQUE,
    nombre_canal                   VARCHAR(80)   ,
    activo                         BOOLEAN        DEFAULT TRUE
);

CREATE TABLE plantilla_whatsapp (
    id_plantilla_wa                SERIAL         PRIMARY KEY,
    id_canal                       INTEGER       ,
    nombre_plantilla               VARCHAR(80)   ,
    contenido                      TEXT          ,
    tipo_uso                       VARCHAR(40)
);

CREATE TABLE mensaje_whatsapp (
    id_mensaje_wa                  BIGSERIAL      PRIMARY KEY,
    id_canal                       INTEGER       ,
    id_cliente                     INTEGER       ,
    id_plantilla_wa                INTEGER       ,
    contenido                      TEXT          ,
    timestamp                      TIMESTAMP     ,
    origen                         VARCHAR(10)   ,
    estado                         VARCHAR(15)
);

CREATE TABLE credenciales_tvip (
    id_credencial                  SERIAL         PRIMARY KEY,
    id_contrato                    INTEGER        UNIQUE,
    usuario_tvip                   VARCHAR(80)   ,
    password_tvip_hash             VARCHAR(72)   ,
    fecha_generacion               TIMESTAMP
);

CREATE TABLE transferencia_equipo (
    id_transferencia               SERIAL         PRIMARY KEY,
    id_empresa_origen              INTEGER       ,
    id_empresa_destino             INTEGER       ,
    id_usuario_registro            INTEGER       ,
    fecha_transferencia            DATE          ,
    observaciones                  TEXT
);

ALTER TABLE usuario ADD CONSTRAINT fk_usuario_id_empresa FOREIGN KEY (id_empresa) REFERENCES empresa(id_empresa);
ALTER TABLE usuario_rol ADD CONSTRAINT fk_usuario_rol_id_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario);
ALTER TABLE usuario_rol ADD CONSTRAINT fk_usuario_rol_id_rol FOREIGN KEY (id_rol) REFERENCES rol(id_rol);
ALTER TABLE log_auditoria ADD CONSTRAINT fk_log_auditoria_id_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario);
ALTER TABLE cliente ADD CONSTRAINT fk_cliente_id_empresa FOREIGN KEY (id_empresa) REFERENCES empresa(id_empresa);
ALTER TABLE direccion_servicio ADD CONSTRAINT fk_direccion_servicio_id_cliente FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente);
ALTER TABLE plan ADD CONSTRAINT fk_plan_id_empresa FOREIGN KEY (id_empresa) REFERENCES empresa(id_empresa);
ALTER TABLE contrato ADD CONSTRAINT fk_contrato_id_cliente FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente);
ALTER TABLE contrato ADD CONSTRAINT fk_contrato_id_plan FOREIGN KEY (id_plan) REFERENCES plan(id_plan);
ALTER TABLE contrato ADD CONSTRAINT fk_contrato_id_empresa FOREIGN KEY (id_empresa) REFERENCES empresa(id_empresa);
ALTER TABLE factura ADD CONSTRAINT fk_factura_id_contrato FOREIGN KEY (id_contrato) REFERENCES contrato(id_contrato);
ALTER TABLE pago ADD CONSTRAINT fk_pago_id_factura FOREIGN KEY (id_factura) REFERENCES factura(id_factura);
ALTER TABLE pago ADD CONSTRAINT fk_pago_id_cliente FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente);
ALTER TABLE ticket ADD CONSTRAINT fk_ticket_id_cliente FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente);
ALTER TABLE ticket ADD CONSTRAINT fk_ticket_id_empresa FOREIGN KEY (id_empresa) REFERENCES empresa(id_empresa);
ALTER TABLE ticket ADD CONSTRAINT fk_ticket_id_usuario_asignado FOREIGN KEY (id_usuario_asignado) REFERENCES usuario(id_usuario);
ALTER TABLE log_notificacion ADD CONSTRAINT fk_log_notificacion_id_cliente FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente);
ALTER TABLE log_notificacion ADD CONSTRAINT fk_log_notificacion_id_plantilla FOREIGN KEY (id_plantilla) REFERENCES plantilla_notificacion(id_plantilla);
ALTER TABLE tipo_equipo ADD CONSTRAINT fk_tipo_equipo_id_empresa FOREIGN KEY (id_empresa) REFERENCES empresa(id_empresa);
ALTER TABLE unidad_equipo ADD CONSTRAINT fk_unidad_equipo_id_tipo_equipo FOREIGN KEY (id_tipo_equipo) REFERENCES tipo_equipo(id_tipo_equipo);
ALTER TABLE unidad_equipo ADD CONSTRAINT fk_unidad_equipo_id_empresa FOREIGN KEY (id_empresa) REFERENCES empresa(id_empresa);
ALTER TABLE unidad_equipo ADD CONSTRAINT fk_unidad_equipo_id_cliente_instalado FOREIGN KEY (id_cliente_instalado) REFERENCES cliente(id_cliente);
ALTER TABLE unidad_equipo ADD CONSTRAINT fk_unidad_equipo_id_bodega_actual FOREIGN KEY (id_bodega_actual) REFERENCES bodega(id_bodega);
ALTER TABLE unidad_equipo ADD CONSTRAINT fk_unidad_equipo_id_caja_nap FOREIGN KEY (id_caja_nap) REFERENCES caja_nap(id_caja_nap);
ALTER TABLE caja_nap ADD CONSTRAINT fk_caja_nap_id_empresa FOREIGN KEY (id_empresa) REFERENCES empresa(id_empresa);
ALTER TABLE caja_nap ADD CONSTRAINT fk_caja_nap_id_mufa FOREIGN KEY (id_mufa) REFERENCES mufa(id_mufa);
ALTER TABLE orden_trabajo ADD CONSTRAINT fk_orden_trabajo_id_empresa FOREIGN KEY (id_empresa) REFERENCES empresa(id_empresa);
ALTER TABLE orden_trabajo ADD CONSTRAINT fk_orden_trabajo_id_cliente FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente);
ALTER TABLE orden_trabajo ADD CONSTRAINT fk_orden_trabajo_id_tecnico FOREIGN KEY (id_tecnico) REFERENCES usuario(id_usuario);
ALTER TABLE orden_trabajo ADD CONSTRAINT fk_orden_trabajo_id_tecnico_externo FOREIGN KEY (id_tecnico_externo) REFERENCES tecnico_externo(id_tecnico_ext);
ALTER TABLE orden_trabajo ADD CONSTRAINT fk_orden_trabajo_id_direccion FOREIGN KEY (id_direccion) REFERENCES direccion_servicio(id_direccion);
ALTER TABLE conversacion_bot ADD CONSTRAINT fk_conversacion_bot_id_cliente FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente);
ALTER TABLE conversacion_bot ADD CONSTRAINT fk_conversacion_bot_id_canal_wa FOREIGN KEY (id_canal_wa) REFERENCES canal_whatsapp(id_canal);
ALTER TABLE mensaje_bot ADD CONSTRAINT fk_mensaje_bot_id_conversacion FOREIGN KEY (id_conversacion) REFERENCES conversacion_bot(id_conversacion);
ALTER TABLE bodega ADD CONSTRAINT fk_bodega_id_empresa FOREIGN KEY (id_empresa) REFERENCES empresa(id_empresa);
ALTER TABLE stock_consumible ADD CONSTRAINT fk_stock_consumible_id_tipo_equipo FOREIGN KEY (id_tipo_equipo) REFERENCES tipo_equipo(id_tipo_equipo);
ALTER TABLE stock_consumible ADD CONSTRAINT fk_stock_consumible_id_bodega FOREIGN KEY (id_bodega) REFERENCES bodega(id_bodega);
ALTER TABLE orden_ingreso ADD CONSTRAINT fk_orden_ingreso_id_proveedor FOREIGN KEY (id_proveedor) REFERENCES proveedor(id_proveedor);
ALTER TABLE orden_ingreso ADD CONSTRAINT fk_orden_ingreso_id_bodega FOREIGN KEY (id_bodega) REFERENCES bodega(id_bodega);
ALTER TABLE orden_ingreso ADD CONSTRAINT fk_orden_ingreso_id_empresa FOREIGN KEY (id_empresa) REFERENCES empresa(id_empresa);
ALTER TABLE orden_ingreso ADD CONSTRAINT fk_orden_ingreso_id_usuario_registro FOREIGN KEY (id_usuario_registro) REFERENCES usuario(id_usuario);
ALTER TABLE detalle_orden_ingreso ADD CONSTRAINT fk_detalle_orden_ingreso_id_orden FOREIGN KEY (id_orden) REFERENCES orden_ingreso(id_orden);
ALTER TABLE detalle_orden_ingreso ADD CONSTRAINT fk_detalle_orden_ingreso_id_tipo_equipo FOREIGN KEY (id_tipo_equipo) REFERENCES tipo_equipo(id_tipo_equipo);
ALTER TABLE historial_estado_equipo ADD CONSTRAINT fk_historial_estado_equipo_id_unidad FOREIGN KEY (id_unidad) REFERENCES unidad_equipo(id_unidad);
ALTER TABLE historial_estado_equipo ADD CONSTRAINT fk_historial_estado_equipo_id_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario);
ALTER TABLE movimiento_inventario ADD CONSTRAINT fk_movimiento_inventario_id_tipo_equipo FOREIGN KEY (id_tipo_equipo) REFERENCES tipo_equipo(id_tipo_equipo);
ALTER TABLE movimiento_inventario ADD CONSTRAINT fk_movimiento_inventario_id_unidad FOREIGN KEY (id_unidad) REFERENCES unidad_equipo(id_unidad);
ALTER TABLE movimiento_inventario ADD CONSTRAINT fk_movimiento_inventario_id_empresa_origen FOREIGN KEY (id_empresa_origen) REFERENCES empresa(id_empresa);
ALTER TABLE movimiento_inventario ADD CONSTRAINT fk_movimiento_inventario_id_empresa_destino FOREIGN KEY (id_empresa_destino) REFERENCES empresa(id_empresa);
ALTER TABLE movimiento_inventario ADD CONSTRAINT fk_movimiento_inventario_id_bodega_origen FOREIGN KEY (id_bodega_origen) REFERENCES bodega(id_bodega);
ALTER TABLE movimiento_inventario ADD CONSTRAINT fk_movimiento_inventario_id_bodega_destino FOREIGN KEY (id_bodega_destino) REFERENCES bodega(id_bodega);
ALTER TABLE movimiento_inventario ADD CONSTRAINT fk_movimiento_inventario_id_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario);
ALTER TABLE prestamo_externo ADD CONSTRAINT fk_prestamo_externo_id_unidad FOREIGN KEY (id_unidad) REFERENCES unidad_equipo(id_unidad);
ALTER TABLE prestamo_externo ADD CONSTRAINT fk_prestamo_externo_id_empresa_prestamista FOREIGN KEY (id_empresa_prestamista) REFERENCES empresa(id_empresa);
ALTER TABLE baja_equipo ADD CONSTRAINT fk_baja_equipo_id_unidad FOREIGN KEY (id_unidad) REFERENCES unidad_equipo(id_unidad);
ALTER TABLE baja_equipo ADD CONSTRAINT fk_baja_equipo_id_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario);
ALTER TABLE sesion_portal ADD CONSTRAINT fk_sesion_portal_id_cliente FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente);
ALTER TABLE punto_cobertura ADD CONSTRAINT fk_punto_cobertura_id_empresa FOREIGN KEY (id_empresa) REFERENCES empresa(id_empresa);
ALTER TABLE consentimiento_cookies ADD CONSTRAINT fk_consentimiento_cookies_id_cliente FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente);
ALTER TABLE historial_ot ADD CONSTRAINT fk_historial_ot_id_ot FOREIGN KEY (id_ot) REFERENCES orden_trabajo(id_ot);
ALTER TABLE historial_ot ADD CONSTRAINT fk_historial_ot_id_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario);
ALTER TABLE uso_material_ot ADD CONSTRAINT fk_uso_material_ot_id_ot FOREIGN KEY (id_ot) REFERENCES orden_trabajo(id_ot);
ALTER TABLE uso_material_ot ADD CONSTRAINT fk_uso_material_ot_id_tipo_equipo FOREIGN KEY (id_tipo_equipo) REFERENCES tipo_equipo(id_tipo_equipo);
ALTER TABLE uso_material_ot ADD CONSTRAINT fk_uso_material_ot_id_unidad FOREIGN KEY (id_unidad) REFERENCES unidad_equipo(id_unidad);
ALTER TABLE evidencia_foto ADD CONSTRAINT fk_evidencia_foto_id_ot FOREIGN KEY (id_ot) REFERENCES orden_trabajo(id_ot);
ALTER TABLE llamada_cortes ADD CONSTRAINT fk_llamada_cortes_id_ot FOREIGN KEY (id_ot) REFERENCES orden_trabajo(id_ot);
ALTER TABLE lista_negra ADD CONSTRAINT fk_lista_negra_id_cliente FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente);
ALTER TABLE lista_negra ADD CONSTRAINT fk_lista_negra_id_usuario_registro FOREIGN KEY (id_usuario_registro) REFERENCES usuario(id_usuario);
ALTER TABLE olt ADD CONSTRAINT fk_olt_id_empresa FOREIGN KEY (id_empresa) REFERENCES empresa(id_empresa);
ALTER TABLE tarjeta_pon ADD CONSTRAINT fk_tarjeta_pon_id_olt FOREIGN KEY (id_olt) REFERENCES olt(id_olt);
ALTER TABLE mufa ADD CONSTRAINT fk_mufa_id_tarjeta_pon FOREIGN KEY (id_tarjeta_pon) REFERENCES tarjeta_pon(id_tarjeta);
ALTER TABLE puerto_nap ADD CONSTRAINT fk_puerto_nap_id_caja_nap FOREIGN KEY (id_caja_nap) REFERENCES caja_nap(id_caja_nap);
ALTER TABLE puerto_nap ADD CONSTRAINT fk_puerto_nap_id_cliente_asociado FOREIGN KEY (id_cliente_asociado) REFERENCES cliente(id_cliente);
ALTER TABLE monitoreo_ont ADD CONSTRAINT fk_monitoreo_ont_id_unidad FOREIGN KEY (id_unidad) REFERENCES unidad_equipo(id_unidad);
ALTER TABLE monitoreo_ont ADD CONSTRAINT fk_monitoreo_ont_id_cliente FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente);
ALTER TABLE historial_conexion_ont ADD CONSTRAINT fk_historial_conexion_ont_id_unidad FOREIGN KEY (id_unidad) REFERENCES unidad_equipo(id_unidad);
ALTER TABLE prospecto ADD CONSTRAINT fk_prospecto_id_empresa FOREIGN KEY (id_empresa) REFERENCES empresa(id_empresa);
ALTER TABLE prospecto ADD CONSTRAINT fk_prospecto_id_usuario_comercial FOREIGN KEY (id_usuario_comercial) REFERENCES usuario(id_usuario);
ALTER TABLE cotizacion ADD CONSTRAINT fk_cotizacion_id_prospecto FOREIGN KEY (id_prospecto) REFERENCES prospecto(id_prospecto);
ALTER TABLE cotizacion ADD CONSTRAINT fk_cotizacion_id_plan FOREIGN KEY (id_plan) REFERENCES plan(id_plan);
ALTER TABLE canal_whatsapp ADD CONSTRAINT fk_canal_whatsapp_id_empresa FOREIGN KEY (id_empresa) REFERENCES empresa(id_empresa);
ALTER TABLE plantilla_whatsapp ADD CONSTRAINT fk_plantilla_whatsapp_id_canal FOREIGN KEY (id_canal) REFERENCES canal_whatsapp(id_canal);
ALTER TABLE mensaje_whatsapp ADD CONSTRAINT fk_mensaje_whatsapp_id_canal FOREIGN KEY (id_canal) REFERENCES canal_whatsapp(id_canal);
ALTER TABLE mensaje_whatsapp ADD CONSTRAINT fk_mensaje_whatsapp_id_cliente FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente);
ALTER TABLE mensaje_whatsapp ADD CONSTRAINT fk_mensaje_whatsapp_id_plantilla_wa FOREIGN KEY (id_plantilla_wa) REFERENCES plantilla_whatsapp(id_plantilla_wa);
ALTER TABLE credenciales_tvip ADD CONSTRAINT fk_credenciales_tvip_id_contrato FOREIGN KEY (id_contrato) REFERENCES contrato(id_contrato);
ALTER TABLE transferencia_equipo ADD CONSTRAINT fk_transferencia_equipo_id_empresa_origen FOREIGN KEY (id_empresa_origen) REFERENCES empresa(id_empresa);
ALTER TABLE transferencia_equipo ADD CONSTRAINT fk_transferencia_equipo_id_empresa_destino FOREIGN KEY (id_empresa_destino) REFERENCES empresa(id_empresa);
ALTER TABLE transferencia_equipo ADD CONSTRAINT fk_transferencia_equipo_id_usuario_registro FOREIGN KEY (id_usuario_registro) REFERENCES usuario(id_usuario);

ALTER TABLE ticket             ADD CONSTRAINT fk_ticket_id_categoria          FOREIGN KEY (id_categoria)         REFERENCES categoria_falla(id_categoria);
ALTER TABLE ticket             ADD CONSTRAINT fk_ticket_id_conversacion_bot   FOREIGN KEY (id_conversacion_bot)  REFERENCES conversacion_bot(id_conversacion);
ALTER TABLE prospecto          ADD CONSTRAINT fk_prospecto_id_cliente         FOREIGN KEY (id_cliente)           REFERENCES cliente(id_cliente);
ALTER TABLE configuracion_seo  ADD CONSTRAINT fk_configuracion_seo_id_empresa FOREIGN KEY (id_empresa)           REFERENCES empresa(id_empresa);
ALTER TABLE intento_fallido    ADD CONSTRAINT fk_intento_fallido_id_empresa   FOREIGN KEY (id_empresa)           REFERENCES empresa(id_empresa);
ALTER TABLE orden_trabajo      ADD CONSTRAINT fk_orden_trabajo_id_ticket      FOREIGN KEY (id_ticket)            REFERENCES ticket(id_ticket);
ALTER TABLE monitoreo_ont      ADD CONSTRAINT fk_monitoreo_ont_id_caja_nap    FOREIGN KEY (id_caja_nap)          REFERENCES caja_nap(id_caja_nap);
