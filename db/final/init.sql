-- CRM Finet & Cable Magico Litoral - Grupo 8
-- Esquema PostgreSQL consolidado al cierre del Incremento 3.
-- Generado: 2026-09-28. Compatible y validado con PostgreSQL 15.
-- Incluye estructura, restricciones, indices y secuencias; no contiene datos,
-- seeds, PII, credenciales ni el historial tecnico _prisma_migrations.
-- Fuente: scripts db/init y migraciones Prisma hasta
-- 20260928120000_i3_g1_multiunit_api_key_readiness.
-- Debe restaurarse sobre una base de datos vacia con psql -v ON_ERROR_STOP=1.

--
-- PostgreSQL database dump
--

\restrict 3CrDfEYtjrJWelw5rIHZs4kdB3Gsj7Ce6jUeEoL7gIcOXJTsrltAs9qr1qeNATU

-- Dumped from database version 15.18
-- Dumped by pg_dump version 15.18

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: baja_equipo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.baja_equipo (
    id_baja integer NOT NULL,
    id_unidad integer,
    id_usuario integer,
    motivo_baja text NOT NULL,
    tipo_baja character varying(20),
    donacion_destinatario character varying(150),
    fecha_baja date
);


--
-- Name: baja_equipo_id_baja_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.baja_equipo_id_baja_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: baja_equipo_id_baja_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.baja_equipo_id_baja_seq OWNED BY public.baja_equipo.id_baja;


--
-- Name: bodega; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bodega (
    id_bodega integer NOT NULL,
    id_empresa integer,
    nombre character varying(60) NOT NULL,
    direccion character varying(200),
    activa boolean DEFAULT true
);


--
-- Name: bodega_id_bodega_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bodega_id_bodega_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bodega_id_bodega_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bodega_id_bodega_seq OWNED BY public.bodega.id_bodega;


--
-- Name: caja_nap; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.caja_nap (
    id_caja_nap integer NOT NULL,
    id_empresa integer,
    id_mufa integer,
    identificador_unico character varying(50),
    numero_poste character varying(30),
    zona character varying(80),
    capacidad_puertos smallint,
    latitud numeric(9,6),
    longitud numeric(9,6)
);


--
-- Name: caja_nap_id_caja_nap_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.caja_nap_id_caja_nap_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: caja_nap_id_caja_nap_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.caja_nap_id_caja_nap_seq OWNED BY public.caja_nap.id_caja_nap;


--
-- Name: cambio_condicion_pago; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cambio_condicion_pago (
    id_cambio integer NOT NULL,
    id_empresa integer NOT NULL,
    id_cliente integer NOT NULL,
    id_contrato integer,
    id_factura integer,
    tipo_cambio character varying(30) NOT NULL,
    valor_anterior character varying(40) NOT NULL,
    valor_nuevo character varying(40) NOT NULL,
    justificacion text NOT NULL,
    id_usuario_responsable integer NOT NULL,
    fecha_registro timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT cambio_condicion_pago_tipo_check CHECK (((tipo_cambio)::text = ANY ((ARRAY['DIA_PAGO'::character varying, 'FECHA_COMPROMETIDA'::character varying])::text[])))
);


--
-- Name: cambio_condicion_pago_id_cambio_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cambio_condicion_pago_id_cambio_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cambio_condicion_pago_id_cambio_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cambio_condicion_pago_id_cambio_seq OWNED BY public.cambio_condicion_pago.id_cambio;


--
-- Name: canal_whatsapp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.canal_whatsapp (
    id_canal integer NOT NULL,
    id_empresa integer,
    numero_telefono character varying(20),
    nombre_canal character varying(80),
    activo boolean DEFAULT true
);


--
-- Name: canal_whatsapp_id_canal_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.canal_whatsapp_id_canal_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: canal_whatsapp_id_canal_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.canal_whatsapp_id_canal_seq OWNED BY public.canal_whatsapp.id_canal;


--
-- Name: cargo_adicional; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cargo_adicional (
    id_cargo integer NOT NULL,
    id_empresa integer NOT NULL,
    id_cliente integer NOT NULL,
    id_contrato integer,
    id_servicio integer,
    tipo character varying(30) NOT NULL,
    monto numeric(12,2) NOT NULL,
    fecha date NOT NULL,
    estado character varying(30) DEFAULT 'PENDIENTE_FACTURACION'::character varying NOT NULL,
    afecta_saldo boolean DEFAULT false NOT NULL,
    observacion text,
    id_usuario_responsable integer NOT NULL,
    fecha_registro timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT cargo_adicional_estado_check CHECK (((estado)::text = ANY ((ARRAY['PENDIENTE_FACTURACION'::character varying, 'FACTURADO'::character varying, 'ANULADO'::character varying])::text[]))),
    CONSTRAINT cargo_adicional_monto_check CHECK ((monto > (0)::numeric)),
    CONSTRAINT cargo_adicional_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['REPOSICION'::character varying, 'RECONEXION'::character varying, 'RETIRO'::character varying, 'OTRO'::character varying])::text[])))
);


--
-- Name: cargo_adicional_id_cargo_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cargo_adicional_id_cargo_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cargo_adicional_id_cargo_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cargo_adicional_id_cargo_seq OWNED BY public.cargo_adicional.id_cargo;


--
-- Name: categoria_falla; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categoria_falla (
    id_categoria integer NOT NULL,
    nombre character varying(80) NOT NULL,
    sla_horas smallint
);


--
-- Name: categoria_falla_id_categoria_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.categoria_falla_id_categoria_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: categoria_falla_id_categoria_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.categoria_falla_id_categoria_seq OWNED BY public.categoria_falla.id_categoria;


--
-- Name: cliente; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cliente (
    id_cliente integer NOT NULL,
    id_empresa integer,
    rut character varying(12),
    nombre_completo character varying(120) NOT NULL,
    email character varying(120),
    telefono character varying(20),
    password_portal_hash character varying(72),
    estado character varying(40) NOT NULL,
    es_conflictivo boolean DEFAULT false,
    importado_masivo boolean DEFAULT false,
    origen_contacto character varying(40),
    datos_tecnicos jsonb,
    fecha_creacion timestamp without time zone DEFAULT now(),
    obs_conflictivo text
);


--
-- Name: cliente_id_cliente_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cliente_id_cliente_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cliente_id_cliente_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cliente_id_cliente_seq OWNED BY public.cliente.id_cliente;


--
-- Name: configuracion_seo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.configuracion_seo (
    id_seo integer NOT NULL,
    id_empresa integer NOT NULL,
    seccion_url character varying(200) NOT NULL,
    meta_titulo character varying(70),
    meta_descripcion character varying(160),
    og_tags jsonb,
    fecha_actualizacion timestamp without time zone DEFAULT now()
);


--
-- Name: configuracion_seo_id_seo_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.configuracion_seo_id_seo_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: configuracion_seo_id_seo_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.configuracion_seo_id_seo_seq OWNED BY public.configuracion_seo.id_seo;


--
-- Name: consentimiento_cookies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consentimiento_cookies (
    id_consentimiento bigint NOT NULL,
    id_cliente integer,
    ip_anonimizada character varying(45),
    version_documento character varying(20),
    fecha_aceptacion timestamp without time zone,
    acepto boolean NOT NULL
);


--
-- Name: consentimiento_cookies_id_consentimiento_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.consentimiento_cookies_id_consentimiento_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: consentimiento_cookies_id_consentimiento_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.consentimiento_cookies_id_consentimiento_seq OWNED BY public.consentimiento_cookies.id_consentimiento;


--
-- Name: contrato; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contrato (
    id_contrato integer NOT NULL,
    id_cliente integer,
    id_plan integer,
    id_empresa integer,
    fecha_inicio date NOT NULL,
    dia_vencimiento smallint NOT NULL,
    estado character varying(40) NOT NULL,
    fecha_suspension date,
    id_zona_pago integer,
    proveedor_contrato character varying(40),
    numero_contrato_externo character varying(80),
    folio_contrato_externo character varying(80),
    url_contrato_pdf text,
    fecha_generacion_contrato date,
    fecha_envio_cliente date,
    observacion_contrato text,
    fecha_firma_manual date,
    id_usuario_firma_manual integer,
    observacion_firma_manual text,
    id_prospecto integer,
    direccion_instalacion character varying(200),
    comuna_instalacion character varying(80),
    ciudad_instalacion character varying(80)
);


--
-- Name: contrato_digital; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contrato_digital (
    id_contrato_digital integer NOT NULL,
    id_contrato integer NOT NULL,
    id_cliente integer,
    id_empresa integer,
    url_documento text NOT NULL,
    hash_documento character varying(128) NOT NULL,
    estado_firma character varying(30) NOT NULL,
    fecha_generacion timestamp without time zone DEFAULT now(),
    fecha_firma timestamp without time zone,
    id_usuario_generador integer,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: contrato_digital_id_contrato_digital_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.contrato_digital_id_contrato_digital_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: contrato_digital_id_contrato_digital_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.contrato_digital_id_contrato_digital_seq OWNED BY public.contrato_digital.id_contrato_digital;


--
-- Name: contrato_id_contrato_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.contrato_id_contrato_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: contrato_id_contrato_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.contrato_id_contrato_seq OWNED BY public.contrato.id_contrato;


--
-- Name: convenio_pago; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.convenio_pago (
    id_convenio integer NOT NULL,
    id_empresa integer NOT NULL,
    id_cliente integer NOT NULL,
    id_servicio integer,
    id_contrato integer,
    id_factura integer,
    monto_comprometido numeric(12,2) NOT NULL,
    cantidad_cuotas smallint NOT NULL,
    condiciones text NOT NULL,
    fecha_inicio date NOT NULL,
    estado character varying(20) DEFAULT 'PENDIENTE'::character varying NOT NULL,
    id_usuario_responsable integer NOT NULL,
    id_usuario_aprobador integer,
    fecha_registro timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_aprobacion timestamp(3) with time zone,
    CONSTRAINT convenio_pago_cuotas_check CHECK ((cantidad_cuotas > 0)),
    CONSTRAINT convenio_pago_estado_check CHECK (((estado)::text = ANY ((ARRAY['PENDIENTE'::character varying, 'APROBADO'::character varying, 'ACTIVO'::character varying, 'CUMPLIDO'::character varying, 'INCUMPLIDO'::character varying, 'CANCELADO'::character varying])::text[]))),
    CONSTRAINT convenio_pago_monto_check CHECK ((monto_comprometido > (0)::numeric))
);


--
-- Name: convenio_pago_id_convenio_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.convenio_pago_id_convenio_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: convenio_pago_id_convenio_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.convenio_pago_id_convenio_seq OWNED BY public.convenio_pago.id_convenio;


--
-- Name: conversacion_bot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversacion_bot (
    id_conversacion integer NOT NULL,
    id_cliente integer,
    id_canal_wa integer,
    plataforma character varying(20),
    fecha_inicio timestamp without time zone,
    fecha_fin timestamp without time zone,
    derivada_humano boolean DEFAULT false
);


--
-- Name: conversacion_bot_id_conversacion_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.conversacion_bot_id_conversacion_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: conversacion_bot_id_conversacion_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.conversacion_bot_id_conversacion_seq OWNED BY public.conversacion_bot.id_conversacion;


--
-- Name: cotizacion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cotizacion (
    id_cotizacion integer NOT NULL,
    id_prospecto integer,
    id_plan integer,
    pdf_url text,
    fecha_envio timestamp without time zone,
    factibilidad_verificada boolean DEFAULT false
);


--
-- Name: cotizacion_id_cotizacion_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cotizacion_id_cotizacion_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cotizacion_id_cotizacion_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cotizacion_id_cotizacion_seq OWNED BY public.cotizacion.id_cotizacion;


--
-- Name: credenciales_tvip; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credenciales_tvip (
    id_credencial integer NOT NULL,
    id_contrato integer,
    usuario_tvip character varying(80),
    password_tvip_hash character varying(72),
    fecha_generacion timestamp without time zone
);


--
-- Name: credenciales_tvip_id_credencial_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.credenciales_tvip_id_credencial_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: credenciales_tvip_id_credencial_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.credenciales_tvip_id_credencial_seq OWNED BY public.credenciales_tvip.id_credencial;


--
-- Name: cuota_convenio_pago; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cuota_convenio_pago (
    id_cuota integer NOT NULL,
    id_convenio integer NOT NULL,
    numero smallint NOT NULL,
    monto numeric(12,2) NOT NULL,
    fecha_vencimiento date NOT NULL,
    estado character varying(20) DEFAULT 'PENDIENTE'::character varying NOT NULL,
    fecha_pago date,
    CONSTRAINT cuota_convenio_pago_estado_check CHECK (((estado)::text = ANY ((ARRAY['PENDIENTE'::character varying, 'PAGADA'::character varying, 'VENCIDA'::character varying, 'CANCELADA'::character varying])::text[]))),
    CONSTRAINT cuota_convenio_pago_monto_check CHECK ((monto > (0)::numeric)),
    CONSTRAINT cuota_convenio_pago_numero_check CHECK ((numero > 0))
);


--
-- Name: cuota_convenio_pago_id_cuota_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cuota_convenio_pago_id_cuota_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cuota_convenio_pago_id_cuota_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cuota_convenio_pago_id_cuota_seq OWNED BY public.cuota_convenio_pago.id_cuota;


--
-- Name: detalle_orden_ingreso; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.detalle_orden_ingreso (
    id_detalle integer NOT NULL,
    id_orden integer,
    id_tipo_equipo integer,
    cantidad_solicitada integer NOT NULL,
    cantidad_recibida integer DEFAULT 0
);


--
-- Name: detalle_orden_ingreso_id_detalle_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.detalle_orden_ingreso_id_detalle_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: detalle_orden_ingreso_id_detalle_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.detalle_orden_ingreso_id_detalle_seq OWNED BY public.detalle_orden_ingreso.id_detalle;


--
-- Name: direccion_servicio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.direccion_servicio (
    id_direccion integer NOT NULL,
    id_cliente integer,
    direccion_completa character varying(200) NOT NULL,
    comuna character varying(80) NOT NULL,
    ciudad character varying(80),
    es_principal boolean DEFAULT true
);


--
-- Name: direccion_servicio_id_direccion_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.direccion_servicio_id_direccion_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: direccion_servicio_id_direccion_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.direccion_servicio_id_direccion_seq OWNED BY public.direccion_servicio.id_direccion;


--
-- Name: documento_tributario_externo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documento_tributario_externo (
    id_documento integer NOT NULL,
    id_empresa integer NOT NULL,
    tipo_documento character varying(20) NOT NULL,
    folio_o_numero character varying(80) NOT NULL,
    folio_normalizado character varying(80) NOT NULL,
    emisor_proveedor character varying(160) NOT NULL,
    emisor_normalizado character varying(160) NOT NULL,
    fecha_emision date NOT NULL,
    monto_neto numeric(14,2),
    monto_exento numeric(14,2),
    iva numeric(14,2),
    monto_total numeric(14,2) NOT NULL,
    url_documento text,
    referencia_externa character varying(200),
    estado character varying(20) DEFAULT 'REGISTRADO'::character varying NOT NULL,
    fuente character varying(30) DEFAULT 'EXTERNO_MANUAL'::character varying NOT NULL,
    id_cliente integer,
    id_contrato integer,
    id_factura integer,
    id_cargo_adicional integer,
    id_usuario_registro integer NOT NULL,
    fecha_registro timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_actualizacion timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT documento_tributario_externo_estado_check CHECK (((estado)::text = ANY ((ARRAY['REGISTRADO'::character varying, 'ANULADO'::character varying])::text[]))),
    CONSTRAINT documento_tributario_externo_fuente_check CHECK (((fuente)::text = 'EXTERNO_MANUAL'::text)),
    CONSTRAINT documento_tributario_externo_montos_check CHECK (((monto_total >= (0)::numeric) AND ((monto_neto IS NULL) OR (monto_neto >= (0)::numeric)) AND ((monto_exento IS NULL) OR (monto_exento >= (0)::numeric)) AND ((iva IS NULL) OR (iva >= (0)::numeric)))),
    CONSTRAINT documento_tributario_externo_tipo_check CHECK (((tipo_documento)::text = ANY ((ARRAY['BOLETA'::character varying, 'FACTURA'::character varying])::text[])))
);


--
-- Name: documento_tributario_externo_id_documento_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.documento_tributario_externo_id_documento_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: documento_tributario_externo_id_documento_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.documento_tributario_externo_id_documento_seq OWNED BY public.documento_tributario_externo.id_documento;


--
-- Name: empresa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.empresa (
    id_empresa integer NOT NULL,
    nombre character varying(100) NOT NULL,
    rut_empresa character varying(12),
    esquema_db character varying(50)
);


--
-- Name: empresa_id_empresa_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.empresa_id_empresa_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: empresa_id_empresa_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.empresa_id_empresa_seq OWNED BY public.empresa.id_empresa;


--
-- Name: evento_gestion_comercial; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evento_gestion_comercial (
    id_evento integer NOT NULL,
    id_empresa integer NOT NULL,
    id_cliente integer NOT NULL,
    id_servicio integer,
    id_contrato integer,
    id_factura integer,
    tipo character varying(40) NOT NULL,
    canal character varying(20) NOT NULL,
    estado_gestion character varying(30) DEFAULT 'REGISTRADO'::character varying NOT NULL,
    fecha timestamp(3) with time zone NOT NULL,
    observacion text,
    id_usuario_responsable integer NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT evento_gestion_comercial_canal_check CHECK (((canal)::text = ANY ((ARRAY['TELEFONO'::character varying, 'EMAIL'::character varying, 'WHATSAPP'::character varying, 'PRESENCIAL'::character varying, 'OTRO'::character varying])::text[]))),
    CONSTRAINT evento_gestion_comercial_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['AVISO_PREVENTIVO'::character varying, 'ULTIMO_AVISO_CORTE'::character varying, 'AVISO_PREVIO_RETIRO'::character varying, 'CONTACTO_CLIENTE'::character varying, 'OTRO_EVENTO_COMERCIAL'::character varying])::text[])))
);


--
-- Name: evento_gestion_comercial_id_evento_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.evento_gestion_comercial_id_evento_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: evento_gestion_comercial_id_evento_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.evento_gestion_comercial_id_evento_seq OWNED BY public.evento_gestion_comercial.id_evento;


--
-- Name: evidencia_foto; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evidencia_foto (
    id_foto integer NOT NULL,
    id_ot integer,
    url_cloudinary text NOT NULL,
    formato character varying(5),
    tamano_kb integer,
    fecha_subida timestamp without time zone
);


--
-- Name: evidencia_foto_id_foto_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.evidencia_foto_id_foto_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: evidencia_foto_id_foto_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.evidencia_foto_id_foto_seq OWNED BY public.evidencia_foto.id_foto;


--
-- Name: factura; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.factura (
    id_factura integer NOT NULL,
    id_contrato integer,
    periodo_mes smallint NOT NULL,
    periodo_anio smallint NOT NULL,
    monto numeric(10,2),
    fecha_emision date,
    fecha_limite_pago date NOT NULL,
    estado character varying(20) NOT NULL,
    tipo_documento character varying(30),
    folio_externo character varying(80)
);


--
-- Name: factura_id_factura_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.factura_id_factura_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: factura_id_factura_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.factura_id_factura_seq OWNED BY public.factura.id_factura;


--
-- Name: garantia_comercial; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.garantia_comercial (
    id_garantia integer NOT NULL,
    id_empresa integer NOT NULL,
    id_cliente integer NOT NULL,
    id_servicio integer NOT NULL,
    id_contrato integer NOT NULL,
    numero_serie_equipo character varying(80),
    tipo character varying(60) NOT NULL,
    fecha_inicio date NOT NULL,
    fecha_termino date NOT NULL,
    cobertura text NOT NULL,
    monto numeric(12,2),
    observaciones text,
    estado character varying(20) DEFAULT 'ACTIVA'::character varying NOT NULL,
    id_usuario_responsable integer NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: garantia_comercial_id_garantia_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.garantia_comercial_id_garantia_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: garantia_comercial_id_garantia_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.garantia_comercial_id_garantia_seq OWNED BY public.garantia_comercial.id_garantia;


--
-- Name: historial_cambio_plan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.historial_cambio_plan (
    id_cambio_plan integer NOT NULL,
    id_contrato integer NOT NULL,
    id_cliente integer,
    id_empresa integer,
    id_plan_anterior integer,
    id_plan_nuevo integer NOT NULL,
    fecha_efectiva date NOT NULL,
    motivo text NOT NULL,
    observaciones text,
    precio_anterior numeric(10,2),
    precio_nuevo numeric(10,2),
    id_usuario_registro integer,
    fecha_registro timestamp without time zone DEFAULT now(),
    estado_cambio character varying(20) DEFAULT 'Aplicado'::character varying NOT NULL,
    fecha_aplicacion timestamp without time zone
);


--
-- Name: historial_cambio_plan_id_cambio_plan_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.historial_cambio_plan_id_cambio_plan_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: historial_cambio_plan_id_cambio_plan_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.historial_cambio_plan_id_cambio_plan_seq OWNED BY public.historial_cambio_plan.id_cambio_plan;


--
-- Name: historial_conexion_ont; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.historial_conexion_ont (
    id_historial_ont bigint NOT NULL,
    id_unidad integer,
    evento character varying(15),
    "timestamp" timestamp without time zone DEFAULT now()
);


--
-- Name: historial_conexion_ont_id_historial_ont_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.historial_conexion_ont_id_historial_ont_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: historial_conexion_ont_id_historial_ont_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.historial_conexion_ont_id_historial_ont_seq OWNED BY public.historial_conexion_ont.id_historial_ont;


--
-- Name: historial_estado_equipo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.historial_estado_equipo (
    id_historial bigint NOT NULL,
    id_unidad integer,
    id_usuario integer,
    estado_anterior character varying(30),
    estado_nuevo character varying(30),
    motivo text,
    fecha_hora timestamp without time zone DEFAULT now()
);


--
-- Name: historial_estado_equipo_id_historial_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.historial_estado_equipo_id_historial_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: historial_estado_equipo_id_historial_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.historial_estado_equipo_id_historial_seq OWNED BY public.historial_estado_equipo.id_historial;


--
-- Name: historial_ot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.historial_ot (
    id_historial_ot bigint NOT NULL,
    id_ot integer,
    id_usuario integer,
    estado_anterior character varying(25),
    estado_nuevo character varying(25),
    observaciones text,
    fecha_hora timestamp without time zone
);


--
-- Name: historial_ot_id_historial_ot_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.historial_ot_id_historial_ot_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: historial_ot_id_historial_ot_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.historial_ot_id_historial_ot_seq OWNED BY public.historial_ot.id_historial_ot;


--
-- Name: integracion_activacion_g1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integracion_activacion_g1 (
    id_integracion integer NOT NULL,
    id_empresa integer NOT NULL,
    id_cliente integer NOT NULL,
    id_servicio integer NOT NULL,
    id_contrato integer NOT NULL,
    id_ot_g3 character varying(100) NOT NULL,
    numero_serie character varying(80),
    event_id character varying(120) NOT NULL,
    trace_id character varying(120) NOT NULL,
    estado_integracion character varying(50) DEFAULT 'PENDIENTE_ENVIO'::character varying NOT NULL,
    intentos integer DEFAULT 0 NOT NULL,
    ultimo_intento timestamp(3) without time zone,
    ultimo_error_sanitizado character varying(500),
    payload_hash character(64) NOT NULL,
    respuesta_estado_g1 jsonb,
    fecha_completado timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    numeros_serie text[] DEFAULT ARRAY[]::text[] NOT NULL
);


--
-- Name: integracion_activacion_g1_id_integracion_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.integracion_activacion_g1_id_integracion_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: integracion_activacion_g1_id_integracion_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.integracion_activacion_g1_id_integracion_seq OWNED BY public.integracion_activacion_g1.id_integracion;


--
-- Name: integracion_evento_entrante; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integracion_evento_entrante (
    id_evento integer NOT NULL,
    id_integracion integer NOT NULL,
    source character varying(30) NOT NULL,
    event_type character varying(50) NOT NULL,
    external_reference character varying(120) NOT NULL,
    payload_hash character(64) NOT NULL,
    processed_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    result jsonb
);


--
-- Name: integracion_evento_entrante_id_evento_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.integracion_evento_entrante_id_evento_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: integracion_evento_entrante_id_evento_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.integracion_evento_entrante_id_evento_seq OWNED BY public.integracion_evento_entrante.id_evento;


--
-- Name: integracion_instalacion_g3; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integracion_instalacion_g3 (
    id_integracion integer NOT NULL,
    id_empresa integer NOT NULL,
    id_prospecto integer,
    id_cliente integer,
    id_contrato integer NOT NULL,
    id_plan integer NOT NULL,
    id_servicio integer,
    request_id uuid NOT NULL,
    trace_id uuid NOT NULL,
    id_ot_g3 character varying(100),
    codigo_ot_g3 character varying(100),
    estado_integracion character varying(30) DEFAULT 'PENDIENTE_ENVIO'::character varying NOT NULL,
    estado_ot_g3 character varying(50),
    estado_original_g3 character varying(100),
    fecha_solicitud timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ultimo_intento timestamp(3) without time zone,
    fecha_ultima_sincronizacion timestamp(3) without time zone,
    intentos integer DEFAULT 0 NOT NULL,
    ultimo_error_sanitizado text,
    payload_hash character(64) NOT NULL,
    payload_snapshot jsonb NOT NULL,
    fecha_cierre_procesado timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT integracion_instalacion_g3_estado_check CHECK (((estado_integracion)::text = ANY ((ARRAY['PENDIENTE_ENVIO'::character varying, 'ENVIADA'::character varying, 'EN_SEGUIMIENTO'::character varying, 'COMPLETADA'::character varying, 'FALLIDA_REINTENTABLE'::character varying, 'FALLIDA_DEFINITIVA'::character varying])::text[]))),
    CONSTRAINT integracion_instalacion_g3_intentos_check CHECK ((intentos >= 0))
);


--
-- Name: integracion_instalacion_g3_id_integracion_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.integracion_instalacion_g3_id_integracion_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: integracion_instalacion_g3_id_integracion_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.integracion_instalacion_g3_id_integracion_seq OWNED BY public.integracion_instalacion_g3.id_integracion;


--
-- Name: intento_fallido; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.intento_fallido (
    id_intento bigint NOT NULL,
    id_empresa integer,
    ip_address inet NOT NULL,
    rut_intentado character varying(12),
    "timestamp" timestamp without time zone DEFAULT now(),
    bloqueado_hasta timestamp without time zone
);


--
-- Name: intento_fallido_id_intento_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.intento_fallido_id_intento_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: intento_fallido_id_intento_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.intento_fallido_id_intento_seq OWNED BY public.intento_fallido.id_intento;


--
-- Name: lista_negra; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lista_negra (
    id_vetado integer NOT NULL,
    id_cliente integer,
    rut_vetado character varying(12) NOT NULL,
    direccion_vetada text,
    motivo text NOT NULL,
    fecha_registro date,
    id_usuario_registro integer
);


--
-- Name: lista_negra_id_vetado_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.lista_negra_id_vetado_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: lista_negra_id_vetado_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.lista_negra_id_vetado_seq OWNED BY public.lista_negra.id_vetado;


--
-- Name: llamada_cortes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.llamada_cortes (
    id_llamada integer NOT NULL,
    id_ot integer,
    resultado character varying(15) NOT NULL,
    observaciones text,
    fecha_llamada timestamp without time zone
);


--
-- Name: llamada_cortes_id_llamada_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.llamada_cortes_id_llamada_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: llamada_cortes_id_llamada_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.llamada_cortes_id_llamada_seq OWNED BY public.llamada_cortes.id_llamada;


--
-- Name: log_auditoria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.log_auditoria (
    id_log bigint NOT NULL,
    id_usuario integer,
    accion character varying(100) NOT NULL,
    entidad_afectada character varying(80),
    id_entidad_afectada integer,
    valor_anterior jsonb,
    valor_nuevo jsonb,
    ip_origen inet,
    fecha_hora timestamp without time zone DEFAULT now()
);


--
-- Name: log_auditoria_id_log_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.log_auditoria_id_log_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: log_auditoria_id_log_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.log_auditoria_id_log_seq OWNED BY public.log_auditoria.id_log;


--
-- Name: log_notificacion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.log_notificacion (
    id_notificacion bigint NOT NULL,
    id_cliente integer,
    id_plantilla integer,
    canal character varying(20),
    fecha_envio timestamp without time zone,
    estado_envio character varying(20)
);


--
-- Name: log_notificacion_id_notificacion_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.log_notificacion_id_notificacion_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: log_notificacion_id_notificacion_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.log_notificacion_id_notificacion_seq OWNED BY public.log_notificacion.id_notificacion;


--
-- Name: mensaje_bot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mensaje_bot (
    id_mensaje bigint NOT NULL,
    id_conversacion integer,
    rol character varying(15),
    contenido text,
    "timestamp" timestamp without time zone DEFAULT now(),
    datos_sensibles boolean
);


--
-- Name: mensaje_bot_id_mensaje_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mensaje_bot_id_mensaje_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mensaje_bot_id_mensaje_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mensaje_bot_id_mensaje_seq OWNED BY public.mensaje_bot.id_mensaje;


--
-- Name: mensaje_whatsapp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mensaje_whatsapp (
    id_mensaje_wa bigint NOT NULL,
    id_canal integer,
    id_cliente integer,
    id_plantilla_wa integer,
    contenido text,
    "timestamp" timestamp without time zone,
    origen character varying(10),
    estado character varying(15)
);


--
-- Name: mensaje_whatsapp_id_mensaje_wa_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mensaje_whatsapp_id_mensaje_wa_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mensaje_whatsapp_id_mensaje_wa_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mensaje_whatsapp_id_mensaje_wa_seq OWNED BY public.mensaje_whatsapp.id_mensaje_wa;


--
-- Name: monitoreo_ont; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.monitoreo_ont (
    id_monitoreo bigint NOT NULL,
    id_unidad integer,
    id_cliente integer,
    id_caja_nap integer,
    potencia_actual_dbm numeric(5,2),
    timestamp_medicion timestamp without time zone DEFAULT now(),
    estado_conexion character varying(15)
);


--
-- Name: monitoreo_ont_id_monitoreo_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.monitoreo_ont_id_monitoreo_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: monitoreo_ont_id_monitoreo_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.monitoreo_ont_id_monitoreo_seq OWNED BY public.monitoreo_ont.id_monitoreo;


--
-- Name: movimiento_inventario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.movimiento_inventario (
    id_movimiento bigint NOT NULL,
    id_tipo_equipo integer,
    id_unidad integer,
    id_empresa_origen integer,
    id_empresa_destino integer,
    id_bodega_origen integer,
    id_bodega_destino integer,
    id_usuario integer,
    tipo_movimiento character varying(30),
    cantidad numeric(10,2) DEFAULT 1,
    fecha timestamp without time zone,
    referencia_id integer
);


--
-- Name: movimiento_inventario_id_movimiento_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.movimiento_inventario_id_movimiento_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: movimiento_inventario_id_movimiento_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.movimiento_inventario_id_movimiento_seq OWNED BY public.movimiento_inventario.id_movimiento;


--
-- Name: mufa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mufa (
    id_mufa integer NOT NULL,
    id_tarjeta_pon integer,
    identificador character varying(50),
    ubicacion character varying(200)
);


--
-- Name: mufa_id_mufa_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mufa_id_mufa_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mufa_id_mufa_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mufa_id_mufa_seq OWNED BY public.mufa.id_mufa;


--
-- Name: observacion_operativa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.observacion_operativa (
    id_observacion integer NOT NULL,
    tipo_entidad character varying(40) NOT NULL,
    id_entidad integer NOT NULL,
    id_cliente integer,
    id_empresa integer,
    id_usuario integer,
    observacion text NOT NULL,
    visibilidad character varying(20) DEFAULT 'Interna'::character varying,
    fecha_creacion timestamp without time zone DEFAULT now()
);


--
-- Name: observacion_operativa_id_observacion_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.observacion_operativa_id_observacion_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: observacion_operativa_id_observacion_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.observacion_operativa_id_observacion_seq OWNED BY public.observacion_operativa.id_observacion;


--
-- Name: olt; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.olt (
    id_olt integer NOT NULL,
    id_empresa integer,
    nombre character varying(80),
    ubicacion character varying(200),
    ip_gestion inet
);


--
-- Name: olt_id_olt_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.olt_id_olt_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: olt_id_olt_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.olt_id_olt_seq OWNED BY public.olt.id_olt;


--
-- Name: orden_ingreso; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orden_ingreso (
    id_orden integer NOT NULL,
    id_proveedor integer,
    id_bodega integer,
    id_empresa integer,
    id_usuario_registro integer,
    fecha_creacion date,
    fecha_recepcion date,
    estado character varying(25),
    factura_proveedor character varying(50)
);


--
-- Name: orden_ingreso_id_orden_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.orden_ingreso_id_orden_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: orden_ingreso_id_orden_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.orden_ingreso_id_orden_seq OWNED BY public.orden_ingreso.id_orden;


--
-- Name: orden_trabajo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orden_trabajo (
    id_ot integer NOT NULL,
    id_empresa integer,
    id_cliente integer,
    id_tecnico integer,
    id_tecnico_externo integer,
    id_direccion integer,
    id_servicio integer,
    id_ticket integer,
    codigo_seguimiento character varying(32),
    tipo_ot character varying(20) NOT NULL,
    prioridad character varying(10) NOT NULL,
    estado character varying(25) NOT NULL,
    fecha_creacion timestamp without time zone,
    fecha_programada date,
    fecha_completada timestamp without time zone,
    potencia_optica_dbm numeric(5,2),
    observaciones text,
    resuelto_remotamente boolean DEFAULT false,
    id_prospecto integer
);


--
-- Name: orden_trabajo_id_ot_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.orden_trabajo_id_ot_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: orden_trabajo_id_ot_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.orden_trabajo_id_ot_seq OWNED BY public.orden_trabajo.id_ot;


--
-- Name: pago; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pago (
    id_pago integer NOT NULL,
    id_factura integer,
    id_cliente integer,
    monto numeric(10,2) NOT NULL,
    fecha_pago timestamp without time zone NOT NULL,
    codigo_transaccion character varying(100),
    pasarela character varying(30) NOT NULL,
    token_transaccional character varying(200),
    comprobante_pdf_url text
);


--
-- Name: pago_id_pago_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pago_id_pago_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pago_id_pago_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pago_id_pago_seq OWNED BY public.pago.id_pago;


--
-- Name: plan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan (
    id_plan integer NOT NULL,
    id_empresa integer,
    nombre_comercial character varying(100) NOT NULL,
    tipo_plan character varying(40) NOT NULL,
    tipo_cliente character varying(20) NOT NULL,
    velocidad_mbps integer,
    precio_mensual numeric(10,2) NOT NULL,
    descripcion text,
    activo boolean DEFAULT true
);


--
-- Name: plan_id_plan_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.plan_id_plan_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: plan_id_plan_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.plan_id_plan_seq OWNED BY public.plan.id_plan;


--
-- Name: plan_zona_precio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_zona_precio (
    id_plan_zona_precio integer NOT NULL,
    id_plan integer NOT NULL,
    id_zona_pago integer NOT NULL,
    precio_mensual numeric(10,2) NOT NULL,
    valor_instalacion numeric(10,2),
    activo boolean DEFAULT true,
    fecha_inicio date,
    fecha_fin date,
    CONSTRAINT plan_zona_precio_vigencia_check CHECK (((fecha_inicio IS NULL) OR (fecha_fin IS NULL) OR (fecha_inicio <= fecha_fin)))
);


--
-- Name: plan_zona_precio_id_plan_zona_precio_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.plan_zona_precio_id_plan_zona_precio_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: plan_zona_precio_id_plan_zona_precio_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.plan_zona_precio_id_plan_zona_precio_seq OWNED BY public.plan_zona_precio.id_plan_zona_precio;


--
-- Name: plantilla_notificacion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plantilla_notificacion (
    id_plantilla integer NOT NULL,
    tipo_evento character varying(60),
    canal character varying(20) NOT NULL,
    contenido_texto text,
    activa boolean DEFAULT true
);


--
-- Name: plantilla_notificacion_id_plantilla_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.plantilla_notificacion_id_plantilla_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: plantilla_notificacion_id_plantilla_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.plantilla_notificacion_id_plantilla_seq OWNED BY public.plantilla_notificacion.id_plantilla;


--
-- Name: plantilla_whatsapp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plantilla_whatsapp (
    id_plantilla_wa integer NOT NULL,
    id_canal integer,
    nombre_plantilla character varying(80),
    contenido text,
    tipo_uso character varying(40)
);


--
-- Name: plantilla_whatsapp_id_plantilla_wa_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.plantilla_whatsapp_id_plantilla_wa_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: plantilla_whatsapp_id_plantilla_wa_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.plantilla_whatsapp_id_plantilla_wa_seq OWNED BY public.plantilla_whatsapp.id_plantilla_wa;


--
-- Name: prestamo_externo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prestamo_externo (
    id_prestamo integer NOT NULL,
    id_unidad integer,
    id_empresa_prestamista integer,
    destinatario character varying(100),
    motivo text,
    fecha_salida date,
    fecha_retorno_esperada date,
    fecha_retorno_real date,
    estado character varying(20),
    condicion_retorno text
);


--
-- Name: prestamo_externo_id_prestamo_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prestamo_externo_id_prestamo_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prestamo_externo_id_prestamo_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prestamo_externo_id_prestamo_seq OWNED BY public.prestamo_externo.id_prestamo;


--
-- Name: prorroga_pago; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prorroga_pago (
    id_prorroga integer NOT NULL,
    id_empresa integer NOT NULL,
    id_cliente integer NOT NULL,
    id_contrato integer,
    id_factura integer NOT NULL,
    fecha_original date NOT NULL,
    nueva_fecha date NOT NULL,
    motivo text NOT NULL,
    estado character varying(20) DEFAULT 'APROBADA'::character varying NOT NULL,
    id_usuario_responsable integer NOT NULL,
    fecha_registro timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT prorroga_pago_estado_check CHECK (((estado)::text = ANY ((ARRAY['PENDIENTE'::character varying, 'APROBADA'::character varying, 'CUMPLIDA'::character varying, 'VENCIDA'::character varying, 'CANCELADA'::character varying])::text[]))),
    CONSTRAINT prorroga_pago_fecha_check CHECK ((nueva_fecha > fecha_original))
);


--
-- Name: prorroga_pago_id_prorroga_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prorroga_pago_id_prorroga_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prorroga_pago_id_prorroga_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prorroga_pago_id_prorroga_seq OWNED BY public.prorroga_pago.id_prorroga;


--
-- Name: prospecto; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prospecto (
    id_prospecto integer NOT NULL,
    id_empresa integer,
    id_usuario_comercial integer,
    id_cliente integer,
    rut character varying(12),
    nombre_completo character varying(120),
    email character varying(120),
    telefono character varying(20),
    direccion character varying(200),
    estado_pipeline character varying(30),
    motivo_perdida character varying(30),
    origen_contacto character varying(40),
    tiempo_conversion_dias integer,
    fecha_creacion timestamp without time zone,
    fecha_conversion date,
    observacion_perdida text,
    fecha_perdida timestamp without time zone,
    id_usuario_perdida integer,
    comuna character varying(80),
    region character varying(80),
    latitud double precision,
    longitud double precision,
    id_zona_pago integer,
    clasificacion_comercial character varying(40) DEFAULT 'PROSPECTO'::character varying NOT NULL,
    disponible_remarketing boolean DEFAULT false NOT NULL,
    CONSTRAINT prospecto_latitud_check CHECK (((latitud IS NULL) OR ((latitud >= ('-90'::integer)::double precision) AND (latitud <= (90)::double precision)))),
    CONSTRAINT prospecto_longitud_check CHECK (((longitud IS NULL) OR ((longitud >= ('-180'::integer)::double precision) AND (longitud <= (180)::double precision))))
);


--
-- Name: prospecto_id_prospecto_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prospecto_id_prospecto_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prospecto_id_prospecto_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prospecto_id_prospecto_seq OWNED BY public.prospecto.id_prospecto;


--
-- Name: proveedor; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proveedor (
    id_proveedor integer NOT NULL,
    nombre_comercial character varying(100) NOT NULL,
    rut_proveedor character varying(12),
    contacto character varying(80),
    telefono character varying(20),
    email character varying(120)
);


--
-- Name: proveedor_id_proveedor_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.proveedor_id_proveedor_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: proveedor_id_proveedor_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.proveedor_id_proveedor_seq OWNED BY public.proveedor.id_proveedor;


--
-- Name: puerto_nap; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.puerto_nap (
    id_puerto integer NOT NULL,
    id_caja_nap integer,
    numero_puerto smallint,
    estado character varying(10),
    id_cliente_asociado integer
);


--
-- Name: puerto_nap_id_puerto_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.puerto_nap_id_puerto_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: puerto_nap_id_puerto_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.puerto_nap_id_puerto_seq OWNED BY public.puerto_nap.id_puerto;


--
-- Name: punto_cobertura; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.punto_cobertura (
    id_punto integer NOT NULL,
    id_empresa integer,
    latitud numeric(9,6) NOT NULL,
    longitud numeric(9,6) NOT NULL,
    densidad_cobertura numeric(5,2),
    tipo_cobertura character varying(20)
);


--
-- Name: punto_cobertura_id_punto_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.punto_cobertura_id_punto_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: punto_cobertura_id_punto_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.punto_cobertura_id_punto_seq OWNED BY public.punto_cobertura.id_punto;


--
-- Name: rol; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rol (
    id_rol integer NOT NULL,
    nombre_rol character varying(50) NOT NULL,
    descripcion text
);


--
-- Name: rol_id_rol_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rol_id_rol_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rol_id_rol_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rol_id_rol_seq OWNED BY public.rol.id_rol;


--
-- Name: servicio_contratado; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.servicio_contratado (
    id_servicio integer NOT NULL,
    id_cliente integer NOT NULL,
    id_empresa integer,
    id_contrato integer,
    id_direccion integer,
    tipo_servicio character varying(40) NOT NULL,
    estado_operativo character varying(30) NOT NULL,
    observaciones text,
    datos_tecnicos jsonb,
    fecha_creacion timestamp without time zone DEFAULT now(),
    id_zona_pago integer,
    fecha_activacion timestamp(3) without time zone
);


--
-- Name: servicio_contratado_id_servicio_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.servicio_contratado_id_servicio_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: servicio_contratado_id_servicio_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.servicio_contratado_id_servicio_seq OWNED BY public.servicio_contratado.id_servicio;


--
-- Name: sesion_portal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sesion_portal (
    id_sesion bigint NOT NULL,
    id_cliente integer,
    token character varying(255) NOT NULL,
    fecha_inicio timestamp without time zone,
    fecha_expiracion timestamp without time zone,
    ip_origen inet
);


--
-- Name: sesion_portal_id_sesion_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sesion_portal_id_sesion_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sesion_portal_id_sesion_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sesion_portal_id_sesion_seq OWNED BY public.sesion_portal.id_sesion;


--
-- Name: solicitud_cliente; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solicitud_cliente (
    id_solicitud integer NOT NULL,
    id_cliente integer,
    id_prospecto integer,
    id_servicio integer,
    id_empresa integer,
    tipo_solicitud character varying(60) NOT NULL,
    canal_origen character varying(40),
    estado character varying(30) NOT NULL,
    factible boolean,
    motivo_no_factible text,
    descripcion text,
    observaciones text,
    id_usuario_registro integer,
    fecha_creacion timestamp without time zone DEFAULT now(),
    fecha_cierre timestamp without time zone
);


--
-- Name: solicitud_cliente_id_solicitud_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.solicitud_cliente_id_solicitud_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: solicitud_cliente_id_solicitud_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.solicitud_cliente_id_solicitud_seq OWNED BY public.solicitud_cliente.id_solicitud;


--
-- Name: solicitud_retiro_servicio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solicitud_retiro_servicio (
    id_solicitud_retiro integer NOT NULL,
    id_empresa integer NOT NULL,
    id_cliente integer NOT NULL,
    id_servicio integer NOT NULL,
    id_contrato integer,
    motivo text NOT NULL,
    fecha_solicitada date NOT NULL,
    estado character varying(30) DEFAULT 'REGISTRADA'::character varying NOT NULL,
    estado_despacho_tecnico character varying(40) DEFAULT 'BLOQUEADO_CONTRATO_G3'::character varying NOT NULL,
    id_usuario_responsable integer NOT NULL,
    observaciones text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT solicitud_retiro_servicio_despacho_check CHECK (((estado_despacho_tecnico)::text = 'BLOQUEADO_CONTRATO_G3'::text)),
    CONSTRAINT solicitud_retiro_servicio_estado_check CHECK (((estado)::text = ANY ((ARRAY['REGISTRADA'::character varying, 'EN_GESTION'::character varying, 'CANCELADA'::character varying, 'CERRADA'::character varying])::text[]))),
    CONSTRAINT solicitud_retiro_servicio_motivo_check CHECK ((length(TRIM(BOTH FROM motivo)) > 0))
);


--
-- Name: solicitud_retiro_servicio_id_solicitud_retiro_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.solicitud_retiro_servicio_id_solicitud_retiro_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: solicitud_retiro_servicio_id_solicitud_retiro_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.solicitud_retiro_servicio_id_solicitud_retiro_seq OWNED BY public.solicitud_retiro_servicio.id_solicitud_retiro;


--
-- Name: stock_consumible; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_consumible (
    id_stock integer NOT NULL,
    id_tipo_equipo integer,
    id_bodega integer,
    cantidad_disponible numeric(10,2) NOT NULL,
    umbral_minimo numeric(10,2)
);


--
-- Name: stock_consumible_id_stock_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_consumible_id_stock_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_consumible_id_stock_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_consumible_id_stock_seq OWNED BY public.stock_consumible.id_stock;


--
-- Name: tarjeta_pon; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tarjeta_pon (
    id_tarjeta integer NOT NULL,
    id_olt integer,
    numero_tarjeta smallint,
    total_puertos smallint
);


--
-- Name: tarjeta_pon_id_tarjeta_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tarjeta_pon_id_tarjeta_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tarjeta_pon_id_tarjeta_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tarjeta_pon_id_tarjeta_seq OWNED BY public.tarjeta_pon.id_tarjeta;


--
-- Name: tecnico_externo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tecnico_externo (
    id_tecnico_ext integer NOT NULL,
    nombre_completo character varying(120) NOT NULL,
    empresa character varying(100),
    telefono character varying(20),
    activo boolean DEFAULT true
);


--
-- Name: tecnico_externo_id_tecnico_ext_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tecnico_externo_id_tecnico_ext_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tecnico_externo_id_tecnico_ext_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tecnico_externo_id_tecnico_ext_seq OWNED BY public.tecnico_externo.id_tecnico_ext;


--
-- Name: ticket; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket (
    id_ticket integer NOT NULL,
    id_cliente integer,
    id_empresa integer,
    id_servicio integer,
    id_usuario_asignado integer,
    id_categoria integer NOT NULL,
    id_conversacion_bot integer,
    codigo_seguimiento character varying(20),
    prioridad character varying(10) NOT NULL,
    estado character varying(20) NOT NULL,
    descripcion text,
    fecha_creacion timestamp without time zone DEFAULT now(),
    fecha_cierre timestamp without time zone,
    origen character varying(20),
    resuelto_remotamente boolean DEFAULT false
);


--
-- Name: ticket_id_ticket_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ticket_id_ticket_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ticket_id_ticket_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ticket_id_ticket_seq OWNED BY public.ticket.id_ticket;


--
-- Name: tipo_equipo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tipo_equipo (
    id_tipo_equipo integer NOT NULL,
    id_empresa integer,
    nombre character varying(100) NOT NULL,
    categoria character varying(40),
    requiere_serie_individual boolean,
    ficha_tecnica_pdf_url text,
    activo boolean DEFAULT true
);


--
-- Name: tipo_equipo_id_tipo_equipo_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tipo_equipo_id_tipo_equipo_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tipo_equipo_id_tipo_equipo_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tipo_equipo_id_tipo_equipo_seq OWNED BY public.tipo_equipo.id_tipo_equipo;


--
-- Name: transferencia_equipo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transferencia_equipo (
    id_transferencia integer NOT NULL,
    id_empresa_origen integer,
    id_empresa_destino integer,
    id_usuario_registro integer,
    fecha_transferencia date,
    observaciones text
);


--
-- Name: transferencia_equipo_id_transferencia_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transferencia_equipo_id_transferencia_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transferencia_equipo_id_transferencia_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transferencia_equipo_id_transferencia_seq OWNED BY public.transferencia_equipo.id_transferencia;


--
-- Name: unidad_equipo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unidad_equipo (
    id_unidad integer NOT NULL,
    id_tipo_equipo integer,
    id_empresa integer,
    numero_serie character varying(80) NOT NULL,
    modelo character varying(80),
    estado character varying(30) NOT NULL,
    fecha_adquisicion date,
    fecha_venc_garantia date,
    diagnostico_tecnico text,
    id_cliente_instalado integer,
    id_servicio integer,
    id_bodega_actual integer,
    numero_poste character varying(30),
    id_caja_nap integer,
    modalidad_asignacion character varying(30),
    valor_arriendo_mensual numeric(10,2),
    fecha_inicio_asignacion date
);


--
-- Name: unidad_equipo_id_unidad_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.unidad_equipo_id_unidad_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: unidad_equipo_id_unidad_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.unidad_equipo_id_unidad_seq OWNED BY public.unidad_equipo.id_unidad;


--
-- Name: uso_material_ot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uso_material_ot (
    id_uso integer NOT NULL,
    id_ot integer,
    id_tipo_equipo integer,
    id_unidad integer,
    cantidad numeric(10,2) NOT NULL
);


--
-- Name: uso_material_ot_id_uso_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.uso_material_ot_id_uso_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: uso_material_ot_id_uso_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.uso_material_ot_id_uso_seq OWNED BY public.uso_material_ot.id_uso;


--
-- Name: usuario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuario (
    id_usuario integer NOT NULL,
    id_empresa integer,
    nombre_completo character varying(80) NOT NULL,
    nombre_usuario character varying(50),
    email character varying(120),
    password_hash character varying(72) NOT NULL,
    activo boolean DEFAULT true,
    fecha_creacion timestamp without time zone DEFAULT now(),
    es_password_temporal boolean DEFAULT true,
    intentos_fallidos integer DEFAULT 0,
    version_sesion integer DEFAULT 0 NOT NULL
);


--
-- Name: usuario_id_usuario_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.usuario_id_usuario_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usuario_id_usuario_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usuario_id_usuario_seq OWNED BY public.usuario.id_usuario;


--
-- Name: usuario_rol; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuario_rol (
    id_usuario_rol integer NOT NULL,
    id_usuario integer,
    id_rol integer NOT NULL,
    fecha_asignacion date DEFAULT now()
);


--
-- Name: usuario_rol_id_usuario_rol_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.usuario_rol_id_usuario_rol_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usuario_rol_id_usuario_rol_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usuario_rol_id_usuario_rol_seq OWNED BY public.usuario_rol.id_usuario_rol;


--
-- Name: zona_pago; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zona_pago (
    id_zona_pago integer NOT NULL,
    id_empresa integer,
    nombre_zona character varying(80) NOT NULL,
    comuna character varying(80),
    descripcion text,
    dia_vencimiento_sugerido smallint,
    activo boolean DEFAULT true,
    tipo_zona character varying(30) DEFAULT 'COBERTURA_GENERAL'::character varying,
    id_zona_padre integer,
    poligono_geojson jsonb,
    centro_lat double precision,
    centro_lng double precision,
    prioridad integer DEFAULT 0 NOT NULL,
    fuente_cobertura character varying(30) DEFAULT 'MANUAL'::character varying,
    fecha_inicio date,
    fecha_fin date,
    CONSTRAINT zona_pago_centro_lat_check CHECK (((centro_lat IS NULL) OR ((centro_lat >= ('-90'::integer)::double precision) AND (centro_lat <= (90)::double precision)))),
    CONSTRAINT zona_pago_centro_lng_check CHECK (((centro_lng IS NULL) OR ((centro_lng >= ('-180'::integer)::double precision) AND (centro_lng <= (180)::double precision)))),
    CONSTRAINT zona_pago_padre_distinto_check CHECK (((id_zona_padre IS NULL) OR (id_zona_padre <> id_zona_pago))),
    CONSTRAINT zona_pago_tipo_zona_check CHECK (((tipo_zona IS NULL) OR ((tipo_zona)::text = ANY ((ARRAY['COBERTURA_GENERAL'::character varying, 'MICROZONA_COMERCIAL'::character varying])::text[])))),
    CONSTRAINT zona_pago_vigencia_check CHECK (((fecha_inicio IS NULL) OR (fecha_fin IS NULL) OR (fecha_inicio <= fecha_fin)))
);


--
-- Name: zona_pago_id_zona_pago_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.zona_pago_id_zona_pago_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: zona_pago_id_zona_pago_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.zona_pago_id_zona_pago_seq OWNED BY public.zona_pago.id_zona_pago;


--
-- Name: baja_equipo id_baja; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baja_equipo ALTER COLUMN id_baja SET DEFAULT nextval('public.baja_equipo_id_baja_seq'::regclass);


--
-- Name: bodega id_bodega; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bodega ALTER COLUMN id_bodega SET DEFAULT nextval('public.bodega_id_bodega_seq'::regclass);


--
-- Name: caja_nap id_caja_nap; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_nap ALTER COLUMN id_caja_nap SET DEFAULT nextval('public.caja_nap_id_caja_nap_seq'::regclass);


--
-- Name: cambio_condicion_pago id_cambio; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cambio_condicion_pago ALTER COLUMN id_cambio SET DEFAULT nextval('public.cambio_condicion_pago_id_cambio_seq'::regclass);


--
-- Name: canal_whatsapp id_canal; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canal_whatsapp ALTER COLUMN id_canal SET DEFAULT nextval('public.canal_whatsapp_id_canal_seq'::regclass);


--
-- Name: cargo_adicional id_cargo; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo_adicional ALTER COLUMN id_cargo SET DEFAULT nextval('public.cargo_adicional_id_cargo_seq'::regclass);


--
-- Name: categoria_falla id_categoria; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categoria_falla ALTER COLUMN id_categoria SET DEFAULT nextval('public.categoria_falla_id_categoria_seq'::regclass);


--
-- Name: cliente id_cliente; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente ALTER COLUMN id_cliente SET DEFAULT nextval('public.cliente_id_cliente_seq'::regclass);


--
-- Name: configuracion_seo id_seo; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracion_seo ALTER COLUMN id_seo SET DEFAULT nextval('public.configuracion_seo_id_seo_seq'::regclass);


--
-- Name: consentimiento_cookies id_consentimiento; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consentimiento_cookies ALTER COLUMN id_consentimiento SET DEFAULT nextval('public.consentimiento_cookies_id_consentimiento_seq'::regclass);


--
-- Name: contrato id_contrato; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contrato ALTER COLUMN id_contrato SET DEFAULT nextval('public.contrato_id_contrato_seq'::regclass);


--
-- Name: contrato_digital id_contrato_digital; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contrato_digital ALTER COLUMN id_contrato_digital SET DEFAULT nextval('public.contrato_digital_id_contrato_digital_seq'::regclass);


--
-- Name: convenio_pago id_convenio; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.convenio_pago ALTER COLUMN id_convenio SET DEFAULT nextval('public.convenio_pago_id_convenio_seq'::regclass);


--
-- Name: conversacion_bot id_conversacion; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversacion_bot ALTER COLUMN id_conversacion SET DEFAULT nextval('public.conversacion_bot_id_conversacion_seq'::regclass);


--
-- Name: cotizacion id_cotizacion; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizacion ALTER COLUMN id_cotizacion SET DEFAULT nextval('public.cotizacion_id_cotizacion_seq'::regclass);


--
-- Name: credenciales_tvip id_credencial; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credenciales_tvip ALTER COLUMN id_credencial SET DEFAULT nextval('public.credenciales_tvip_id_credencial_seq'::regclass);


--
-- Name: cuota_convenio_pago id_cuota; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuota_convenio_pago ALTER COLUMN id_cuota SET DEFAULT nextval('public.cuota_convenio_pago_id_cuota_seq'::regclass);


--
-- Name: detalle_orden_ingreso id_detalle; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalle_orden_ingreso ALTER COLUMN id_detalle SET DEFAULT nextval('public.detalle_orden_ingreso_id_detalle_seq'::regclass);


--
-- Name: direccion_servicio id_direccion; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direccion_servicio ALTER COLUMN id_direccion SET DEFAULT nextval('public.direccion_servicio_id_direccion_seq'::regclass);


--
-- Name: documento_tributario_externo id_documento; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documento_tributario_externo ALTER COLUMN id_documento SET DEFAULT nextval('public.documento_tributario_externo_id_documento_seq'::regclass);


--
-- Name: empresa id_empresa; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa ALTER COLUMN id_empresa SET DEFAULT nextval('public.empresa_id_empresa_seq'::regclass);


--
-- Name: evento_gestion_comercial id_evento; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evento_gestion_comercial ALTER COLUMN id_evento SET DEFAULT nextval('public.evento_gestion_comercial_id_evento_seq'::regclass);


--
-- Name: evidencia_foto id_foto; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidencia_foto ALTER COLUMN id_foto SET DEFAULT nextval('public.evidencia_foto_id_foto_seq'::regclass);


--
-- Name: factura id_factura; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factura ALTER COLUMN id_factura SET DEFAULT nextval('public.factura_id_factura_seq'::regclass);


--
-- Name: garantia_comercial id_garantia; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.garantia_comercial ALTER COLUMN id_garantia SET DEFAULT nextval('public.garantia_comercial_id_garantia_seq'::regclass);


--
-- Name: historial_cambio_plan id_cambio_plan; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_cambio_plan ALTER COLUMN id_cambio_plan SET DEFAULT nextval('public.historial_cambio_plan_id_cambio_plan_seq'::regclass);


--
-- Name: historial_conexion_ont id_historial_ont; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_conexion_ont ALTER COLUMN id_historial_ont SET DEFAULT nextval('public.historial_conexion_ont_id_historial_ont_seq'::regclass);


--
-- Name: historial_estado_equipo id_historial; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_estado_equipo ALTER COLUMN id_historial SET DEFAULT nextval('public.historial_estado_equipo_id_historial_seq'::regclass);


--
-- Name: historial_ot id_historial_ot; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_ot ALTER COLUMN id_historial_ot SET DEFAULT nextval('public.historial_ot_id_historial_ot_seq'::regclass);


--
-- Name: integracion_activacion_g1 id_integracion; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integracion_activacion_g1 ALTER COLUMN id_integracion SET DEFAULT nextval('public.integracion_activacion_g1_id_integracion_seq'::regclass);


--
-- Name: integracion_evento_entrante id_evento; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integracion_evento_entrante ALTER COLUMN id_evento SET DEFAULT nextval('public.integracion_evento_entrante_id_evento_seq'::regclass);


--
-- Name: integracion_instalacion_g3 id_integracion; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integracion_instalacion_g3 ALTER COLUMN id_integracion SET DEFAULT nextval('public.integracion_instalacion_g3_id_integracion_seq'::regclass);


--
-- Name: intento_fallido id_intento; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intento_fallido ALTER COLUMN id_intento SET DEFAULT nextval('public.intento_fallido_id_intento_seq'::regclass);


--
-- Name: lista_negra id_vetado; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lista_negra ALTER COLUMN id_vetado SET DEFAULT nextval('public.lista_negra_id_vetado_seq'::regclass);


--
-- Name: llamada_cortes id_llamada; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llamada_cortes ALTER COLUMN id_llamada SET DEFAULT nextval('public.llamada_cortes_id_llamada_seq'::regclass);


--
-- Name: log_auditoria id_log; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.log_auditoria ALTER COLUMN id_log SET DEFAULT nextval('public.log_auditoria_id_log_seq'::regclass);


--
-- Name: log_notificacion id_notificacion; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.log_notificacion ALTER COLUMN id_notificacion SET DEFAULT nextval('public.log_notificacion_id_notificacion_seq'::regclass);


--
-- Name: mensaje_bot id_mensaje; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensaje_bot ALTER COLUMN id_mensaje SET DEFAULT nextval('public.mensaje_bot_id_mensaje_seq'::regclass);


--
-- Name: mensaje_whatsapp id_mensaje_wa; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensaje_whatsapp ALTER COLUMN id_mensaje_wa SET DEFAULT nextval('public.mensaje_whatsapp_id_mensaje_wa_seq'::regclass);


--
-- Name: monitoreo_ont id_monitoreo; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monitoreo_ont ALTER COLUMN id_monitoreo SET DEFAULT nextval('public.monitoreo_ont_id_monitoreo_seq'::regclass);


--
-- Name: movimiento_inventario id_movimiento; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimiento_inventario ALTER COLUMN id_movimiento SET DEFAULT nextval('public.movimiento_inventario_id_movimiento_seq'::regclass);


--
-- Name: mufa id_mufa; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mufa ALTER COLUMN id_mufa SET DEFAULT nextval('public.mufa_id_mufa_seq'::regclass);


--
-- Name: observacion_operativa id_observacion; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.observacion_operativa ALTER COLUMN id_observacion SET DEFAULT nextval('public.observacion_operativa_id_observacion_seq'::regclass);


--
-- Name: olt id_olt; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.olt ALTER COLUMN id_olt SET DEFAULT nextval('public.olt_id_olt_seq'::regclass);


--
-- Name: orden_ingreso id_orden; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_ingreso ALTER COLUMN id_orden SET DEFAULT nextval('public.orden_ingreso_id_orden_seq'::regclass);


--
-- Name: orden_trabajo id_ot; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_trabajo ALTER COLUMN id_ot SET DEFAULT nextval('public.orden_trabajo_id_ot_seq'::regclass);


--
-- Name: pago id_pago; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pago ALTER COLUMN id_pago SET DEFAULT nextval('public.pago_id_pago_seq'::regclass);


--
-- Name: plan id_plan; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan ALTER COLUMN id_plan SET DEFAULT nextval('public.plan_id_plan_seq'::regclass);


--
-- Name: plan_zona_precio id_plan_zona_precio; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_zona_precio ALTER COLUMN id_plan_zona_precio SET DEFAULT nextval('public.plan_zona_precio_id_plan_zona_precio_seq'::regclass);


--
-- Name: plantilla_notificacion id_plantilla; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plantilla_notificacion ALTER COLUMN id_plantilla SET DEFAULT nextval('public.plantilla_notificacion_id_plantilla_seq'::regclass);


--
-- Name: plantilla_whatsapp id_plantilla_wa; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plantilla_whatsapp ALTER COLUMN id_plantilla_wa SET DEFAULT nextval('public.plantilla_whatsapp_id_plantilla_wa_seq'::regclass);


--
-- Name: prestamo_externo id_prestamo; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prestamo_externo ALTER COLUMN id_prestamo SET DEFAULT nextval('public.prestamo_externo_id_prestamo_seq'::regclass);


--
-- Name: prorroga_pago id_prorroga; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prorroga_pago ALTER COLUMN id_prorroga SET DEFAULT nextval('public.prorroga_pago_id_prorroga_seq'::regclass);


--
-- Name: prospecto id_prospecto; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospecto ALTER COLUMN id_prospecto SET DEFAULT nextval('public.prospecto_id_prospecto_seq'::regclass);


--
-- Name: proveedor id_proveedor; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proveedor ALTER COLUMN id_proveedor SET DEFAULT nextval('public.proveedor_id_proveedor_seq'::regclass);


--
-- Name: puerto_nap id_puerto; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.puerto_nap ALTER COLUMN id_puerto SET DEFAULT nextval('public.puerto_nap_id_puerto_seq'::regclass);


--
-- Name: punto_cobertura id_punto; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.punto_cobertura ALTER COLUMN id_punto SET DEFAULT nextval('public.punto_cobertura_id_punto_seq'::regclass);


--
-- Name: rol id_rol; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rol ALTER COLUMN id_rol SET DEFAULT nextval('public.rol_id_rol_seq'::regclass);


--
-- Name: servicio_contratado id_servicio; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicio_contratado ALTER COLUMN id_servicio SET DEFAULT nextval('public.servicio_contratado_id_servicio_seq'::regclass);


--
-- Name: sesion_portal id_sesion; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sesion_portal ALTER COLUMN id_sesion SET DEFAULT nextval('public.sesion_portal_id_sesion_seq'::regclass);


--
-- Name: solicitud_cliente id_solicitud; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitud_cliente ALTER COLUMN id_solicitud SET DEFAULT nextval('public.solicitud_cliente_id_solicitud_seq'::regclass);


--
-- Name: solicitud_retiro_servicio id_solicitud_retiro; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitud_retiro_servicio ALTER COLUMN id_solicitud_retiro SET DEFAULT nextval('public.solicitud_retiro_servicio_id_solicitud_retiro_seq'::regclass);


--
-- Name: stock_consumible id_stock; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_consumible ALTER COLUMN id_stock SET DEFAULT nextval('public.stock_consumible_id_stock_seq'::regclass);


--
-- Name: tarjeta_pon id_tarjeta; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarjeta_pon ALTER COLUMN id_tarjeta SET DEFAULT nextval('public.tarjeta_pon_id_tarjeta_seq'::regclass);


--
-- Name: tecnico_externo id_tecnico_ext; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tecnico_externo ALTER COLUMN id_tecnico_ext SET DEFAULT nextval('public.tecnico_externo_id_tecnico_ext_seq'::regclass);


--
-- Name: ticket id_ticket; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket ALTER COLUMN id_ticket SET DEFAULT nextval('public.ticket_id_ticket_seq'::regclass);


--
-- Name: tipo_equipo id_tipo_equipo; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipo_equipo ALTER COLUMN id_tipo_equipo SET DEFAULT nextval('public.tipo_equipo_id_tipo_equipo_seq'::regclass);


--
-- Name: transferencia_equipo id_transferencia; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transferencia_equipo ALTER COLUMN id_transferencia SET DEFAULT nextval('public.transferencia_equipo_id_transferencia_seq'::regclass);


--
-- Name: unidad_equipo id_unidad; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unidad_equipo ALTER COLUMN id_unidad SET DEFAULT nextval('public.unidad_equipo_id_unidad_seq'::regclass);


--
-- Name: uso_material_ot id_uso; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uso_material_ot ALTER COLUMN id_uso SET DEFAULT nextval('public.uso_material_ot_id_uso_seq'::regclass);


--
-- Name: usuario id_usuario; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario ALTER COLUMN id_usuario SET DEFAULT nextval('public.usuario_id_usuario_seq'::regclass);


--
-- Name: usuario_rol id_usuario_rol; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario_rol ALTER COLUMN id_usuario_rol SET DEFAULT nextval('public.usuario_rol_id_usuario_rol_seq'::regclass);


--
-- Name: zona_pago id_zona_pago; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zona_pago ALTER COLUMN id_zona_pago SET DEFAULT nextval('public.zona_pago_id_zona_pago_seq'::regclass);


--
-- Name: baja_equipo baja_equipo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baja_equipo
    ADD CONSTRAINT baja_equipo_pkey PRIMARY KEY (id_baja);


--
-- Name: bodega bodega_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bodega
    ADD CONSTRAINT bodega_pkey PRIMARY KEY (id_bodega);


--
-- Name: caja_nap caja_nap_identificador_unico_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_nap
    ADD CONSTRAINT caja_nap_identificador_unico_key UNIQUE (identificador_unico);


--
-- Name: caja_nap caja_nap_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_nap
    ADD CONSTRAINT caja_nap_pkey PRIMARY KEY (id_caja_nap);


--
-- Name: cambio_condicion_pago cambio_condicion_pago_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cambio_condicion_pago
    ADD CONSTRAINT cambio_condicion_pago_pkey PRIMARY KEY (id_cambio);


--
-- Name: canal_whatsapp canal_whatsapp_numero_telefono_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canal_whatsapp
    ADD CONSTRAINT canal_whatsapp_numero_telefono_key UNIQUE (numero_telefono);


--
-- Name: canal_whatsapp canal_whatsapp_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canal_whatsapp
    ADD CONSTRAINT canal_whatsapp_pkey PRIMARY KEY (id_canal);


--
-- Name: cargo_adicional cargo_adicional_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo_adicional
    ADD CONSTRAINT cargo_adicional_pkey PRIMARY KEY (id_cargo);


--
-- Name: categoria_falla categoria_falla_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categoria_falla
    ADD CONSTRAINT categoria_falla_pkey PRIMARY KEY (id_categoria);


--
-- Name: cliente cliente_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente
    ADD CONSTRAINT cliente_pkey PRIMARY KEY (id_cliente);


--
-- Name: cliente cliente_rut_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente
    ADD CONSTRAINT cliente_rut_key UNIQUE (rut);


--
-- Name: configuracion_seo configuracion_seo_id_empresa_seccion_url_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracion_seo
    ADD CONSTRAINT configuracion_seo_id_empresa_seccion_url_key UNIQUE (id_empresa, seccion_url);


--
-- Name: configuracion_seo configuracion_seo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracion_seo
    ADD CONSTRAINT configuracion_seo_pkey PRIMARY KEY (id_seo);


--
-- Name: consentimiento_cookies consentimiento_cookies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consentimiento_cookies
    ADD CONSTRAINT consentimiento_cookies_pkey PRIMARY KEY (id_consentimiento);


--
-- Name: contrato_digital contrato_digital_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contrato_digital
    ADD CONSTRAINT contrato_digital_pkey PRIMARY KEY (id_contrato_digital);


--
-- Name: contrato contrato_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contrato
    ADD CONSTRAINT contrato_pkey PRIMARY KEY (id_contrato);


--
-- Name: convenio_pago convenio_pago_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.convenio_pago
    ADD CONSTRAINT convenio_pago_pkey PRIMARY KEY (id_convenio);


--
-- Name: conversacion_bot conversacion_bot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversacion_bot
    ADD CONSTRAINT conversacion_bot_pkey PRIMARY KEY (id_conversacion);


--
-- Name: cotizacion cotizacion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizacion
    ADD CONSTRAINT cotizacion_pkey PRIMARY KEY (id_cotizacion);


--
-- Name: credenciales_tvip credenciales_tvip_id_contrato_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credenciales_tvip
    ADD CONSTRAINT credenciales_tvip_id_contrato_key UNIQUE (id_contrato);


--
-- Name: credenciales_tvip credenciales_tvip_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credenciales_tvip
    ADD CONSTRAINT credenciales_tvip_pkey PRIMARY KEY (id_credencial);


--
-- Name: cuota_convenio_pago cuota_convenio_pago_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuota_convenio_pago
    ADD CONSTRAINT cuota_convenio_pago_pkey PRIMARY KEY (id_cuota);


--
-- Name: detalle_orden_ingreso detalle_orden_ingreso_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalle_orden_ingreso
    ADD CONSTRAINT detalle_orden_ingreso_pkey PRIMARY KEY (id_detalle);


--
-- Name: direccion_servicio direccion_servicio_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direccion_servicio
    ADD CONSTRAINT direccion_servicio_pkey PRIMARY KEY (id_direccion);


--
-- Name: documento_tributario_externo documento_tributario_externo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documento_tributario_externo
    ADD CONSTRAINT documento_tributario_externo_pkey PRIMARY KEY (id_documento);


--
-- Name: empresa empresa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa
    ADD CONSTRAINT empresa_pkey PRIMARY KEY (id_empresa);


--
-- Name: empresa empresa_rut_empresa_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa
    ADD CONSTRAINT empresa_rut_empresa_key UNIQUE (rut_empresa);


--
-- Name: evento_gestion_comercial evento_gestion_comercial_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evento_gestion_comercial
    ADD CONSTRAINT evento_gestion_comercial_pkey PRIMARY KEY (id_evento);


--
-- Name: evidencia_foto evidencia_foto_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidencia_foto
    ADD CONSTRAINT evidencia_foto_pkey PRIMARY KEY (id_foto);


--
-- Name: factura factura_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factura
    ADD CONSTRAINT factura_pkey PRIMARY KEY (id_factura);


--
-- Name: garantia_comercial garantia_comercial_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.garantia_comercial
    ADD CONSTRAINT garantia_comercial_pkey PRIMARY KEY (id_garantia);


--
-- Name: historial_cambio_plan historial_cambio_plan_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_cambio_plan
    ADD CONSTRAINT historial_cambio_plan_pkey PRIMARY KEY (id_cambio_plan);


--
-- Name: historial_conexion_ont historial_conexion_ont_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_conexion_ont
    ADD CONSTRAINT historial_conexion_ont_pkey PRIMARY KEY (id_historial_ont);


--
-- Name: historial_estado_equipo historial_estado_equipo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_estado_equipo
    ADD CONSTRAINT historial_estado_equipo_pkey PRIMARY KEY (id_historial);


--
-- Name: historial_ot historial_ot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_ot
    ADD CONSTRAINT historial_ot_pkey PRIMARY KEY (id_historial_ot);


--
-- Name: integracion_activacion_g1 integracion_activacion_g1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integracion_activacion_g1
    ADD CONSTRAINT integracion_activacion_g1_pkey PRIMARY KEY (id_integracion);


--
-- Name: integracion_evento_entrante integracion_evento_entrante_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integracion_evento_entrante
    ADD CONSTRAINT integracion_evento_entrante_pkey PRIMARY KEY (id_evento);


--
-- Name: integracion_instalacion_g3 integracion_instalacion_g3_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integracion_instalacion_g3
    ADD CONSTRAINT integracion_instalacion_g3_pkey PRIMARY KEY (id_integracion);


--
-- Name: intento_fallido intento_fallido_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intento_fallido
    ADD CONSTRAINT intento_fallido_pkey PRIMARY KEY (id_intento);


--
-- Name: lista_negra lista_negra_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lista_negra
    ADD CONSTRAINT lista_negra_pkey PRIMARY KEY (id_vetado);


--
-- Name: llamada_cortes llamada_cortes_id_ot_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llamada_cortes
    ADD CONSTRAINT llamada_cortes_id_ot_key UNIQUE (id_ot);


--
-- Name: llamada_cortes llamada_cortes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llamada_cortes
    ADD CONSTRAINT llamada_cortes_pkey PRIMARY KEY (id_llamada);


--
-- Name: log_auditoria log_auditoria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.log_auditoria
    ADD CONSTRAINT log_auditoria_pkey PRIMARY KEY (id_log);


--
-- Name: log_notificacion log_notificacion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.log_notificacion
    ADD CONSTRAINT log_notificacion_pkey PRIMARY KEY (id_notificacion);


--
-- Name: mensaje_bot mensaje_bot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensaje_bot
    ADD CONSTRAINT mensaje_bot_pkey PRIMARY KEY (id_mensaje);


--
-- Name: mensaje_whatsapp mensaje_whatsapp_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensaje_whatsapp
    ADD CONSTRAINT mensaje_whatsapp_pkey PRIMARY KEY (id_mensaje_wa);


--
-- Name: monitoreo_ont monitoreo_ont_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monitoreo_ont
    ADD CONSTRAINT monitoreo_ont_pkey PRIMARY KEY (id_monitoreo);


--
-- Name: movimiento_inventario movimiento_inventario_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimiento_inventario
    ADD CONSTRAINT movimiento_inventario_pkey PRIMARY KEY (id_movimiento);


--
-- Name: mufa mufa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mufa
    ADD CONSTRAINT mufa_pkey PRIMARY KEY (id_mufa);


--
-- Name: observacion_operativa observacion_operativa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.observacion_operativa
    ADD CONSTRAINT observacion_operativa_pkey PRIMARY KEY (id_observacion);


--
-- Name: olt olt_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.olt
    ADD CONSTRAINT olt_pkey PRIMARY KEY (id_olt);


--
-- Name: orden_ingreso orden_ingreso_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_ingreso
    ADD CONSTRAINT orden_ingreso_pkey PRIMARY KEY (id_orden);


--
-- Name: orden_trabajo orden_trabajo_codigo_seguimiento_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_trabajo
    ADD CONSTRAINT orden_trabajo_codigo_seguimiento_key UNIQUE (codigo_seguimiento);


--
-- Name: orden_trabajo orden_trabajo_id_ticket_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_trabajo
    ADD CONSTRAINT orden_trabajo_id_ticket_key UNIQUE (id_ticket);


--
-- Name: orden_trabajo orden_trabajo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_trabajo
    ADD CONSTRAINT orden_trabajo_pkey PRIMARY KEY (id_ot);


--
-- Name: pago pago_codigo_transaccion_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pago
    ADD CONSTRAINT pago_codigo_transaccion_key UNIQUE (codigo_transaccion);


--
-- Name: pago pago_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pago
    ADD CONSTRAINT pago_pkey PRIMARY KEY (id_pago);


--
-- Name: plan plan_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan
    ADD CONSTRAINT plan_pkey PRIMARY KEY (id_plan);


--
-- Name: plan_zona_precio plan_zona_precio_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_zona_precio
    ADD CONSTRAINT plan_zona_precio_pkey PRIMARY KEY (id_plan_zona_precio);


--
-- Name: plantilla_notificacion plantilla_notificacion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plantilla_notificacion
    ADD CONSTRAINT plantilla_notificacion_pkey PRIMARY KEY (id_plantilla);


--
-- Name: plantilla_whatsapp plantilla_whatsapp_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plantilla_whatsapp
    ADD CONSTRAINT plantilla_whatsapp_pkey PRIMARY KEY (id_plantilla_wa);


--
-- Name: prestamo_externo prestamo_externo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prestamo_externo
    ADD CONSTRAINT prestamo_externo_pkey PRIMARY KEY (id_prestamo);


--
-- Name: prorroga_pago prorroga_pago_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prorroga_pago
    ADD CONSTRAINT prorroga_pago_pkey PRIMARY KEY (id_prorroga);


--
-- Name: prospecto prospecto_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospecto
    ADD CONSTRAINT prospecto_pkey PRIMARY KEY (id_prospecto);


--
-- Name: proveedor proveedor_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proveedor
    ADD CONSTRAINT proveedor_pkey PRIMARY KEY (id_proveedor);


--
-- Name: puerto_nap puerto_nap_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.puerto_nap
    ADD CONSTRAINT puerto_nap_pkey PRIMARY KEY (id_puerto);


--
-- Name: punto_cobertura punto_cobertura_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.punto_cobertura
    ADD CONSTRAINT punto_cobertura_pkey PRIMARY KEY (id_punto);


--
-- Name: rol rol_nombre_rol_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rol
    ADD CONSTRAINT rol_nombre_rol_key UNIQUE (nombre_rol);


--
-- Name: rol rol_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rol
    ADD CONSTRAINT rol_pkey PRIMARY KEY (id_rol);


--
-- Name: servicio_contratado servicio_contratado_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicio_contratado
    ADD CONSTRAINT servicio_contratado_pkey PRIMARY KEY (id_servicio);


--
-- Name: sesion_portal sesion_portal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sesion_portal
    ADD CONSTRAINT sesion_portal_pkey PRIMARY KEY (id_sesion);


--
-- Name: solicitud_cliente solicitud_cliente_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitud_cliente
    ADD CONSTRAINT solicitud_cliente_pkey PRIMARY KEY (id_solicitud);


--
-- Name: solicitud_retiro_servicio solicitud_retiro_servicio_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitud_retiro_servicio
    ADD CONSTRAINT solicitud_retiro_servicio_pkey PRIMARY KEY (id_solicitud_retiro);


--
-- Name: stock_consumible stock_consumible_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_consumible
    ADD CONSTRAINT stock_consumible_pkey PRIMARY KEY (id_stock);


--
-- Name: tarjeta_pon tarjeta_pon_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarjeta_pon
    ADD CONSTRAINT tarjeta_pon_pkey PRIMARY KEY (id_tarjeta);


--
-- Name: tecnico_externo tecnico_externo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tecnico_externo
    ADD CONSTRAINT tecnico_externo_pkey PRIMARY KEY (id_tecnico_ext);


--
-- Name: ticket ticket_codigo_seguimiento_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket
    ADD CONSTRAINT ticket_codigo_seguimiento_key UNIQUE (codigo_seguimiento);


--
-- Name: ticket ticket_id_conversacion_bot_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket
    ADD CONSTRAINT ticket_id_conversacion_bot_key UNIQUE (id_conversacion_bot);


--
-- Name: ticket ticket_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket
    ADD CONSTRAINT ticket_pkey PRIMARY KEY (id_ticket);


--
-- Name: tipo_equipo tipo_equipo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipo_equipo
    ADD CONSTRAINT tipo_equipo_pkey PRIMARY KEY (id_tipo_equipo);


--
-- Name: transferencia_equipo transferencia_equipo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transferencia_equipo
    ADD CONSTRAINT transferencia_equipo_pkey PRIMARY KEY (id_transferencia);


--
-- Name: unidad_equipo unidad_equipo_numero_serie_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unidad_equipo
    ADD CONSTRAINT unidad_equipo_numero_serie_key UNIQUE (numero_serie);


--
-- Name: unidad_equipo unidad_equipo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unidad_equipo
    ADD CONSTRAINT unidad_equipo_pkey PRIMARY KEY (id_unidad);


--
-- Name: uso_material_ot uso_material_ot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uso_material_ot
    ADD CONSTRAINT uso_material_ot_pkey PRIMARY KEY (id_uso);


--
-- Name: usuario usuario_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario
    ADD CONSTRAINT usuario_email_key UNIQUE (email);


--
-- Name: usuario usuario_nombre_usuario_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario
    ADD CONSTRAINT usuario_nombre_usuario_key UNIQUE (nombre_usuario);


--
-- Name: usuario usuario_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario
    ADD CONSTRAINT usuario_pkey PRIMARY KEY (id_usuario);


--
-- Name: usuario_rol usuario_rol_id_usuario_id_rol_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario_rol
    ADD CONSTRAINT usuario_rol_id_usuario_id_rol_key UNIQUE (id_usuario, id_rol);


--
-- Name: usuario_rol usuario_rol_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario_rol
    ADD CONSTRAINT usuario_rol_pkey PRIMARY KEY (id_usuario_rol);


--
-- Name: zona_pago zona_pago_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zona_pago
    ADD CONSTRAINT zona_pago_pkey PRIMARY KEY (id_zona_pago);


--
-- Name: cambio_condicion_pago_id_cliente_fecha_registro_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cambio_condicion_pago_id_cliente_fecha_registro_idx ON public.cambio_condicion_pago USING btree (id_cliente, fecha_registro);


--
-- Name: cambio_condicion_pago_id_empresa_tipo_cambio_fecha_registro_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cambio_condicion_pago_id_empresa_tipo_cambio_fecha_registro_idx ON public.cambio_condicion_pago USING btree (id_empresa, tipo_cambio, fecha_registro);


--
-- Name: cargo_adicional_id_cliente_fecha_registro_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cargo_adicional_id_cliente_fecha_registro_idx ON public.cargo_adicional USING btree (id_cliente, fecha_registro);


--
-- Name: cargo_adicional_id_empresa_estado_fecha_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cargo_adicional_id_empresa_estado_fecha_idx ON public.cargo_adicional USING btree (id_empresa, estado, fecha);


--
-- Name: convenio_pago_id_cliente_estado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX convenio_pago_id_cliente_estado_idx ON public.convenio_pago USING btree (id_cliente, estado);


--
-- Name: convenio_pago_id_empresa_estado_fecha_inicio_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX convenio_pago_id_empresa_estado_fecha_inicio_idx ON public.convenio_pago USING btree (id_empresa, estado, fecha_inicio);


--
-- Name: convenio_pago_id_factura_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX convenio_pago_id_factura_idx ON public.convenio_pago USING btree (id_factura);


--
-- Name: cuota_convenio_pago_fecha_vencimiento_estado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cuota_convenio_pago_fecha_vencimiento_estado_idx ON public.cuota_convenio_pago USING btree (fecha_vencimiento, estado);


--
-- Name: cuota_convenio_pago_id_convenio_numero_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cuota_convenio_pago_id_convenio_numero_key ON public.cuota_convenio_pago USING btree (id_convenio, numero);


--
-- Name: documento_tributario_externo_cargo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documento_tributario_externo_cargo_idx ON public.documento_tributario_externo USING btree (id_cargo_adicional);


--
-- Name: documento_tributario_externo_cliente_fecha_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documento_tributario_externo_cliente_fecha_idx ON public.documento_tributario_externo USING btree (id_cliente, fecha_emision);


--
-- Name: documento_tributario_externo_contrato_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documento_tributario_externo_contrato_idx ON public.documento_tributario_externo USING btree (id_contrato);


--
-- Name: documento_tributario_externo_empresa_estado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documento_tributario_externo_empresa_estado_idx ON public.documento_tributario_externo USING btree (id_empresa, estado);


--
-- Name: documento_tributario_externo_empresa_fecha_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documento_tributario_externo_empresa_fecha_idx ON public.documento_tributario_externo USING btree (id_empresa, fecha_emision);


--
-- Name: documento_tributario_externo_factura_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documento_tributario_externo_factura_idx ON public.documento_tributario_externo USING btree (id_factura);


--
-- Name: documento_tributario_externo_identidad_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX documento_tributario_externo_identidad_key ON public.documento_tributario_externo USING btree (id_empresa, tipo_documento, emisor_normalizado, folio_normalizado);


--
-- Name: evento_gestion_comercial_id_cliente_fecha_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX evento_gestion_comercial_id_cliente_fecha_idx ON public.evento_gestion_comercial USING btree (id_cliente, fecha);


--
-- Name: evento_gestion_comercial_id_empresa_tipo_fecha_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX evento_gestion_comercial_id_empresa_tipo_fecha_idx ON public.evento_gestion_comercial USING btree (id_empresa, tipo, fecha);


--
-- Name: evento_gestion_comercial_id_factura_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX evento_gestion_comercial_id_factura_idx ON public.evento_gestion_comercial USING btree (id_factura);


--
-- Name: factura_folio_externo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX factura_folio_externo_idx ON public.factura USING btree (folio_externo);


--
-- Name: garantia_comercial_activa_periodo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX garantia_comercial_activa_periodo_key ON public.garantia_comercial USING btree (id_servicio, tipo, fecha_inicio, fecha_termino) WHERE ((estado)::text = 'ACTIVA'::text);


--
-- Name: garantia_comercial_cliente_fecha_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX garantia_comercial_cliente_fecha_idx ON public.garantia_comercial USING btree (id_cliente, fecha_inicio);


--
-- Name: garantia_comercial_empresa_estado_fecha_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX garantia_comercial_empresa_estado_fecha_idx ON public.garantia_comercial USING btree (id_empresa, estado, fecha_termino);


--
-- Name: garantia_comercial_servicio_estado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX garantia_comercial_servicio_estado_idx ON public.garantia_comercial USING btree (id_servicio, estado);


--
-- Name: idx_cambio_plan_ejecucion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cambio_plan_ejecucion ON public.historial_cambio_plan USING btree (estado_cambio, fecha_efectiva);


--
-- Name: idx_contrato_estado_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contrato_estado_cliente ON public.contrato USING btree (id_cliente, estado);


--
-- Name: idx_contrato_id_prospecto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contrato_id_prospecto ON public.contrato USING btree (id_prospecto);


--
-- Name: idx_historial_cambio_plan_contrato; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_historial_cambio_plan_contrato ON public.historial_cambio_plan USING btree (id_contrato);


--
-- Name: idx_observacion_operativa_entidad; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_observacion_operativa_entidad ON public.observacion_operativa USING btree (tipo_entidad, id_entidad);


--
-- Name: idx_orden_trabajo_id_prospecto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orden_trabajo_id_prospecto ON public.orden_trabajo USING btree (id_prospecto);


--
-- Name: idx_solicitud_cliente_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_solicitud_cliente_cliente ON public.solicitud_cliente USING btree (id_cliente);


--
-- Name: idx_solicitud_cliente_servicio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_solicitud_cliente_servicio ON public.solicitud_cliente USING btree (id_servicio);


--
-- Name: integracion_activacion_g1_empresa_estado_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX integracion_activacion_g1_empresa_estado_created_idx ON public.integracion_activacion_g1 USING btree (id_empresa, estado_integracion, created_at);


--
-- Name: integracion_activacion_g1_event_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX integracion_activacion_g1_event_id_key ON public.integracion_activacion_g1 USING btree (event_id);


--
-- Name: integracion_activacion_g1_servicio_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX integracion_activacion_g1_servicio_created_idx ON public.integracion_activacion_g1 USING btree (id_servicio, created_at);


--
-- Name: integracion_evento_entrante_external_reference_payload_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX integracion_evento_entrante_external_reference_payload_hash_idx ON public.integracion_evento_entrante USING btree (external_reference, payload_hash);


--
-- Name: integracion_evento_entrante_id_integracion_event_type_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX integracion_evento_entrante_id_integracion_event_type_key ON public.integracion_evento_entrante USING btree (id_integracion, event_type);


--
-- Name: integracion_instalacion_g3_id_contrato_fecha_solicitud_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX integracion_instalacion_g3_id_contrato_fecha_solicitud_idx ON public.integracion_instalacion_g3 USING btree (id_contrato, fecha_solicitud);


--
-- Name: integracion_instalacion_g3_id_empresa_codigo_ot_g3_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX integracion_instalacion_g3_id_empresa_codigo_ot_g3_idx ON public.integracion_instalacion_g3 USING btree (id_empresa, codigo_ot_g3);


--
-- Name: integracion_instalacion_g3_id_empresa_estado_integracion_fecha_; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX integracion_instalacion_g3_id_empresa_estado_integracion_fecha_ ON public.integracion_instalacion_g3 USING btree (id_empresa, estado_integracion, fecha_solicitud);


--
-- Name: integracion_instalacion_g3_id_empresa_id_ot_g3_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX integracion_instalacion_g3_id_empresa_id_ot_g3_idx ON public.integracion_instalacion_g3 USING btree (id_empresa, id_ot_g3);


--
-- Name: integracion_instalacion_g3_request_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX integracion_instalacion_g3_request_id_key ON public.integracion_instalacion_g3 USING btree (request_id);


--
-- Name: plan_zona_precio_id_plan_id_zona_pago_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX plan_zona_precio_id_plan_id_zona_pago_idx ON public.plan_zona_precio USING btree (id_plan, id_zona_pago);


--
-- Name: plan_zona_precio_id_zona_pago_activo_fechas_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX plan_zona_precio_id_zona_pago_activo_fechas_idx ON public.plan_zona_precio USING btree (id_zona_pago, activo, fecha_inicio, fecha_fin);


--
-- Name: prorroga_pago_id_empresa_estado_nueva_fecha_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prorroga_pago_id_empresa_estado_nueva_fecha_idx ON public.prorroga_pago USING btree (id_empresa, estado, nueva_fecha);


--
-- Name: prorroga_pago_id_factura_fecha_registro_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prorroga_pago_id_factura_fecha_registro_idx ON public.prorroga_pago USING btree (id_factura, fecha_registro);


--
-- Name: prospecto_id_empresa_clasificacion_comercial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prospecto_id_empresa_clasificacion_comercial_idx ON public.prospecto USING btree (id_empresa, clasificacion_comercial);


--
-- Name: prospecto_id_empresa_id_zona_pago_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prospecto_id_empresa_id_zona_pago_idx ON public.prospecto USING btree (id_empresa, id_zona_pago);


--
-- Name: solicitud_retiro_empresa_estado_fecha_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX solicitud_retiro_empresa_estado_fecha_idx ON public.solicitud_retiro_servicio USING btree (id_empresa, estado, fecha_solicitada);


--
-- Name: solicitud_retiro_servicio_id_servicio_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX solicitud_retiro_servicio_id_servicio_created_at_idx ON public.solicitud_retiro_servicio USING btree (id_servicio, created_at);


--
-- Name: uq_cambio_plan_pendiente; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_cambio_plan_pendiente ON public.historial_cambio_plan USING btree (id_contrato) WHERE ((estado_cambio)::text = 'Pendiente'::text);


--
-- Name: uq_contrato_digital_version; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_contrato_digital_version ON public.contrato_digital USING btree (id_contrato, version);


--
-- Name: uq_plan_zona_precio_activo; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_plan_zona_precio_activo ON public.plan_zona_precio USING btree (id_plan, id_zona_pago) WHERE (activo = true);


--
-- Name: uq_zona_pago_empresa_nombre; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_zona_pago_empresa_nombre ON public.zona_pago USING btree (COALESCE(id_empresa, 0), lower((nombre_zona)::text));


--
-- Name: zona_pago_fecha_inicio_fecha_fin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX zona_pago_fecha_inicio_fecha_fin_idx ON public.zona_pago USING btree (fecha_inicio, fecha_fin);


--
-- Name: zona_pago_id_empresa_tipo_zona_activo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX zona_pago_id_empresa_tipo_zona_activo_idx ON public.zona_pago USING btree (id_empresa, tipo_zona, activo);


--
-- Name: zona_pago_id_zona_padre_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX zona_pago_id_zona_padre_idx ON public.zona_pago USING btree (id_zona_padre);


--
-- Name: cambio_condicion_pago cambio_condicion_pago_id_cliente_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cambio_condicion_pago
    ADD CONSTRAINT cambio_condicion_pago_id_cliente_fkey FOREIGN KEY (id_cliente) REFERENCES public.cliente(id_cliente) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: cambio_condicion_pago cambio_condicion_pago_id_contrato_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cambio_condicion_pago
    ADD CONSTRAINT cambio_condicion_pago_id_contrato_fkey FOREIGN KEY (id_contrato) REFERENCES public.contrato(id_contrato) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: cambio_condicion_pago cambio_condicion_pago_id_empresa_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cambio_condicion_pago
    ADD CONSTRAINT cambio_condicion_pago_id_empresa_fkey FOREIGN KEY (id_empresa) REFERENCES public.empresa(id_empresa) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: cambio_condicion_pago cambio_condicion_pago_id_factura_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cambio_condicion_pago
    ADD CONSTRAINT cambio_condicion_pago_id_factura_fkey FOREIGN KEY (id_factura) REFERENCES public.factura(id_factura) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: cambio_condicion_pago cambio_condicion_pago_id_usuario_responsable_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cambio_condicion_pago
    ADD CONSTRAINT cambio_condicion_pago_id_usuario_responsable_fkey FOREIGN KEY (id_usuario_responsable) REFERENCES public.usuario(id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: cargo_adicional cargo_adicional_id_cliente_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo_adicional
    ADD CONSTRAINT cargo_adicional_id_cliente_fkey FOREIGN KEY (id_cliente) REFERENCES public.cliente(id_cliente) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: cargo_adicional cargo_adicional_id_contrato_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo_adicional
    ADD CONSTRAINT cargo_adicional_id_contrato_fkey FOREIGN KEY (id_contrato) REFERENCES public.contrato(id_contrato) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: cargo_adicional cargo_adicional_id_empresa_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo_adicional
    ADD CONSTRAINT cargo_adicional_id_empresa_fkey FOREIGN KEY (id_empresa) REFERENCES public.empresa(id_empresa) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: cargo_adicional cargo_adicional_id_servicio_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo_adicional
    ADD CONSTRAINT cargo_adicional_id_servicio_fkey FOREIGN KEY (id_servicio) REFERENCES public.servicio_contratado(id_servicio) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: cargo_adicional cargo_adicional_id_usuario_responsable_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo_adicional
    ADD CONSTRAINT cargo_adicional_id_usuario_responsable_fkey FOREIGN KEY (id_usuario_responsable) REFERENCES public.usuario(id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: convenio_pago convenio_pago_id_cliente_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.convenio_pago
    ADD CONSTRAINT convenio_pago_id_cliente_fkey FOREIGN KEY (id_cliente) REFERENCES public.cliente(id_cliente) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: convenio_pago convenio_pago_id_contrato_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.convenio_pago
    ADD CONSTRAINT convenio_pago_id_contrato_fkey FOREIGN KEY (id_contrato) REFERENCES public.contrato(id_contrato) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: convenio_pago convenio_pago_id_empresa_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.convenio_pago
    ADD CONSTRAINT convenio_pago_id_empresa_fkey FOREIGN KEY (id_empresa) REFERENCES public.empresa(id_empresa) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: convenio_pago convenio_pago_id_factura_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.convenio_pago
    ADD CONSTRAINT convenio_pago_id_factura_fkey FOREIGN KEY (id_factura) REFERENCES public.factura(id_factura) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: convenio_pago convenio_pago_id_servicio_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.convenio_pago
    ADD CONSTRAINT convenio_pago_id_servicio_fkey FOREIGN KEY (id_servicio) REFERENCES public.servicio_contratado(id_servicio) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: convenio_pago convenio_pago_id_usuario_aprobador_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.convenio_pago
    ADD CONSTRAINT convenio_pago_id_usuario_aprobador_fkey FOREIGN KEY (id_usuario_aprobador) REFERENCES public.usuario(id_usuario) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: convenio_pago convenio_pago_id_usuario_responsable_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.convenio_pago
    ADD CONSTRAINT convenio_pago_id_usuario_responsable_fkey FOREIGN KEY (id_usuario_responsable) REFERENCES public.usuario(id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: cuota_convenio_pago cuota_convenio_pago_id_convenio_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuota_convenio_pago
    ADD CONSTRAINT cuota_convenio_pago_id_convenio_fkey FOREIGN KEY (id_convenio) REFERENCES public.convenio_pago(id_convenio) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: documento_tributario_externo documento_tributario_externo_cargo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documento_tributario_externo
    ADD CONSTRAINT documento_tributario_externo_cargo_fkey FOREIGN KEY (id_cargo_adicional) REFERENCES public.cargo_adicional(id_cargo) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: documento_tributario_externo documento_tributario_externo_cliente_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documento_tributario_externo
    ADD CONSTRAINT documento_tributario_externo_cliente_fkey FOREIGN KEY (id_cliente) REFERENCES public.cliente(id_cliente) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: documento_tributario_externo documento_tributario_externo_contrato_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documento_tributario_externo
    ADD CONSTRAINT documento_tributario_externo_contrato_fkey FOREIGN KEY (id_contrato) REFERENCES public.contrato(id_contrato) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: documento_tributario_externo documento_tributario_externo_empresa_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documento_tributario_externo
    ADD CONSTRAINT documento_tributario_externo_empresa_fkey FOREIGN KEY (id_empresa) REFERENCES public.empresa(id_empresa) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: documento_tributario_externo documento_tributario_externo_factura_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documento_tributario_externo
    ADD CONSTRAINT documento_tributario_externo_factura_fkey FOREIGN KEY (id_factura) REFERENCES public.factura(id_factura) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: documento_tributario_externo documento_tributario_externo_usuario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documento_tributario_externo
    ADD CONSTRAINT documento_tributario_externo_usuario_fkey FOREIGN KEY (id_usuario_registro) REFERENCES public.usuario(id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: evento_gestion_comercial evento_gestion_comercial_id_cliente_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evento_gestion_comercial
    ADD CONSTRAINT evento_gestion_comercial_id_cliente_fkey FOREIGN KEY (id_cliente) REFERENCES public.cliente(id_cliente) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: evento_gestion_comercial evento_gestion_comercial_id_contrato_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evento_gestion_comercial
    ADD CONSTRAINT evento_gestion_comercial_id_contrato_fkey FOREIGN KEY (id_contrato) REFERENCES public.contrato(id_contrato) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: evento_gestion_comercial evento_gestion_comercial_id_empresa_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evento_gestion_comercial
    ADD CONSTRAINT evento_gestion_comercial_id_empresa_fkey FOREIGN KEY (id_empresa) REFERENCES public.empresa(id_empresa) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: evento_gestion_comercial evento_gestion_comercial_id_factura_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evento_gestion_comercial
    ADD CONSTRAINT evento_gestion_comercial_id_factura_fkey FOREIGN KEY (id_factura) REFERENCES public.factura(id_factura) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: evento_gestion_comercial evento_gestion_comercial_id_servicio_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evento_gestion_comercial
    ADD CONSTRAINT evento_gestion_comercial_id_servicio_fkey FOREIGN KEY (id_servicio) REFERENCES public.servicio_contratado(id_servicio) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: evento_gestion_comercial evento_gestion_comercial_id_usuario_responsable_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evento_gestion_comercial
    ADD CONSTRAINT evento_gestion_comercial_id_usuario_responsable_fkey FOREIGN KEY (id_usuario_responsable) REFERENCES public.usuario(id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: baja_equipo fk_baja_equipo_id_unidad; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baja_equipo
    ADD CONSTRAINT fk_baja_equipo_id_unidad FOREIGN KEY (id_unidad) REFERENCES public.unidad_equipo(id_unidad);


--
-- Name: baja_equipo fk_baja_equipo_id_usuario; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.baja_equipo
    ADD CONSTRAINT fk_baja_equipo_id_usuario FOREIGN KEY (id_usuario) REFERENCES public.usuario(id_usuario);


--
-- Name: bodega fk_bodega_id_empresa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bodega
    ADD CONSTRAINT fk_bodega_id_empresa FOREIGN KEY (id_empresa) REFERENCES public.empresa(id_empresa);


--
-- Name: caja_nap fk_caja_nap_id_empresa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_nap
    ADD CONSTRAINT fk_caja_nap_id_empresa FOREIGN KEY (id_empresa) REFERENCES public.empresa(id_empresa);


--
-- Name: caja_nap fk_caja_nap_id_mufa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_nap
    ADD CONSTRAINT fk_caja_nap_id_mufa FOREIGN KEY (id_mufa) REFERENCES public.mufa(id_mufa);


--
-- Name: canal_whatsapp fk_canal_whatsapp_id_empresa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canal_whatsapp
    ADD CONSTRAINT fk_canal_whatsapp_id_empresa FOREIGN KEY (id_empresa) REFERENCES public.empresa(id_empresa);


--
-- Name: cliente fk_cliente_id_empresa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente
    ADD CONSTRAINT fk_cliente_id_empresa FOREIGN KEY (id_empresa) REFERENCES public.empresa(id_empresa);


--
-- Name: configuracion_seo fk_configuracion_seo_id_empresa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracion_seo
    ADD CONSTRAINT fk_configuracion_seo_id_empresa FOREIGN KEY (id_empresa) REFERENCES public.empresa(id_empresa);


--
-- Name: consentimiento_cookies fk_consentimiento_cookies_id_cliente; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consentimiento_cookies
    ADD CONSTRAINT fk_consentimiento_cookies_id_cliente FOREIGN KEY (id_cliente) REFERENCES public.cliente(id_cliente);


--
-- Name: contrato_digital fk_contrato_digital_id_cliente; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contrato_digital
    ADD CONSTRAINT fk_contrato_digital_id_cliente FOREIGN KEY (id_cliente) REFERENCES public.cliente(id_cliente);


--
-- Name: contrato_digital fk_contrato_digital_id_contrato; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contrato_digital
    ADD CONSTRAINT fk_contrato_digital_id_contrato FOREIGN KEY (id_contrato) REFERENCES public.contrato(id_contrato);


--
-- Name: contrato_digital fk_contrato_digital_id_usuario_generador; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contrato_digital
    ADD CONSTRAINT fk_contrato_digital_id_usuario_generador FOREIGN KEY (id_usuario_generador) REFERENCES public.usuario(id_usuario);


--
-- Name: contrato fk_contrato_id_cliente; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contrato
    ADD CONSTRAINT fk_contrato_id_cliente FOREIGN KEY (id_cliente) REFERENCES public.cliente(id_cliente);


--
-- Name: contrato fk_contrato_id_empresa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contrato
    ADD CONSTRAINT fk_contrato_id_empresa FOREIGN KEY (id_empresa) REFERENCES public.empresa(id_empresa);


--
-- Name: contrato fk_contrato_id_plan; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contrato
    ADD CONSTRAINT fk_contrato_id_plan FOREIGN KEY (id_plan) REFERENCES public.plan(id_plan);


--
-- Name: contrato fk_contrato_id_prospecto; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contrato
    ADD CONSTRAINT fk_contrato_id_prospecto FOREIGN KEY (id_prospecto) REFERENCES public.prospecto(id_prospecto);


--
-- Name: contrato fk_contrato_id_zona_pago; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contrato
    ADD CONSTRAINT fk_contrato_id_zona_pago FOREIGN KEY (id_zona_pago) REFERENCES public.zona_pago(id_zona_pago);


--
-- Name: conversacion_bot fk_conversacion_bot_id_canal_wa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversacion_bot
    ADD CONSTRAINT fk_conversacion_bot_id_canal_wa FOREIGN KEY (id_canal_wa) REFERENCES public.canal_whatsapp(id_canal);


--
-- Name: conversacion_bot fk_conversacion_bot_id_cliente; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversacion_bot
    ADD CONSTRAINT fk_conversacion_bot_id_cliente FOREIGN KEY (id_cliente) REFERENCES public.cliente(id_cliente);


--
-- Name: cotizacion fk_cotizacion_id_plan; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizacion
    ADD CONSTRAINT fk_cotizacion_id_plan FOREIGN KEY (id_plan) REFERENCES public.plan(id_plan);


--
-- Name: cotizacion fk_cotizacion_id_prospecto; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizacion
    ADD CONSTRAINT fk_cotizacion_id_prospecto FOREIGN KEY (id_prospecto) REFERENCES public.prospecto(id_prospecto);


--
-- Name: credenciales_tvip fk_credenciales_tvip_id_contrato; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credenciales_tvip
    ADD CONSTRAINT fk_credenciales_tvip_id_contrato FOREIGN KEY (id_contrato) REFERENCES public.contrato(id_contrato);


--
-- Name: detalle_orden_ingreso fk_detalle_orden_ingreso_id_orden; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalle_orden_ingreso
    ADD CONSTRAINT fk_detalle_orden_ingreso_id_orden FOREIGN KEY (id_orden) REFERENCES public.orden_ingreso(id_orden);


--
-- Name: detalle_orden_ingreso fk_detalle_orden_ingreso_id_tipo_equipo; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalle_orden_ingreso
    ADD CONSTRAINT fk_detalle_orden_ingreso_id_tipo_equipo FOREIGN KEY (id_tipo_equipo) REFERENCES public.tipo_equipo(id_tipo_equipo);


--
-- Name: direccion_servicio fk_direccion_servicio_id_cliente; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direccion_servicio
    ADD CONSTRAINT fk_direccion_servicio_id_cliente FOREIGN KEY (id_cliente) REFERENCES public.cliente(id_cliente);


--
-- Name: evidencia_foto fk_evidencia_foto_id_ot; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidencia_foto
    ADD CONSTRAINT fk_evidencia_foto_id_ot FOREIGN KEY (id_ot) REFERENCES public.orden_trabajo(id_ot);


--
-- Name: factura fk_factura_id_contrato; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factura
    ADD CONSTRAINT fk_factura_id_contrato FOREIGN KEY (id_contrato) REFERENCES public.contrato(id_contrato);


--
-- Name: historial_cambio_plan fk_historial_cambio_plan_id_cliente; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_cambio_plan
    ADD CONSTRAINT fk_historial_cambio_plan_id_cliente FOREIGN KEY (id_cliente) REFERENCES public.cliente(id_cliente);


--
-- Name: historial_cambio_plan fk_historial_cambio_plan_id_contrato; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_cambio_plan
    ADD CONSTRAINT fk_historial_cambio_plan_id_contrato FOREIGN KEY (id_contrato) REFERENCES public.contrato(id_contrato);


--
-- Name: historial_cambio_plan fk_historial_cambio_plan_id_plan_anterior; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_cambio_plan
    ADD CONSTRAINT fk_historial_cambio_plan_id_plan_anterior FOREIGN KEY (id_plan_anterior) REFERENCES public.plan(id_plan);


--
-- Name: historial_cambio_plan fk_historial_cambio_plan_id_plan_nuevo; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_cambio_plan
    ADD CONSTRAINT fk_historial_cambio_plan_id_plan_nuevo FOREIGN KEY (id_plan_nuevo) REFERENCES public.plan(id_plan);


--
-- Name: historial_conexion_ont fk_historial_conexion_ont_id_unidad; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_conexion_ont
    ADD CONSTRAINT fk_historial_conexion_ont_id_unidad FOREIGN KEY (id_unidad) REFERENCES public.unidad_equipo(id_unidad);


--
-- Name: historial_estado_equipo fk_historial_estado_equipo_id_unidad; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_estado_equipo
    ADD CONSTRAINT fk_historial_estado_equipo_id_unidad FOREIGN KEY (id_unidad) REFERENCES public.unidad_equipo(id_unidad);


--
-- Name: historial_estado_equipo fk_historial_estado_equipo_id_usuario; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_estado_equipo
    ADD CONSTRAINT fk_historial_estado_equipo_id_usuario FOREIGN KEY (id_usuario) REFERENCES public.usuario(id_usuario);


--
-- Name: historial_ot fk_historial_ot_id_ot; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_ot
    ADD CONSTRAINT fk_historial_ot_id_ot FOREIGN KEY (id_ot) REFERENCES public.orden_trabajo(id_ot);


--
-- Name: historial_ot fk_historial_ot_id_usuario; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_ot
    ADD CONSTRAINT fk_historial_ot_id_usuario FOREIGN KEY (id_usuario) REFERENCES public.usuario(id_usuario);


--
-- Name: intento_fallido fk_intento_fallido_id_empresa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intento_fallido
    ADD CONSTRAINT fk_intento_fallido_id_empresa FOREIGN KEY (id_empresa) REFERENCES public.empresa(id_empresa);


--
-- Name: lista_negra fk_lista_negra_id_cliente; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lista_negra
    ADD CONSTRAINT fk_lista_negra_id_cliente FOREIGN KEY (id_cliente) REFERENCES public.cliente(id_cliente);


--
-- Name: lista_negra fk_lista_negra_id_usuario_registro; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lista_negra
    ADD CONSTRAINT fk_lista_negra_id_usuario_registro FOREIGN KEY (id_usuario_registro) REFERENCES public.usuario(id_usuario);


--
-- Name: llamada_cortes fk_llamada_cortes_id_ot; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llamada_cortes
    ADD CONSTRAINT fk_llamada_cortes_id_ot FOREIGN KEY (id_ot) REFERENCES public.orden_trabajo(id_ot);


--
-- Name: log_auditoria fk_log_auditoria_id_usuario; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.log_auditoria
    ADD CONSTRAINT fk_log_auditoria_id_usuario FOREIGN KEY (id_usuario) REFERENCES public.usuario(id_usuario);


--
-- Name: log_notificacion fk_log_notificacion_id_cliente; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.log_notificacion
    ADD CONSTRAINT fk_log_notificacion_id_cliente FOREIGN KEY (id_cliente) REFERENCES public.cliente(id_cliente);


--
-- Name: log_notificacion fk_log_notificacion_id_plantilla; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.log_notificacion
    ADD CONSTRAINT fk_log_notificacion_id_plantilla FOREIGN KEY (id_plantilla) REFERENCES public.plantilla_notificacion(id_plantilla);


--
-- Name: mensaje_bot fk_mensaje_bot_id_conversacion; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensaje_bot
    ADD CONSTRAINT fk_mensaje_bot_id_conversacion FOREIGN KEY (id_conversacion) REFERENCES public.conversacion_bot(id_conversacion);


--
-- Name: mensaje_whatsapp fk_mensaje_whatsapp_id_canal; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensaje_whatsapp
    ADD CONSTRAINT fk_mensaje_whatsapp_id_canal FOREIGN KEY (id_canal) REFERENCES public.canal_whatsapp(id_canal);


--
-- Name: mensaje_whatsapp fk_mensaje_whatsapp_id_cliente; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensaje_whatsapp
    ADD CONSTRAINT fk_mensaje_whatsapp_id_cliente FOREIGN KEY (id_cliente) REFERENCES public.cliente(id_cliente);


--
-- Name: mensaje_whatsapp fk_mensaje_whatsapp_id_plantilla_wa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensaje_whatsapp
    ADD CONSTRAINT fk_mensaje_whatsapp_id_plantilla_wa FOREIGN KEY (id_plantilla_wa) REFERENCES public.plantilla_whatsapp(id_plantilla_wa);


--
-- Name: monitoreo_ont fk_monitoreo_ont_id_caja_nap; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monitoreo_ont
    ADD CONSTRAINT fk_monitoreo_ont_id_caja_nap FOREIGN KEY (id_caja_nap) REFERENCES public.caja_nap(id_caja_nap);


--
-- Name: monitoreo_ont fk_monitoreo_ont_id_cliente; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monitoreo_ont
    ADD CONSTRAINT fk_monitoreo_ont_id_cliente FOREIGN KEY (id_cliente) REFERENCES public.cliente(id_cliente);


--
-- Name: monitoreo_ont fk_monitoreo_ont_id_unidad; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monitoreo_ont
    ADD CONSTRAINT fk_monitoreo_ont_id_unidad FOREIGN KEY (id_unidad) REFERENCES public.unidad_equipo(id_unidad);


--
-- Name: movimiento_inventario fk_movimiento_inventario_id_bodega_destino; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimiento_inventario
    ADD CONSTRAINT fk_movimiento_inventario_id_bodega_destino FOREIGN KEY (id_bodega_destino) REFERENCES public.bodega(id_bodega);


--
-- Name: movimiento_inventario fk_movimiento_inventario_id_bodega_origen; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimiento_inventario
    ADD CONSTRAINT fk_movimiento_inventario_id_bodega_origen FOREIGN KEY (id_bodega_origen) REFERENCES public.bodega(id_bodega);


--
-- Name: movimiento_inventario fk_movimiento_inventario_id_empresa_destino; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimiento_inventario
    ADD CONSTRAINT fk_movimiento_inventario_id_empresa_destino FOREIGN KEY (id_empresa_destino) REFERENCES public.empresa(id_empresa);


--
-- Name: movimiento_inventario fk_movimiento_inventario_id_empresa_origen; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimiento_inventario
    ADD CONSTRAINT fk_movimiento_inventario_id_empresa_origen FOREIGN KEY (id_empresa_origen) REFERENCES public.empresa(id_empresa);


--
-- Name: movimiento_inventario fk_movimiento_inventario_id_tipo_equipo; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimiento_inventario
    ADD CONSTRAINT fk_movimiento_inventario_id_tipo_equipo FOREIGN KEY (id_tipo_equipo) REFERENCES public.tipo_equipo(id_tipo_equipo);


--
-- Name: movimiento_inventario fk_movimiento_inventario_id_unidad; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimiento_inventario
    ADD CONSTRAINT fk_movimiento_inventario_id_unidad FOREIGN KEY (id_unidad) REFERENCES public.unidad_equipo(id_unidad);


--
-- Name: movimiento_inventario fk_movimiento_inventario_id_usuario; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimiento_inventario
    ADD CONSTRAINT fk_movimiento_inventario_id_usuario FOREIGN KEY (id_usuario) REFERENCES public.usuario(id_usuario);


--
-- Name: mufa fk_mufa_id_tarjeta_pon; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mufa
    ADD CONSTRAINT fk_mufa_id_tarjeta_pon FOREIGN KEY (id_tarjeta_pon) REFERENCES public.tarjeta_pon(id_tarjeta);


--
-- Name: observacion_operativa fk_observacion_operativa_id_usuario; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.observacion_operativa
    ADD CONSTRAINT fk_observacion_operativa_id_usuario FOREIGN KEY (id_usuario) REFERENCES public.usuario(id_usuario);


--
-- Name: olt fk_olt_id_empresa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.olt
    ADD CONSTRAINT fk_olt_id_empresa FOREIGN KEY (id_empresa) REFERENCES public.empresa(id_empresa);


--
-- Name: orden_ingreso fk_orden_ingreso_id_bodega; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_ingreso
    ADD CONSTRAINT fk_orden_ingreso_id_bodega FOREIGN KEY (id_bodega) REFERENCES public.bodega(id_bodega);


--
-- Name: orden_ingreso fk_orden_ingreso_id_empresa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_ingreso
    ADD CONSTRAINT fk_orden_ingreso_id_empresa FOREIGN KEY (id_empresa) REFERENCES public.empresa(id_empresa);


--
-- Name: orden_ingreso fk_orden_ingreso_id_proveedor; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_ingreso
    ADD CONSTRAINT fk_orden_ingreso_id_proveedor FOREIGN KEY (id_proveedor) REFERENCES public.proveedor(id_proveedor);


--
-- Name: orden_ingreso fk_orden_ingreso_id_usuario_registro; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_ingreso
    ADD CONSTRAINT fk_orden_ingreso_id_usuario_registro FOREIGN KEY (id_usuario_registro) REFERENCES public.usuario(id_usuario);


--
-- Name: orden_trabajo fk_orden_trabajo_id_cliente; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_trabajo
    ADD CONSTRAINT fk_orden_trabajo_id_cliente FOREIGN KEY (id_cliente) REFERENCES public.cliente(id_cliente);


--
-- Name: orden_trabajo fk_orden_trabajo_id_direccion; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_trabajo
    ADD CONSTRAINT fk_orden_trabajo_id_direccion FOREIGN KEY (id_direccion) REFERENCES public.direccion_servicio(id_direccion);


--
-- Name: orden_trabajo fk_orden_trabajo_id_empresa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_trabajo
    ADD CONSTRAINT fk_orden_trabajo_id_empresa FOREIGN KEY (id_empresa) REFERENCES public.empresa(id_empresa);


--
-- Name: orden_trabajo fk_orden_trabajo_id_prospecto; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_trabajo
    ADD CONSTRAINT fk_orden_trabajo_id_prospecto FOREIGN KEY (id_prospecto) REFERENCES public.prospecto(id_prospecto);


--
-- Name: orden_trabajo fk_orden_trabajo_id_servicio; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_trabajo
    ADD CONSTRAINT fk_orden_trabajo_id_servicio FOREIGN KEY (id_servicio) REFERENCES public.servicio_contratado(id_servicio);


--
-- Name: orden_trabajo fk_orden_trabajo_id_tecnico; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_trabajo
    ADD CONSTRAINT fk_orden_trabajo_id_tecnico FOREIGN KEY (id_tecnico) REFERENCES public.usuario(id_usuario);


--
-- Name: orden_trabajo fk_orden_trabajo_id_tecnico_externo; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_trabajo
    ADD CONSTRAINT fk_orden_trabajo_id_tecnico_externo FOREIGN KEY (id_tecnico_externo) REFERENCES public.tecnico_externo(id_tecnico_ext);


--
-- Name: orden_trabajo fk_orden_trabajo_id_ticket; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orden_trabajo
    ADD CONSTRAINT fk_orden_trabajo_id_ticket FOREIGN KEY (id_ticket) REFERENCES public.ticket(id_ticket);


--
-- Name: pago fk_pago_id_cliente; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pago
    ADD CONSTRAINT fk_pago_id_cliente FOREIGN KEY (id_cliente) REFERENCES public.cliente(id_cliente);


--
-- Name: pago fk_pago_id_factura; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pago
    ADD CONSTRAINT fk_pago_id_factura FOREIGN KEY (id_factura) REFERENCES public.factura(id_factura);


--
-- Name: plan fk_plan_id_empresa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan
    ADD CONSTRAINT fk_plan_id_empresa FOREIGN KEY (id_empresa) REFERENCES public.empresa(id_empresa);


--
-- Name: plan_zona_precio fk_plan_zona_precio_id_plan; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_zona_precio
    ADD CONSTRAINT fk_plan_zona_precio_id_plan FOREIGN KEY (id_plan) REFERENCES public.plan(id_plan);


--
-- Name: plan_zona_precio fk_plan_zona_precio_id_zona_pago; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_zona_precio
    ADD CONSTRAINT fk_plan_zona_precio_id_zona_pago FOREIGN KEY (id_zona_pago) REFERENCES public.zona_pago(id_zona_pago);


--
-- Name: plantilla_whatsapp fk_plantilla_whatsapp_id_canal; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plantilla_whatsapp
    ADD CONSTRAINT fk_plantilla_whatsapp_id_canal FOREIGN KEY (id_canal) REFERENCES public.canal_whatsapp(id_canal);


--
-- Name: prestamo_externo fk_prestamo_externo_id_empresa_prestamista; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prestamo_externo
    ADD CONSTRAINT fk_prestamo_externo_id_empresa_prestamista FOREIGN KEY (id_empresa_prestamista) REFERENCES public.empresa(id_empresa);


--
-- Name: prestamo_externo fk_prestamo_externo_id_unidad; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prestamo_externo
    ADD CONSTRAINT fk_prestamo_externo_id_unidad FOREIGN KEY (id_unidad) REFERENCES public.unidad_equipo(id_unidad);


--
-- Name: prospecto fk_prospecto_id_cliente; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospecto
    ADD CONSTRAINT fk_prospecto_id_cliente FOREIGN KEY (id_cliente) REFERENCES public.cliente(id_cliente);


--
-- Name: prospecto fk_prospecto_id_empresa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospecto
    ADD CONSTRAINT fk_prospecto_id_empresa FOREIGN KEY (id_empresa) REFERENCES public.empresa(id_empresa);


--
-- Name: prospecto fk_prospecto_id_usuario_comercial; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospecto
    ADD CONSTRAINT fk_prospecto_id_usuario_comercial FOREIGN KEY (id_usuario_comercial) REFERENCES public.usuario(id_usuario);


--
-- Name: prospecto fk_prospecto_id_usuario_perdida; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospecto
    ADD CONSTRAINT fk_prospecto_id_usuario_perdida FOREIGN KEY (id_usuario_perdida) REFERENCES public.usuario(id_usuario);


--
-- Name: puerto_nap fk_puerto_nap_id_caja_nap; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.puerto_nap
    ADD CONSTRAINT fk_puerto_nap_id_caja_nap FOREIGN KEY (id_caja_nap) REFERENCES public.caja_nap(id_caja_nap);


--
-- Name: puerto_nap fk_puerto_nap_id_cliente_asociado; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.puerto_nap
    ADD CONSTRAINT fk_puerto_nap_id_cliente_asociado FOREIGN KEY (id_cliente_asociado) REFERENCES public.cliente(id_cliente);


--
-- Name: punto_cobertura fk_punto_cobertura_id_empresa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.punto_cobertura
    ADD CONSTRAINT fk_punto_cobertura_id_empresa FOREIGN KEY (id_empresa) REFERENCES public.empresa(id_empresa);


--
-- Name: servicio_contratado fk_servicio_contratado_id_cliente; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicio_contratado
    ADD CONSTRAINT fk_servicio_contratado_id_cliente FOREIGN KEY (id_cliente) REFERENCES public.cliente(id_cliente);


--
-- Name: servicio_contratado fk_servicio_contratado_id_contrato; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicio_contratado
    ADD CONSTRAINT fk_servicio_contratado_id_contrato FOREIGN KEY (id_contrato) REFERENCES public.contrato(id_contrato);


--
-- Name: servicio_contratado fk_servicio_contratado_id_direccion; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicio_contratado
    ADD CONSTRAINT fk_servicio_contratado_id_direccion FOREIGN KEY (id_direccion) REFERENCES public.direccion_servicio(id_direccion);


--
-- Name: servicio_contratado fk_servicio_contratado_id_empresa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicio_contratado
    ADD CONSTRAINT fk_servicio_contratado_id_empresa FOREIGN KEY (id_empresa) REFERENCES public.empresa(id_empresa);


--
-- Name: servicio_contratado fk_servicio_contratado_id_zona_pago; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicio_contratado
    ADD CONSTRAINT fk_servicio_contratado_id_zona_pago FOREIGN KEY (id_zona_pago) REFERENCES public.zona_pago(id_zona_pago);


--
-- Name: sesion_portal fk_sesion_portal_id_cliente; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sesion_portal
    ADD CONSTRAINT fk_sesion_portal_id_cliente FOREIGN KEY (id_cliente) REFERENCES public.cliente(id_cliente);


--
-- Name: solicitud_cliente fk_solicitud_cliente_id_cliente; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitud_cliente
    ADD CONSTRAINT fk_solicitud_cliente_id_cliente FOREIGN KEY (id_cliente) REFERENCES public.cliente(id_cliente);


--
-- Name: solicitud_cliente fk_solicitud_cliente_id_empresa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitud_cliente
    ADD CONSTRAINT fk_solicitud_cliente_id_empresa FOREIGN KEY (id_empresa) REFERENCES public.empresa(id_empresa);


--
-- Name: solicitud_cliente fk_solicitud_cliente_id_servicio; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitud_cliente
    ADD CONSTRAINT fk_solicitud_cliente_id_servicio FOREIGN KEY (id_servicio) REFERENCES public.servicio_contratado(id_servicio);


--
-- Name: solicitud_cliente fk_solicitud_cliente_id_usuario_registro; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitud_cliente
    ADD CONSTRAINT fk_solicitud_cliente_id_usuario_registro FOREIGN KEY (id_usuario_registro) REFERENCES public.usuario(id_usuario);


--
-- Name: stock_consumible fk_stock_consumible_id_bodega; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_consumible
    ADD CONSTRAINT fk_stock_consumible_id_bodega FOREIGN KEY (id_bodega) REFERENCES public.bodega(id_bodega);


--
-- Name: stock_consumible fk_stock_consumible_id_tipo_equipo; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_consumible
    ADD CONSTRAINT fk_stock_consumible_id_tipo_equipo FOREIGN KEY (id_tipo_equipo) REFERENCES public.tipo_equipo(id_tipo_equipo);


--
-- Name: tarjeta_pon fk_tarjeta_pon_id_olt; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarjeta_pon
    ADD CONSTRAINT fk_tarjeta_pon_id_olt FOREIGN KEY (id_olt) REFERENCES public.olt(id_olt);


--
-- Name: ticket fk_ticket_id_categoria; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket
    ADD CONSTRAINT fk_ticket_id_categoria FOREIGN KEY (id_categoria) REFERENCES public.categoria_falla(id_categoria);


--
-- Name: ticket fk_ticket_id_cliente; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket
    ADD CONSTRAINT fk_ticket_id_cliente FOREIGN KEY (id_cliente) REFERENCES public.cliente(id_cliente);


--
-- Name: ticket fk_ticket_id_conversacion_bot; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket
    ADD CONSTRAINT fk_ticket_id_conversacion_bot FOREIGN KEY (id_conversacion_bot) REFERENCES public.conversacion_bot(id_conversacion);


--
-- Name: ticket fk_ticket_id_empresa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket
    ADD CONSTRAINT fk_ticket_id_empresa FOREIGN KEY (id_empresa) REFERENCES public.empresa(id_empresa);


--
-- Name: ticket fk_ticket_id_servicio; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket
    ADD CONSTRAINT fk_ticket_id_servicio FOREIGN KEY (id_servicio) REFERENCES public.servicio_contratado(id_servicio);


--
-- Name: ticket fk_ticket_id_usuario_asignado; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket
    ADD CONSTRAINT fk_ticket_id_usuario_asignado FOREIGN KEY (id_usuario_asignado) REFERENCES public.usuario(id_usuario);


--
-- Name: tipo_equipo fk_tipo_equipo_id_empresa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipo_equipo
    ADD CONSTRAINT fk_tipo_equipo_id_empresa FOREIGN KEY (id_empresa) REFERENCES public.empresa(id_empresa);


--
-- Name: transferencia_equipo fk_transferencia_equipo_id_empresa_destino; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transferencia_equipo
    ADD CONSTRAINT fk_transferencia_equipo_id_empresa_destino FOREIGN KEY (id_empresa_destino) REFERENCES public.empresa(id_empresa);


--
-- Name: transferencia_equipo fk_transferencia_equipo_id_empresa_origen; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transferencia_equipo
    ADD CONSTRAINT fk_transferencia_equipo_id_empresa_origen FOREIGN KEY (id_empresa_origen) REFERENCES public.empresa(id_empresa);


--
-- Name: transferencia_equipo fk_transferencia_equipo_id_usuario_registro; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transferencia_equipo
    ADD CONSTRAINT fk_transferencia_equipo_id_usuario_registro FOREIGN KEY (id_usuario_registro) REFERENCES public.usuario(id_usuario);


--
-- Name: unidad_equipo fk_unidad_equipo_id_bodega_actual; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unidad_equipo
    ADD CONSTRAINT fk_unidad_equipo_id_bodega_actual FOREIGN KEY (id_bodega_actual) REFERENCES public.bodega(id_bodega);


--
-- Name: unidad_equipo fk_unidad_equipo_id_caja_nap; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unidad_equipo
    ADD CONSTRAINT fk_unidad_equipo_id_caja_nap FOREIGN KEY (id_caja_nap) REFERENCES public.caja_nap(id_caja_nap);


--
-- Name: unidad_equipo fk_unidad_equipo_id_cliente_instalado; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unidad_equipo
    ADD CONSTRAINT fk_unidad_equipo_id_cliente_instalado FOREIGN KEY (id_cliente_instalado) REFERENCES public.cliente(id_cliente);


--
-- Name: unidad_equipo fk_unidad_equipo_id_empresa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unidad_equipo
    ADD CONSTRAINT fk_unidad_equipo_id_empresa FOREIGN KEY (id_empresa) REFERENCES public.empresa(id_empresa);


--
-- Name: unidad_equipo fk_unidad_equipo_id_servicio; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unidad_equipo
    ADD CONSTRAINT fk_unidad_equipo_id_servicio FOREIGN KEY (id_servicio) REFERENCES public.servicio_contratado(id_servicio);


--
-- Name: unidad_equipo fk_unidad_equipo_id_tipo_equipo; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unidad_equipo
    ADD CONSTRAINT fk_unidad_equipo_id_tipo_equipo FOREIGN KEY (id_tipo_equipo) REFERENCES public.tipo_equipo(id_tipo_equipo);


--
-- Name: uso_material_ot fk_uso_material_ot_id_ot; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uso_material_ot
    ADD CONSTRAINT fk_uso_material_ot_id_ot FOREIGN KEY (id_ot) REFERENCES public.orden_trabajo(id_ot);


--
-- Name: uso_material_ot fk_uso_material_ot_id_tipo_equipo; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uso_material_ot
    ADD CONSTRAINT fk_uso_material_ot_id_tipo_equipo FOREIGN KEY (id_tipo_equipo) REFERENCES public.tipo_equipo(id_tipo_equipo);


--
-- Name: uso_material_ot fk_uso_material_ot_id_unidad; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uso_material_ot
    ADD CONSTRAINT fk_uso_material_ot_id_unidad FOREIGN KEY (id_unidad) REFERENCES public.unidad_equipo(id_unidad);


--
-- Name: usuario fk_usuario_id_empresa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario
    ADD CONSTRAINT fk_usuario_id_empresa FOREIGN KEY (id_empresa) REFERENCES public.empresa(id_empresa);


--
-- Name: usuario_rol fk_usuario_rol_id_rol; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario_rol
    ADD CONSTRAINT fk_usuario_rol_id_rol FOREIGN KEY (id_rol) REFERENCES public.rol(id_rol);


--
-- Name: usuario_rol fk_usuario_rol_id_usuario; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario_rol
    ADD CONSTRAINT fk_usuario_rol_id_usuario FOREIGN KEY (id_usuario) REFERENCES public.usuario(id_usuario);


--
-- Name: zona_pago fk_zona_pago_id_empresa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zona_pago
    ADD CONSTRAINT fk_zona_pago_id_empresa FOREIGN KEY (id_empresa) REFERENCES public.empresa(id_empresa);


--
-- Name: garantia_comercial garantia_comercial_cliente_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.garantia_comercial
    ADD CONSTRAINT garantia_comercial_cliente_fkey FOREIGN KEY (id_cliente) REFERENCES public.cliente(id_cliente) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: garantia_comercial garantia_comercial_contrato_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.garantia_comercial
    ADD CONSTRAINT garantia_comercial_contrato_fkey FOREIGN KEY (id_contrato) REFERENCES public.contrato(id_contrato) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: garantia_comercial garantia_comercial_empresa_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.garantia_comercial
    ADD CONSTRAINT garantia_comercial_empresa_fkey FOREIGN KEY (id_empresa) REFERENCES public.empresa(id_empresa) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: garantia_comercial garantia_comercial_responsable_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.garantia_comercial
    ADD CONSTRAINT garantia_comercial_responsable_fkey FOREIGN KEY (id_usuario_responsable) REFERENCES public.usuario(id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: garantia_comercial garantia_comercial_servicio_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.garantia_comercial
    ADD CONSTRAINT garantia_comercial_servicio_fkey FOREIGN KEY (id_servicio) REFERENCES public.servicio_contratado(id_servicio) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: integracion_activacion_g1 integracion_activacion_g1_cliente_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integracion_activacion_g1
    ADD CONSTRAINT integracion_activacion_g1_cliente_fkey FOREIGN KEY (id_cliente) REFERENCES public.cliente(id_cliente) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: integracion_activacion_g1 integracion_activacion_g1_contrato_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integracion_activacion_g1
    ADD CONSTRAINT integracion_activacion_g1_contrato_fkey FOREIGN KEY (id_contrato) REFERENCES public.contrato(id_contrato) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: integracion_activacion_g1 integracion_activacion_g1_empresa_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integracion_activacion_g1
    ADD CONSTRAINT integracion_activacion_g1_empresa_fkey FOREIGN KEY (id_empresa) REFERENCES public.empresa(id_empresa) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: integracion_activacion_g1 integracion_activacion_g1_servicio_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integracion_activacion_g1
    ADD CONSTRAINT integracion_activacion_g1_servicio_fkey FOREIGN KEY (id_servicio) REFERENCES public.servicio_contratado(id_servicio) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: integracion_evento_entrante integracion_evento_entrante_id_integracion_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integracion_evento_entrante
    ADD CONSTRAINT integracion_evento_entrante_id_integracion_fkey FOREIGN KEY (id_integracion) REFERENCES public.integracion_instalacion_g3(id_integracion) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: integracion_instalacion_g3 integracion_instalacion_g3_id_cliente_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integracion_instalacion_g3
    ADD CONSTRAINT integracion_instalacion_g3_id_cliente_fkey FOREIGN KEY (id_cliente) REFERENCES public.cliente(id_cliente) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: integracion_instalacion_g3 integracion_instalacion_g3_id_contrato_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integracion_instalacion_g3
    ADD CONSTRAINT integracion_instalacion_g3_id_contrato_fkey FOREIGN KEY (id_contrato) REFERENCES public.contrato(id_contrato) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: integracion_instalacion_g3 integracion_instalacion_g3_id_empresa_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integracion_instalacion_g3
    ADD CONSTRAINT integracion_instalacion_g3_id_empresa_fkey FOREIGN KEY (id_empresa) REFERENCES public.empresa(id_empresa) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: integracion_instalacion_g3 integracion_instalacion_g3_id_plan_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integracion_instalacion_g3
    ADD CONSTRAINT integracion_instalacion_g3_id_plan_fkey FOREIGN KEY (id_plan) REFERENCES public.plan(id_plan) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: integracion_instalacion_g3 integracion_instalacion_g3_id_prospecto_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integracion_instalacion_g3
    ADD CONSTRAINT integracion_instalacion_g3_id_prospecto_fkey FOREIGN KEY (id_prospecto) REFERENCES public.prospecto(id_prospecto) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: integracion_instalacion_g3 integracion_instalacion_g3_id_servicio_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integracion_instalacion_g3
    ADD CONSTRAINT integracion_instalacion_g3_id_servicio_fkey FOREIGN KEY (id_servicio) REFERENCES public.servicio_contratado(id_servicio) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: prorroga_pago prorroga_pago_id_cliente_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prorroga_pago
    ADD CONSTRAINT prorroga_pago_id_cliente_fkey FOREIGN KEY (id_cliente) REFERENCES public.cliente(id_cliente) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: prorroga_pago prorroga_pago_id_contrato_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prorroga_pago
    ADD CONSTRAINT prorroga_pago_id_contrato_fkey FOREIGN KEY (id_contrato) REFERENCES public.contrato(id_contrato) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: prorroga_pago prorroga_pago_id_empresa_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prorroga_pago
    ADD CONSTRAINT prorroga_pago_id_empresa_fkey FOREIGN KEY (id_empresa) REFERENCES public.empresa(id_empresa) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: prorroga_pago prorroga_pago_id_factura_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prorroga_pago
    ADD CONSTRAINT prorroga_pago_id_factura_fkey FOREIGN KEY (id_factura) REFERENCES public.factura(id_factura) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: prorroga_pago prorroga_pago_id_usuario_responsable_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prorroga_pago
    ADD CONSTRAINT prorroga_pago_id_usuario_responsable_fkey FOREIGN KEY (id_usuario_responsable) REFERENCES public.usuario(id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: prospecto prospecto_id_zona_pago_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospecto
    ADD CONSTRAINT prospecto_id_zona_pago_fkey FOREIGN KEY (id_zona_pago) REFERENCES public.zona_pago(id_zona_pago) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: solicitud_retiro_servicio solicitud_retiro_servicio_id_cliente_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitud_retiro_servicio
    ADD CONSTRAINT solicitud_retiro_servicio_id_cliente_fkey FOREIGN KEY (id_cliente) REFERENCES public.cliente(id_cliente) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: solicitud_retiro_servicio solicitud_retiro_servicio_id_contrato_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitud_retiro_servicio
    ADD CONSTRAINT solicitud_retiro_servicio_id_contrato_fkey FOREIGN KEY (id_contrato) REFERENCES public.contrato(id_contrato) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: solicitud_retiro_servicio solicitud_retiro_servicio_id_empresa_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitud_retiro_servicio
    ADD CONSTRAINT solicitud_retiro_servicio_id_empresa_fkey FOREIGN KEY (id_empresa) REFERENCES public.empresa(id_empresa) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: solicitud_retiro_servicio solicitud_retiro_servicio_id_servicio_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitud_retiro_servicio
    ADD CONSTRAINT solicitud_retiro_servicio_id_servicio_fkey FOREIGN KEY (id_servicio) REFERENCES public.servicio_contratado(id_servicio) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: solicitud_retiro_servicio solicitud_retiro_servicio_id_usuario_responsable_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitud_retiro_servicio
    ADD CONSTRAINT solicitud_retiro_servicio_id_usuario_responsable_fkey FOREIGN KEY (id_usuario_responsable) REFERENCES public.usuario(id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: zona_pago zona_pago_id_zona_padre_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zona_pago
    ADD CONSTRAINT zona_pago_id_zona_padre_fkey FOREIGN KEY (id_zona_padre) REFERENCES public.zona_pago(id_zona_pago) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict 3CrDfEYtjrJWelw5rIHZs4kdB3Gsj7Ce6jUeEoL7gIcOXJTsrltAs9qr1qeNATU

