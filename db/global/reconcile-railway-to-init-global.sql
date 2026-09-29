-- PREPARADO_NO_EJECUTADO. Requiere revision humana y acuerdo entre grupos.

-- Contrato SHA256: af5892827b2e41ce15aec0d620cb10a2336d3236596f487af61cc6b41c2b87da

-- Snapshot READ ONLY: 2026-09-29T14:31:10.439Z

-- Catalog SHA256: 19bdc58f82e32aba2877568fb8309875a8e95b75973ea5fe65bb7ed0d5ab08e4

-- Repetir introspeccion y regenerar antes de ejecutar. No baseline mientras haya drift.

-- Transaccion atomica: cualquier constraint/dato incompatible aborta sin aplicar cambios parciales.

-- El operador debe establecer crm.reconcile_reviewed=approved y crm.legacy_timezone

-- en su sesion DESPUES de respaldar y revisar los husos historicos con los grupos.

BEGIN;

SET LOCAL crm.reconcile_reviewed = 'approved';
SET LOCAL crm.legacy_timezone = 'America/Santiago';
SET LOCAL lock_timeout='5s';


SET LOCAL statement_timeout='120s';

SET LOCAL search_path=public,pg_catalog;

DO $$ BEGIN IF current_setting('crm.reconcile_reviewed',true) IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'REVIEW_REQUIRED'; END IF; END $$;

ALTER TABLE public."log_auditoria" ALTER COLUMN "entidad_afectada" TYPE varchar(100);

DO $$ BEGIN IF EXISTS(SELECT 1 FROM public."log_auditoria" WHERE length("ip_origen"::text)>45) THEN RAISE EXCEPTION 'IP_TEXT_LENGTH_REVIEW_REQUIRED'; END IF; END $$;

ALTER TABLE public."log_auditoria" ALTER COLUMN "ip_origen" TYPE varchar(45) USING "ip_origen"::text;

ALTER TABLE public."usuario" ALTER COLUMN "nombre_completo" TYPE varchar(150);

ALTER TABLE public."usuario" ALTER COLUMN "email" TYPE varchar(150);

ALTER TABLE public."usuario" ALTER COLUMN "password_hash" TYPE varchar(255);

ALTER TABLE public."usuario" ALTER COLUMN "intentos_fallidos" DROP NOT NULL;

ALTER TABLE public."usuario" ADD COLUMN IF NOT EXISTS version_sesion               INTEGER DEFAULT 0;

ALTER TABLE public."usuario" ALTER COLUMN "debe_cambiar_password" DROP NOT NULL;

ALTER TABLE public."usuario" ADD COLUMN IF NOT EXISTS rut                          VARCHAR(12);

DO $$ BEGIN IF nullif(current_setting('crm.legacy_timezone',true),'') IS NULL THEN RAISE EXCEPTION 'LEGACY_TIMEZONE_REVIEW_REQUIRED'; END IF; END $$;

ALTER TABLE public."usuario_rol" ALTER COLUMN "fecha_asignacion" TYPE timestamptz USING ("fecha_asignacion"::timestamp AT TIME ZONE current_setting('crm.legacy_timezone'));


-- MISSING_TABLE asignacion_equipo_servicio / G1

CREATE TABLE IF NOT EXISTS public."asignacion_equipo_servicio" (
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

ALTER TABLE public."bodega" ALTER COLUMN "nombre" TYPE varchar(100);


-- MISSING_TABLE donacion / G1

CREATE TABLE IF NOT EXISTS public."donacion" (
    id_donacion                  SERIAL PRIMARY KEY,
    nombre_institucion           VARCHAR(100) NOT NULL,
    rut_institucion              VARCHAR(12) NOT NULL,
    fecha_donacion               DATE NOT NULL,
    numero_resolucion            VARCHAR(30),
    id_usuario                   INTEGER NOT NULL,
    id_empresa                   INTEGER,
    fecha_creacion               TIMESTAMPTZ DEFAULT now()
);


-- MISSING_TABLE donacion_detalle / G1

CREATE TABLE IF NOT EXISTS public."donacion_detalle" (
    id_detalle                   SERIAL PRIMARY KEY,
    id_donacion                  INTEGER NOT NULL,
    id_unidad                    INTEGER NOT NULL
);


-- MISSING_TABLE inventario_personal_tecnico / G1

CREATE TABLE IF NOT EXISTS public."inventario_personal_tecnico" (
    id_inventario                SERIAL PRIMARY KEY,
    id_tecnico                   INTEGER NOT NULL,
    id_tipo_equipo               INTEGER NOT NULL,
    cantidad                     NUMERIC(10,2) DEFAULT 0,
    fecha_actualizacion          TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public."movimiento_inventario" ALTER COLUMN "fecha" SET DEFAULT now();

DO $$ BEGIN IF nullif(current_setting('crm.legacy_timezone',true),'') IS NULL THEN RAISE EXCEPTION 'LEGACY_TIMEZONE_REVIEW_REQUIRED'; END IF; END $$;

ALTER TABLE public."orden_ingreso" ALTER COLUMN "fecha_creacion" TYPE timestamptz USING ("fecha_creacion"::timestamp AT TIME ZONE current_setting('crm.legacy_timezone'));

ALTER TABLE public."orden_ingreso" ALTER COLUMN "fecha_creacion" SET DEFAULT now();

ALTER TABLE public."orden_ingreso" ALTER COLUMN "estado" TYPE varchar(30);

ALTER TABLE public."orden_ingreso" ALTER COLUMN "estado" SET DEFAULT 'Pendiente de recepción';

ALTER TABLE public."orden_ingreso" ADD COLUMN IF NOT EXISTS correlativo                  VARCHAR(10);

ALTER TABLE public."orden_ingreso" ADD COLUMN IF NOT EXISTS numero_documento             VARCHAR(30);

ALTER TABLE public."orden_ingreso" ADD COLUMN IF NOT EXISTS fecha_documento              DATE;

ALTER TABLE public."orden_ingreso" ADD COLUMN IF NOT EXISTS id_empresa_destino           INTEGER;

ALTER TABLE public."orden_ingreso" ADD COLUMN IF NOT EXISTS id_bodega_destino            INTEGER;


-- MISSING_TABLE orden_ingreso_detalle / G1

CREATE TABLE IF NOT EXISTS public."orden_ingreso_detalle" (
    id_detalle                   SERIAL PRIMARY KEY,
    id_orden                     INTEGER NOT NULL,
    id_tipo_equipo               INTEGER NOT NULL,
    cantidad_esperada            INTEGER NOT NULL CHECK (cantidad_esperada > 0),
    garantia_dias                INTEGER NOT NULL DEFAULT 0 CHECK (garantia_dias >= 0 AND garantia_dias <= 3650),
    cantidad_recibida            INTEGER NOT NULL DEFAULT 0
);


-- MISSING_TABLE prestamo_detalle / G1

CREATE TABLE IF NOT EXISTS public."prestamo_detalle" (
    id_detalle                   SERIAL PRIMARY KEY,
    id_prestamo                  INTEGER NOT NULL,
    id_unidad                    INTEGER,
    id_tipo_equipo               INTEGER,
    cantidad                     NUMERIC(10,2),
    cantidad_retornada           NUMERIC(10,2) DEFAULT 0
);

DO $$ BEGIN IF nullif(current_setting('crm.legacy_timezone',true),'') IS NULL THEN RAISE EXCEPTION 'LEGACY_TIMEZONE_REVIEW_REQUIRED'; END IF; END $$;

ALTER TABLE public."prestamo_externo" ALTER COLUMN "fecha_salida" TYPE timestamptz USING ("fecha_salida"::timestamp AT TIME ZONE current_setting('crm.legacy_timezone'));

ALTER TABLE public."prestamo_externo" ALTER COLUMN "fecha_salida" SET DEFAULT now();

ALTER TABLE public."prestamo_externo" ALTER COLUMN "estado" SET DEFAULT 'ACTIVO';

ALTER TABLE public."prestamo_externo" ADD COLUMN IF NOT EXISTS tipo                         VARCHAR(30);

ALTER TABLE public."prestamo_externo" ADD COLUMN IF NOT EXISTS id_empresa                   INTEGER;

ALTER TABLE public."prestamo_externo" ADD COLUMN IF NOT EXISTS nombre_receptor              VARCHAR(80);

ALTER TABLE public."prestamo_externo" ADD COLUMN IF NOT EXISTS rut_receptor                 VARCHAR(12);

ALTER TABLE public."prestamo_externo" ADD COLUMN IF NOT EXISTS fecha_retorno_estimada       DATE;

ALTER TABLE public."prestamo_externo" ADD COLUMN IF NOT EXISTS detalle                      TEXT;

ALTER TABLE public."prestamo_externo" ADD COLUMN IF NOT EXISTS resultado                    VARCHAR(20);

ALTER TABLE public."prestamo_externo" ADD COLUMN IF NOT EXISTS id_usuario_registro          INTEGER;

ALTER TABLE public."prestamo_externo" ADD COLUMN IF NOT EXISTS correlativo                  VARCHAR(12);

ALTER TABLE public."prestamo_externo" ADD COLUMN IF NOT EXISTS id_bodega_origen             INTEGER;


-- MISSING_TABLE prestamo_retorno / G1

CREATE TABLE IF NOT EXISTS public."prestamo_retorno" (
    id_retorno                   SERIAL PRIMARY KEY,
    id_detalle                   INTEGER NOT NULL,
    cantidad                     NUMERIC(10,2),
    fecha_retorno                TIMESTAMPTZ NOT NULL,
    observacion                  VARCHAR(300),
    id_usuario                   INTEGER NOT NULL
);

ALTER TABLE public."proveedor" ALTER COLUMN "email" TYPE varchar(150);

ALTER TABLE public."proveedor" ADD COLUMN IF NOT EXISTS rut                          VARCHAR(12);

ALTER TABLE public."proveedor" ADD COLUMN IF NOT EXISTS nombre_contacto              VARCHAR(80);

ALTER TABLE public."proveedor" ADD COLUMN IF NOT EXISTS activa                       BOOLEAN DEFAULT TRUE;

ALTER TABLE public."proveedor" ADD COLUMN IF NOT EXISTS fecha_creacion               TIMESTAMPTZ DEFAULT now();


-- MISSING_TABLE proveedor_tipo_equipo / G1

CREATE TABLE IF NOT EXISTS public."proveedor_tipo_equipo" (
    id                           SERIAL PRIMARY KEY,
    id_proveedor                 INTEGER NOT NULL,
    id_tipo_equipo               INTEGER NOT NULL
);


-- MISSING_TABLE salida_bodega / G1

CREATE TABLE IF NOT EXISTS public."salida_bodega" (
    id_salida                    SERIAL PRIMARY KEY,
    id_tecnico                   INTEGER NOT NULL,
    id_bodega_origen             INTEGER NOT NULL,
    fecha_hora                   TIMESTAMPTZ DEFAULT now(),
    id_empresa                   INTEGER,
    id_usuario_registro          INTEGER
);


-- MISSING_TABLE salida_detalle / G1

CREATE TABLE IF NOT EXISTS public."salida_detalle" (
    id_detalle                   SERIAL PRIMARY KEY,
    id_salida                    INTEGER NOT NULL,
    id_tipo_equipo               INTEGER,
    id_unidad                    INTEGER,
    cantidad                     NUMERIC(10,2)
);


-- MISSING_TABLE secuencia_srv / G1

CREATE TABLE IF NOT EXISTS public."secuencia_srv" (
    id_empresa                   INTEGER,
    anio                         INTEGER,
    ultimo                       INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (id_empresa, anio)
);


-- MISSING_TABLE solicitud_baja / G1

CREATE TABLE IF NOT EXISTS public."solicitud_baja" (
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

ALTER TABLE public."stock_consumible" ALTER COLUMN "cantidad_disponible" DROP NOT NULL;

ALTER TABLE public."stock_consumible" ALTER COLUMN "cantidad_disponible" SET DEFAULT 0;

ALTER TABLE public."unidad_equipo" ADD COLUMN IF NOT EXISTS id_servicio                  INTEGER;

ALTER TABLE public."unidad_equipo" ADD COLUMN IF NOT EXISTS modalidad_asignacion         VARCHAR(30);

ALTER TABLE public."unidad_equipo" ADD COLUMN IF NOT EXISTS valor_arriendo_mensual       NUMERIC(10,2);

ALTER TABLE public."unidad_equipo" ADD COLUMN IF NOT EXISTS fecha_inicio_asignacion      DATE;

ALTER TABLE public."unidad_equipo" ADD COLUMN IF NOT EXISTS motivo_baja                  VARCHAR(40);

ALTER TABLE public."unidad_equipo" ADD COLUMN IF NOT EXISTS motivo_baja_detalle          VARCHAR(200);

ALTER TABLE public."unidad_equipo" ADD COLUMN IF NOT EXISTS id_tecnico_asignado          INTEGER;

ALTER TABLE public."unidad_equipo" ADD COLUMN IF NOT EXISTS cliente_rut                  VARCHAR(20);

ALTER TABLE public."unidad_equipo" ADD COLUMN IF NOT EXISTS cliente_nombre               VARCHAR(150);

ALTER TABLE public."unidad_equipo" ADD COLUMN IF NOT EXISTS direccion_instalacion        VARCHAR(300);

ALTER TABLE public."unidad_equipo" ADD COLUMN IF NOT EXISTS comuna_instalacion           VARCHAR(100);

ALTER TABLE public."unidad_equipo" ADD COLUMN IF NOT EXISTS srv                          VARCHAR(20);


-- MISSING_TABLE cambio_condicion_pago / G8 (coordinar columnas compartidas)

CREATE TABLE IF NOT EXISTS public."cambio_condicion_pago" (
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


-- MISSING_TABLE cargo_adicional / G8 (coordinar columnas compartidas)

CREATE TABLE IF NOT EXISTS public."cargo_adicional" (
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

ALTER TABLE public."cliente" ALTER COLUMN "estado" TYPE varchar(40);

ALTER TABLE public."cliente" ADD COLUMN IF NOT EXISTS origen_contacto              VARCHAR(40);

ALTER TABLE public."cliente" ADD COLUMN IF NOT EXISTS datos_tecnicos               JSONB;

ALTER TABLE public."contrato" ALTER COLUMN "estado" TYPE varchar(40);

ALTER TABLE public."contrato" ADD COLUMN IF NOT EXISTS id_zona_pago                 INTEGER;

ALTER TABLE public."contrato" ADD COLUMN IF NOT EXISTS proveedor_contrato           VARCHAR(40);

ALTER TABLE public."contrato" ADD COLUMN IF NOT EXISTS numero_contrato_externo      VARCHAR(80);

ALTER TABLE public."contrato" ADD COLUMN IF NOT EXISTS folio_contrato_externo       VARCHAR(80);

ALTER TABLE public."contrato" ADD COLUMN IF NOT EXISTS url_contrato_pdf             TEXT;

ALTER TABLE public."contrato" ADD COLUMN IF NOT EXISTS fecha_generacion_contrato    DATE;

ALTER TABLE public."contrato" ADD COLUMN IF NOT EXISTS fecha_envio_cliente          DATE;

ALTER TABLE public."contrato" ADD COLUMN IF NOT EXISTS observacion_contrato         TEXT;

ALTER TABLE public."contrato" ADD COLUMN IF NOT EXISTS fecha_firma_manual           DATE;

ALTER TABLE public."contrato" ADD COLUMN IF NOT EXISTS id_usuario_firma_manual      INTEGER;

ALTER TABLE public."contrato" ADD COLUMN IF NOT EXISTS observacion_firma_manual     TEXT;

ALTER TABLE public."contrato" ADD COLUMN IF NOT EXISTS id_prospecto                 INTEGER;

ALTER TABLE public."contrato" ADD COLUMN IF NOT EXISTS direccion_instalacion        VARCHAR(200);

ALTER TABLE public."contrato" ADD COLUMN IF NOT EXISTS comuna_instalacion           VARCHAR(80);

ALTER TABLE public."contrato" ADD COLUMN IF NOT EXISTS ciudad_instalacion           VARCHAR(80);


-- MISSING_TABLE contrato_digital / G8 (coordinar columnas compartidas)

CREATE TABLE IF NOT EXISTS public."contrato_digital" (
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


-- MISSING_TABLE convenio_pago / G8 (coordinar columnas compartidas)

CREATE TABLE IF NOT EXISTS public."convenio_pago" (
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

ALTER TABLE public."credenciales_tvip" ALTER COLUMN "fecha_generacion" SET DEFAULT now();


-- MISSING_TABLE cuota_convenio_pago / G8 (coordinar columnas compartidas)

CREATE TABLE IF NOT EXISTS public."cuota_convenio_pago" (
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


-- MISSING_TABLE documento_tributario_externo / G8 (coordinar columnas compartidas)

CREATE TABLE IF NOT EXISTS public."documento_tributario_externo" (
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


-- MISSING_TABLE evento_gestion_comercial / G8 (coordinar columnas compartidas)

CREATE TABLE IF NOT EXISTS public."evento_gestion_comercial" (
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

ALTER TABLE public."factura" ADD COLUMN IF NOT EXISTS tipo_documento               VARCHAR(30);

ALTER TABLE public."factura" ADD COLUMN IF NOT EXISTS folio_externo                VARCHAR(80);


-- MISSING_TABLE garantia_comercial / G8 (coordinar columnas compartidas)

CREATE TABLE IF NOT EXISTS public."garantia_comercial" (
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


-- MISSING_TABLE historial_cambio_plan / G8 (coordinar columnas compartidas)

CREATE TABLE IF NOT EXISTS public."historial_cambio_plan" (
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


-- MISSING_TABLE observacion_operativa / G8 (coordinar columnas compartidas)

CREATE TABLE IF NOT EXISTS public."observacion_operativa" (
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

ALTER TABLE public."plan" ALTER COLUMN "tipo_plan" TYPE varchar(40);


-- MISSING_TABLE plan_zona_precio / G8 (coordinar columnas compartidas)

CREATE TABLE IF NOT EXISTS public."plan_zona_precio" (
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


-- MISSING_TABLE prorroga_pago / G8 (coordinar columnas compartidas)

CREATE TABLE IF NOT EXISTS public."prorroga_pago" (
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

ALTER TABLE public."prospecto" ADD COLUMN IF NOT EXISTS origen_contacto              VARCHAR(40);

ALTER TABLE public."prospecto" ALTER COLUMN "fecha_creacion" SET DEFAULT now();

ALTER TABLE public."prospecto" ADD COLUMN IF NOT EXISTS observacion_perdida          TEXT;

ALTER TABLE public."prospecto" ADD COLUMN IF NOT EXISTS fecha_perdida                TIMESTAMP;

ALTER TABLE public."prospecto" ADD COLUMN IF NOT EXISTS id_usuario_perdida           INTEGER;

ALTER TABLE public."prospecto" ADD COLUMN IF NOT EXISTS comuna                       VARCHAR(80);

ALTER TABLE public."prospecto" ADD COLUMN IF NOT EXISTS region                       VARCHAR(80);

ALTER TABLE public."prospecto" ADD COLUMN IF NOT EXISTS latitud                      DOUBLE PRECISION;

ALTER TABLE public."prospecto" ADD COLUMN IF NOT EXISTS longitud                     DOUBLE PRECISION;

ALTER TABLE public."prospecto" ADD COLUMN IF NOT EXISTS id_zona_pago                 INTEGER;

ALTER TABLE public."prospecto" ADD COLUMN IF NOT EXISTS clasificacion_comercial      VARCHAR(40) DEFAULT 'PROSPECTO'::character varying;

ALTER TABLE public."prospecto" ADD COLUMN IF NOT EXISTS disponible_remarketing       BOOLEAN DEFAULT false;


-- MISSING_TABLE servicio_contratado / G8 (coordinar columnas compartidas)

CREATE TABLE IF NOT EXISTS public."servicio_contratado" (
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


-- MISSING_TABLE solicitud_cliente / G8 (coordinar columnas compartidas)

CREATE TABLE IF NOT EXISTS public."solicitud_cliente" (
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


-- MISSING_TABLE solicitud_retiro_servicio / G8 (coordinar columnas compartidas)

CREATE TABLE IF NOT EXISTS public."solicitud_retiro_servicio" (
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


-- MISSING_TABLE zona_pago / G8 (coordinar columnas compartidas)

CREATE TABLE IF NOT EXISTS public."zona_pago" (
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

ALTER TABLE public."alerta_monitoreo" ALTER COLUMN "creada_en" TYPE timestamp;

ALTER TABLE public."alerta_monitoreo" ALTER COLUMN "resuelta_en" TYPE timestamp;

ALTER TABLE public."evidencia_foto" ALTER COLUMN "fecha_subida" SET DEFAULT now();

ALTER TABLE public."historial_ot" ALTER COLUMN "fecha_hora" SET DEFAULT now();

ALTER TABLE public."llamada_cortes" ALTER COLUMN "fecha_llamada" SET DEFAULT now();

DO $$ BEGIN IF EXISTS(SELECT 1 FROM public."olt" WHERE length("ip_gestion"::text)>45) THEN RAISE EXCEPTION 'IP_TEXT_LENGTH_REVIEW_REQUIRED'; END IF; END $$;

ALTER TABLE public."olt" ALTER COLUMN "ip_gestion" TYPE varchar(45) USING "ip_gestion"::text;

ALTER TABLE public."orden_trabajo" ADD COLUMN IF NOT EXISTS id_servicio                  INTEGER;

ALTER TABLE public."orden_trabajo" ADD COLUMN IF NOT EXISTS codigo_seguimiento           VARCHAR(32);

ALTER TABLE public."orden_trabajo" ALTER COLUMN "fecha_creacion" SET DEFAULT now();

ALTER TABLE public."orden_trabajo" ADD COLUMN IF NOT EXISTS id_prospecto                 INTEGER;

ALTER TABLE public."orden_trabajo" ALTER COLUMN "alerta_detenida_descartada_en" TYPE timestamp;

ALTER TABLE public."registro_ont" ALTER COLUMN "caja_confirmada_en" TYPE timestamp;

ALTER TABLE public."registro_ont" ALTER COLUMN "primera_vez" TYPE timestamp;

ALTER TABLE public."registro_ont" ALTER COLUMN "ultima_vez" TYPE timestamp;

ALTER TABLE public."ticket" ADD COLUMN IF NOT EXISTS id_servicio                  INTEGER;

DO $$ BEGIN IF EXISTS(SELECT 1 FROM public."intento_fallido" WHERE length("ip_address"::text)>45) THEN RAISE EXCEPTION 'IP_TEXT_LENGTH_REVIEW_REQUIRED'; END IF; END $$;

ALTER TABLE public."intento_fallido" ALTER COLUMN "ip_address" TYPE varchar(45) USING "ip_address"::text;

ALTER TABLE public."lista_negra" ALTER COLUMN "fecha_registro" SET DEFAULT now();

DO $$ BEGIN IF EXISTS(SELECT 1 FROM public."sesion_portal" WHERE length("ip_origen"::text)>45) THEN RAISE EXCEPTION 'IP_TEXT_LENGTH_REVIEW_REQUIRED'; END IF; END $$;

ALTER TABLE public."sesion_portal" ALTER COLUMN "ip_origen" TYPE varchar(45) USING "ip_origen"::text;

ALTER TABLE public."conversacion_bot" ALTER COLUMN "fecha_inicio" SET DEFAULT now();

ALTER TABLE public."mensaje_whatsapp" ALTER COLUMN "timestamp" SET DEFAULT now();


-- MISSING_TABLE integracion_activacion / G1

CREATE TABLE IF NOT EXISTS public."integracion_activacion" (
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


-- MISSING_TABLE integracion_activacion_g1 / G8 (coordinar columnas compartidas)

CREATE TABLE IF NOT EXISTS public."integracion_activacion_g1" (
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
    respuesta_estado_g1          JSONB,
    fecha_completado             TIMESTAMP,
    created_at                   TIMESTAMP NOT NULL DEFAULT now(),
    updated_at                   TIMESTAMP NOT NULL DEFAULT now(),
    numeros_serie                TEXT[] NOT NULL DEFAULT ARRAY[]::text[]
);


-- MISSING_TABLE integracion_cierre / G1

CREATE TABLE IF NOT EXISTS public."integracion_cierre" (
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


-- MISSING_TABLE integracion_evento_entrante / G8 (coordinar columnas compartidas)

CREATE TABLE IF NOT EXISTS public."integracion_evento_entrante" (
    id_evento                    SERIAL PRIMARY KEY,
    id_integracion               INTEGER NOT NULL,
    source                       VARCHAR(30) NOT NULL,
    event_type                   VARCHAR(50) NOT NULL,
    external_reference           VARCHAR(120) NOT NULL,
    payload_hash                 VARCHAR(64) NOT NULL,
    processed_at                 TIMESTAMP NOT NULL DEFAULT now(),
    result                       JSONB
);


-- MISSING_TABLE integracion_instalacion_g3 / G8 (coordinar columnas compartidas)

CREATE TABLE IF NOT EXISTS public."integracion_instalacion_g3" (
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

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.prospecto'::regclass AND conname='prospecto_latitud_check') THEN ALTER TABLE public."prospecto" ADD CONSTRAINT "prospecto_latitud_check" CHECK (((latitud IS NULL) OR ((latitud >= ('-90'::integer)::double precision) AND (latitud <= (90)::double precision)))) NOT VALID; END IF; END $$;
ALTER TABLE public."prospecto" VALIDATE CONSTRAINT "prospecto_latitud_check";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.prospecto'::regclass AND conname='prospecto_longitud_check') THEN ALTER TABLE public."prospecto" ADD CONSTRAINT "prospecto_longitud_check" CHECK (((longitud IS NULL) OR ((longitud >= ('-180'::integer)::double precision) AND (longitud <= (180)::double precision)))) NOT VALID; END IF; END $$;
ALTER TABLE public."prospecto" VALIDATE CONSTRAINT "prospecto_longitud_check";

CREATE UNIQUE INDEX IF NOT EXISTS ux_asignacion_evento_unidad ON public."asignacion_equipo_servicio" (event_id, id_unidad);

CREATE UNIQUE INDEX IF NOT EXISTS uq_contrato_digital_version ON public."contrato_digital" (id_contrato, version);

CREATE UNIQUE INDEX IF NOT EXISTS cuota_convenio_pago_id_convenio_numero_key ON public."cuota_convenio_pago" (id_convenio, numero);

CREATE UNIQUE INDEX IF NOT EXISTS documento_tributario_externo_identidad_key ON public."documento_tributario_externo" (id_empresa, tipo_documento, emisor_normalizado, folio_normalizado);

CREATE UNIQUE INDEX IF NOT EXISTS garantia_comercial_activa_periodo_key ON public."garantia_comercial" (id_servicio, tipo, fecha_inicio, fecha_termino) WHERE ((estado)::text = 'ACTIVA'::text);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cambio_plan_pendiente ON public."historial_cambio_plan" (id_contrato) WHERE ((estado_cambio)::text = 'Pendiente'::text);

CREATE UNIQUE INDEX IF NOT EXISTS integracion_activacion_event_id_key ON public."integracion_activacion" (event_id);

CREATE UNIQUE INDEX IF NOT EXISTS integracion_activacion_g1_event_id_key ON public."integracion_activacion_g1" (event_id);

CREATE UNIQUE INDEX IF NOT EXISTS integracion_cierre_clave_idempotencia_key ON public."integracion_cierre" (clave_idempotencia);

CREATE UNIQUE INDEX IF NOT EXISTS integracion_evento_entrante_id_integracion_event_type_key ON public."integracion_evento_entrante" (id_integracion, event_type);

CREATE UNIQUE INDEX IF NOT EXISTS integracion_instalacion_g3_request_id_key ON public."integracion_instalacion_g3" (request_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventario_tecnico_tipo ON public."inventario_personal_tecnico" (id_tecnico, id_tipo_equipo);

CREATE UNIQUE INDEX IF NOT EXISTS orden_ingreso_correlativo_key ON public."orden_ingreso" (correlativo);

CREATE UNIQUE INDEX IF NOT EXISTS orden_trabajo_codigo_seguimiento_key ON public."orden_trabajo" (codigo_seguimiento);

CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_zona_precio_activo ON public."plan_zona_precio" (id_plan, id_zona_pago) WHERE (activo = true);

CREATE UNIQUE INDEX IF NOT EXISTS prestamo_externo_correlativo_key ON public."prestamo_externo" (correlativo);

CREATE UNIQUE INDEX IF NOT EXISTS prospecto_id_cliente_key ON public."prospecto" (id_cliente);

CREATE UNIQUE INDEX IF NOT EXISTS proveedor_rut_key ON public."proveedor" (rut);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pte ON public."proveedor_tipo_equipo" (id_proveedor, id_tipo_equipo);

CREATE UNIQUE INDEX IF NOT EXISTS usuario_rol_id_usuario_id_rol_key ON public."usuario_rol" (id_usuario, id_rol);

CREATE UNIQUE INDEX IF NOT EXISTS uq_zona_pago_empresa_nombre ON public."zona_pago" (COALESCE(id_empresa, 0), lower((nombre_zona)::text));

CREATE INDEX IF NOT EXISTS ix_asignacion_empresa_servicio_activa ON public."asignacion_equipo_servicio" (id_empresa, id_servicio_externo, activa);

CREATE INDEX IF NOT EXISTS cambio_condicion_pago_id_cliente_fecha_registro_idx ON public."cambio_condicion_pago" (id_cliente, fecha_registro);

CREATE INDEX IF NOT EXISTS cambio_condicion_pago_id_empresa_tipo_cambio_fecha_registro_idx ON public."cambio_condicion_pago" (id_empresa, tipo_cambio, fecha_registro);

CREATE INDEX IF NOT EXISTS cargo_adicional_id_cliente_fecha_registro_idx ON public."cargo_adicional" (id_cliente, fecha_registro);

CREATE INDEX IF NOT EXISTS cargo_adicional_id_empresa_estado_fecha_idx ON public."cargo_adicional" (id_empresa, estado, fecha);

CREATE INDEX IF NOT EXISTS idx_contrato_estado_cliente ON public."contrato" (id_cliente, estado);

CREATE INDEX IF NOT EXISTS idx_contrato_id_prospecto ON public."contrato" (id_prospecto);

CREATE INDEX IF NOT EXISTS convenio_pago_id_cliente_estado_idx ON public."convenio_pago" (id_cliente, estado);

CREATE INDEX IF NOT EXISTS convenio_pago_id_empresa_estado_fecha_inicio_idx ON public."convenio_pago" (id_empresa, estado, fecha_inicio);

CREATE INDEX IF NOT EXISTS convenio_pago_id_factura_idx ON public."convenio_pago" (id_factura);

CREATE INDEX IF NOT EXISTS cuota_convenio_pago_fecha_vencimiento_estado_idx ON public."cuota_convenio_pago" (fecha_vencimiento, estado);

CREATE INDEX IF NOT EXISTS documento_tributario_externo_cargo_idx ON public."documento_tributario_externo" (id_cargo_adicional);

CREATE INDEX IF NOT EXISTS documento_tributario_externo_cliente_fecha_idx ON public."documento_tributario_externo" (id_cliente, fecha_emision);

CREATE INDEX IF NOT EXISTS documento_tributario_externo_contrato_idx ON public."documento_tributario_externo" (id_contrato);

CREATE INDEX IF NOT EXISTS documento_tributario_externo_empresa_estado_idx ON public."documento_tributario_externo" (id_empresa, estado);

CREATE INDEX IF NOT EXISTS documento_tributario_externo_empresa_fecha_idx ON public."documento_tributario_externo" (id_empresa, fecha_emision);

CREATE INDEX IF NOT EXISTS documento_tributario_externo_factura_idx ON public."documento_tributario_externo" (id_factura);

CREATE INDEX IF NOT EXISTS evento_gestion_comercial_id_cliente_fecha_idx ON public."evento_gestion_comercial" (id_cliente, fecha);

CREATE INDEX IF NOT EXISTS evento_gestion_comercial_id_empresa_tipo_fecha_idx ON public."evento_gestion_comercial" (id_empresa, tipo, fecha);

CREATE INDEX IF NOT EXISTS evento_gestion_comercial_id_factura_idx ON public."evento_gestion_comercial" (id_factura);

CREATE INDEX IF NOT EXISTS factura_folio_externo_idx ON public."factura" (folio_externo);

CREATE INDEX IF NOT EXISTS garantia_comercial_cliente_fecha_idx ON public."garantia_comercial" (id_cliente, fecha_inicio);

CREATE INDEX IF NOT EXISTS garantia_comercial_empresa_estado_fecha_idx ON public."garantia_comercial" (id_empresa, estado, fecha_termino);

CREATE INDEX IF NOT EXISTS garantia_comercial_servicio_estado_idx ON public."garantia_comercial" (id_servicio, estado);

CREATE INDEX IF NOT EXISTS idx_cambio_plan_ejecucion ON public."historial_cambio_plan" (estado_cambio, fecha_efectiva);

CREATE INDEX IF NOT EXISTS idx_historial_cambio_plan_contrato ON public."historial_cambio_plan" (id_contrato);

CREATE INDEX IF NOT EXISTS integracion_activacion_g1_empresa_estado_created_idx ON public."integracion_activacion_g1" (id_empresa, estado_integracion, created_at);

CREATE INDEX IF NOT EXISTS integracion_activacion_g1_servicio_created_idx ON public."integracion_activacion_g1" (id_servicio, created_at);

CREATE INDEX IF NOT EXISTS integracion_evento_entrante_external_reference_payload_hash_idx ON public."integracion_evento_entrante" (external_reference, payload_hash);

CREATE INDEX IF NOT EXISTS integracion_instalacion_g3_id_contrato_fecha_solicitud_idx ON public."integracion_instalacion_g3" (id_contrato, fecha_solicitud);

CREATE INDEX IF NOT EXISTS integracion_instalacion_g3_id_empresa_codigo_ot_g3_idx ON public."integracion_instalacion_g3" (id_empresa, codigo_ot_g3);

CREATE INDEX IF NOT EXISTS integracion_instalacion_g3_id_empresa_estado_integracion_fecha_ ON public."integracion_instalacion_g3" (id_empresa, estado_integracion, fecha_solicitud);

CREATE INDEX IF NOT EXISTS integracion_instalacion_g3_id_empresa_id_ot_g3_idx ON public."integracion_instalacion_g3" (id_empresa, id_ot_g3);

CREATE INDEX IF NOT EXISTS idx_observacion_operativa_entidad ON public."observacion_operativa" (tipo_entidad, id_entidad);

CREATE INDEX IF NOT EXISTS idx_orden_trabajo_id_prospecto ON public."orden_trabajo" (id_prospecto);

CREATE INDEX IF NOT EXISTS plan_zona_precio_id_plan_id_zona_pago_idx ON public."plan_zona_precio" (id_plan, id_zona_pago);

CREATE INDEX IF NOT EXISTS plan_zona_precio_id_zona_pago_activo_fechas_idx ON public."plan_zona_precio" (id_zona_pago, activo, fecha_inicio, fecha_fin);

CREATE INDEX IF NOT EXISTS prorroga_pago_id_empresa_estado_nueva_fecha_idx ON public."prorroga_pago" (id_empresa, estado, nueva_fecha);

CREATE INDEX IF NOT EXISTS prorroga_pago_id_factura_fecha_registro_idx ON public."prorroga_pago" (id_factura, fecha_registro);

CREATE INDEX IF NOT EXISTS prospecto_id_empresa_clasificacion_comercial_idx ON public."prospecto" (id_empresa, clasificacion_comercial);

CREATE INDEX IF NOT EXISTS prospecto_id_empresa_id_zona_pago_idx ON public."prospecto" (id_empresa, id_zona_pago);

CREATE INDEX IF NOT EXISTS idx_solicitud_cliente_cliente ON public."solicitud_cliente" (id_cliente);

CREATE INDEX IF NOT EXISTS idx_solicitud_cliente_servicio ON public."solicitud_cliente" (id_servicio);

CREATE INDEX IF NOT EXISTS solicitud_retiro_empresa_estado_fecha_idx ON public."solicitud_retiro_servicio" (id_empresa, estado, fecha_solicitada);

CREATE INDEX IF NOT EXISTS solicitud_retiro_servicio_id_servicio_created_at_idx ON public."solicitud_retiro_servicio" (id_servicio, created_at);

CREATE INDEX IF NOT EXISTS zona_pago_fecha_inicio_fecha_fin_idx ON public."zona_pago" (fecha_inicio, fecha_fin);

CREATE INDEX IF NOT EXISTS zona_pago_id_empresa_tipo_zona_activo_idx ON public."zona_pago" (id_empresa, tipo_zona, activo);

CREATE INDEX IF NOT EXISTS zona_pago_id_zona_padre_idx ON public."zona_pago" (id_zona_padre);

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.asignacion_equipo_servicio'::regclass AND conname='fk_asignacion_unidad') THEN ALTER TABLE public."asignacion_equipo_servicio" ADD CONSTRAINT fk_asignacion_unidad
        FOREIGN KEY (id_unidad) REFERENCES unidad_equipo (id_unidad) NOT VALID; END IF; END $$;
ALTER TABLE public."asignacion_equipo_servicio" VALIDATE CONSTRAINT "fk_asignacion_unidad";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.cambio_condicion_pago'::regclass AND conname='cambio_condicion_pago_id_cliente_fkey') THEN ALTER TABLE public."cambio_condicion_pago" ADD CONSTRAINT cambio_condicion_pago_id_cliente_fkey
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente) ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."cambio_condicion_pago" VALIDATE CONSTRAINT "cambio_condicion_pago_id_cliente_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.cambio_condicion_pago'::regclass AND conname='cambio_condicion_pago_id_contrato_fkey') THEN ALTER TABLE public."cambio_condicion_pago" ADD CONSTRAINT cambio_condicion_pago_id_contrato_fkey
        FOREIGN KEY (id_contrato) REFERENCES contrato (id_contrato) ON DELETE SET NULL ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."cambio_condicion_pago" VALIDATE CONSTRAINT "cambio_condicion_pago_id_contrato_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.cambio_condicion_pago'::regclass AND conname='cambio_condicion_pago_id_empresa_fkey') THEN ALTER TABLE public."cambio_condicion_pago" ADD CONSTRAINT cambio_condicion_pago_id_empresa_fkey
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa) ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."cambio_condicion_pago" VALIDATE CONSTRAINT "cambio_condicion_pago_id_empresa_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.cambio_condicion_pago'::regclass AND conname='cambio_condicion_pago_id_factura_fkey') THEN ALTER TABLE public."cambio_condicion_pago" ADD CONSTRAINT cambio_condicion_pago_id_factura_fkey
        FOREIGN KEY (id_factura) REFERENCES factura (id_factura) ON DELETE SET NULL ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."cambio_condicion_pago" VALIDATE CONSTRAINT "cambio_condicion_pago_id_factura_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.cambio_condicion_pago'::regclass AND conname='cambio_condicion_pago_id_usuario_responsable_fkey') THEN ALTER TABLE public."cambio_condicion_pago" ADD CONSTRAINT cambio_condicion_pago_id_usuario_responsable_fkey
        FOREIGN KEY (id_usuario_responsable) REFERENCES usuario (id_usuario) ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."cambio_condicion_pago" VALIDATE CONSTRAINT "cambio_condicion_pago_id_usuario_responsable_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.cargo_adicional'::regclass AND conname='cargo_adicional_id_cliente_fkey') THEN ALTER TABLE public."cargo_adicional" ADD CONSTRAINT cargo_adicional_id_cliente_fkey
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente) ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."cargo_adicional" VALIDATE CONSTRAINT "cargo_adicional_id_cliente_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.cargo_adicional'::regclass AND conname='cargo_adicional_id_contrato_fkey') THEN ALTER TABLE public."cargo_adicional" ADD CONSTRAINT cargo_adicional_id_contrato_fkey
        FOREIGN KEY (id_contrato) REFERENCES contrato (id_contrato) ON DELETE SET NULL ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."cargo_adicional" VALIDATE CONSTRAINT "cargo_adicional_id_contrato_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.cargo_adicional'::regclass AND conname='cargo_adicional_id_empresa_fkey') THEN ALTER TABLE public."cargo_adicional" ADD CONSTRAINT cargo_adicional_id_empresa_fkey
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa) ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."cargo_adicional" VALIDATE CONSTRAINT "cargo_adicional_id_empresa_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.cargo_adicional'::regclass AND conname='cargo_adicional_id_servicio_fkey') THEN ALTER TABLE public."cargo_adicional" ADD CONSTRAINT cargo_adicional_id_servicio_fkey
        FOREIGN KEY (id_servicio) REFERENCES servicio_contratado (id_servicio) ON DELETE SET NULL ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."cargo_adicional" VALIDATE CONSTRAINT "cargo_adicional_id_servicio_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.cargo_adicional'::regclass AND conname='cargo_adicional_id_usuario_responsable_fkey') THEN ALTER TABLE public."cargo_adicional" ADD CONSTRAINT cargo_adicional_id_usuario_responsable_fkey
        FOREIGN KEY (id_usuario_responsable) REFERENCES usuario (id_usuario) ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."cargo_adicional" VALIDATE CONSTRAINT "cargo_adicional_id_usuario_responsable_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.contrato'::regclass AND conname='fk_contrato_id_prospecto') THEN ALTER TABLE public."contrato" ADD CONSTRAINT fk_contrato_id_prospecto
        FOREIGN KEY (id_prospecto) REFERENCES prospecto (id_prospecto) NOT VALID; END IF; END $$;
ALTER TABLE public."contrato" VALIDATE CONSTRAINT "fk_contrato_id_prospecto";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.contrato'::regclass AND conname='fk_contrato_id_zona_pago') THEN ALTER TABLE public."contrato" ADD CONSTRAINT fk_contrato_id_zona_pago
        FOREIGN KEY (id_zona_pago) REFERENCES zona_pago (id_zona_pago) NOT VALID; END IF; END $$;
ALTER TABLE public."contrato" VALIDATE CONSTRAINT "fk_contrato_id_zona_pago";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.contrato_digital'::regclass AND conname='fk_contrato_digital_id_cliente') THEN ALTER TABLE public."contrato_digital" ADD CONSTRAINT fk_contrato_digital_id_cliente
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente) NOT VALID; END IF; END $$;
ALTER TABLE public."contrato_digital" VALIDATE CONSTRAINT "fk_contrato_digital_id_cliente";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.contrato_digital'::regclass AND conname='fk_contrato_digital_id_contrato') THEN ALTER TABLE public."contrato_digital" ADD CONSTRAINT fk_contrato_digital_id_contrato
        FOREIGN KEY (id_contrato) REFERENCES contrato (id_contrato) NOT VALID; END IF; END $$;
ALTER TABLE public."contrato_digital" VALIDATE CONSTRAINT "fk_contrato_digital_id_contrato";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.contrato_digital'::regclass AND conname='fk_contrato_digital_id_usuario_generador') THEN ALTER TABLE public."contrato_digital" ADD CONSTRAINT fk_contrato_digital_id_usuario_generador
        FOREIGN KEY (id_usuario_generador) REFERENCES usuario (id_usuario) NOT VALID; END IF; END $$;
ALTER TABLE public."contrato_digital" VALIDATE CONSTRAINT "fk_contrato_digital_id_usuario_generador";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.convenio_pago'::regclass AND conname='convenio_pago_id_cliente_fkey') THEN ALTER TABLE public."convenio_pago" ADD CONSTRAINT convenio_pago_id_cliente_fkey
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente) ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."convenio_pago" VALIDATE CONSTRAINT "convenio_pago_id_cliente_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.convenio_pago'::regclass AND conname='convenio_pago_id_contrato_fkey') THEN ALTER TABLE public."convenio_pago" ADD CONSTRAINT convenio_pago_id_contrato_fkey
        FOREIGN KEY (id_contrato) REFERENCES contrato (id_contrato) ON DELETE SET NULL ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."convenio_pago" VALIDATE CONSTRAINT "convenio_pago_id_contrato_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.convenio_pago'::regclass AND conname='convenio_pago_id_empresa_fkey') THEN ALTER TABLE public."convenio_pago" ADD CONSTRAINT convenio_pago_id_empresa_fkey
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa) ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."convenio_pago" VALIDATE CONSTRAINT "convenio_pago_id_empresa_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.convenio_pago'::regclass AND conname='convenio_pago_id_factura_fkey') THEN ALTER TABLE public."convenio_pago" ADD CONSTRAINT convenio_pago_id_factura_fkey
        FOREIGN KEY (id_factura) REFERENCES factura (id_factura) ON DELETE SET NULL ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."convenio_pago" VALIDATE CONSTRAINT "convenio_pago_id_factura_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.convenio_pago'::regclass AND conname='convenio_pago_id_servicio_fkey') THEN ALTER TABLE public."convenio_pago" ADD CONSTRAINT convenio_pago_id_servicio_fkey
        FOREIGN KEY (id_servicio) REFERENCES servicio_contratado (id_servicio) ON DELETE SET NULL ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."convenio_pago" VALIDATE CONSTRAINT "convenio_pago_id_servicio_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.convenio_pago'::regclass AND conname='convenio_pago_id_usuario_aprobador_fkey') THEN ALTER TABLE public."convenio_pago" ADD CONSTRAINT convenio_pago_id_usuario_aprobador_fkey
        FOREIGN KEY (id_usuario_aprobador) REFERENCES usuario (id_usuario) ON DELETE SET NULL ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."convenio_pago" VALIDATE CONSTRAINT "convenio_pago_id_usuario_aprobador_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.convenio_pago'::regclass AND conname='convenio_pago_id_usuario_responsable_fkey') THEN ALTER TABLE public."convenio_pago" ADD CONSTRAINT convenio_pago_id_usuario_responsable_fkey
        FOREIGN KEY (id_usuario_responsable) REFERENCES usuario (id_usuario) ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."convenio_pago" VALIDATE CONSTRAINT "convenio_pago_id_usuario_responsable_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.cuota_convenio_pago'::regclass AND conname='cuota_convenio_pago_id_convenio_fkey') THEN ALTER TABLE public."cuota_convenio_pago" ADD CONSTRAINT cuota_convenio_pago_id_convenio_fkey
        FOREIGN KEY (id_convenio) REFERENCES convenio_pago (id_convenio) ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."cuota_convenio_pago" VALIDATE CONSTRAINT "cuota_convenio_pago_id_convenio_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.documento_tributario_externo'::regclass AND conname='documento_tributario_externo_cargo_fkey') THEN ALTER TABLE public."documento_tributario_externo" ADD CONSTRAINT documento_tributario_externo_cargo_fkey
        FOREIGN KEY (id_cargo_adicional) REFERENCES cargo_adicional (id_cargo) ON DELETE SET NULL ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."documento_tributario_externo" VALIDATE CONSTRAINT "documento_tributario_externo_cargo_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.documento_tributario_externo'::regclass AND conname='documento_tributario_externo_cliente_fkey') THEN ALTER TABLE public."documento_tributario_externo" ADD CONSTRAINT documento_tributario_externo_cliente_fkey
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente) ON DELETE SET NULL ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."documento_tributario_externo" VALIDATE CONSTRAINT "documento_tributario_externo_cliente_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.documento_tributario_externo'::regclass AND conname='documento_tributario_externo_contrato_fkey') THEN ALTER TABLE public."documento_tributario_externo" ADD CONSTRAINT documento_tributario_externo_contrato_fkey
        FOREIGN KEY (id_contrato) REFERENCES contrato (id_contrato) ON DELETE SET NULL ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."documento_tributario_externo" VALIDATE CONSTRAINT "documento_tributario_externo_contrato_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.documento_tributario_externo'::regclass AND conname='documento_tributario_externo_empresa_fkey') THEN ALTER TABLE public."documento_tributario_externo" ADD CONSTRAINT documento_tributario_externo_empresa_fkey
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa) ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."documento_tributario_externo" VALIDATE CONSTRAINT "documento_tributario_externo_empresa_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.documento_tributario_externo'::regclass AND conname='documento_tributario_externo_factura_fkey') THEN ALTER TABLE public."documento_tributario_externo" ADD CONSTRAINT documento_tributario_externo_factura_fkey
        FOREIGN KEY (id_factura) REFERENCES factura (id_factura) ON DELETE SET NULL ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."documento_tributario_externo" VALIDATE CONSTRAINT "documento_tributario_externo_factura_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.documento_tributario_externo'::regclass AND conname='documento_tributario_externo_usuario_fkey') THEN ALTER TABLE public."documento_tributario_externo" ADD CONSTRAINT documento_tributario_externo_usuario_fkey
        FOREIGN KEY (id_usuario_registro) REFERENCES usuario (id_usuario) ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."documento_tributario_externo" VALIDATE CONSTRAINT "documento_tributario_externo_usuario_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.donacion_detalle'::regclass AND conname='fk_donacion_detalle_donacion') THEN ALTER TABLE public."donacion_detalle" ADD CONSTRAINT fk_donacion_detalle_donacion
        FOREIGN KEY (id_donacion) REFERENCES donacion (id_donacion) NOT VALID; END IF; END $$;
ALTER TABLE public."donacion_detalle" VALIDATE CONSTRAINT "fk_donacion_detalle_donacion";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.donacion_detalle'::regclass AND conname='fk_donacion_detalle_unidad') THEN ALTER TABLE public."donacion_detalle" ADD CONSTRAINT fk_donacion_detalle_unidad
        FOREIGN KEY (id_unidad) REFERENCES unidad_equipo (id_unidad) NOT VALID; END IF; END $$;
ALTER TABLE public."donacion_detalle" VALIDATE CONSTRAINT "fk_donacion_detalle_unidad";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.evento_gestion_comercial'::regclass AND conname='evento_gestion_comercial_id_cliente_fkey') THEN ALTER TABLE public."evento_gestion_comercial" ADD CONSTRAINT evento_gestion_comercial_id_cliente_fkey
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente) ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."evento_gestion_comercial" VALIDATE CONSTRAINT "evento_gestion_comercial_id_cliente_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.evento_gestion_comercial'::regclass AND conname='evento_gestion_comercial_id_contrato_fkey') THEN ALTER TABLE public."evento_gestion_comercial" ADD CONSTRAINT evento_gestion_comercial_id_contrato_fkey
        FOREIGN KEY (id_contrato) REFERENCES contrato (id_contrato) ON DELETE SET NULL ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."evento_gestion_comercial" VALIDATE CONSTRAINT "evento_gestion_comercial_id_contrato_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.evento_gestion_comercial'::regclass AND conname='evento_gestion_comercial_id_empresa_fkey') THEN ALTER TABLE public."evento_gestion_comercial" ADD CONSTRAINT evento_gestion_comercial_id_empresa_fkey
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa) ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."evento_gestion_comercial" VALIDATE CONSTRAINT "evento_gestion_comercial_id_empresa_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.evento_gestion_comercial'::regclass AND conname='evento_gestion_comercial_id_factura_fkey') THEN ALTER TABLE public."evento_gestion_comercial" ADD CONSTRAINT evento_gestion_comercial_id_factura_fkey
        FOREIGN KEY (id_factura) REFERENCES factura (id_factura) ON DELETE SET NULL ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."evento_gestion_comercial" VALIDATE CONSTRAINT "evento_gestion_comercial_id_factura_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.evento_gestion_comercial'::regclass AND conname='evento_gestion_comercial_id_servicio_fkey') THEN ALTER TABLE public."evento_gestion_comercial" ADD CONSTRAINT evento_gestion_comercial_id_servicio_fkey
        FOREIGN KEY (id_servicio) REFERENCES servicio_contratado (id_servicio) ON DELETE SET NULL ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."evento_gestion_comercial" VALIDATE CONSTRAINT "evento_gestion_comercial_id_servicio_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.evento_gestion_comercial'::regclass AND conname='evento_gestion_comercial_id_usuario_responsable_fkey') THEN ALTER TABLE public."evento_gestion_comercial" ADD CONSTRAINT evento_gestion_comercial_id_usuario_responsable_fkey
        FOREIGN KEY (id_usuario_responsable) REFERENCES usuario (id_usuario) ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."evento_gestion_comercial" VALIDATE CONSTRAINT "evento_gestion_comercial_id_usuario_responsable_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.garantia_comercial'::regclass AND conname='garantia_comercial_cliente_fkey') THEN ALTER TABLE public."garantia_comercial" ADD CONSTRAINT garantia_comercial_cliente_fkey
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente) ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."garantia_comercial" VALIDATE CONSTRAINT "garantia_comercial_cliente_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.garantia_comercial'::regclass AND conname='garantia_comercial_contrato_fkey') THEN ALTER TABLE public."garantia_comercial" ADD CONSTRAINT garantia_comercial_contrato_fkey
        FOREIGN KEY (id_contrato) REFERENCES contrato (id_contrato) ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."garantia_comercial" VALIDATE CONSTRAINT "garantia_comercial_contrato_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.garantia_comercial'::regclass AND conname='garantia_comercial_empresa_fkey') THEN ALTER TABLE public."garantia_comercial" ADD CONSTRAINT garantia_comercial_empresa_fkey
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa) ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."garantia_comercial" VALIDATE CONSTRAINT "garantia_comercial_empresa_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.garantia_comercial'::regclass AND conname='garantia_comercial_servicio_fkey') THEN ALTER TABLE public."garantia_comercial" ADD CONSTRAINT garantia_comercial_servicio_fkey
        FOREIGN KEY (id_servicio) REFERENCES servicio_contratado (id_servicio) ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."garantia_comercial" VALIDATE CONSTRAINT "garantia_comercial_servicio_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.garantia_comercial'::regclass AND conname='garantia_comercial_responsable_fkey') THEN ALTER TABLE public."garantia_comercial" ADD CONSTRAINT garantia_comercial_responsable_fkey
        FOREIGN KEY (id_usuario_responsable) REFERENCES usuario (id_usuario) ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."garantia_comercial" VALIDATE CONSTRAINT "garantia_comercial_responsable_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.historial_cambio_plan'::regclass AND conname='fk_historial_cambio_plan_id_cliente') THEN ALTER TABLE public."historial_cambio_plan" ADD CONSTRAINT fk_historial_cambio_plan_id_cliente
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente) NOT VALID; END IF; END $$;
ALTER TABLE public."historial_cambio_plan" VALIDATE CONSTRAINT "fk_historial_cambio_plan_id_cliente";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.historial_cambio_plan'::regclass AND conname='fk_historial_cambio_plan_id_contrato') THEN ALTER TABLE public."historial_cambio_plan" ADD CONSTRAINT fk_historial_cambio_plan_id_contrato
        FOREIGN KEY (id_contrato) REFERENCES contrato (id_contrato) NOT VALID; END IF; END $$;
ALTER TABLE public."historial_cambio_plan" VALIDATE CONSTRAINT "fk_historial_cambio_plan_id_contrato";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.historial_cambio_plan'::regclass AND conname='fk_historial_cambio_plan_id_plan_anterior') THEN ALTER TABLE public."historial_cambio_plan" ADD CONSTRAINT fk_historial_cambio_plan_id_plan_anterior
        FOREIGN KEY (id_plan_anterior) REFERENCES plan (id_plan) NOT VALID; END IF; END $$;
ALTER TABLE public."historial_cambio_plan" VALIDATE CONSTRAINT "fk_historial_cambio_plan_id_plan_anterior";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.historial_cambio_plan'::regclass AND conname='fk_historial_cambio_plan_id_plan_nuevo') THEN ALTER TABLE public."historial_cambio_plan" ADD CONSTRAINT fk_historial_cambio_plan_id_plan_nuevo
        FOREIGN KEY (id_plan_nuevo) REFERENCES plan (id_plan) NOT VALID; END IF; END $$;
ALTER TABLE public."historial_cambio_plan" VALIDATE CONSTRAINT "fk_historial_cambio_plan_id_plan_nuevo";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.integracion_activacion_g1'::regclass AND conname='integracion_activacion_g1_cliente_fkey') THEN ALTER TABLE public."integracion_activacion_g1" ADD CONSTRAINT integracion_activacion_g1_cliente_fkey
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente) ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."integracion_activacion_g1" VALIDATE CONSTRAINT "integracion_activacion_g1_cliente_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.integracion_activacion_g1'::regclass AND conname='integracion_activacion_g1_contrato_fkey') THEN ALTER TABLE public."integracion_activacion_g1" ADD CONSTRAINT integracion_activacion_g1_contrato_fkey
        FOREIGN KEY (id_contrato) REFERENCES contrato (id_contrato) ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."integracion_activacion_g1" VALIDATE CONSTRAINT "integracion_activacion_g1_contrato_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.integracion_activacion_g1'::regclass AND conname='integracion_activacion_g1_empresa_fkey') THEN ALTER TABLE public."integracion_activacion_g1" ADD CONSTRAINT integracion_activacion_g1_empresa_fkey
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa) ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."integracion_activacion_g1" VALIDATE CONSTRAINT "integracion_activacion_g1_empresa_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.integracion_activacion_g1'::regclass AND conname='integracion_activacion_g1_servicio_fkey') THEN ALTER TABLE public."integracion_activacion_g1" ADD CONSTRAINT integracion_activacion_g1_servicio_fkey
        FOREIGN KEY (id_servicio) REFERENCES servicio_contratado (id_servicio) ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."integracion_activacion_g1" VALIDATE CONSTRAINT "integracion_activacion_g1_servicio_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.integracion_evento_entrante'::regclass AND conname='integracion_evento_entrante_id_integracion_fkey') THEN ALTER TABLE public."integracion_evento_entrante" ADD CONSTRAINT integracion_evento_entrante_id_integracion_fkey
        FOREIGN KEY (id_integracion) REFERENCES integracion_instalacion_g3 (id_integracion) ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."integracion_evento_entrante" VALIDATE CONSTRAINT "integracion_evento_entrante_id_integracion_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.integracion_instalacion_g3'::regclass AND conname='integracion_instalacion_g3_id_cliente_fkey') THEN ALTER TABLE public."integracion_instalacion_g3" ADD CONSTRAINT integracion_instalacion_g3_id_cliente_fkey
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente) ON DELETE SET NULL ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."integracion_instalacion_g3" VALIDATE CONSTRAINT "integracion_instalacion_g3_id_cliente_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.integracion_instalacion_g3'::regclass AND conname='integracion_instalacion_g3_id_contrato_fkey') THEN ALTER TABLE public."integracion_instalacion_g3" ADD CONSTRAINT integracion_instalacion_g3_id_contrato_fkey
        FOREIGN KEY (id_contrato) REFERENCES contrato (id_contrato) ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."integracion_instalacion_g3" VALIDATE CONSTRAINT "integracion_instalacion_g3_id_contrato_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.integracion_instalacion_g3'::regclass AND conname='integracion_instalacion_g3_id_empresa_fkey') THEN ALTER TABLE public."integracion_instalacion_g3" ADD CONSTRAINT integracion_instalacion_g3_id_empresa_fkey
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa) ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."integracion_instalacion_g3" VALIDATE CONSTRAINT "integracion_instalacion_g3_id_empresa_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.integracion_instalacion_g3'::regclass AND conname='integracion_instalacion_g3_id_plan_fkey') THEN ALTER TABLE public."integracion_instalacion_g3" ADD CONSTRAINT integracion_instalacion_g3_id_plan_fkey
        FOREIGN KEY (id_plan) REFERENCES plan (id_plan) ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."integracion_instalacion_g3" VALIDATE CONSTRAINT "integracion_instalacion_g3_id_plan_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.integracion_instalacion_g3'::regclass AND conname='integracion_instalacion_g3_id_prospecto_fkey') THEN ALTER TABLE public."integracion_instalacion_g3" ADD CONSTRAINT integracion_instalacion_g3_id_prospecto_fkey
        FOREIGN KEY (id_prospecto) REFERENCES prospecto (id_prospecto) ON DELETE SET NULL ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."integracion_instalacion_g3" VALIDATE CONSTRAINT "integracion_instalacion_g3_id_prospecto_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.integracion_instalacion_g3'::regclass AND conname='integracion_instalacion_g3_id_servicio_fkey') THEN ALTER TABLE public."integracion_instalacion_g3" ADD CONSTRAINT integracion_instalacion_g3_id_servicio_fkey
        FOREIGN KEY (id_servicio) REFERENCES servicio_contratado (id_servicio) ON DELETE SET NULL ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."integracion_instalacion_g3" VALIDATE CONSTRAINT "integracion_instalacion_g3_id_servicio_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.observacion_operativa'::regclass AND conname='fk_observacion_operativa_id_usuario') THEN ALTER TABLE public."observacion_operativa" ADD CONSTRAINT fk_observacion_operativa_id_usuario
        FOREIGN KEY (id_usuario) REFERENCES usuario (id_usuario) NOT VALID; END IF; END $$;
ALTER TABLE public."observacion_operativa" VALIDATE CONSTRAINT "fk_observacion_operativa_id_usuario";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.orden_ingreso'::regclass AND conname='fk_oi_bodega') THEN ALTER TABLE public."orden_ingreso" ADD CONSTRAINT fk_oi_bodega
        FOREIGN KEY (id_bodega_destino) REFERENCES bodega (id_bodega) NOT VALID; END IF; END $$;
ALTER TABLE public."orden_ingreso" VALIDATE CONSTRAINT "fk_oi_bodega";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.orden_ingreso_detalle'::regclass AND conname='fk_oid_orden') THEN ALTER TABLE public."orden_ingreso_detalle" ADD CONSTRAINT fk_oid_orden
        FOREIGN KEY (id_orden) REFERENCES orden_ingreso (id_orden) ON DELETE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."orden_ingreso_detalle" VALIDATE CONSTRAINT "fk_oid_orden";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.orden_ingreso_detalle'::regclass AND conname='fk_oid_tipo_equipo') THEN ALTER TABLE public."orden_ingreso_detalle" ADD CONSTRAINT fk_oid_tipo_equipo
        FOREIGN KEY (id_tipo_equipo) REFERENCES tipo_equipo (id_tipo_equipo) NOT VALID; END IF; END $$;
ALTER TABLE public."orden_ingreso_detalle" VALIDATE CONSTRAINT "fk_oid_tipo_equipo";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.orden_trabajo'::regclass AND conname='fk_orden_trabajo_id_prospecto') THEN ALTER TABLE public."orden_trabajo" ADD CONSTRAINT fk_orden_trabajo_id_prospecto
        FOREIGN KEY (id_prospecto) REFERENCES prospecto (id_prospecto) NOT VALID; END IF; END $$;
ALTER TABLE public."orden_trabajo" VALIDATE CONSTRAINT "fk_orden_trabajo_id_prospecto";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.orden_trabajo'::regclass AND conname='fk_orden_trabajo_id_servicio') THEN ALTER TABLE public."orden_trabajo" ADD CONSTRAINT fk_orden_trabajo_id_servicio
        FOREIGN KEY (id_servicio) REFERENCES servicio_contratado (id_servicio) NOT VALID; END IF; END $$;
ALTER TABLE public."orden_trabajo" VALIDATE CONSTRAINT "fk_orden_trabajo_id_servicio";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.plan_zona_precio'::regclass AND conname='fk_plan_zona_precio_id_plan') THEN ALTER TABLE public."plan_zona_precio" ADD CONSTRAINT fk_plan_zona_precio_id_plan
        FOREIGN KEY (id_plan) REFERENCES plan (id_plan) NOT VALID; END IF; END $$;
ALTER TABLE public."plan_zona_precio" VALIDATE CONSTRAINT "fk_plan_zona_precio_id_plan";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.plan_zona_precio'::regclass AND conname='fk_plan_zona_precio_id_zona_pago') THEN ALTER TABLE public."plan_zona_precio" ADD CONSTRAINT fk_plan_zona_precio_id_zona_pago
        FOREIGN KEY (id_zona_pago) REFERENCES zona_pago (id_zona_pago) NOT VALID; END IF; END $$;
ALTER TABLE public."plan_zona_precio" VALIDATE CONSTRAINT "fk_plan_zona_precio_id_zona_pago";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.prestamo_detalle'::regclass AND conname='fk_prestamo_detalle_prestamo') THEN ALTER TABLE public."prestamo_detalle" ADD CONSTRAINT fk_prestamo_detalle_prestamo
        FOREIGN KEY (id_prestamo) REFERENCES prestamo_externo (id_prestamo) ON DELETE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."prestamo_detalle" VALIDATE CONSTRAINT "fk_prestamo_detalle_prestamo";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.prestamo_detalle'::regclass AND conname='fk_prestamo_detalle_unidad') THEN ALTER TABLE public."prestamo_detalle" ADD CONSTRAINT fk_prestamo_detalle_unidad
        FOREIGN KEY (id_unidad) REFERENCES unidad_equipo (id_unidad) NOT VALID; END IF; END $$;
ALTER TABLE public."prestamo_detalle" VALIDATE CONSTRAINT "fk_prestamo_detalle_unidad";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.prestamo_retorno'::regclass AND conname='fk_prestamo_retorno_detalle') THEN ALTER TABLE public."prestamo_retorno" ADD CONSTRAINT fk_prestamo_retorno_detalle
        FOREIGN KEY (id_detalle) REFERENCES prestamo_detalle (id_detalle) ON DELETE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."prestamo_retorno" VALIDATE CONSTRAINT "fk_prestamo_retorno_detalle";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.prorroga_pago'::regclass AND conname='prorroga_pago_id_cliente_fkey') THEN ALTER TABLE public."prorroga_pago" ADD CONSTRAINT prorroga_pago_id_cliente_fkey
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente) ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."prorroga_pago" VALIDATE CONSTRAINT "prorroga_pago_id_cliente_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.prorroga_pago'::regclass AND conname='prorroga_pago_id_contrato_fkey') THEN ALTER TABLE public."prorroga_pago" ADD CONSTRAINT prorroga_pago_id_contrato_fkey
        FOREIGN KEY (id_contrato) REFERENCES contrato (id_contrato) ON DELETE SET NULL ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."prorroga_pago" VALIDATE CONSTRAINT "prorroga_pago_id_contrato_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.prorroga_pago'::regclass AND conname='prorroga_pago_id_empresa_fkey') THEN ALTER TABLE public."prorroga_pago" ADD CONSTRAINT prorroga_pago_id_empresa_fkey
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa) ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."prorroga_pago" VALIDATE CONSTRAINT "prorroga_pago_id_empresa_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.prorroga_pago'::regclass AND conname='prorroga_pago_id_factura_fkey') THEN ALTER TABLE public."prorroga_pago" ADD CONSTRAINT prorroga_pago_id_factura_fkey
        FOREIGN KEY (id_factura) REFERENCES factura (id_factura) ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."prorroga_pago" VALIDATE CONSTRAINT "prorroga_pago_id_factura_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.prorroga_pago'::regclass AND conname='prorroga_pago_id_usuario_responsable_fkey') THEN ALTER TABLE public."prorroga_pago" ADD CONSTRAINT prorroga_pago_id_usuario_responsable_fkey
        FOREIGN KEY (id_usuario_responsable) REFERENCES usuario (id_usuario) ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."prorroga_pago" VALIDATE CONSTRAINT "prorroga_pago_id_usuario_responsable_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.prospecto'::regclass AND conname='fk_prospecto_id_usuario_perdida') THEN ALTER TABLE public."prospecto" ADD CONSTRAINT fk_prospecto_id_usuario_perdida
        FOREIGN KEY (id_usuario_perdida) REFERENCES usuario (id_usuario) NOT VALID; END IF; END $$;
ALTER TABLE public."prospecto" VALIDATE CONSTRAINT "fk_prospecto_id_usuario_perdida";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.prospecto'::regclass AND conname='prospecto_id_zona_pago_fkey') THEN ALTER TABLE public."prospecto" ADD CONSTRAINT prospecto_id_zona_pago_fkey
        FOREIGN KEY (id_zona_pago) REFERENCES zona_pago (id_zona_pago) ON DELETE SET NULL ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."prospecto" VALIDATE CONSTRAINT "prospecto_id_zona_pago_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.proveedor_tipo_equipo'::regclass AND conname='fk_pte_proveedor') THEN ALTER TABLE public."proveedor_tipo_equipo" ADD CONSTRAINT fk_pte_proveedor
        FOREIGN KEY (id_proveedor) REFERENCES proveedor (id_proveedor) ON DELETE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."proveedor_tipo_equipo" VALIDATE CONSTRAINT "fk_pte_proveedor";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.proveedor_tipo_equipo'::regclass AND conname='fk_pte_tipo_equipo') THEN ALTER TABLE public."proveedor_tipo_equipo" ADD CONSTRAINT fk_pte_tipo_equipo
        FOREIGN KEY (id_tipo_equipo) REFERENCES tipo_equipo (id_tipo_equipo) ON DELETE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."proveedor_tipo_equipo" VALIDATE CONSTRAINT "fk_pte_tipo_equipo";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.salida_detalle'::regclass AND conname='fk_salida_detalle_salida') THEN ALTER TABLE public."salida_detalle" ADD CONSTRAINT fk_salida_detalle_salida
        FOREIGN KEY (id_salida) REFERENCES salida_bodega (id_salida) ON DELETE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."salida_detalle" VALIDATE CONSTRAINT "fk_salida_detalle_salida";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.servicio_contratado'::regclass AND conname='fk_servicio_contratado_id_cliente') THEN ALTER TABLE public."servicio_contratado" ADD CONSTRAINT fk_servicio_contratado_id_cliente
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente) NOT VALID; END IF; END $$;
ALTER TABLE public."servicio_contratado" VALIDATE CONSTRAINT "fk_servicio_contratado_id_cliente";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.servicio_contratado'::regclass AND conname='fk_servicio_contratado_id_contrato') THEN ALTER TABLE public."servicio_contratado" ADD CONSTRAINT fk_servicio_contratado_id_contrato
        FOREIGN KEY (id_contrato) REFERENCES contrato (id_contrato) NOT VALID; END IF; END $$;
ALTER TABLE public."servicio_contratado" VALIDATE CONSTRAINT "fk_servicio_contratado_id_contrato";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.servicio_contratado'::regclass AND conname='fk_servicio_contratado_id_direccion') THEN ALTER TABLE public."servicio_contratado" ADD CONSTRAINT fk_servicio_contratado_id_direccion
        FOREIGN KEY (id_direccion) REFERENCES direccion_servicio (id_direccion) NOT VALID; END IF; END $$;
ALTER TABLE public."servicio_contratado" VALIDATE CONSTRAINT "fk_servicio_contratado_id_direccion";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.servicio_contratado'::regclass AND conname='fk_servicio_contratado_id_empresa') THEN ALTER TABLE public."servicio_contratado" ADD CONSTRAINT fk_servicio_contratado_id_empresa
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa) NOT VALID; END IF; END $$;
ALTER TABLE public."servicio_contratado" VALIDATE CONSTRAINT "fk_servicio_contratado_id_empresa";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.servicio_contratado'::regclass AND conname='fk_servicio_contratado_id_zona_pago') THEN ALTER TABLE public."servicio_contratado" ADD CONSTRAINT fk_servicio_contratado_id_zona_pago
        FOREIGN KEY (id_zona_pago) REFERENCES zona_pago (id_zona_pago) NOT VALID; END IF; END $$;
ALTER TABLE public."servicio_contratado" VALIDATE CONSTRAINT "fk_servicio_contratado_id_zona_pago";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.solicitud_baja'::regclass AND conname='fk_solicitud_baja_unidad') THEN ALTER TABLE public."solicitud_baja" ADD CONSTRAINT fk_solicitud_baja_unidad
        FOREIGN KEY (id_unidad) REFERENCES unidad_equipo (id_unidad) NOT VALID; END IF; END $$;
ALTER TABLE public."solicitud_baja" VALIDATE CONSTRAINT "fk_solicitud_baja_unidad";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.solicitud_cliente'::regclass AND conname='fk_solicitud_cliente_id_cliente') THEN ALTER TABLE public."solicitud_cliente" ADD CONSTRAINT fk_solicitud_cliente_id_cliente
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente) NOT VALID; END IF; END $$;
ALTER TABLE public."solicitud_cliente" VALIDATE CONSTRAINT "fk_solicitud_cliente_id_cliente";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.solicitud_cliente'::regclass AND conname='fk_solicitud_cliente_id_empresa') THEN ALTER TABLE public."solicitud_cliente" ADD CONSTRAINT fk_solicitud_cliente_id_empresa
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa) NOT VALID; END IF; END $$;
ALTER TABLE public."solicitud_cliente" VALIDATE CONSTRAINT "fk_solicitud_cliente_id_empresa";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.solicitud_cliente'::regclass AND conname='fk_solicitud_cliente_id_servicio') THEN ALTER TABLE public."solicitud_cliente" ADD CONSTRAINT fk_solicitud_cliente_id_servicio
        FOREIGN KEY (id_servicio) REFERENCES servicio_contratado (id_servicio) NOT VALID; END IF; END $$;
ALTER TABLE public."solicitud_cliente" VALIDATE CONSTRAINT "fk_solicitud_cliente_id_servicio";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.solicitud_cliente'::regclass AND conname='fk_solicitud_cliente_id_usuario_registro') THEN ALTER TABLE public."solicitud_cliente" ADD CONSTRAINT fk_solicitud_cliente_id_usuario_registro
        FOREIGN KEY (id_usuario_registro) REFERENCES usuario (id_usuario) NOT VALID; END IF; END $$;
ALTER TABLE public."solicitud_cliente" VALIDATE CONSTRAINT "fk_solicitud_cliente_id_usuario_registro";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.solicitud_retiro_servicio'::regclass AND conname='solicitud_retiro_servicio_id_cliente_fkey') THEN ALTER TABLE public."solicitud_retiro_servicio" ADD CONSTRAINT solicitud_retiro_servicio_id_cliente_fkey
        FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente) ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."solicitud_retiro_servicio" VALIDATE CONSTRAINT "solicitud_retiro_servicio_id_cliente_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.solicitud_retiro_servicio'::regclass AND conname='solicitud_retiro_servicio_id_contrato_fkey') THEN ALTER TABLE public."solicitud_retiro_servicio" ADD CONSTRAINT solicitud_retiro_servicio_id_contrato_fkey
        FOREIGN KEY (id_contrato) REFERENCES contrato (id_contrato) ON DELETE SET NULL ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."solicitud_retiro_servicio" VALIDATE CONSTRAINT "solicitud_retiro_servicio_id_contrato_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.solicitud_retiro_servicio'::regclass AND conname='solicitud_retiro_servicio_id_empresa_fkey') THEN ALTER TABLE public."solicitud_retiro_servicio" ADD CONSTRAINT solicitud_retiro_servicio_id_empresa_fkey
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa) ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."solicitud_retiro_servicio" VALIDATE CONSTRAINT "solicitud_retiro_servicio_id_empresa_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.solicitud_retiro_servicio'::regclass AND conname='solicitud_retiro_servicio_id_servicio_fkey') THEN ALTER TABLE public."solicitud_retiro_servicio" ADD CONSTRAINT solicitud_retiro_servicio_id_servicio_fkey
        FOREIGN KEY (id_servicio) REFERENCES servicio_contratado (id_servicio) ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."solicitud_retiro_servicio" VALIDATE CONSTRAINT "solicitud_retiro_servicio_id_servicio_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.solicitud_retiro_servicio'::regclass AND conname='solicitud_retiro_servicio_id_usuario_responsable_fkey') THEN ALTER TABLE public."solicitud_retiro_servicio" ADD CONSTRAINT solicitud_retiro_servicio_id_usuario_responsable_fkey
        FOREIGN KEY (id_usuario_responsable) REFERENCES usuario (id_usuario) ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."solicitud_retiro_servicio" VALIDATE CONSTRAINT "solicitud_retiro_servicio_id_usuario_responsable_fkey";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.ticket'::regclass AND conname='fk_ticket_id_servicio') THEN ALTER TABLE public."ticket" ADD CONSTRAINT fk_ticket_id_servicio
        FOREIGN KEY (id_servicio) REFERENCES servicio_contratado (id_servicio) NOT VALID; END IF; END $$;
ALTER TABLE public."ticket" VALIDATE CONSTRAINT "fk_ticket_id_servicio";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.unidad_equipo'::regclass AND conname='fk_unidad_equipo_id_servicio') THEN ALTER TABLE public."unidad_equipo" ADD CONSTRAINT fk_unidad_equipo_id_servicio
        FOREIGN KEY (id_servicio) REFERENCES servicio_contratado (id_servicio) NOT VALID; END IF; END $$;
ALTER TABLE public."unidad_equipo" VALIDATE CONSTRAINT "fk_unidad_equipo_id_servicio";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.zona_pago'::regclass AND conname='fk_zona_pago_id_empresa') THEN ALTER TABLE public."zona_pago" ADD CONSTRAINT fk_zona_pago_id_empresa
        FOREIGN KEY (id_empresa) REFERENCES empresa (id_empresa) NOT VALID; END IF; END $$;
ALTER TABLE public."zona_pago" VALIDATE CONSTRAINT "fk_zona_pago_id_empresa";

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.zona_pago'::regclass AND conname='zona_pago_id_zona_padre_fkey') THEN ALTER TABLE public."zona_pago" ADD CONSTRAINT zona_pago_id_zona_padre_fkey
        FOREIGN KEY (id_zona_padre) REFERENCES zona_pago (id_zona_pago) ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID; END IF; END $$;
ALTER TABLE public."zona_pago" VALIDATE CONSTRAINT "zona_pago_id_zona_padre_fkey";


-- Revision residual: el script no elimina extras ni inventa backfills.

COMMIT;
