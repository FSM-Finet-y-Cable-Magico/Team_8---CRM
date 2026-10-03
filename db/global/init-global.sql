-- CONTRACT_CHANGE 2026-09-29:
-- - REMOVE invalid unique prospecto_id_cliente_key (un cliente puede relacionarse con varios prospectos).
-- - ADD integracion_activacion_g1.payload_snapshot JSONB NULL.
-- CONTRACT_CHANGE 2026-09-30:
-- - ADD solicitud_instalacion_integracion from confirmed G8-G3 physical contract.
-- ============================================================================
--  init-global.sql · Esquema consolidado de la base de datos compartida
--  Grupos integrados:
--    1 · Inventario y Bodega              (init-2.sql)
--    2 · Portal Clientes                   (init-grupo2-portal-clientes.sql)
--    8 · CRM Finet & Cable Mágico Litoral  (init-3.sql)
--    X · Red / Ops (ONT, OLT, NAP)         (init.sql)
--  Generado: 2026-09-28 · Validado con PostgreSQL
--
--  Cómo se construyó:
--    · Contrato vigente de 91 tablas funcionales (no se descarta ninguna).
--    · Unión de columnas: si una tabla existe en varios grupos, conserva
--      las columnas de todos.
--    · Tipos ensanchados al mayor dominio compatible (VARCHAR de mayor
--      largo, TEXT, BIGSERIAL, TIMESTAMPTZ, NUMERIC de mayor precisión).
--    · Columnas definidas por un subconjunto de los grupos dueños de la
--      tabla quedan NULL-ables (salvo PK) para no romper los INSERT ajenos.
--    · FK: una sola definición por relación; se conserva la del esquema de
--      mayor preferencia (G8 > G2 > Ops > G1).
--    · Sin datos ni seeds. Sin DROP: pensado para base vacía.
--
--  Idempotente: puede re-ejecutarse; usa IF NOT EXISTS y bloques DO para
--  las claves foráneas.
--
--  Tablas 'gemelas' (mismo concepto, distinto nombre en cada grupo). Se
--  mantienen ambas para no romper el código de ningún equipo:
--    · orden_ingreso_detalle (G1)  <-> detalle_orden_ingreso (G8/G2/Ops)
--    · solicitud_baja (G1)         <-> baja_equipo (G8/G2/Ops)
--    · prestamo_detalle / prestamo_retorno (G1) completan prestamo_externo
--    · integracion_cierre / integracion_activacion (G1) <-> integracion_*_g1/g3 (G8)
--    · proveedor.rut (G1)          <-> proveedor.rut_proveedor (G8/G2/Ops)
-- ============================================================================

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

-- ============================================================================
-- SECCIÓN 1 · Núcleo compartido (empresas, usuarios y roles)
-- ============================================================================

CREATE TABLE IF NOT EXISTS empresa (
    id_empresa                   SERIAL PRIMARY KEY,
    nombre                       VARCHAR(100) NOT NULL,
    rut_empresa                  VARCHAR(12),
    esquema_db                   VARCHAR(50),
    umbral_desconexion_min       SMALLINT
);

CREATE TABLE IF NOT EXISTS log_auditoria (
    id_log                       BIGSERIAL PRIMARY KEY,
    id_usuario                   INTEGER,
    accion                       VARCHAR(100) NOT NULL,
    entidad_afectada             VARCHAR(100),
    id_entidad_afectada          INTEGER,
    valor_anterior               JSONB,
    valor_nuevo                  JSONB,
    ip_origen                    VARCHAR(45),
    fecha_hora                   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rol (
    id_rol                       SERIAL PRIMARY KEY,
    nombre_rol                   VARCHAR(50) NOT NULL,
    descripcion                  TEXT
);

CREATE TABLE IF NOT EXISTS usuario (
    id_usuario                   SERIAL PRIMARY KEY,
    id_empresa                   INTEGER,
    nombre_completo              VARCHAR(150) NOT NULL,
    nombre_usuario               VARCHAR(50),
    email                        VARCHAR(150),
    password_hash                VARCHAR(255) NOT NULL,
    activo                       BOOLEAN DEFAULT true,
    fecha_creacion               TIMESTAMPTZ DEFAULT now(),
    es_password_temporal         BOOLEAN DEFAULT true,
    intentos_fallidos            INTEGER DEFAULT 0,
    version_sesion               INTEGER DEFAULT 0,
    bloqueado_hasta              TIMESTAMPTZ,
    debe_cambiar_password        BOOLEAN DEFAULT FALSE,
    rut                          VARCHAR(12)
);

CREATE TABLE IF NOT EXISTS usuario_rol (
    id_usuario_rol               SERIAL PRIMARY KEY,
    id_usuario                   INTEGER,
    id_rol                       INTEGER NOT NULL,
    fecha_asignacion             TIMESTAMPTZ DEFAULT now()
);


-- ============================================================================
-- SECCIÓN 2 · Inventario y Bodega (Grupo 1) y tablas compartidas del dominio
-- ============================================================================

CREATE TABLE IF NOT EXISTS asignacion_equipo_servicio (
    id_asignacion                SERIAL PRIMARY KEY,
    id_unidad                    INTEGER NOT NULL,
    id_empresa                   INTEGER NOT NULL,
    event_id                     VARCHAR(100),
    id_cliente_externo           INTEGER,
    rut_cliente                  VARCHAR(20),
    id_servicio_externo          INTEGER NOT NULL,
    id_contrato_externo          INTEGER,
    id_ot                        INTEGER,
    fecha_instalacion            TIMESTAMPTZ NOT NULL,
    fecha_retiro                 TIMESTAMPTZ,
    activa                       BOOLEAN NOT NULL DEFAULT TRUE,
    origen                       VARCHAR(30),
    trace_id                     VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS baja_equipo (
    id_baja                      SERIAL PRIMARY KEY,
    id_unidad                    INTEGER,
    id_usuario                   INTEGER,
    motivo_baja                  TEXT NOT NULL,
    tipo_baja                    VARCHAR(20),
    donacion_destinatario        VARCHAR(150),
    fecha_baja                   DATE
);

CREATE TABLE IF NOT EXISTS bodega (
    id_bodega                    SERIAL PRIMARY KEY,
    id_empresa                   INTEGER,
    nombre                       VARCHAR(100) NOT NULL,
    direccion                    VARCHAR(200),
    activa                       BOOLEAN DEFAULT true,
    id_usuario_responsable       INTEGER
);

CREATE TABLE IF NOT EXISTS detalle_orden_ingreso (
    id_detalle                   SERIAL PRIMARY KEY,
    id_orden                     INTEGER,
    id_tipo_equipo               INTEGER,
    cantidad_solicitada          INTEGER NOT NULL,
    cantidad_recibida            INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS donacion (
    id_donacion                  SERIAL PRIMARY KEY,
    nombre_institucion           VARCHAR(100) NOT NULL,
    rut_institucion              VARCHAR(12) NOT NULL,
    fecha_donacion               DATE NOT NULL,
    numero_resolucion            VARCHAR(30),
    id_usuario                   INTEGER NOT NULL,
    id_empresa                   INTEGER,
    fecha_creacion               TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS donacion_detalle (
    id_detalle                   SERIAL PRIMARY KEY,
    id_donacion                  INTEGER NOT NULL,
    id_unidad                    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS historial_estado_equipo (
    id_historial                 BIGSERIAL PRIMARY KEY,
    id_unidad                    INTEGER,
    id_usuario                   INTEGER,
    estado_anterior              VARCHAR(30),
    estado_nuevo                 VARCHAR(30),
    motivo                       TEXT,
    fecha_hora                   TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventario_personal_tecnico (
    id_inventario                SERIAL PRIMARY KEY,
    id_tecnico                   INTEGER NOT NULL,
    id_tipo_equipo               INTEGER NOT NULL,
    cantidad                     NUMERIC(10,2) DEFAULT 0,
    fecha_actualizacion          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS movimiento_inventario (
    id_movimiento                BIGSERIAL PRIMARY KEY,
    id_tipo_equipo               INTEGER,
    id_unidad                    INTEGER,
    id_empresa_origen            INTEGER,
    id_empresa_destino           INTEGER,
    id_bodega_origen             INTEGER,
    id_bodega_destino            INTEGER,
    id_usuario                   INTEGER,
    tipo_movimiento              VARCHAR(30),
    cantidad                     NUMERIC(10,2) DEFAULT 1,
    fecha                        TIMESTAMP DEFAULT now(),
    referencia_id                INTEGER
);

CREATE TABLE IF NOT EXISTS orden_ingreso (
    id_orden                     SERIAL PRIMARY KEY,
    id_proveedor                 INTEGER,
    id_bodega                    INTEGER,
    id_empresa                   INTEGER,
    id_usuario_registro          INTEGER,
    fecha_creacion               TIMESTAMPTZ DEFAULT now(),
    fecha_recepcion              DATE,
    estado                       VARCHAR(30) DEFAULT 'Pendiente de recepción',
    factura_proveedor            VARCHAR(50),
    correlativo                  VARCHAR(10),
    numero_documento             VARCHAR(30),
    fecha_documento              DATE,
    id_empresa_destino           INTEGER,
    id_bodega_destino            INTEGER
);

CREATE TABLE IF NOT EXISTS orden_ingreso_detalle (
    id_detalle                   SERIAL PRIMARY KEY,
    id_orden                     INTEGER NOT NULL,
    id_tipo_equipo               INTEGER NOT NULL,
    cantidad_esperada            INTEGER NOT NULL CHECK (cantidad_esperada > 0),
    garantia_dias                INTEGER NOT NULL DEFAULT 0 CHECK (garantia_dias >= 0 AND garantia_dias <= 3650),
    cantidad_recibida            INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS prestamo_detalle (
    id_detalle                   SERIAL PRIMARY KEY,
    id_prestamo                  INTEGER NOT NULL,
    id_unidad                    INTEGER,
    id_tipo_equipo               INTEGER,
    cantidad                     NUMERIC(10,2),
    cantidad_retornada           NUMERIC(10,2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS prestamo_externo (
    id_prestamo                  SERIAL PRIMARY KEY,
    id_unidad                    INTEGER,
    id_empresa_prestamista       INTEGER,
    destinatario                 VARCHAR(100),
    motivo                       TEXT,
    fecha_salida                 TIMESTAMPTZ DEFAULT now(),
    fecha_retorno_esperada       DATE,
    fecha_retorno_real           DATE,
    estado                       VARCHAR(20) DEFAULT 'ACTIVO',
    condicion_retorno            TEXT,
    tipo                         VARCHAR(30),
    id_empresa                   INTEGER,
    nombre_receptor              VARCHAR(80),
    rut_receptor                 VARCHAR(12),
    fecha_retorno_estimada       DATE,
    detalle                      TEXT,
    resultado                    VARCHAR(20),
    id_usuario_registro          INTEGER,
    correlativo                  VARCHAR(12),
    id_bodega_origen             INTEGER
);

CREATE TABLE IF NOT EXISTS prestamo_retorno (
    id_retorno                   SERIAL PRIMARY KEY,
    id_detalle                   INTEGER NOT NULL,
    cantidad                     NUMERIC(10,2),
    fecha_retorno                TIMESTAMPTZ NOT NULL,
    observacion                  VARCHAR(300),
    id_usuario                   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS proveedor (
    id_proveedor                 SERIAL PRIMARY KEY,
    nombre_comercial             VARCHAR(100) NOT NULL,
    rut_proveedor                VARCHAR(12),
    contacto                     VARCHAR(80),
    telefono                     VARCHAR(20),
    email                        VARCHAR(150),
    rut                          VARCHAR(12),
    nombre_contacto              VARCHAR(80),
    activa                       BOOLEAN DEFAULT TRUE,
    fecha_creacion               TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS proveedor_tipo_equipo (
    id                           SERIAL PRIMARY KEY,
    id_proveedor                 INTEGER NOT NULL,
    id_tipo_equipo               INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS salida_bodega (
    id_salida                    SERIAL PRIMARY KEY,
    id_tecnico                   INTEGER NOT NULL,
    id_bodega_origen             INTEGER NOT NULL,
    fecha_hora                   TIMESTAMPTZ DEFAULT now(),
    id_empresa                   INTEGER,
    id_usuario_registro          INTEGER
);

CREATE TABLE IF NOT EXISTS salida_detalle (
    id_detalle                   SERIAL PRIMARY KEY,
    id_salida                    INTEGER NOT NULL,
    id_tipo_equipo               INTEGER,
    id_unidad                    INTEGER,
    cantidad                     NUMERIC(10,2)
);

CREATE TABLE IF NOT EXISTS secuencia_srv (
    id_empresa                   INTEGER,
    anio                         INTEGER,
    ultimo                       INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (id_empresa, anio)
);

CREATE TABLE IF NOT EXISTS solicitud_baja (
    id_solicitud                 SERIAL PRIMARY KEY,
    id_unidad                    INTEGER NOT NULL,
    id_empresa                   INTEGER,
    id_usuario_solicitante       INTEGER NOT NULL,
    motivo                       VARCHAR(40) NOT NULL,
    motivo_otro                  VARCHAR(200),
    estado                       VARCHAR(30) NOT NULL,
    id_usuario_aprobador         INTEGER,
    fecha_solicitud              TIMESTAMPTZ DEFAULT now(),
    fecha_resolucion             TIMESTAMPTZ,
    motivo_rechazo               VARCHAR(200)
);

CREATE TABLE IF NOT EXISTS stock_consumible (
    id_stock                     SERIAL PRIMARY KEY,
    id_tipo_equipo               INTEGER,
    id_bodega                    INTEGER,
    cantidad_disponible          NUMERIC(10,2) DEFAULT 0,
    umbral_minimo                NUMERIC(10,2)
);

CREATE TABLE IF NOT EXISTS tipo_equipo (
    id_tipo_equipo               SERIAL PRIMARY KEY,
    id_empresa                   INTEGER,
    nombre                       VARCHAR(100) NOT NULL,
    categoria                    VARCHAR(40),
    requiere_serie_individual    BOOLEAN,
    ficha_tecnica_pdf_url        TEXT,
    activo                       BOOLEAN DEFAULT true,
    marca                        VARCHAR(50),
    modelo                       VARCHAR(50),
    descripcion_tecnica          VARCHAR(500),
    unidad_medida                VARCHAR(20),
    garantia_dias                INTEGER DEFAULT 0,
    ficha_tecnica_nombre         VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS transferencia_equipo (
    id_transferencia             SERIAL PRIMARY KEY,
    id_empresa_origen            INTEGER,
    id_empresa_destino           INTEGER,
    id_usuario_registro          INTEGER,
    fecha_transferencia          DATE,
    observaciones                TEXT
);

CREATE TABLE IF NOT EXISTS unidad_equipo (
    id_unidad                    SERIAL PRIMARY KEY,
    id_tipo_equipo               INTEGER,
    id_empresa                   INTEGER,
    numero_serie                 VARCHAR(80) NOT NULL,
    modelo                       VARCHAR(80),
    estado                       VARCHAR(30) NOT NULL,
    fecha_adquisicion            DATE,
    fecha_venc_garantia          DATE,
    diagnostico_tecnico          TEXT,
    id_cliente_instalado         INTEGER,
    id_servicio                  INTEGER,
    id_bodega_actual             INTEGER,
    numero_poste                 VARCHAR(30),
    id_caja_nap                  INTEGER,
    modalidad_asignacion         VARCHAR(30),
    valor_arriendo_mensual       NUMERIC(10,2),
    fecha_inicio_asignacion      DATE,
    mac_address                  VARCHAR(17),
    proveedor                    VARCHAR(80),
    observaciones                VARCHAR(300),
    ubicacion_fisica             VARCHAR(60),
    motivo_baja                  VARCHAR(40),
    motivo_baja_detalle          VARCHAR(200),
    id_tecnico_asignado          INTEGER,
    cliente_rut                  VARCHAR(20),
    cliente_nombre               VARCHAR(150),
    direccion_instalacion        VARCHAR(300),
    comuna_instalacion           VARCHAR(100),
    srv                          VARCHAR(20)
);


-- ============================================================================
-- SECCIÓN 3 · Clientes, CRM y facturación (Grupo 8)
-- ============================================================================

CREATE TABLE IF NOT EXISTS cambio_condicion_pago (
    id_cambio                    SERIAL PRIMARY KEY,
    id_empresa                   INTEGER NOT NULL,
    id_cliente                   INTEGER NOT NULL,
    id_contrato                  INTEGER,
    id_factura                   INTEGER,
    tipo_cambio                  VARCHAR(30) NOT NULL,
    valor_anterior               VARCHAR(40) NOT NULL,
    valor_nuevo                  VARCHAR(40) NOT NULL,
    justificacion                TEXT NOT NULL,
    id_usuario_responsable       INTEGER NOT NULL,
    fecha_registro               TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT cambio_condicion_pago_tipo_check CHECK (((tipo_cambio)::text = ANY ((ARRAY['DIA_PAGO'::character varying, 'FECHA_COMPROMETIDA'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS cargo_adicional (
    id_cargo                     SERIAL PRIMARY KEY,
    id_empresa                   INTEGER NOT NULL,
    id_cliente                   INTEGER NOT NULL,
    id_contrato                  INTEGER,
    id_servicio                  INTEGER,
    tipo                         VARCHAR(30) NOT NULL,
    monto                        NUMERIC(12,2) NOT NULL,
    fecha                        DATE NOT NULL,
    estado                       VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE_FACTURACION'::character varying,
    afecta_saldo                 BOOLEAN NOT NULL DEFAULT false,
    observacion                  TEXT,
    id_usuario_responsable       INTEGER NOT NULL,
    fecha_registro               TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT cargo_adicional_estado_check CHECK (((estado)::text = ANY ((ARRAY['PENDIENTE_FACTURACION'::character varying, 'FACTURADO'::character varying, 'ANULADO'::character varying])::text[]))),
    CONSTRAINT cargo_adicional_monto_check CHECK ((monto > (0)::numeric)),
    CONSTRAINT cargo_adicional_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['REPOSICION'::character varying, 'RECONEXION'::character varying, 'RETIRO'::character varying, 'OTRO'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS cliente (
    id_cliente                   SERIAL PRIMARY KEY,
    id_empresa                   INTEGER,
    rut                          VARCHAR(12),
    nombre_completo              VARCHAR(120) NOT NULL,
    email                        VARCHAR(120),
    telefono                     VARCHAR(20),
    password_portal_hash         VARCHAR(72),
    estado                       VARCHAR(40) NOT NULL,
    es_conflictivo               BOOLEAN DEFAULT false,
    importado_masivo             BOOLEAN DEFAULT false,
    origen_contacto              VARCHAR(40),
    datos_tecnicos               JSONB,
    fecha_creacion               TIMESTAMP DEFAULT now(),
    obs_conflictivo              TEXT
);

CREATE TABLE IF NOT EXISTS contrato (
    id_contrato                  SERIAL PRIMARY KEY,
    id_cliente                   INTEGER,
    id_plan                      INTEGER,
    id_empresa                   INTEGER,
    fecha_inicio                 DATE NOT NULL,
    dia_vencimiento              SMALLINT NOT NULL,
    estado                       VARCHAR(40) NOT NULL,
    fecha_suspension             DATE,
    id_zona_pago                 INTEGER,
    proveedor_contrato           VARCHAR(40),
    numero_contrato_externo      VARCHAR(80),
    folio_contrato_externo       VARCHAR(80),
    url_contrato_pdf             TEXT,
    fecha_generacion_contrato    DATE,
    fecha_envio_cliente          DATE,
    observacion_contrato         TEXT,
    fecha_firma_manual           DATE,
    id_usuario_firma_manual      INTEGER,
    observacion_firma_manual     TEXT,
    id_prospecto                 INTEGER,
    direccion_instalacion        VARCHAR(200),
    comuna_instalacion           VARCHAR(80),
    ciudad_instalacion           VARCHAR(80)
);

CREATE TABLE IF NOT EXISTS contrato_digital (
    id_contrato_digital          SERIAL PRIMARY KEY,
    id_contrato                  INTEGER NOT NULL,
    id_cliente                   INTEGER,
    id_empresa                   INTEGER,
    url_documento                TEXT NOT NULL,
    hash_documento               VARCHAR(128) NOT NULL,
    estado_firma                 VARCHAR(30) NOT NULL,
    fecha_generacion             TIMESTAMP DEFAULT now(),
    fecha_firma                  TIMESTAMP,
    id_usuario_generador         INTEGER,
    version                      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS convenio_pago (
    id_convenio                  SERIAL PRIMARY KEY,
    id_empresa                   INTEGER NOT NULL,
    id_cliente                   INTEGER NOT NULL,
    id_servicio                  INTEGER,
    id_contrato                  INTEGER,
    id_factura                   INTEGER,
    monto_comprometido           NUMERIC(12,2) NOT NULL,
    cantidad_cuotas              SMALLINT NOT NULL,
    condiciones                  TEXT NOT NULL,
    fecha_inicio                 DATE NOT NULL,
    estado                       VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'::character varying,
    id_usuario_responsable       INTEGER NOT NULL,
    id_usuario_aprobador         INTEGER,
    fecha_registro               TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_aprobacion             TIMESTAMPTZ,
    CONSTRAINT convenio_pago_cuotas_check CHECK ((cantidad_cuotas > 0)),
    CONSTRAINT convenio_pago_estado_check CHECK (((estado)::text = ANY ((ARRAY['PENDIENTE'::character varying, 'APROBADO'::character varying, 'ACTIVO'::character varying, 'CUMPLIDO'::character varying, 'INCUMPLIDO'::character varying, 'CANCELADO'::character varying])::text[]))),
    CONSTRAINT convenio_pago_monto_check CHECK ((monto_comprometido > (0)::numeric))
);

CREATE TABLE IF NOT EXISTS cotizacion (
    id_cotizacion                SERIAL PRIMARY KEY,
    id_prospecto                 INTEGER,
    id_plan                      INTEGER,
    pdf_url                      TEXT,
    fecha_envio                  TIMESTAMP,
    factibilidad_verificada      BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS credenciales_tvip (
    id_credencial                SERIAL PRIMARY KEY,
    id_contrato                  INTEGER,
    usuario_tvip                 VARCHAR(80),
    password_tvip_hash           VARCHAR(72),
    fecha_generacion             TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cuota_convenio_pago (
    id_cuota                     SERIAL PRIMARY KEY,
    id_convenio                  INTEGER NOT NULL,
    numero                       SMALLINT NOT NULL,
    monto                        NUMERIC(12,2) NOT NULL,
    fecha_vencimiento            DATE NOT NULL,
    estado                       VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'::character varying,
    fecha_pago                   DATE,
    CONSTRAINT cuota_convenio_pago_estado_check CHECK (((estado)::text = ANY ((ARRAY['PENDIENTE'::character varying, 'PAGADA'::character varying, 'VENCIDA'::character varying, 'CANCELADA'::character varying])::text[]))),
    CONSTRAINT cuota_convenio_pago_monto_check CHECK ((monto > (0)::numeric)),
    CONSTRAINT cuota_convenio_pago_numero_check CHECK ((numero > 0))
);

CREATE TABLE IF NOT EXISTS direccion_servicio (
    id_direccion                 SERIAL PRIMARY KEY,
    id_cliente                   INTEGER,
    direccion_completa           VARCHAR(200) NOT NULL,
    comuna                       VARCHAR(80) NOT NULL,
    ciudad                       VARCHAR(80),
    es_principal                 BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS documento_tributario_externo (
    id_documento                 SERIAL PRIMARY KEY,
    id_empresa                   INTEGER NOT NULL,
    tipo_documento               VARCHAR(20) NOT NULL,
    folio_o_numero               VARCHAR(80) NOT NULL,
    folio_normalizado            VARCHAR(80) NOT NULL,
    emisor_proveedor             VARCHAR(160) NOT NULL,
    emisor_normalizado           VARCHAR(160) NOT NULL,
    fecha_emision                DATE NOT NULL,
    monto_neto                   NUMERIC(14,2),
    monto_exento                 NUMERIC(14,2),
    iva                          NUMERIC(14,2),
    monto_total                  NUMERIC(14,2) NOT NULL,
    url_documento                TEXT,
    referencia_externa           VARCHAR(200),
    estado                       VARCHAR(20) NOT NULL DEFAULT 'REGISTRADO'::character varying,
    fuente                       VARCHAR(30) NOT NULL DEFAULT 'EXTERNO_MANUAL'::character varying,
    id_cliente                   INTEGER,
    id_contrato                  INTEGER,
    id_factura                   INTEGER,
    id_cargo_adicional           INTEGER,
    id_usuario_registro          INTEGER NOT NULL,
    fecha_registro               TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_actualizacion          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT documento_tributario_externo_estado_check CHECK (((estado)::text = ANY ((ARRAY['REGISTRADO'::character varying, 'ANULADO'::character varying])::text[]))),
    CONSTRAINT documento_tributario_externo_fuente_check CHECK (((fuente)::text = 'EXTERNO_MANUAL'::text)),
    CONSTRAINT documento_tributario_externo_montos_check CHECK (((monto_total >= (0)::numeric) AND ((monto_neto IS NULL) OR (monto_neto >= (0)::numeric)) AND ((monto_exento IS NULL) OR (monto_exento >= (0)::numeric)) AND ((iva IS NULL) OR (iva >= (0)::numeric)))),
    CONSTRAINT documento_tributario_externo_tipo_check CHECK (((tipo_documento)::text = ANY ((ARRAY['BOLETA'::character varying, 'FACTURA'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS evento_gestion_comercial (
    id_evento                    SERIAL PRIMARY KEY,
    id_empresa                   INTEGER NOT NULL,
    id_cliente                   INTEGER NOT NULL,
    id_servicio                  INTEGER,
    id_contrato                  INTEGER,
    id_factura                   INTEGER,
    tipo                         VARCHAR(40) NOT NULL,
    canal                        VARCHAR(20) NOT NULL,
    estado_gestion               VARCHAR(30) NOT NULL DEFAULT 'REGISTRADO'::character varying,
    fecha                        TIMESTAMPTZ NOT NULL,
    observacion                  TEXT,
    id_usuario_responsable       INTEGER NOT NULL,
    created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT evento_gestion_comercial_canal_check CHECK (((canal)::text = ANY ((ARRAY['TELEFONO'::character varying, 'EMAIL'::character varying, 'WHATSAPP'::character varying, 'PRESENCIAL'::character varying, 'OTRO'::character varying])::text[]))),
    CONSTRAINT evento_gestion_comercial_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['AVISO_PREVENTIVO'::character varying, 'ULTIMO_AVISO_CORTE'::character varying, 'AVISO_PREVIO_RETIRO'::character varying, 'CONTACTO_CLIENTE'::character varying, 'OTRO_EVENTO_COMERCIAL'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS factura (
    id_factura                   SERIAL PRIMARY KEY,
    id_contrato                  INTEGER,
    periodo_mes                  SMALLINT NOT NULL,
    periodo_anio                 SMALLINT NOT NULL,
    monto                        NUMERIC(10,2),
    fecha_emision                DATE,
    fecha_limite_pago            DATE NOT NULL,
    estado                       VARCHAR(20) NOT NULL,
    tipo_documento               VARCHAR(30),
    folio_externo                VARCHAR(80)
);

CREATE TABLE IF NOT EXISTS garantia_comercial (
    id_garantia                  SERIAL PRIMARY KEY,
    id_empresa                   INTEGER NOT NULL,
    id_cliente                   INTEGER NOT NULL,
    id_servicio                  INTEGER NOT NULL,
    id_contrato                  INTEGER NOT NULL,
    numero_serie_equipo          VARCHAR(80),
    tipo                         VARCHAR(60) NOT NULL,
    fecha_inicio                 DATE NOT NULL,
    fecha_termino                DATE NOT NULL,
    cobertura                    TEXT NOT NULL,
    monto                        NUMERIC(12,2),
    observaciones                TEXT,
    estado                       VARCHAR(20) NOT NULL DEFAULT 'ACTIVA'::character varying,
    id_usuario_responsable       INTEGER NOT NULL,
    created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS historial_cambio_plan (
    id_cambio_plan               SERIAL PRIMARY KEY,
    id_contrato                  INTEGER NOT NULL,
    id_cliente                   INTEGER,
    id_empresa                   INTEGER,
    id_plan_anterior             INTEGER,
    id_plan_nuevo                INTEGER NOT NULL,
    fecha_efectiva               DATE NOT NULL,
    motivo                       TEXT NOT NULL,
    observaciones                TEXT,
    precio_anterior              NUMERIC(10,2),
    precio_nuevo                 NUMERIC(10,2),
    id_usuario_registro          INTEGER,
    fecha_registro               TIMESTAMP DEFAULT now(),
    estado_cambio                VARCHAR(20) NOT NULL DEFAULT 'Aplicado'::character varying,
    fecha_aplicacion             TIMESTAMP
);

CREATE TABLE IF NOT EXISTS observacion_operativa (
    id_observacion               SERIAL PRIMARY KEY,
    tipo_entidad                 VARCHAR(40) NOT NULL,
    id_entidad                   INTEGER NOT NULL,
    id_cliente                   INTEGER,
    id_empresa                   INTEGER,
    id_usuario                   INTEGER,
    observacion                  TEXT NOT NULL,
    visibilidad                  VARCHAR(20) DEFAULT 'Interna'::character varying,
    fecha_creacion               TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pago (
    id_pago                      SERIAL PRIMARY KEY,
    id_factura                   INTEGER,
    id_cliente                   INTEGER,
    monto                        NUMERIC(10,2) NOT NULL,
    fecha_pago                   TIMESTAMP NOT NULL,
    codigo_transaccion           VARCHAR(100),
    codigo_autorizacion          VARCHAR(100),
    pasarela                     VARCHAR(30) NOT NULL,
    token_transaccional          VARCHAR(200),
    comprobante_pdf_url          TEXT,
    comprobante_estado           VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'::character varying,
    CONSTRAINT pago_comprobante_estado_check CHECK (((comprobante_estado)::text = ANY ((ARRAY['PENDIENTE'::character varying, 'GENERADO'::character varying, 'FALLIDO'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS plan (
    id_plan                      SERIAL PRIMARY KEY,
    id_empresa                   INTEGER,
    nombre_comercial             VARCHAR(100) NOT NULL,
    tipo_plan                    VARCHAR(40) NOT NULL,
    tipo_cliente                 VARCHAR(20) NOT NULL,
    velocidad_mbps               INTEGER,
    precio_mensual               NUMERIC(10,2) NOT NULL,
    descripcion                  TEXT,
    activo                       BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS plan_zona_precio (
    id_plan_zona_precio          SERIAL PRIMARY KEY,
    id_plan                      INTEGER NOT NULL,
    id_zona_pago                 INTEGER NOT NULL,
    precio_mensual               NUMERIC(10,2) NOT NULL,
    valor_instalacion            NUMERIC(10,2),
    activo                       BOOLEAN DEFAULT true,
    fecha_inicio                 DATE,
    fecha_fin                    DATE,
    CONSTRAINT plan_zona_precio_vigencia_check CHECK (((fecha_inicio IS NULL) OR (fecha_fin IS NULL) OR (fecha_inicio <= fecha_fin)))
);

CREATE TABLE IF NOT EXISTS prorroga_pago (
    id_prorroga                  SERIAL PRIMARY KEY,
    id_empresa                   INTEGER NOT NULL,
    id_cliente                   INTEGER NOT NULL,
    id_contrato                  INTEGER,
    id_factura                   INTEGER NOT NULL,
    fecha_original               DATE NOT NULL,
    nueva_fecha                  DATE NOT NULL,
    motivo                       TEXT NOT NULL,
    estado                       VARCHAR(20) NOT NULL DEFAULT 'APROBADA'::character varying,
    id_usuario_responsable       INTEGER NOT NULL,
    fecha_registro               TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT prorroga_pago_estado_check CHECK (((estado)::text = ANY ((ARRAY['PENDIENTE'::character varying, 'APROBADA'::character varying, 'CUMPLIDA'::character varying, 'VENCIDA'::character varying, 'CANCELADA'::character varying])::text[]))),
    CONSTRAINT prorroga_pago_fecha_check CHECK ((nueva_fecha > fecha_original))
);

CREATE TABLE IF NOT EXISTS prospecto (
    id_prospecto                 SERIAL PRIMARY KEY,
    id_empresa                   INTEGER,
    id_usuario_comercial         INTEGER,
    id_cliente                   INTEGER,
    rut                          VARCHAR(12),
    nombre_completo              VARCHAR(120),
    email                        VARCHAR(120),
    telefono                     VARCHAR(20),
    direccion                    VARCHAR(200),
    estado_pipeline              VARCHAR(30),
    motivo_perdida               VARCHAR(30),
    origen_contacto              VARCHAR(40),
    tiempo_conversion_dias       INTEGER,
    fecha_creacion               TIMESTAMP DEFAULT now(),
    fecha_conversion             DATE,
    observacion_perdida          TEXT,
    fecha_perdida                TIMESTAMP,
    id_usuario_perdida           INTEGER,
    comuna                       VARCHAR(80),
    region                       VARCHAR(80),
    latitud                      DOUBLE PRECISION,
    longitud                     DOUBLE PRECISION,
    id_zona_pago                 INTEGER,
    id_plan_interes              INTEGER,
    clasificacion_comercial      VARCHAR(40) DEFAULT 'PROSPECTO'::character varying,
    disponible_remarketing       BOOLEAN DEFAULT false,
    CONSTRAINT prospecto_latitud_check CHECK (((latitud IS NULL) OR ((latitud >= ('-90'::integer)::double precision) AND (latitud <= (90)::double precision)))),
    CONSTRAINT prospecto_longitud_check CHECK (((longitud IS NULL) OR ((longitud >= ('-180'::integer)::double precision) AND (longitud <= (180)::double precision))))
);

CREATE TABLE IF NOT EXISTS servicio_contratado (
    id_servicio                  SERIAL PRIMARY KEY,
    id_cliente                   INTEGER NOT NULL,
    id_empresa                   INTEGER,
    id_contrato                  INTEGER,
    id_direccion                 INTEGER,
    tipo_servicio                VARCHAR(40) NOT NULL,
    estado_operativo             VARCHAR(30) NOT NULL,
    observaciones                TEXT,
    datos_tecnicos               JSONB,
    fecha_creacion               TIMESTAMP DEFAULT now(),
    id_zona_pago                 INTEGER,
    fecha_activacion             TIMESTAMP
);

CREATE TABLE IF NOT EXISTS solicitud_cliente (
    id_solicitud                 SERIAL PRIMARY KEY,
    id_cliente                   INTEGER,
    id_prospecto                 INTEGER,
    id_servicio                  INTEGER,
    id_empresa                   INTEGER,
    tipo_solicitud               VARCHAR(60) NOT NULL,
    canal_origen                 VARCHAR(40),
    estado                       VARCHAR(30) NOT NULL,
    factible                     BOOLEAN,
    motivo_no_factible           TEXT,
    descripcion                  TEXT,
    observaciones                TEXT,
    id_usuario_registro          INTEGER,
    fecha_creacion               TIMESTAMP DEFAULT now(),
    fecha_cierre                 TIMESTAMP
);

CREATE TABLE IF NOT EXISTS solicitud_retiro_servicio (
    id_solicitud_retiro          SERIAL PRIMARY KEY,
    id_empresa                   INTEGER NOT NULL,
    id_cliente                   INTEGER NOT NULL,
    id_servicio                  INTEGER NOT NULL,
    id_contrato                  INTEGER,
    motivo                       TEXT NOT NULL,
    fecha_solicitada             DATE NOT NULL,
    estado                       VARCHAR(30) NOT NULL DEFAULT 'REGISTRADA'::character varying,
    estado_despacho_tecnico      VARCHAR(40) NOT NULL DEFAULT 'BLOQUEADO_CONTRATO_G3'::character varying,
    id_usuario_responsable       INTEGER NOT NULL,
    observaciones                TEXT,
    created_at                   TIMESTAMP NOT NULL DEFAULT now(),
    updated_at                   TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT solicitud_retiro_servicio_despacho_check CHECK (((estado_despacho_tecnico)::text = 'BLOQUEADO_CONTRATO_G3'::text)),
    CONSTRAINT solicitud_retiro_servicio_estado_check CHECK (((estado)::text = ANY ((ARRAY['REGISTRADA'::character varying, 'EN_GESTION'::character varying, 'CANCELADA'::character varying, 'CERRADA'::character varying])::text[]))),
    CONSTRAINT solicitud_retiro_servicio_motivo_check CHECK ((length(TRIM(BOTH FROM motivo)) > 0))
);

CREATE TABLE IF NOT EXISTS zona_pago (
    id_zona_pago                 SERIAL PRIMARY KEY,
    id_empresa                   INTEGER,
    nombre_zona                  VARCHAR(80) NOT NULL,
    comuna                       VARCHAR(80),
    descripcion                  TEXT,
    dia_vencimiento_sugerido     SMALLINT,
    activo                       BOOLEAN DEFAULT true,
    tipo_zona                    VARCHAR(30) DEFAULT 'COBERTURA_GENERAL'::character varying,
    id_zona_padre                INTEGER,
    poligono_geojson             JSONB,
    centro_lat                   DOUBLE PRECISION,
    centro_lng                   DOUBLE PRECISION,
    prioridad                    INTEGER NOT NULL DEFAULT 0,
    fuente_cobertura             VARCHAR(30) DEFAULT 'MANUAL'::character varying,
    fecha_inicio                 DATE,
    fecha_fin                    DATE,
    CONSTRAINT zona_pago_centro_lat_check CHECK (((centro_lat IS NULL) OR ((centro_lat >= ('-90'::integer)::double precision) AND (centro_lat <= (90)::double precision)))),
    CONSTRAINT zona_pago_centro_lng_check CHECK (((centro_lng IS NULL) OR ((centro_lng >= ('-180'::integer)::double precision) AND (centro_lng <= (180)::double precision)))),
    CONSTRAINT zona_pago_padre_distinto_check CHECK (((id_zona_padre IS NULL) OR (id_zona_padre <> id_zona_pago))),
    CONSTRAINT zona_pago_tipo_zona_check CHECK (((tipo_zona IS NULL) OR ((tipo_zona)::text = ANY ((ARRAY['COBERTURA_GENERAL'::character varying, 'MICROZONA_COMERCIAL'::character varying])::text[])))),
    CONSTRAINT zona_pago_vigencia_check CHECK (((fecha_inicio IS NULL) OR (fecha_fin IS NULL) OR (fecha_inicio <= fecha_fin)))
);


-- ============================================================================
-- SECCIÓN 4 · Red, operaciones y soporte (Ops / Grupo 8)
-- ============================================================================

CREATE TABLE IF NOT EXISTS alerta_monitoreo (
    id_alerta                    SERIAL PRIMARY KEY,
    id_empresa                   INTEGER NOT NULL,
    tipo                         VARCHAR(30) NOT NULL,
    severidad                    VARCHAR(15),
    mensaje                      TEXT,
    id_registro_ont              INTEGER,
    id_cliente                   INTEGER,
    clave_caja                   VARCHAR(120),
    id_caja_nap                  INTEGER,
    afectados                    INTEGER NOT NULL DEFAULT 1,
    id_ot_generada               INTEGER,
    resuelta                     BOOLEAN NOT NULL DEFAULT false,
    resuelta_por                 INTEGER,
    observacion_resolucion       TEXT,
    creada_en                    TIMESTAMP NOT NULL DEFAULT now(),
    resuelta_en                  TIMESTAMP
);

CREATE TABLE IF NOT EXISTS caja_nap (
    id_caja_nap                  SERIAL PRIMARY KEY,
    id_empresa                   INTEGER,
    id_mufa                      INTEGER,
    identificador_unico          VARCHAR(50),
    numero_poste                 VARCHAR(30),
    zona                         VARCHAR(80),
    capacidad_puertos            SMALLINT,
    latitud                      NUMERIC(9,6),
    longitud                     NUMERIC(9,6)
);

CREATE TABLE IF NOT EXISTS categoria_falla (
    id_categoria                 SERIAL PRIMARY KEY,
    nombre                       VARCHAR(80) NOT NULL,
    sla_horas                    SMALLINT
);

CREATE TABLE IF NOT EXISTS evidencia_foto (
    id_foto                      SERIAL PRIMARY KEY,
    id_ot                        INTEGER,
    url_cloudinary               TEXT NOT NULL,
    formato                      VARCHAR(5),
    tamano_kb                    INTEGER,
    fecha_subida                 TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS historial_conexion_ont (
    id_historial_ont             BIGSERIAL PRIMARY KEY,
    id_unidad                    INTEGER,
    evento                       VARCHAR(15),
    timestamp                    TIMESTAMP DEFAULT now(),
    id_registro_ont              INTEGER
);

CREATE TABLE IF NOT EXISTS historial_ot (
    id_historial_ot              BIGSERIAL PRIMARY KEY,
    id_ot                        INTEGER,
    id_usuario                   INTEGER,
    estado_anterior              VARCHAR(25),
    estado_nuevo                 VARCHAR(25),
    observaciones                TEXT,
    fecha_hora                   TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS llamada_cortes (
    id_llamada                   SERIAL PRIMARY KEY,
    id_ot                        INTEGER,
    resultado                    VARCHAR(15) NOT NULL,
    observaciones                TEXT,
    fecha_llamada                TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS monitoreo_ont (
    id_monitoreo                 BIGSERIAL PRIMARY KEY,
    id_unidad                    INTEGER,
    id_cliente                   INTEGER,
    id_caja_nap                  INTEGER,
    potencia_actual_dbm          NUMERIC(5,2),
    timestamp_medicion           TIMESTAMP DEFAULT now(),
    estado_conexion              VARCHAR(15),
    id_registro_ont              INTEGER
);

CREATE TABLE IF NOT EXISTS mufa (
    id_mufa                      SERIAL PRIMARY KEY,
    id_tarjeta_pon               INTEGER,
    identificador                VARCHAR(50),
    ubicacion                    VARCHAR(200)
);

CREATE TABLE IF NOT EXISTS olt (
    id_olt                       SERIAL PRIMARY KEY,
    id_empresa                   INTEGER,
    nombre                       VARCHAR(80),
    ubicacion                    VARCHAR(200),
    ip_gestion                   VARCHAR(45)
);

CREATE TABLE IF NOT EXISTS orden_trabajo (
    id_ot                        SERIAL PRIMARY KEY,
    id_empresa                   INTEGER,
    id_cliente                   INTEGER,
    id_tecnico                   INTEGER,
    id_tecnico_externo           INTEGER,
    id_direccion                 INTEGER,
    id_servicio                  INTEGER,
    id_ticket                    INTEGER,
    codigo_seguimiento           VARCHAR(32),
    tipo_ot                      VARCHAR(20) NOT NULL,
    prioridad                    VARCHAR(10) NOT NULL,
    estado                       VARCHAR(25) NOT NULL,
    fecha_creacion               TIMESTAMP DEFAULT now(),
    fecha_programada             TIMESTAMPTZ,
    fecha_completada             TIMESTAMP,
    potencia_optica_dbm          NUMERIC(5,2),
    observaciones                TEXT,
    resuelto_remotamente         BOOLEAN DEFAULT false,
    id_prospecto                 INTEGER,
    id_categoria_falla           INTEGER,
    id_caja_nap                  INTEGER,
    categoria_falla_otro         VARCHAR(120),
    obs_cliente_ausente          VARCHAR(500),
    alerta_detenida_descartada_en TIMESTAMP,
    alerta_detenida_descartada_por INTEGER,
    cierre_equipos               JSONB
);

CREATE TABLE IF NOT EXISTS puerto_nap (
    id_puerto                    SERIAL PRIMARY KEY,
    id_caja_nap                  INTEGER,
    numero_puerto                SMALLINT,
    estado                       VARCHAR(20),
    id_cliente_asociado          INTEGER
);

CREATE TABLE IF NOT EXISTS punto_cobertura (
    id_punto                     SERIAL PRIMARY KEY,
    id_empresa                   INTEGER,
    latitud                      NUMERIC(9,6) NOT NULL,
    longitud                     NUMERIC(9,6) NOT NULL,
    densidad_cobertura           NUMERIC(5,2),
    tipo_cobertura               VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS registro_ont (
    id_registro_ont              SERIAL PRIMARY KEY,
    id_empresa                   INTEGER,
    numero_serie                 VARCHAR(80) NOT NULL,
    id_externo                   VARCHAR(40),
    olt_externo                  VARCHAR(40),
    board                        SMALLINT,
    puerto_pon                   SMALLINT,
    zona                         VARCHAR(80),
    odb                          VARCHAR(50),
    modelo                       VARCHAR(80),
    nombre_cliente_ext           VARCHAR(160),
    direccion_cliente_ext        VARCHAR(200),
    id_unidad                    INTEGER,
    id_cliente                   INTEGER,
    id_caja_nap                  INTEGER,
    caja_confirmada_por          INTEGER,
    caja_confirmada_en           TIMESTAMP,
    primera_vez                  TIMESTAMP NOT NULL DEFAULT now(),
    ultima_vez                   TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS tarjeta_pon (
    id_tarjeta                   SERIAL PRIMARY KEY,
    id_olt                       INTEGER,
    numero_tarjeta               SMALLINT,
    total_puertos                SMALLINT
);

CREATE TABLE IF NOT EXISTS tecnico_externo (
    id_tecnico_ext               SERIAL PRIMARY KEY,
    nombre_completo              VARCHAR(120) NOT NULL,
    empresa                      VARCHAR(100),
    telefono                     VARCHAR(20),
    activo                       BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS ticket (
    id_ticket                    SERIAL PRIMARY KEY,
    id_cliente                   INTEGER,
    id_empresa                   INTEGER,
    id_servicio                  INTEGER,
    id_usuario_asignado          INTEGER,
    id_categoria                 INTEGER NOT NULL,
    id_conversacion_bot          INTEGER,
    codigo_seguimiento           VARCHAR(20),
    prioridad                    VARCHAR(10) NOT NULL,
    estado                       VARCHAR(20) NOT NULL,
    descripcion                  TEXT,
    fecha_creacion               TIMESTAMP DEFAULT now(),
    fecha_cierre                 TIMESTAMP,
    origen                       VARCHAR(20),
    resuelto_remotamente         BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS uso_material_ot (
    id_uso                       SERIAL PRIMARY KEY,
    id_ot                        INTEGER,
    id_tipo_equipo               INTEGER,
    id_unidad                    INTEGER,
    cantidad                     NUMERIC(10,2) NOT NULL
);


-- ============================================================================
-- SECCIÓN 5 · Portal de Clientes (Grupo 2)
-- ============================================================================

CREATE TABLE IF NOT EXISTS configuracion_seo (
    id_seo                       SERIAL PRIMARY KEY,
    id_empresa                   INTEGER NOT NULL,
    seccion_url                  VARCHAR(200) NOT NULL,
    meta_titulo                  VARCHAR(70),
    meta_descripcion             VARCHAR(160),
    og_tags                      JSONB,
    fecha_actualizacion          TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS consentimiento_cookies (
    id_consentimiento            BIGSERIAL PRIMARY KEY,
    id_cliente                   INTEGER,
    ip_anonimizada               VARCHAR(45),
    version_documento            VARCHAR(20),
    fecha_aceptacion             TIMESTAMP,
    acepto                       BOOLEAN NOT NULL
);

CREATE TABLE IF NOT EXISTS intento_fallido (
    id_intento                   BIGSERIAL PRIMARY KEY,
    id_empresa                   INTEGER,
    ip_address                   VARCHAR(45) NOT NULL,
    rut_intentado                VARCHAR(50),
    timestamp                    TIMESTAMP DEFAULT now(),
    bloqueado_hasta              TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lista_negra (
    id_vetado                    SERIAL PRIMARY KEY,
    id_cliente                   INTEGER,
    rut_vetado                   VARCHAR(12) NOT NULL,
    direccion_vetada             TEXT,
    motivo                       TEXT NOT NULL,
    fecha_registro               DATE DEFAULT now(),
    id_usuario_registro          INTEGER
);

CREATE TABLE IF NOT EXISTS sesion_portal (
    id_sesion                    BIGSERIAL PRIMARY KEY,
    id_cliente                   INTEGER,
    token                        TEXT NOT NULL,
    fecha_inicio                 TIMESTAMP,
    fecha_expiracion             TIMESTAMP,
    ip_origen                    VARCHAR(45)
);

CREATE TABLE IF NOT EXISTS solicitud_contrasena_wifi (
    id_solicitud                 SERIAL PRIMARY KEY,
    id_contrato                  INTEGER NOT NULL,
    id_cliente                   INTEGER NOT NULL,
    password_nueva_cifrada       TEXT,
    estado                       VARCHAR(20) NOT NULL,
    fecha_solicitud              TIMESTAMP DEFAULT now(),
    fecha_procesada              TIMESTAMP
);


-- ============================================================================
-- SECCIÓN 6 · Comunicaciones y notificaciones
-- ============================================================================

CREATE TABLE IF NOT EXISTS canal_whatsapp (
    id_canal                     SERIAL PRIMARY KEY,
    id_empresa                   INTEGER,
    numero_telefono              VARCHAR(20),
    nombre_canal                 VARCHAR(80),
    activo                       BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS conversacion_bot (
    id_conversacion              SERIAL PRIMARY KEY,
    id_cliente                   INTEGER,
    id_canal_wa                  INTEGER,
    plataforma                   VARCHAR(20),
    fecha_inicio                 TIMESTAMP DEFAULT now(),
    fecha_fin                    TIMESTAMP,
    derivada_humano              BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS log_notificacion (
    id_notificacion              BIGSERIAL PRIMARY KEY,
    id_cliente                   INTEGER,
    id_plantilla                 INTEGER,
    canal                        VARCHAR(20),
    fecha_envio                  TIMESTAMP,
    estado_envio                 VARCHAR(20),
    mensaje_enviado              TEXT,
    id_alerta                    INTEGER
);

CREATE TABLE IF NOT EXISTS mensaje_bot (
    id_mensaje                   BIGSERIAL PRIMARY KEY,
    id_conversacion              INTEGER,
    rol                          VARCHAR(15),
    contenido                    TEXT,
    timestamp                    TIMESTAMP DEFAULT now(),
    datos_sensibles              BOOLEAN
);

CREATE TABLE IF NOT EXISTS mensaje_whatsapp (
    id_mensaje_wa                BIGSERIAL PRIMARY KEY,
    id_canal                     INTEGER,
    id_cliente                   INTEGER,
    id_plantilla_wa              INTEGER,
    contenido                    TEXT,
    timestamp                    TIMESTAMP DEFAULT now(),
    origen                       VARCHAR(10),
    estado                       VARCHAR(15)
);

CREATE TABLE IF NOT EXISTS plantilla_notificacion (
    id_plantilla                 SERIAL PRIMARY KEY,
    tipo_evento                  VARCHAR(60),
    canal                        VARCHAR(20) NOT NULL,
    contenido_texto              TEXT,
    activa                       BOOLEAN DEFAULT true,
    id_empresa                   INTEGER,
    tiempo_estimado_reparacion   VARCHAR(60)
);

CREATE TABLE IF NOT EXISTS plantilla_whatsapp (
    id_plantilla_wa              SERIAL PRIMARY KEY,
    id_canal                     INTEGER,
    nombre_plantilla             VARCHAR(80),
    contenido                    TEXT,
    tipo_uso                     VARCHAR(40)
);


-- ============================================================================
-- SECCIÓN 7 · Integraciones entre grupos
-- ============================================================================

CREATE TABLE IF NOT EXISTS integracion_activacion (
    id_activacion                SERIAL PRIMARY KEY,
    event_id                     VARCHAR(100),
    trace_id                     VARCHAR(100),
    id_empresa                   INTEGER NOT NULL,
    id_ot                        INTEGER,
    id_cliente_externo           INTEGER,
    rut_cliente                  VARCHAR(20),
    id_servicio_externo          INTEGER,
    id_contrato_externo          INTEGER,
    payload                      JSONB,
    estado_proceso               VARCHAR(40) NOT NULL,
    equipos_asociados            JSONB,
    discrepancias                JSONB,
    fecha_proceso                TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integracion_activacion_g1 (
    id_integracion               SERIAL PRIMARY KEY,
    id_empresa                   INTEGER NOT NULL,
    id_cliente                   INTEGER NOT NULL,
    id_servicio                  INTEGER NOT NULL,
    id_contrato                  INTEGER NOT NULL,
    id_ot_g3                     VARCHAR(100) NOT NULL,
    numero_serie                 VARCHAR(80),
    event_id                     VARCHAR(120) NOT NULL,
    trace_id                     VARCHAR(120) NOT NULL,
    estado_integracion           VARCHAR(50) NOT NULL DEFAULT 'PENDIENTE_ENVIO'::character varying,
    intentos                     INTEGER NOT NULL DEFAULT 0,
    ultimo_intento               TIMESTAMP,
    ultimo_error_sanitizado      VARCHAR(500),
    payload_hash                 VARCHAR(64) NOT NULL,
    payload_snapshot             JSONB,
    respuesta_estado_g1          JSONB,
    fecha_completado             TIMESTAMP,
    created_at                   TIMESTAMP NOT NULL DEFAULT now(),
    updated_at                   TIMESTAMP NOT NULL DEFAULT now(),
    numeros_serie                TEXT[] NOT NULL DEFAULT ARRAY[]::text[]
);

CREATE TABLE IF NOT EXISTS integracion_cierre (
    id_cierre                    SERIAL PRIMARY KEY,
    clave_idempotencia           VARCHAR(120) NOT NULL,
    id_ot                        INTEGER NOT NULL,
    id_empresa                   INTEGER NOT NULL,
    tipo_ot                      VARCHAR(30),
    payload                      JSONB NOT NULL,
    estado_proceso               VARCHAR(40) NOT NULL DEFAULT 'PROCESADO',
    discrepancias                JSONB,
    acciones_aplicadas           JSONB,
    fecha_proceso                TIMESTAMPTZ DEFAULT now(),
    srv                          VARCHAR(20),
    id_tecnico                   INTEGER,
    materiales_aplicados         JSONB
);

CREATE TABLE IF NOT EXISTS integracion_resultado_wifi_g2 (
    id_resultado                 BIGSERIAL PRIMARY KEY,
    request_id                   VARCHAR(100) NOT NULL,
    trace_id                     VARCHAR(100),
    id_empresa                   INTEGER NOT NULL,
    id_ticket                    INTEGER NOT NULL,
    payload_hash                 VARCHAR(64) NOT NULL,
    exito                        BOOLEAN NOT NULL,
    resultado_tecnico            TEXT NOT NULL,
    estado_ticket_resultante     VARCHAR(20) NOT NULL,
    fecha_recepcion              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT integracion_resultado_wifi_g2_estado_check CHECK (((estado_ticket_resultante)::text = ANY ((ARRAY['Resuelto'::character varying, 'Escalado'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS integracion_evento_entrante (
    id_evento                    SERIAL PRIMARY KEY,
    id_integracion               INTEGER NOT NULL,
    source                       VARCHAR(30) NOT NULL,
    event_type                   VARCHAR(50) NOT NULL,
    external_reference           VARCHAR(120) NOT NULL,
    payload_hash                 VARCHAR(64) NOT NULL,
    processed_at                 TIMESTAMP NOT NULL DEFAULT now(),
    result                       JSONB
);

CREATE TABLE IF NOT EXISTS integracion_instalacion_g3 (
    id_integracion               SERIAL PRIMARY KEY,
    id_empresa                   INTEGER NOT NULL,
    id_prospecto                 INTEGER,
    id_cliente                   INTEGER,
    id_contrato                  INTEGER NOT NULL,
    id_plan                      INTEGER NOT NULL,
    id_servicio                  INTEGER,
    request_id                   UUID NOT NULL,
    trace_id                     UUID NOT NULL,
    id_ot_g3                     VARCHAR(100),
    codigo_ot_g3                 VARCHAR(100),
    estado_integracion           VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE_ENVIO'::character varying,
    estado_ot_g3                 VARCHAR(50),
    estado_original_g3           VARCHAR(100),
    fecha_solicitud              TIMESTAMP NOT NULL DEFAULT now(),
    ultimo_intento               TIMESTAMP,
    fecha_ultima_sincronizacion  TIMESTAMP,
    intentos                     INTEGER NOT NULL DEFAULT 0,
    ultimo_error_sanitizado      TEXT,
    payload_hash                 VARCHAR(64) NOT NULL,
    payload_snapshot             JSONB NOT NULL,
    fecha_cierre_procesado       TIMESTAMP,
    created_at                   TIMESTAMP NOT NULL DEFAULT now(),
    updated_at                   TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT integracion_instalacion_g3_estado_check CHECK (((estado_integracion)::text = ANY ((ARRAY['PENDIENTE_ENVIO'::character varying, 'ENVIADA'::character varying, 'EN_SEGUIMIENTO'::character varying, 'COMPLETADA'::character varying, 'FALLIDA_REINTENTABLE'::character varying, 'FALLIDA_DEFINITIVA'::character varying])::text[]))),
    CONSTRAINT integracion_instalacion_g3_intentos_check CHECK ((intentos >= 0))
);

CREATE TABLE IF NOT EXISTS solicitud_instalacion_integracion (
    id_solicitud                 SERIAL PRIMARY KEY,
    request_id                   VARCHAR(100) NOT NULL,
    trace_id                     VARCHAR(100) NOT NULL,
    hash_payload                 VARCHAR(64) NOT NULL,
    id_empresa                   INTEGER NOT NULL,
    id_prospecto_externo         INTEGER NOT NULL,
    id_contrato_externo          INTEGER NOT NULL,
    id_plan_externo              INTEGER,
    rut                          VARCHAR(12) NOT NULL,
    nombre_completo              VARCHAR(120) NOT NULL,
    telefono                     VARCHAR(21) NOT NULL,
    direccion_completa           VARCHAR(200) NOT NULL,
    comuna                       VARCHAR(80) NOT NULL,
    ciudad                       VARCHAR(80),
    observaciones                TEXT,
    requisitos_equipamiento      JSONB,
    id_ot                        INTEGER,
    estado                       VARCHAR(30) NOT NULL,
    fecha_creacion               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================================
-- ÍNDICES Y RESTRICCIONES DE UNICIDAD
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS ux_asignacion_evento_unidad ON asignacion_equipo_servicio (event_id, id_unidad);
CREATE UNIQUE INDEX IF NOT EXISTS caja_nap_identificador_unico_key ON caja_nap (identificador_unico);
CREATE UNIQUE INDEX IF NOT EXISTS canal_whatsapp_numero_telefono_key ON canal_whatsapp (numero_telefono);
CREATE UNIQUE INDEX IF NOT EXISTS cliente_rut_key ON cliente (rut);
CREATE UNIQUE INDEX IF NOT EXISTS configuracion_seo_id_empresa_seccion_url_key ON configuracion_seo (id_empresa, seccion_url);
CREATE UNIQUE INDEX IF NOT EXISTS uq_contrato_digital_version ON contrato_digital (id_contrato, version);
CREATE UNIQUE INDEX IF NOT EXISTS credenciales_tvip_id_contrato_key ON credenciales_tvip (id_contrato);
CREATE UNIQUE INDEX IF NOT EXISTS cuota_convenio_pago_id_convenio_numero_key ON cuota_convenio_pago (id_convenio, numero);
CREATE UNIQUE INDEX IF NOT EXISTS documento_tributario_externo_identidad_key ON documento_tributario_externo (id_empresa, tipo_documento, emisor_normalizado, folio_normalizado);
CREATE UNIQUE INDEX IF NOT EXISTS empresa_rut_empresa_key ON empresa (rut_empresa);
CREATE UNIQUE INDEX IF NOT EXISTS garantia_comercial_activa_periodo_key ON garantia_comercial (id_servicio, tipo, fecha_inicio, fecha_termino) WHERE ((estado)::text = 'ACTIVA'::text);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cambio_plan_pendiente ON historial_cambio_plan (id_contrato) WHERE ((estado_cambio)::text = 'Pendiente'::text);
CREATE UNIQUE INDEX IF NOT EXISTS integracion_activacion_event_id_key ON integracion_activacion (event_id);
CREATE UNIQUE INDEX IF NOT EXISTS integracion_activacion_g1_event_id_key ON integracion_activacion_g1 (event_id);
CREATE UNIQUE INDEX IF NOT EXISTS integracion_cierre_clave_idempotencia_key ON integracion_cierre (clave_idempotencia);
CREATE UNIQUE INDEX IF NOT EXISTS integracion_evento_entrante_id_integracion_event_type_key ON integracion_evento_entrante (id_integracion, event_type);
CREATE UNIQUE INDEX IF NOT EXISTS integracion_instalacion_g3_request_id_key ON integracion_instalacion_g3 (request_id);
CREATE UNIQUE INDEX IF NOT EXISTS solicitud_instalacion_integracion_request_id_key ON solicitud_instalacion_integracion (request_id);
CREATE UNIQUE INDEX IF NOT EXISTS solicitud_instalacion_integracion_id_ot_key ON solicitud_instalacion_integracion (id_ot);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventario_tecnico_tipo ON inventario_personal_tecnico (id_tecnico, id_tipo_equipo);
CREATE UNIQUE INDEX IF NOT EXISTS llamada_cortes_id_ot_key ON llamada_cortes (id_ot);
CREATE UNIQUE INDEX IF NOT EXISTS orden_ingreso_correlativo_key ON orden_ingreso (correlativo);
CREATE UNIQUE INDEX IF NOT EXISTS orden_trabajo_codigo_seguimiento_key ON orden_trabajo (codigo_seguimiento);
CREATE UNIQUE INDEX IF NOT EXISTS orden_trabajo_id_ticket_key ON orden_trabajo (id_ticket);
CREATE UNIQUE INDEX IF NOT EXISTS pago_codigo_transaccion_key ON pago (codigo_transaccion);
CREATE UNIQUE INDEX IF NOT EXISTS categoria_falla_nombre_key ON categoria_falla (nombre);
CREATE UNIQUE INDEX IF NOT EXISTS integracion_resultado_wifi_g2_request_id_key ON integracion_resultado_wifi_g2 (request_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_zona_precio_activo ON plan_zona_precio (id_plan, id_zona_pago) WHERE (activo = true);
CREATE UNIQUE INDEX IF NOT EXISTS prestamo_externo_correlativo_key ON prestamo_externo (correlativo);
CREATE UNIQUE INDEX IF NOT EXISTS proveedor_rut_key ON proveedor (rut);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pte ON proveedor_tipo_equipo (id_proveedor, id_tipo_equipo);
CREATE UNIQUE INDEX IF NOT EXISTS registro_ont_numero_serie_key ON registro_ont (numero_serie);
CREATE UNIQUE INDEX IF NOT EXISTS rol_nombre_rol_key ON rol (nombre_rol);
CREATE UNIQUE INDEX IF NOT EXISTS ticket_codigo_seguimiento_key ON ticket (codigo_seguimiento);
CREATE UNIQUE INDEX IF NOT EXISTS ticket_id_conversacion_bot_key ON ticket (id_conversacion_bot);
CREATE UNIQUE INDEX IF NOT EXISTS unidad_equipo_mac_address_key ON unidad_equipo (mac_address);
CREATE UNIQUE INDEX IF NOT EXISTS unidad_equipo_numero_serie_key ON unidad_equipo (numero_serie);
CREATE UNIQUE INDEX IF NOT EXISTS usuario_email_key ON usuario (email);
CREATE UNIQUE INDEX IF NOT EXISTS usuario_nombre_usuario_key ON usuario (nombre_usuario);
CREATE UNIQUE INDEX IF NOT EXISTS usuario_rol_id_usuario_id_rol_key ON usuario_rol (id_usuario, id_rol);
CREATE UNIQUE INDEX IF NOT EXISTS uq_zona_pago_empresa_nombre ON zona_pago (COALESCE(id_empresa, 0), lower((nombre_zona)::text));
CREATE INDEX IF NOT EXISTS alerta_monitoreo_id_empresa_resuelta_idx ON alerta_monitoreo (id_empresa, resuelta);
CREATE INDEX IF NOT EXISTS alerta_monitoreo_tipo_clave_caja_resuelta_idx ON alerta_monitoreo (tipo, clave_caja, resuelta);
CREATE INDEX IF NOT EXISTS ix_asignacion_empresa_servicio_activa ON asignacion_equipo_servicio (id_empresa, id_servicio_externo, activa);
CREATE INDEX IF NOT EXISTS cambio_condicion_pago_id_cliente_fecha_registro_idx ON cambio_condicion_pago (id_cliente, fecha_registro);
CREATE INDEX IF NOT EXISTS cambio_condicion_pago_id_empresa_tipo_cambio_fecha_registro_idx ON cambio_condicion_pago (id_empresa, tipo_cambio, fecha_registro);
CREATE INDEX IF NOT EXISTS cargo_adicional_id_cliente_fecha_registro_idx ON cargo_adicional (id_cliente, fecha_registro);
CREATE INDEX IF NOT EXISTS cargo_adicional_id_empresa_estado_fecha_idx ON cargo_adicional (id_empresa, estado, fecha);
CREATE INDEX IF NOT EXISTS cliente_id_empresa_fecha_creacion_idx ON cliente (id_empresa, fecha_creacion);
CREATE INDEX IF NOT EXISTS idx_contrato_estado_cliente ON contrato (id_cliente, estado);
CREATE INDEX IF NOT EXISTS idx_contrato_id_prospecto ON contrato (id_prospecto);
CREATE INDEX IF NOT EXISTS convenio_pago_id_cliente_estado_idx ON convenio_pago (id_cliente, estado);
CREATE INDEX IF NOT EXISTS convenio_pago_id_empresa_estado_fecha_inicio_idx ON convenio_pago (id_empresa, estado, fecha_inicio);
CREATE INDEX IF NOT EXISTS convenio_pago_id_factura_idx ON convenio_pago (id_factura);
CREATE INDEX IF NOT EXISTS cuota_convenio_pago_fecha_vencimiento_estado_idx ON cuota_convenio_pago (fecha_vencimiento, estado);
CREATE INDEX IF NOT EXISTS direccion_servicio_id_cliente_idx ON direccion_servicio (id_cliente);
CREATE INDEX IF NOT EXISTS documento_tributario_externo_cargo_idx ON documento_tributario_externo (id_cargo_adicional);
CREATE INDEX IF NOT EXISTS documento_tributario_externo_cliente_fecha_idx ON documento_tributario_externo (id_cliente, fecha_emision);
CREATE INDEX IF NOT EXISTS documento_tributario_externo_contrato_idx ON documento_tributario_externo (id_contrato);
CREATE INDEX IF NOT EXISTS documento_tributario_externo_empresa_estado_idx ON documento_tributario_externo (id_empresa, estado);
CREATE INDEX IF NOT EXISTS documento_tributario_externo_empresa_fecha_idx ON documento_tributario_externo (id_empresa, fecha_emision);
CREATE INDEX IF NOT EXISTS documento_tributario_externo_factura_idx ON documento_tributario_externo (id_factura);
CREATE INDEX IF NOT EXISTS evento_gestion_comercial_id_cliente_fecha_idx ON evento_gestion_comercial (id_cliente, fecha);
CREATE INDEX IF NOT EXISTS evento_gestion_comercial_id_empresa_tipo_fecha_idx ON evento_gestion_comercial (id_empresa, tipo, fecha);
CREATE INDEX IF NOT EXISTS evento_gestion_comercial_id_factura_idx ON evento_gestion_comercial (id_factura);
CREATE INDEX IF NOT EXISTS factura_folio_externo_idx ON factura (folio_externo);
CREATE INDEX IF NOT EXISTS garantia_comercial_cliente_fecha_idx ON garantia_comercial (id_cliente, fecha_inicio);
CREATE INDEX IF NOT EXISTS garantia_comercial_empresa_estado_fecha_idx ON garantia_comercial (id_empresa, estado, fecha_termino);
CREATE INDEX IF NOT EXISTS garantia_comercial_servicio_estado_idx ON garantia_comercial (id_servicio, estado);
CREATE INDEX IF NOT EXISTS idx_cambio_plan_ejecucion ON historial_cambio_plan (estado_cambio, fecha_efectiva);
CREATE INDEX IF NOT EXISTS idx_historial_cambio_plan_contrato ON historial_cambio_plan (id_contrato);
CREATE INDEX IF NOT EXISTS historial_ot_id_ot_fecha_hora_idx ON historial_ot (id_ot, fecha_hora);
CREATE INDEX IF NOT EXISTS integracion_activacion_g1_empresa_estado_created_idx ON integracion_activacion_g1 (id_empresa, estado_integracion, created_at);
CREATE INDEX IF NOT EXISTS integracion_activacion_g1_servicio_created_idx ON integracion_activacion_g1 (id_servicio, created_at);
CREATE INDEX IF NOT EXISTS integracion_evento_entrante_external_reference_payload_hash_idx ON integracion_evento_entrante (external_reference, payload_hash);
CREATE INDEX IF NOT EXISTS integracion_instalacion_g3_id_contrato_fecha_solicitud_idx ON integracion_instalacion_g3 (id_contrato, fecha_solicitud);
CREATE INDEX IF NOT EXISTS integracion_instalacion_g3_id_empresa_codigo_ot_g3_idx ON integracion_instalacion_g3 (id_empresa, codigo_ot_g3);
CREATE INDEX IF NOT EXISTS integracion_instalacion_g3_id_empresa_estado_integracion_fecha_ ON integracion_instalacion_g3 (id_empresa, estado_integracion, fecha_solicitud);
CREATE INDEX IF NOT EXISTS integracion_instalacion_g3_id_empresa_id_ot_g3_idx ON integracion_instalacion_g3 (id_empresa, id_ot_g3);
CREATE INDEX IF NOT EXISTS integracion_resultado_wifi_g2_empresa_fecha_idx ON integracion_resultado_wifi_g2 (id_empresa, fecha_recepcion);
CREATE INDEX IF NOT EXISTS integracion_resultado_wifi_g2_ticket_fecha_idx ON integracion_resultado_wifi_g2 (id_ticket, fecha_recepcion);
CREATE INDEX IF NOT EXISTS solicitud_instalacion_integracion_id_empresa_idx ON solicitud_instalacion_integracion (id_empresa);
CREATE INDEX IF NOT EXISTS intento_fallido_rut_intentado_bloqueado_hasta_idx ON intento_fallido (rut_intentado, bloqueado_hasta);
CREATE INDEX IF NOT EXISTS log_notificacion_id_alerta_idx ON log_notificacion (id_alerta);
CREATE INDEX IF NOT EXISTS log_notificacion_id_cliente_idx ON log_notificacion (id_cliente);
CREATE INDEX IF NOT EXISTS monitoreo_ont_id_registro_ont_timestamp_medicion_idx ON monitoreo_ont (id_registro_ont, timestamp_medicion);
CREATE INDEX IF NOT EXISTS idx_observacion_operativa_entidad ON observacion_operativa (tipo_entidad, id_entidad);
CREATE INDEX IF NOT EXISTS orden_trabajo_id_caja_nap_idx ON orden_trabajo (id_caja_nap);
CREATE INDEX IF NOT EXISTS orden_trabajo_id_cliente_idx ON orden_trabajo (id_cliente);
CREATE INDEX IF NOT EXISTS orden_trabajo_id_empresa_estado_idx ON orden_trabajo (id_empresa, estado);
CREATE INDEX IF NOT EXISTS orden_trabajo_id_empresa_fecha_creacion_idx ON orden_trabajo (id_empresa, fecha_creacion);
CREATE INDEX IF NOT EXISTS orden_trabajo_id_empresa_tipo_ot_idx ON orden_trabajo (id_empresa, tipo_ot);
CREATE INDEX IF NOT EXISTS idx_orden_trabajo_id_prospecto ON orden_trabajo (id_prospecto);
CREATE INDEX IF NOT EXISTS orden_trabajo_id_tecnico_estado_idx ON orden_trabajo (id_tecnico, estado);
CREATE INDEX IF NOT EXISTS plan_id_empresa_idx ON plan (id_empresa);
CREATE INDEX IF NOT EXISTS plan_zona_precio_id_plan_id_zona_pago_idx ON plan_zona_precio (id_plan, id_zona_pago);
CREATE INDEX IF NOT EXISTS plan_zona_precio_id_zona_pago_activo_fechas_idx ON plan_zona_precio (id_zona_pago, activo, fecha_inicio, fecha_fin);
CREATE INDEX IF NOT EXISTS plantilla_notificacion_id_empresa_idx ON plantilla_notificacion (id_empresa);
CREATE INDEX IF NOT EXISTS prorroga_pago_id_empresa_estado_nueva_fecha_idx ON prorroga_pago (id_empresa, estado, nueva_fecha);
CREATE INDEX IF NOT EXISTS prorroga_pago_id_factura_fecha_registro_idx ON prorroga_pago (id_factura, fecha_registro);
CREATE INDEX IF NOT EXISTS prospecto_id_empresa_clasificacion_comercial_idx ON prospecto (id_empresa, clasificacion_comercial);
CREATE INDEX IF NOT EXISTS prospecto_id_empresa_id_zona_pago_idx ON prospecto (id_empresa, id_zona_pago);
CREATE INDEX IF NOT EXISTS prospecto_id_empresa_id_plan_interes_idx ON prospecto (id_empresa, id_plan_interes);
CREATE INDEX IF NOT EXISTS registro_ont_id_empresa_idx ON registro_ont (id_empresa);
CREATE INDEX IF NOT EXISTS idx_solicitud_cliente_cliente ON solicitud_cliente (id_cliente);
CREATE INDEX IF NOT EXISTS idx_solicitud_cliente_servicio ON solicitud_cliente (id_servicio);
CREATE INDEX IF NOT EXISTS solicitud_retiro_empresa_estado_fecha_idx ON solicitud_retiro_servicio (id_empresa, estado, fecha_solicitada);
CREATE INDEX IF NOT EXISTS solicitud_retiro_servicio_id_servicio_created_at_idx ON solicitud_retiro_servicio (id_servicio, created_at);
CREATE INDEX IF NOT EXISTS stock_consumible_id_tipo_equipo_idx ON stock_consumible (id_tipo_equipo);
CREATE INDEX IF NOT EXISTS tipo_equipo_id_empresa_idx ON tipo_equipo (id_empresa);
CREATE INDEX IF NOT EXISTS usuario_id_empresa_idx ON usuario (id_empresa);
CREATE INDEX IF NOT EXISTS zona_pago_fecha_inicio_fecha_fin_idx ON zona_pago (fecha_inicio, fecha_fin);
CREATE INDEX IF NOT EXISTS zona_pago_id_empresa_tipo_zona_activo_idx ON zona_pago (id_empresa, tipo_zona, activo);
CREATE INDEX IF NOT EXISTS zona_pago_id_zona_padre_idx ON zona_pago (id_zona_padre);

-- ============================================================================
-- CLAVES FORÁNEAS
-- (idempotentes: si la restricción ya existe, el bloque no falla)
-- ============================================================================

DO $$ BEGIN
    ALTER TABLE alerta_monitoreo ADD CONSTRAINT alerta_monitoreo_id_caja_nap_fkey
        FOREIGN KEY (id_caja_nap) REFERENCES caja_nap (id_caja_nap) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE alerta_monitoreo ADD CONSTRAINT alerta_monitoreo_id_cliente_fkey
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE alerta_monitoreo ADD CONSTRAINT alerta_monitoreo_id_empresa_fkey
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE alerta_monitoreo ADD CONSTRAINT alerta_monitoreo_id_ot_generada_fkey
        FOREIGN KEY (id_ot_generada) REFERENCES orden_trabajo (id_ot) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE alerta_monitoreo ADD CONSTRAINT alerta_monitoreo_id_registro_ont_fkey
        FOREIGN KEY (id_registro_ont) REFERENCES registro_ont (id_registro_ont) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE alerta_monitoreo ADD CONSTRAINT alerta_monitoreo_resuelta_por_fkey
        FOREIGN KEY (resuelta_por) REFERENCES usuario (id_usuario) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE asignacion_equipo_servicio ADD CONSTRAINT fk_asignacion_unidad
        FOREIGN KEY (id_unidad) REFERENCES unidad_equipo (id_unidad);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE baja_equipo ADD CONSTRAINT fk_baja_equipo_id_unidad
        FOREIGN KEY (id_unidad) REFERENCES unidad_equipo (id_unidad);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE baja_equipo ADD CONSTRAINT fk_baja_equipo_id_usuario
        FOREIGN KEY (id_usuario) REFERENCES usuario (id_usuario);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE bodega ADD CONSTRAINT fk_bodega_id_empresa
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE caja_nap ADD CONSTRAINT fk_caja_nap_id_empresa
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE caja_nap ADD CONSTRAINT fk_caja_nap_id_mufa
        FOREIGN KEY (id_mufa) REFERENCES mufa (id_mufa);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE cambio_condicion_pago ADD CONSTRAINT cambio_condicion_pago_id_cliente_fkey
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE cambio_condicion_pago ADD CONSTRAINT cambio_condicion_pago_id_contrato_fkey
        FOREIGN KEY (id_contrato) REFERENCES contrato (id_contrato) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE cambio_condicion_pago ADD CONSTRAINT cambio_condicion_pago_id_empresa_fkey
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE cambio_condicion_pago ADD CONSTRAINT cambio_condicion_pago_id_factura_fkey
        FOREIGN KEY (id_factura) REFERENCES factura (id_factura) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE cambio_condicion_pago ADD CONSTRAINT cambio_condicion_pago_id_usuario_responsable_fkey
        FOREIGN KEY (id_usuario_responsable) REFERENCES usuario (id_usuario) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE canal_whatsapp ADD CONSTRAINT fk_canal_whatsapp_id_empresa
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE cargo_adicional ADD CONSTRAINT cargo_adicional_id_cliente_fkey
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE cargo_adicional ADD CONSTRAINT cargo_adicional_id_contrato_fkey
        FOREIGN KEY (id_contrato) REFERENCES contrato (id_contrato) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE cargo_adicional ADD CONSTRAINT cargo_adicional_id_empresa_fkey
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE cargo_adicional ADD CONSTRAINT cargo_adicional_id_servicio_fkey
        FOREIGN KEY (id_servicio) REFERENCES servicio_contratado (id_servicio) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE cargo_adicional ADD CONSTRAINT cargo_adicional_id_usuario_responsable_fkey
        FOREIGN KEY (id_usuario_responsable) REFERENCES usuario (id_usuario) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE cliente ADD CONSTRAINT fk_cliente_id_empresa
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE configuracion_seo ADD CONSTRAINT fk_configuracion_seo_id_empresa
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE consentimiento_cookies ADD CONSTRAINT fk_consentimiento_cookies_id_cliente
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE contrato ADD CONSTRAINT fk_contrato_id_cliente
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE contrato ADD CONSTRAINT fk_contrato_id_empresa
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE contrato ADD CONSTRAINT fk_contrato_id_plan
        FOREIGN KEY (id_plan) REFERENCES plan (id_plan);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE contrato ADD CONSTRAINT fk_contrato_id_prospecto
        FOREIGN KEY (id_prospecto) REFERENCES prospecto (id_prospecto);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE contrato ADD CONSTRAINT fk_contrato_id_zona_pago
        FOREIGN KEY (id_zona_pago) REFERENCES zona_pago (id_zona_pago);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE contrato_digital ADD CONSTRAINT fk_contrato_digital_id_cliente
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE contrato_digital ADD CONSTRAINT fk_contrato_digital_id_contrato
        FOREIGN KEY (id_contrato) REFERENCES contrato (id_contrato);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE contrato_digital ADD CONSTRAINT fk_contrato_digital_id_usuario_generador
        FOREIGN KEY (id_usuario_generador) REFERENCES usuario (id_usuario);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE convenio_pago ADD CONSTRAINT convenio_pago_id_cliente_fkey
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE convenio_pago ADD CONSTRAINT convenio_pago_id_contrato_fkey
        FOREIGN KEY (id_contrato) REFERENCES contrato (id_contrato) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE convenio_pago ADD CONSTRAINT convenio_pago_id_empresa_fkey
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE convenio_pago ADD CONSTRAINT convenio_pago_id_factura_fkey
        FOREIGN KEY (id_factura) REFERENCES factura (id_factura) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE convenio_pago ADD CONSTRAINT convenio_pago_id_servicio_fkey
        FOREIGN KEY (id_servicio) REFERENCES servicio_contratado (id_servicio) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE convenio_pago ADD CONSTRAINT convenio_pago_id_usuario_aprobador_fkey
        FOREIGN KEY (id_usuario_aprobador) REFERENCES usuario (id_usuario) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE convenio_pago ADD CONSTRAINT convenio_pago_id_usuario_responsable_fkey
        FOREIGN KEY (id_usuario_responsable) REFERENCES usuario (id_usuario) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE conversacion_bot ADD CONSTRAINT fk_conversacion_bot_id_canal_wa
        FOREIGN KEY (id_canal_wa) REFERENCES canal_whatsapp (id_canal);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE conversacion_bot ADD CONSTRAINT fk_conversacion_bot_id_cliente
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE cotizacion ADD CONSTRAINT fk_cotizacion_id_plan
        FOREIGN KEY (id_plan) REFERENCES plan (id_plan);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE cotizacion ADD CONSTRAINT fk_cotizacion_id_prospecto
        FOREIGN KEY (id_prospecto) REFERENCES prospecto (id_prospecto);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE credenciales_tvip ADD CONSTRAINT fk_credenciales_tvip_id_contrato
        FOREIGN KEY (id_contrato) REFERENCES contrato (id_contrato);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE cuota_convenio_pago ADD CONSTRAINT cuota_convenio_pago_id_convenio_fkey
        FOREIGN KEY (id_convenio) REFERENCES convenio_pago (id_convenio) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE detalle_orden_ingreso ADD CONSTRAINT fk_detalle_orden_ingreso_id_orden
        FOREIGN KEY (id_orden) REFERENCES orden_ingreso (id_orden);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE detalle_orden_ingreso ADD CONSTRAINT fk_detalle_orden_ingreso_id_tipo_equipo
        FOREIGN KEY (id_tipo_equipo) REFERENCES tipo_equipo (id_tipo_equipo);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE direccion_servicio ADD CONSTRAINT fk_direccion_servicio_id_cliente
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE documento_tributario_externo ADD CONSTRAINT documento_tributario_externo_cargo_fkey
        FOREIGN KEY (id_cargo_adicional) REFERENCES cargo_adicional (id_cargo) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE documento_tributario_externo ADD CONSTRAINT documento_tributario_externo_cliente_fkey
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE documento_tributario_externo ADD CONSTRAINT documento_tributario_externo_contrato_fkey
        FOREIGN KEY (id_contrato) REFERENCES contrato (id_contrato) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE documento_tributario_externo ADD CONSTRAINT documento_tributario_externo_empresa_fkey
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE documento_tributario_externo ADD CONSTRAINT documento_tributario_externo_factura_fkey
        FOREIGN KEY (id_factura) REFERENCES factura (id_factura) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE documento_tributario_externo ADD CONSTRAINT documento_tributario_externo_usuario_fkey
        FOREIGN KEY (id_usuario_registro) REFERENCES usuario (id_usuario) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE donacion_detalle ADD CONSTRAINT fk_donacion_detalle_donacion
        FOREIGN KEY (id_donacion) REFERENCES donacion (id_donacion);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE donacion_detalle ADD CONSTRAINT fk_donacion_detalle_unidad
        FOREIGN KEY (id_unidad) REFERENCES unidad_equipo (id_unidad);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE evento_gestion_comercial ADD CONSTRAINT evento_gestion_comercial_id_cliente_fkey
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE evento_gestion_comercial ADD CONSTRAINT evento_gestion_comercial_id_contrato_fkey
        FOREIGN KEY (id_contrato) REFERENCES contrato (id_contrato) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE evento_gestion_comercial ADD CONSTRAINT evento_gestion_comercial_id_empresa_fkey
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE evento_gestion_comercial ADD CONSTRAINT evento_gestion_comercial_id_factura_fkey
        FOREIGN KEY (id_factura) REFERENCES factura (id_factura) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE evento_gestion_comercial ADD CONSTRAINT evento_gestion_comercial_id_servicio_fkey
        FOREIGN KEY (id_servicio) REFERENCES servicio_contratado (id_servicio) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE evento_gestion_comercial ADD CONSTRAINT evento_gestion_comercial_id_usuario_responsable_fkey
        FOREIGN KEY (id_usuario_responsable) REFERENCES usuario (id_usuario) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE evidencia_foto ADD CONSTRAINT fk_evidencia_foto_id_ot
        FOREIGN KEY (id_ot) REFERENCES orden_trabajo (id_ot);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE factura ADD CONSTRAINT fk_factura_id_contrato
        FOREIGN KEY (id_contrato) REFERENCES contrato (id_contrato);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE garantia_comercial ADD CONSTRAINT garantia_comercial_cliente_fkey
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE garantia_comercial ADD CONSTRAINT garantia_comercial_contrato_fkey
        FOREIGN KEY (id_contrato) REFERENCES contrato (id_contrato) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE garantia_comercial ADD CONSTRAINT garantia_comercial_empresa_fkey
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE garantia_comercial ADD CONSTRAINT garantia_comercial_servicio_fkey
        FOREIGN KEY (id_servicio) REFERENCES servicio_contratado (id_servicio) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE garantia_comercial ADD CONSTRAINT garantia_comercial_responsable_fkey
        FOREIGN KEY (id_usuario_responsable) REFERENCES usuario (id_usuario) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE historial_cambio_plan ADD CONSTRAINT fk_historial_cambio_plan_id_cliente
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE historial_cambio_plan ADD CONSTRAINT fk_historial_cambio_plan_id_contrato
        FOREIGN KEY (id_contrato) REFERENCES contrato (id_contrato);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE historial_cambio_plan ADD CONSTRAINT fk_historial_cambio_plan_id_plan_anterior
        FOREIGN KEY (id_plan_anterior) REFERENCES plan (id_plan);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE historial_cambio_plan ADD CONSTRAINT fk_historial_cambio_plan_id_plan_nuevo
        FOREIGN KEY (id_plan_nuevo) REFERENCES plan (id_plan);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE historial_conexion_ont ADD CONSTRAINT historial_conexion_ont_id_registro_ont_fkey
        FOREIGN KEY (id_registro_ont) REFERENCES registro_ont (id_registro_ont) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE historial_conexion_ont ADD CONSTRAINT fk_historial_conexion_ont_id_unidad
        FOREIGN KEY (id_unidad) REFERENCES unidad_equipo (id_unidad);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE historial_estado_equipo ADD CONSTRAINT fk_historial_estado_equipo_id_unidad
        FOREIGN KEY (id_unidad) REFERENCES unidad_equipo (id_unidad);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE historial_estado_equipo ADD CONSTRAINT fk_historial_estado_equipo_id_usuario
        FOREIGN KEY (id_usuario) REFERENCES usuario (id_usuario);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE historial_ot ADD CONSTRAINT fk_historial_ot_id_ot
        FOREIGN KEY (id_ot) REFERENCES orden_trabajo (id_ot);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE historial_ot ADD CONSTRAINT fk_historial_ot_id_usuario
        FOREIGN KEY (id_usuario) REFERENCES usuario (id_usuario);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE integracion_activacion_g1 ADD CONSTRAINT integracion_activacion_g1_cliente_fkey
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE integracion_activacion_g1 ADD CONSTRAINT integracion_activacion_g1_contrato_fkey
        FOREIGN KEY (id_contrato) REFERENCES contrato (id_contrato) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE integracion_activacion_g1 ADD CONSTRAINT integracion_activacion_g1_empresa_fkey
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE integracion_activacion_g1 ADD CONSTRAINT integracion_activacion_g1_servicio_fkey
        FOREIGN KEY (id_servicio) REFERENCES servicio_contratado (id_servicio) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE integracion_evento_entrante ADD CONSTRAINT integracion_evento_entrante_id_integracion_fkey
        FOREIGN KEY (id_integracion) REFERENCES integracion_instalacion_g3 (id_integracion) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE integracion_instalacion_g3 ADD CONSTRAINT integracion_instalacion_g3_id_cliente_fkey
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE integracion_instalacion_g3 ADD CONSTRAINT integracion_instalacion_g3_id_contrato_fkey
        FOREIGN KEY (id_contrato) REFERENCES contrato (id_contrato) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE integracion_instalacion_g3 ADD CONSTRAINT integracion_instalacion_g3_id_empresa_fkey
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE integracion_instalacion_g3 ADD CONSTRAINT integracion_instalacion_g3_id_plan_fkey
        FOREIGN KEY (id_plan) REFERENCES plan (id_plan) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE integracion_instalacion_g3 ADD CONSTRAINT integracion_instalacion_g3_id_prospecto_fkey
        FOREIGN KEY (id_prospecto) REFERENCES prospecto (id_prospecto) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE integracion_instalacion_g3 ADD CONSTRAINT integracion_instalacion_g3_id_servicio_fkey
        FOREIGN KEY (id_servicio) REFERENCES servicio_contratado (id_servicio) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE solicitud_instalacion_integracion ADD CONSTRAINT solicitud_instalacion_integracion_id_ot_fkey
        FOREIGN KEY (id_ot) REFERENCES orden_trabajo (id_ot) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE intento_fallido ADD CONSTRAINT fk_intento_fallido_id_empresa
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE lista_negra ADD CONSTRAINT fk_lista_negra_id_cliente
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE lista_negra ADD CONSTRAINT fk_lista_negra_id_usuario_registro
        FOREIGN KEY (id_usuario_registro) REFERENCES usuario (id_usuario);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE llamada_cortes ADD CONSTRAINT fk_llamada_cortes_id_ot
        FOREIGN KEY (id_ot) REFERENCES orden_trabajo (id_ot);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE log_auditoria ADD CONSTRAINT fk_log_auditoria_id_usuario
        FOREIGN KEY (id_usuario) REFERENCES usuario (id_usuario);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE log_notificacion ADD CONSTRAINT log_notificacion_id_alerta_fkey
        FOREIGN KEY (id_alerta) REFERENCES alerta_monitoreo (id_alerta) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE log_notificacion ADD CONSTRAINT fk_log_notificacion_id_cliente
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE log_notificacion ADD CONSTRAINT fk_log_notificacion_id_plantilla
        FOREIGN KEY (id_plantilla) REFERENCES plantilla_notificacion (id_plantilla);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE mensaje_bot ADD CONSTRAINT fk_mensaje_bot_id_conversacion
        FOREIGN KEY (id_conversacion) REFERENCES conversacion_bot (id_conversacion);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE mensaje_whatsapp ADD CONSTRAINT fk_mensaje_whatsapp_id_canal
        FOREIGN KEY (id_canal) REFERENCES canal_whatsapp (id_canal);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE mensaje_whatsapp ADD CONSTRAINT fk_mensaje_whatsapp_id_cliente
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE mensaje_whatsapp ADD CONSTRAINT fk_mensaje_whatsapp_id_plantilla_wa
        FOREIGN KEY (id_plantilla_wa) REFERENCES plantilla_whatsapp (id_plantilla_wa);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE monitoreo_ont ADD CONSTRAINT fk_monitoreo_ont_id_caja_nap
        FOREIGN KEY (id_caja_nap) REFERENCES caja_nap (id_caja_nap);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE monitoreo_ont ADD CONSTRAINT fk_monitoreo_ont_id_cliente
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE monitoreo_ont ADD CONSTRAINT monitoreo_ont_id_registro_ont_fkey
        FOREIGN KEY (id_registro_ont) REFERENCES registro_ont (id_registro_ont) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE monitoreo_ont ADD CONSTRAINT fk_monitoreo_ont_id_unidad
        FOREIGN KEY (id_unidad) REFERENCES unidad_equipo (id_unidad);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE movimiento_inventario ADD CONSTRAINT fk_movimiento_inventario_id_bodega_destino
        FOREIGN KEY (id_bodega_destino) REFERENCES bodega (id_bodega);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE movimiento_inventario ADD CONSTRAINT fk_movimiento_inventario_id_bodega_origen
        FOREIGN KEY (id_bodega_origen) REFERENCES bodega (id_bodega);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE movimiento_inventario ADD CONSTRAINT fk_movimiento_inventario_id_empresa_destino
        FOREIGN KEY (id_empresa_destino) REFERENCES empresa (id_empresa);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE movimiento_inventario ADD CONSTRAINT fk_movimiento_inventario_id_empresa_origen
        FOREIGN KEY (id_empresa_origen) REFERENCES empresa (id_empresa);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE movimiento_inventario ADD CONSTRAINT fk_movimiento_inventario_id_tipo_equipo
        FOREIGN KEY (id_tipo_equipo) REFERENCES tipo_equipo (id_tipo_equipo);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE movimiento_inventario ADD CONSTRAINT fk_movimiento_inventario_id_unidad
        FOREIGN KEY (id_unidad) REFERENCES unidad_equipo (id_unidad);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE movimiento_inventario ADD CONSTRAINT fk_movimiento_inventario_id_usuario
        FOREIGN KEY (id_usuario) REFERENCES usuario (id_usuario);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE mufa ADD CONSTRAINT fk_mufa_id_tarjeta_pon
        FOREIGN KEY (id_tarjeta_pon) REFERENCES tarjeta_pon (id_tarjeta);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE observacion_operativa ADD CONSTRAINT fk_observacion_operativa_id_usuario
        FOREIGN KEY (id_usuario) REFERENCES usuario (id_usuario);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE olt ADD CONSTRAINT fk_olt_id_empresa
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE orden_ingreso ADD CONSTRAINT fk_orden_ingreso_id_bodega
        FOREIGN KEY (id_bodega) REFERENCES bodega (id_bodega);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE orden_ingreso ADD CONSTRAINT fk_oi_bodega
        FOREIGN KEY (id_bodega_destino) REFERENCES bodega (id_bodega);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE orden_ingreso ADD CONSTRAINT fk_orden_ingreso_id_empresa
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE orden_ingreso ADD CONSTRAINT fk_orden_ingreso_id_proveedor
        FOREIGN KEY (id_proveedor) REFERENCES proveedor (id_proveedor);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE orden_ingreso ADD CONSTRAINT fk_orden_ingreso_id_usuario_registro
        FOREIGN KEY (id_usuario_registro) REFERENCES usuario (id_usuario);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE orden_ingreso_detalle ADD CONSTRAINT fk_oid_orden
        FOREIGN KEY (id_orden) REFERENCES orden_ingreso (id_orden) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE orden_ingreso_detalle ADD CONSTRAINT fk_oid_tipo_equipo
        FOREIGN KEY (id_tipo_equipo) REFERENCES tipo_equipo (id_tipo_equipo);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE orden_trabajo ADD CONSTRAINT orden_trabajo_id_caja_nap_fkey
        FOREIGN KEY (id_caja_nap) REFERENCES caja_nap (id_caja_nap) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE orden_trabajo ADD CONSTRAINT orden_trabajo_id_categoria_falla_fkey
        FOREIGN KEY (id_categoria_falla) REFERENCES categoria_falla (id_categoria) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE orden_trabajo ADD CONSTRAINT fk_orden_trabajo_id_cliente
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE orden_trabajo ADD CONSTRAINT fk_orden_trabajo_id_direccion
        FOREIGN KEY (id_direccion) REFERENCES direccion_servicio (id_direccion);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE orden_trabajo ADD CONSTRAINT fk_orden_trabajo_id_empresa
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE orden_trabajo ADD CONSTRAINT fk_orden_trabajo_id_prospecto
        FOREIGN KEY (id_prospecto) REFERENCES prospecto (id_prospecto);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE orden_trabajo ADD CONSTRAINT fk_orden_trabajo_id_servicio
        FOREIGN KEY (id_servicio) REFERENCES servicio_contratado (id_servicio);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE orden_trabajo ADD CONSTRAINT fk_orden_trabajo_id_tecnico
        FOREIGN KEY (id_tecnico) REFERENCES usuario (id_usuario);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE orden_trabajo ADD CONSTRAINT fk_orden_trabajo_id_tecnico_externo
        FOREIGN KEY (id_tecnico_externo) REFERENCES tecnico_externo (id_tecnico_ext);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE orden_trabajo ADD CONSTRAINT fk_orden_trabajo_id_ticket
        FOREIGN KEY (id_ticket) REFERENCES ticket (id_ticket);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE pago ADD CONSTRAINT fk_pago_id_cliente
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE pago ADD CONSTRAINT fk_pago_id_factura
        FOREIGN KEY (id_factura) REFERENCES factura (id_factura);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE plan ADD CONSTRAINT fk_plan_id_empresa
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE plan_zona_precio ADD CONSTRAINT fk_plan_zona_precio_id_plan
        FOREIGN KEY (id_plan) REFERENCES plan (id_plan);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE plan_zona_precio ADD CONSTRAINT fk_plan_zona_precio_id_zona_pago
        FOREIGN KEY (id_zona_pago) REFERENCES zona_pago (id_zona_pago);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE plantilla_notificacion ADD CONSTRAINT plantilla_notificacion_id_empresa_fkey
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE plantilla_whatsapp ADD CONSTRAINT fk_plantilla_whatsapp_id_canal
        FOREIGN KEY (id_canal) REFERENCES canal_whatsapp (id_canal);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE prestamo_detalle ADD CONSTRAINT fk_prestamo_detalle_prestamo
        FOREIGN KEY (id_prestamo) REFERENCES prestamo_externo (id_prestamo) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE prestamo_detalle ADD CONSTRAINT fk_prestamo_detalle_unidad
        FOREIGN KEY (id_unidad) REFERENCES unidad_equipo (id_unidad);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE prestamo_externo ADD CONSTRAINT fk_prestamo_externo_id_empresa_prestamista
        FOREIGN KEY (id_empresa_prestamista) REFERENCES empresa (id_empresa);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE prestamo_externo ADD CONSTRAINT fk_prestamo_externo_id_unidad
        FOREIGN KEY (id_unidad) REFERENCES unidad_equipo (id_unidad);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE prestamo_retorno ADD CONSTRAINT fk_prestamo_retorno_detalle
        FOREIGN KEY (id_detalle) REFERENCES prestamo_detalle (id_detalle) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE prorroga_pago ADD CONSTRAINT prorroga_pago_id_cliente_fkey
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE prorroga_pago ADD CONSTRAINT prorroga_pago_id_contrato_fkey
        FOREIGN KEY (id_contrato) REFERENCES contrato (id_contrato) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE prorroga_pago ADD CONSTRAINT prorroga_pago_id_empresa_fkey
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE prorroga_pago ADD CONSTRAINT prorroga_pago_id_factura_fkey
        FOREIGN KEY (id_factura) REFERENCES factura (id_factura) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE prorroga_pago ADD CONSTRAINT prorroga_pago_id_usuario_responsable_fkey
        FOREIGN KEY (id_usuario_responsable) REFERENCES usuario (id_usuario) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE prospecto ADD CONSTRAINT fk_prospecto_id_cliente
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE prospecto ADD CONSTRAINT fk_prospecto_id_empresa
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE prospecto ADD CONSTRAINT fk_prospecto_id_usuario_comercial
        FOREIGN KEY (id_usuario_comercial) REFERENCES usuario (id_usuario);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE prospecto ADD CONSTRAINT fk_prospecto_id_usuario_perdida
        FOREIGN KEY (id_usuario_perdida) REFERENCES usuario (id_usuario);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE prospecto ADD CONSTRAINT prospecto_id_zona_pago_fkey
        FOREIGN KEY (id_zona_pago) REFERENCES zona_pago (id_zona_pago) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE proveedor_tipo_equipo ADD CONSTRAINT fk_pte_proveedor
        FOREIGN KEY (id_proveedor) REFERENCES proveedor (id_proveedor) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE proveedor_tipo_equipo ADD CONSTRAINT fk_pte_tipo_equipo
        FOREIGN KEY (id_tipo_equipo) REFERENCES tipo_equipo (id_tipo_equipo) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE puerto_nap ADD CONSTRAINT fk_puerto_nap_id_caja_nap
        FOREIGN KEY (id_caja_nap) REFERENCES caja_nap (id_caja_nap);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE puerto_nap ADD CONSTRAINT fk_puerto_nap_id_cliente_asociado
        FOREIGN KEY (id_cliente_asociado) REFERENCES cliente (id_cliente);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE punto_cobertura ADD CONSTRAINT fk_punto_cobertura_id_empresa
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE registro_ont ADD CONSTRAINT registro_ont_caja_confirmada_por_fkey
        FOREIGN KEY (caja_confirmada_por) REFERENCES usuario (id_usuario) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE registro_ont ADD CONSTRAINT registro_ont_id_empresa_fkey
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE salida_detalle ADD CONSTRAINT fk_salida_detalle_salida
        FOREIGN KEY (id_salida) REFERENCES salida_bodega (id_salida) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE servicio_contratado ADD CONSTRAINT fk_servicio_contratado_id_cliente
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE servicio_contratado ADD CONSTRAINT fk_servicio_contratado_id_contrato
        FOREIGN KEY (id_contrato) REFERENCES contrato (id_contrato);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE servicio_contratado ADD CONSTRAINT fk_servicio_contratado_id_direccion
        FOREIGN KEY (id_direccion) REFERENCES direccion_servicio (id_direccion);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE servicio_contratado ADD CONSTRAINT fk_servicio_contratado_id_empresa
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE servicio_contratado ADD CONSTRAINT fk_servicio_contratado_id_zona_pago
        FOREIGN KEY (id_zona_pago) REFERENCES zona_pago (id_zona_pago);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE sesion_portal ADD CONSTRAINT fk_sesion_portal_id_cliente
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE solicitud_baja ADD CONSTRAINT fk_solicitud_baja_unidad
        FOREIGN KEY (id_unidad) REFERENCES unidad_equipo (id_unidad);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE solicitud_cliente ADD CONSTRAINT fk_solicitud_cliente_id_cliente
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE solicitud_cliente ADD CONSTRAINT fk_solicitud_cliente_id_empresa
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE solicitud_cliente ADD CONSTRAINT fk_solicitud_cliente_id_servicio
        FOREIGN KEY (id_servicio) REFERENCES servicio_contratado (id_servicio);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE solicitud_cliente ADD CONSTRAINT fk_solicitud_cliente_id_usuario_registro
        FOREIGN KEY (id_usuario_registro) REFERENCES usuario (id_usuario);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE solicitud_contrasena_wifi ADD CONSTRAINT fk_solicitud_contrasena_wifi_id_cliente
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE solicitud_contrasena_wifi ADD CONSTRAINT fk_solicitud_contrasena_wifi_id_contrato
        FOREIGN KEY (id_contrato) REFERENCES contrato (id_contrato);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE solicitud_retiro_servicio ADD CONSTRAINT solicitud_retiro_servicio_id_cliente_fkey
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE solicitud_retiro_servicio ADD CONSTRAINT solicitud_retiro_servicio_id_contrato_fkey
        FOREIGN KEY (id_contrato) REFERENCES contrato (id_contrato) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE solicitud_retiro_servicio ADD CONSTRAINT solicitud_retiro_servicio_id_empresa_fkey
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE solicitud_retiro_servicio ADD CONSTRAINT solicitud_retiro_servicio_id_servicio_fkey
        FOREIGN KEY (id_servicio) REFERENCES servicio_contratado (id_servicio) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE solicitud_retiro_servicio ADD CONSTRAINT solicitud_retiro_servicio_id_usuario_responsable_fkey
        FOREIGN KEY (id_usuario_responsable) REFERENCES usuario (id_usuario) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE stock_consumible ADD CONSTRAINT fk_stock_consumible_id_bodega
        FOREIGN KEY (id_bodega) REFERENCES bodega (id_bodega);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE stock_consumible ADD CONSTRAINT fk_stock_consumible_id_tipo_equipo
        FOREIGN KEY (id_tipo_equipo) REFERENCES tipo_equipo (id_tipo_equipo);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE tarjeta_pon ADD CONSTRAINT fk_tarjeta_pon_id_olt
        FOREIGN KEY (id_olt) REFERENCES olt (id_olt);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE ticket ADD CONSTRAINT fk_ticket_id_categoria
        FOREIGN KEY (id_categoria) REFERENCES categoria_falla (id_categoria);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE ticket ADD CONSTRAINT fk_ticket_id_cliente
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE ticket ADD CONSTRAINT fk_ticket_id_conversacion_bot
        FOREIGN KEY (id_conversacion_bot) REFERENCES conversacion_bot (id_conversacion);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE ticket ADD CONSTRAINT fk_ticket_id_empresa
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE ticket ADD CONSTRAINT fk_ticket_id_servicio
        FOREIGN KEY (id_servicio) REFERENCES servicio_contratado (id_servicio);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE ticket ADD CONSTRAINT fk_ticket_id_usuario_asignado
        FOREIGN KEY (id_usuario_asignado) REFERENCES usuario (id_usuario);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE tipo_equipo ADD CONSTRAINT fk_tipo_equipo_id_empresa
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE transferencia_equipo ADD CONSTRAINT fk_transferencia_equipo_id_empresa_destino
        FOREIGN KEY (id_empresa_destino) REFERENCES empresa (id_empresa);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE transferencia_equipo ADD CONSTRAINT fk_transferencia_equipo_id_empresa_origen
        FOREIGN KEY (id_empresa_origen) REFERENCES empresa (id_empresa);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE transferencia_equipo ADD CONSTRAINT fk_transferencia_equipo_id_usuario_registro
        FOREIGN KEY (id_usuario_registro) REFERENCES usuario (id_usuario);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE unidad_equipo ADD CONSTRAINT fk_unidad_equipo_id_bodega_actual
        FOREIGN KEY (id_bodega_actual) REFERENCES bodega (id_bodega);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE unidad_equipo ADD CONSTRAINT fk_unidad_equipo_id_caja_nap
        FOREIGN KEY (id_caja_nap) REFERENCES caja_nap (id_caja_nap);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE unidad_equipo ADD CONSTRAINT fk_unidad_equipo_id_cliente_instalado
        FOREIGN KEY (id_cliente_instalado) REFERENCES cliente (id_cliente);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE unidad_equipo ADD CONSTRAINT fk_unidad_equipo_id_empresa
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE unidad_equipo ADD CONSTRAINT fk_unidad_equipo_id_servicio
        FOREIGN KEY (id_servicio) REFERENCES servicio_contratado (id_servicio);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE unidad_equipo ADD CONSTRAINT fk_unidad_equipo_id_tipo_equipo
        FOREIGN KEY (id_tipo_equipo) REFERENCES tipo_equipo (id_tipo_equipo);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE uso_material_ot ADD CONSTRAINT fk_uso_material_ot_id_ot
        FOREIGN KEY (id_ot) REFERENCES orden_trabajo (id_ot);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE uso_material_ot ADD CONSTRAINT fk_uso_material_ot_id_tipo_equipo
        FOREIGN KEY (id_tipo_equipo) REFERENCES tipo_equipo (id_tipo_equipo);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE uso_material_ot ADD CONSTRAINT fk_uso_material_ot_id_unidad
        FOREIGN KEY (id_unidad) REFERENCES unidad_equipo (id_unidad);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE usuario ADD CONSTRAINT fk_usuario_id_empresa
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE usuario_rol ADD CONSTRAINT fk_usuario_rol_id_rol
        FOREIGN KEY (id_rol) REFERENCES rol (id_rol);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE usuario_rol ADD CONSTRAINT fk_usuario_rol_id_usuario
        FOREIGN KEY (id_usuario) REFERENCES usuario (id_usuario);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE prospecto ADD CONSTRAINT prospecto_id_plan_interes_fkey
        FOREIGN KEY (id_plan_interes) REFERENCES plan (id_plan) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE integracion_resultado_wifi_g2 ADD CONSTRAINT integracion_resultado_wifi_g2_id_empresa_fkey
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE integracion_resultado_wifi_g2 ADD CONSTRAINT integracion_resultado_wifi_g2_id_ticket_fkey
        FOREIGN KEY (id_ticket) REFERENCES ticket (id_ticket) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE zona_pago ADD CONSTRAINT fk_zona_pago_id_empresa
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE zona_pago ADD CONSTRAINT zona_pago_id_zona_padre_fkey
        FOREIGN KEY (id_zona_padre) REFERENCES zona_pago (id_zona_pago) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

