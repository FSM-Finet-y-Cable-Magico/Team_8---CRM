// Generated from init-global.sql SHA256 e3f43ed3e58fba9a73e8a3dd566e2ab245061bcdb6bfb60ac69c6be21692834c; no seeds or credentials.
export const GLOBAL_COLUMNS = [
  {
    "table": "empresa",
    "name": "id_empresa",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "empresa",
    "name": "nombre",
    "type": "varchar(100)",
    "nullable": false
  },
  {
    "table": "empresa",
    "name": "rut_empresa",
    "type": "varchar(12)",
    "nullable": true
  },
  {
    "table": "empresa",
    "name": "esquema_db",
    "type": "varchar(50)",
    "nullable": true
  },
  {
    "table": "empresa",
    "name": "umbral_desconexion_min",
    "type": "smallint",
    "nullable": true
  },
  {
    "table": "log_auditoria",
    "name": "id_log",
    "type": "bigint",
    "nullable": false
  },
  {
    "table": "log_auditoria",
    "name": "id_usuario",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "log_auditoria",
    "name": "accion",
    "type": "varchar(100)",
    "nullable": false
  },
  {
    "table": "log_auditoria",
    "name": "entidad_afectada",
    "type": "varchar(100)",
    "nullable": true
  },
  {
    "table": "log_auditoria",
    "name": "id_entidad_afectada",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "log_auditoria",
    "name": "valor_anterior",
    "type": "jsonb",
    "nullable": true
  },
  {
    "table": "log_auditoria",
    "name": "valor_nuevo",
    "type": "jsonb",
    "nullable": true
  },
  {
    "table": "log_auditoria",
    "name": "ip_origen",
    "type": "varchar(45)",
    "nullable": true
  },
  {
    "table": "log_auditoria",
    "name": "fecha_hora",
    "type": "timestamptz",
    "nullable": true
  },
  {
    "table": "rol",
    "name": "id_rol",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "rol",
    "name": "nombre_rol",
    "type": "varchar(50)",
    "nullable": false
  },
  {
    "table": "rol",
    "name": "descripcion",
    "type": "text",
    "nullable": true
  },
  {
    "table": "usuario",
    "name": "id_usuario",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "usuario",
    "name": "id_empresa",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "usuario",
    "name": "nombre_completo",
    "type": "varchar(150)",
    "nullable": false
  },
  {
    "table": "usuario",
    "name": "nombre_usuario",
    "type": "varchar(50)",
    "nullable": true
  },
  {
    "table": "usuario",
    "name": "email",
    "type": "varchar(150)",
    "nullable": true
  },
  {
    "table": "usuario",
    "name": "password_hash",
    "type": "varchar(255)",
    "nullable": false
  },
  {
    "table": "usuario",
    "name": "activo",
    "type": "boolean",
    "nullable": true
  },
  {
    "table": "usuario",
    "name": "fecha_creacion",
    "type": "timestamptz",
    "nullable": true
  },
  {
    "table": "usuario",
    "name": "es_password_temporal",
    "type": "boolean",
    "nullable": true
  },
  {
    "table": "usuario",
    "name": "intentos_fallidos",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "usuario",
    "name": "version_sesion",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "usuario",
    "name": "bloqueado_hasta",
    "type": "timestamptz",
    "nullable": true
  },
  {
    "table": "usuario",
    "name": "debe_cambiar_password",
    "type": "boolean",
    "nullable": true
  },
  {
    "table": "usuario",
    "name": "rut",
    "type": "varchar(12)",
    "nullable": true
  },
  {
    "table": "usuario_rol",
    "name": "id_usuario_rol",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "usuario_rol",
    "name": "id_usuario",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "usuario_rol",
    "name": "id_rol",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "usuario_rol",
    "name": "fecha_asignacion",
    "type": "timestamptz",
    "nullable": true
  },
  {
    "table": "asignacion_equipo_servicio",
    "name": "id_asignacion",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "asignacion_equipo_servicio",
    "name": "id_unidad",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "asignacion_equipo_servicio",
    "name": "id_empresa",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "asignacion_equipo_servicio",
    "name": "event_id",
    "type": "varchar(100)",
    "nullable": true
  },
  {
    "table": "asignacion_equipo_servicio",
    "name": "id_cliente_externo",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "asignacion_equipo_servicio",
    "name": "rut_cliente",
    "type": "varchar(20)",
    "nullable": true
  },
  {
    "table": "asignacion_equipo_servicio",
    "name": "id_servicio_externo",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "asignacion_equipo_servicio",
    "name": "id_contrato_externo",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "asignacion_equipo_servicio",
    "name": "id_ot",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "asignacion_equipo_servicio",
    "name": "fecha_instalacion",
    "type": "timestamptz",
    "nullable": false
  },
  {
    "table": "asignacion_equipo_servicio",
    "name": "fecha_retiro",
    "type": "timestamptz",
    "nullable": true
  },
  {
    "table": "asignacion_equipo_servicio",
    "name": "activa",
    "type": "boolean",
    "nullable": false
  },
  {
    "table": "asignacion_equipo_servicio",
    "name": "origen",
    "type": "varchar(30)",
    "nullable": true
  },
  {
    "table": "asignacion_equipo_servicio",
    "name": "trace_id",
    "type": "varchar(100)",
    "nullable": true
  },
  {
    "table": "baja_equipo",
    "name": "id_baja",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "baja_equipo",
    "name": "id_unidad",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "baja_equipo",
    "name": "id_usuario",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "baja_equipo",
    "name": "motivo_baja",
    "type": "text",
    "nullable": false
  },
  {
    "table": "baja_equipo",
    "name": "tipo_baja",
    "type": "varchar(20)",
    "nullable": true
  },
  {
    "table": "baja_equipo",
    "name": "donacion_destinatario",
    "type": "varchar(150)",
    "nullable": true
  },
  {
    "table": "baja_equipo",
    "name": "fecha_baja",
    "type": "date",
    "nullable": true
  },
  {
    "table": "bodega",
    "name": "id_bodega",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "bodega",
    "name": "id_empresa",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "bodega",
    "name": "nombre",
    "type": "varchar(100)",
    "nullable": false
  },
  {
    "table": "bodega",
    "name": "direccion",
    "type": "varchar(200)",
    "nullable": true
  },
  {
    "table": "bodega",
    "name": "activa",
    "type": "boolean",
    "nullable": true
  },
  {
    "table": "bodega",
    "name": "id_usuario_responsable",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "detalle_orden_ingreso",
    "name": "id_detalle",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "detalle_orden_ingreso",
    "name": "id_orden",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "detalle_orden_ingreso",
    "name": "id_tipo_equipo",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "detalle_orden_ingreso",
    "name": "cantidad_solicitada",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "detalle_orden_ingreso",
    "name": "cantidad_recibida",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "donacion",
    "name": "id_donacion",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "donacion",
    "name": "nombre_institucion",
    "type": "varchar(100)",
    "nullable": false
  },
  {
    "table": "donacion",
    "name": "rut_institucion",
    "type": "varchar(12)",
    "nullable": false
  },
  {
    "table": "donacion",
    "name": "fecha_donacion",
    "type": "date",
    "nullable": false
  },
  {
    "table": "donacion",
    "name": "numero_resolucion",
    "type": "varchar(30)",
    "nullable": true
  },
  {
    "table": "donacion",
    "name": "id_usuario",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "donacion",
    "name": "id_empresa",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "donacion",
    "name": "fecha_creacion",
    "type": "timestamptz",
    "nullable": true
  },
  {
    "table": "donacion_detalle",
    "name": "id_detalle",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "donacion_detalle",
    "name": "id_donacion",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "donacion_detalle",
    "name": "id_unidad",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "historial_estado_equipo",
    "name": "id_historial",
    "type": "bigint",
    "nullable": false
  },
  {
    "table": "historial_estado_equipo",
    "name": "id_unidad",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "historial_estado_equipo",
    "name": "id_usuario",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "historial_estado_equipo",
    "name": "estado_anterior",
    "type": "varchar(30)",
    "nullable": true
  },
  {
    "table": "historial_estado_equipo",
    "name": "estado_nuevo",
    "type": "varchar(30)",
    "nullable": true
  },
  {
    "table": "historial_estado_equipo",
    "name": "motivo",
    "type": "text",
    "nullable": true
  },
  {
    "table": "historial_estado_equipo",
    "name": "fecha_hora",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "inventario_personal_tecnico",
    "name": "id_inventario",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "inventario_personal_tecnico",
    "name": "id_tecnico",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "inventario_personal_tecnico",
    "name": "id_tipo_equipo",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "inventario_personal_tecnico",
    "name": "cantidad",
    "type": "numeric(10,2)",
    "nullable": true
  },
  {
    "table": "inventario_personal_tecnico",
    "name": "fecha_actualizacion",
    "type": "timestamptz",
    "nullable": true
  },
  {
    "table": "movimiento_inventario",
    "name": "id_movimiento",
    "type": "bigint",
    "nullable": false
  },
  {
    "table": "movimiento_inventario",
    "name": "id_tipo_equipo",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "movimiento_inventario",
    "name": "id_unidad",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "movimiento_inventario",
    "name": "id_empresa_origen",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "movimiento_inventario",
    "name": "id_empresa_destino",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "movimiento_inventario",
    "name": "id_bodega_origen",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "movimiento_inventario",
    "name": "id_bodega_destino",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "movimiento_inventario",
    "name": "id_usuario",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "movimiento_inventario",
    "name": "tipo_movimiento",
    "type": "varchar(30)",
    "nullable": true
  },
  {
    "table": "movimiento_inventario",
    "name": "cantidad",
    "type": "numeric(10,2)",
    "nullable": true
  },
  {
    "table": "movimiento_inventario",
    "name": "fecha",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "movimiento_inventario",
    "name": "referencia_id",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "orden_ingreso",
    "name": "id_orden",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "orden_ingreso",
    "name": "id_proveedor",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "orden_ingreso",
    "name": "id_bodega",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "orden_ingreso",
    "name": "id_empresa",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "orden_ingreso",
    "name": "id_usuario_registro",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "orden_ingreso",
    "name": "fecha_creacion",
    "type": "timestamptz",
    "nullable": true
  },
  {
    "table": "orden_ingreso",
    "name": "fecha_recepcion",
    "type": "date",
    "nullable": true
  },
  {
    "table": "orden_ingreso",
    "name": "estado",
    "type": "varchar(30)",
    "nullable": true
  },
  {
    "table": "orden_ingreso",
    "name": "factura_proveedor",
    "type": "varchar(50)",
    "nullable": true
  },
  {
    "table": "orden_ingreso",
    "name": "correlativo",
    "type": "varchar(10)",
    "nullable": true
  },
  {
    "table": "orden_ingreso",
    "name": "numero_documento",
    "type": "varchar(30)",
    "nullable": true
  },
  {
    "table": "orden_ingreso",
    "name": "fecha_documento",
    "type": "date",
    "nullable": true
  },
  {
    "table": "orden_ingreso",
    "name": "id_empresa_destino",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "orden_ingreso",
    "name": "id_bodega_destino",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "orden_ingreso_detalle",
    "name": "id_detalle",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "orden_ingreso_detalle",
    "name": "id_orden",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "orden_ingreso_detalle",
    "name": "id_tipo_equipo",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "orden_ingreso_detalle",
    "name": "cantidad_esperada",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "orden_ingreso_detalle",
    "name": "garantia_dias",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "orden_ingreso_detalle",
    "name": "cantidad_recibida",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "prestamo_detalle",
    "name": "id_detalle",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "prestamo_detalle",
    "name": "id_prestamo",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "prestamo_detalle",
    "name": "id_unidad",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "prestamo_detalle",
    "name": "id_tipo_equipo",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "prestamo_detalle",
    "name": "cantidad",
    "type": "numeric(10,2)",
    "nullable": true
  },
  {
    "table": "prestamo_detalle",
    "name": "cantidad_retornada",
    "type": "numeric(10,2)",
    "nullable": true
  },
  {
    "table": "prestamo_externo",
    "name": "id_prestamo",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "prestamo_externo",
    "name": "id_unidad",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "prestamo_externo",
    "name": "id_empresa_prestamista",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "prestamo_externo",
    "name": "destinatario",
    "type": "varchar(100)",
    "nullable": true
  },
  {
    "table": "prestamo_externo",
    "name": "motivo",
    "type": "text",
    "nullable": true
  },
  {
    "table": "prestamo_externo",
    "name": "fecha_salida",
    "type": "timestamptz",
    "nullable": true
  },
  {
    "table": "prestamo_externo",
    "name": "fecha_retorno_esperada",
    "type": "date",
    "nullable": true
  },
  {
    "table": "prestamo_externo",
    "name": "fecha_retorno_real",
    "type": "date",
    "nullable": true
  },
  {
    "table": "prestamo_externo",
    "name": "estado",
    "type": "varchar(20)",
    "nullable": true
  },
  {
    "table": "prestamo_externo",
    "name": "condicion_retorno",
    "type": "text",
    "nullable": true
  },
  {
    "table": "prestamo_externo",
    "name": "tipo",
    "type": "varchar(30)",
    "nullable": true
  },
  {
    "table": "prestamo_externo",
    "name": "id_empresa",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "prestamo_externo",
    "name": "nombre_receptor",
    "type": "varchar(80)",
    "nullable": true
  },
  {
    "table": "prestamo_externo",
    "name": "rut_receptor",
    "type": "varchar(12)",
    "nullable": true
  },
  {
    "table": "prestamo_externo",
    "name": "fecha_retorno_estimada",
    "type": "date",
    "nullable": true
  },
  {
    "table": "prestamo_externo",
    "name": "detalle",
    "type": "text",
    "nullable": true
  },
  {
    "table": "prestamo_externo",
    "name": "resultado",
    "type": "varchar(20)",
    "nullable": true
  },
  {
    "table": "prestamo_externo",
    "name": "id_usuario_registro",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "prestamo_externo",
    "name": "correlativo",
    "type": "varchar(12)",
    "nullable": true
  },
  {
    "table": "prestamo_externo",
    "name": "id_bodega_origen",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "prestamo_retorno",
    "name": "id_retorno",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "prestamo_retorno",
    "name": "id_detalle",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "prestamo_retorno",
    "name": "cantidad",
    "type": "numeric(10,2)",
    "nullable": true
  },
  {
    "table": "prestamo_retorno",
    "name": "fecha_retorno",
    "type": "timestamptz",
    "nullable": false
  },
  {
    "table": "prestamo_retorno",
    "name": "observacion",
    "type": "varchar(300)",
    "nullable": true
  },
  {
    "table": "prestamo_retorno",
    "name": "id_usuario",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "proveedor",
    "name": "id_proveedor",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "proveedor",
    "name": "nombre_comercial",
    "type": "varchar(100)",
    "nullable": false
  },
  {
    "table": "proveedor",
    "name": "rut_proveedor",
    "type": "varchar(12)",
    "nullable": true
  },
  {
    "table": "proveedor",
    "name": "contacto",
    "type": "varchar(80)",
    "nullable": true
  },
  {
    "table": "proveedor",
    "name": "telefono",
    "type": "varchar(20)",
    "nullable": true
  },
  {
    "table": "proveedor",
    "name": "email",
    "type": "varchar(150)",
    "nullable": true
  },
  {
    "table": "proveedor",
    "name": "rut",
    "type": "varchar(12)",
    "nullable": true
  },
  {
    "table": "proveedor",
    "name": "nombre_contacto",
    "type": "varchar(80)",
    "nullable": true
  },
  {
    "table": "proveedor",
    "name": "activa",
    "type": "boolean",
    "nullable": true
  },
  {
    "table": "proveedor",
    "name": "fecha_creacion",
    "type": "timestamptz",
    "nullable": true
  },
  {
    "table": "proveedor_tipo_equipo",
    "name": "id",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "proveedor_tipo_equipo",
    "name": "id_proveedor",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "proveedor_tipo_equipo",
    "name": "id_tipo_equipo",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "salida_bodega",
    "name": "id_salida",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "salida_bodega",
    "name": "id_tecnico",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "salida_bodega",
    "name": "id_bodega_origen",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "salida_bodega",
    "name": "fecha_hora",
    "type": "timestamptz",
    "nullable": true
  },
  {
    "table": "salida_bodega",
    "name": "id_empresa",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "salida_bodega",
    "name": "id_usuario_registro",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "salida_detalle",
    "name": "id_detalle",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "salida_detalle",
    "name": "id_salida",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "salida_detalle",
    "name": "id_tipo_equipo",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "salida_detalle",
    "name": "id_unidad",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "salida_detalle",
    "name": "cantidad",
    "type": "numeric(10,2)",
    "nullable": true
  },
  {
    "table": "secuencia_srv",
    "name": "id_empresa",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "secuencia_srv",
    "name": "anio",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "secuencia_srv",
    "name": "ultimo",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "solicitud_baja",
    "name": "id_solicitud",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "solicitud_baja",
    "name": "id_unidad",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "solicitud_baja",
    "name": "id_empresa",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "solicitud_baja",
    "name": "id_usuario_solicitante",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "solicitud_baja",
    "name": "motivo",
    "type": "varchar(40)",
    "nullable": false
  },
  {
    "table": "solicitud_baja",
    "name": "motivo_otro",
    "type": "varchar(200)",
    "nullable": true
  },
  {
    "table": "solicitud_baja",
    "name": "estado",
    "type": "varchar(30)",
    "nullable": false
  },
  {
    "table": "solicitud_baja",
    "name": "id_usuario_aprobador",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "solicitud_baja",
    "name": "fecha_solicitud",
    "type": "timestamptz",
    "nullable": true
  },
  {
    "table": "solicitud_baja",
    "name": "fecha_resolucion",
    "type": "timestamptz",
    "nullable": true
  },
  {
    "table": "solicitud_baja",
    "name": "motivo_rechazo",
    "type": "varchar(200)",
    "nullable": true
  },
  {
    "table": "stock_consumible",
    "name": "id_stock",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "stock_consumible",
    "name": "id_tipo_equipo",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "stock_consumible",
    "name": "id_bodega",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "stock_consumible",
    "name": "cantidad_disponible",
    "type": "numeric(10,2)",
    "nullable": true
  },
  {
    "table": "stock_consumible",
    "name": "umbral_minimo",
    "type": "numeric(10,2)",
    "nullable": true
  },
  {
    "table": "tipo_equipo",
    "name": "id_tipo_equipo",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "tipo_equipo",
    "name": "id_empresa",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "tipo_equipo",
    "name": "nombre",
    "type": "varchar(100)",
    "nullable": false
  },
  {
    "table": "tipo_equipo",
    "name": "categoria",
    "type": "varchar(40)",
    "nullable": true
  },
  {
    "table": "tipo_equipo",
    "name": "requiere_serie_individual",
    "type": "boolean",
    "nullable": true
  },
  {
    "table": "tipo_equipo",
    "name": "ficha_tecnica_pdf_url",
    "type": "text",
    "nullable": true
  },
  {
    "table": "tipo_equipo",
    "name": "activo",
    "type": "boolean",
    "nullable": true
  },
  {
    "table": "tipo_equipo",
    "name": "marca",
    "type": "varchar(50)",
    "nullable": true
  },
  {
    "table": "tipo_equipo",
    "name": "modelo",
    "type": "varchar(50)",
    "nullable": true
  },
  {
    "table": "tipo_equipo",
    "name": "descripcion_tecnica",
    "type": "varchar(500)",
    "nullable": true
  },
  {
    "table": "tipo_equipo",
    "name": "unidad_medida",
    "type": "varchar(20)",
    "nullable": true
  },
  {
    "table": "tipo_equipo",
    "name": "garantia_dias",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "tipo_equipo",
    "name": "ficha_tecnica_nombre",
    "type": "varchar(255)",
    "nullable": true
  },
  {
    "table": "transferencia_equipo",
    "name": "id_transferencia",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "transferencia_equipo",
    "name": "id_empresa_origen",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "transferencia_equipo",
    "name": "id_empresa_destino",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "transferencia_equipo",
    "name": "id_usuario_registro",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "transferencia_equipo",
    "name": "fecha_transferencia",
    "type": "date",
    "nullable": true
  },
  {
    "table": "transferencia_equipo",
    "name": "observaciones",
    "type": "text",
    "nullable": true
  },
  {
    "table": "unidad_equipo",
    "name": "id_unidad",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "unidad_equipo",
    "name": "id_tipo_equipo",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "unidad_equipo",
    "name": "id_empresa",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "unidad_equipo",
    "name": "numero_serie",
    "type": "varchar(80)",
    "nullable": false
  },
  {
    "table": "unidad_equipo",
    "name": "modelo",
    "type": "varchar(80)",
    "nullable": true
  },
  {
    "table": "unidad_equipo",
    "name": "estado",
    "type": "varchar(30)",
    "nullable": false
  },
  {
    "table": "unidad_equipo",
    "name": "fecha_adquisicion",
    "type": "date",
    "nullable": true
  },
  {
    "table": "unidad_equipo",
    "name": "fecha_venc_garantia",
    "type": "date",
    "nullable": true
  },
  {
    "table": "unidad_equipo",
    "name": "diagnostico_tecnico",
    "type": "text",
    "nullable": true
  },
  {
    "table": "unidad_equipo",
    "name": "id_cliente_instalado",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "unidad_equipo",
    "name": "id_servicio",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "unidad_equipo",
    "name": "id_bodega_actual",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "unidad_equipo",
    "name": "numero_poste",
    "type": "varchar(30)",
    "nullable": true
  },
  {
    "table": "unidad_equipo",
    "name": "id_caja_nap",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "unidad_equipo",
    "name": "modalidad_asignacion",
    "type": "varchar(30)",
    "nullable": true
  },
  {
    "table": "unidad_equipo",
    "name": "valor_arriendo_mensual",
    "type": "numeric(10,2)",
    "nullable": true
  },
  {
    "table": "unidad_equipo",
    "name": "fecha_inicio_asignacion",
    "type": "date",
    "nullable": true
  },
  {
    "table": "unidad_equipo",
    "name": "mac_address",
    "type": "varchar(17)",
    "nullable": true
  },
  {
    "table": "unidad_equipo",
    "name": "proveedor",
    "type": "varchar(80)",
    "nullable": true
  },
  {
    "table": "unidad_equipo",
    "name": "observaciones",
    "type": "varchar(300)",
    "nullable": true
  },
  {
    "table": "unidad_equipo",
    "name": "ubicacion_fisica",
    "type": "varchar(60)",
    "nullable": true
  },
  {
    "table": "unidad_equipo",
    "name": "motivo_baja",
    "type": "varchar(40)",
    "nullable": true
  },
  {
    "table": "unidad_equipo",
    "name": "motivo_baja_detalle",
    "type": "varchar(200)",
    "nullable": true
  },
  {
    "table": "unidad_equipo",
    "name": "id_tecnico_asignado",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "unidad_equipo",
    "name": "cliente_rut",
    "type": "varchar(20)",
    "nullable": true
  },
  {
    "table": "unidad_equipo",
    "name": "cliente_nombre",
    "type": "varchar(150)",
    "nullable": true
  },
  {
    "table": "unidad_equipo",
    "name": "direccion_instalacion",
    "type": "varchar(300)",
    "nullable": true
  },
  {
    "table": "unidad_equipo",
    "name": "comuna_instalacion",
    "type": "varchar(100)",
    "nullable": true
  },
  {
    "table": "unidad_equipo",
    "name": "srv",
    "type": "varchar(20)",
    "nullable": true
  },
  {
    "table": "cambio_condicion_pago",
    "name": "id_cambio",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "cambio_condicion_pago",
    "name": "id_empresa",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "cambio_condicion_pago",
    "name": "id_cliente",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "cambio_condicion_pago",
    "name": "id_contrato",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "cambio_condicion_pago",
    "name": "id_factura",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "cambio_condicion_pago",
    "name": "tipo_cambio",
    "type": "varchar(30)",
    "nullable": false
  },
  {
    "table": "cambio_condicion_pago",
    "name": "valor_anterior",
    "type": "varchar(40)",
    "nullable": false
  },
  {
    "table": "cambio_condicion_pago",
    "name": "valor_nuevo",
    "type": "varchar(40)",
    "nullable": false
  },
  {
    "table": "cambio_condicion_pago",
    "name": "justificacion",
    "type": "text",
    "nullable": false
  },
  {
    "table": "cambio_condicion_pago",
    "name": "id_usuario_responsable",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "cambio_condicion_pago",
    "name": "fecha_registro",
    "type": "timestamptz",
    "nullable": false
  },
  {
    "table": "cargo_adicional",
    "name": "id_cargo",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "cargo_adicional",
    "name": "id_empresa",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "cargo_adicional",
    "name": "id_cliente",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "cargo_adicional",
    "name": "id_contrato",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "cargo_adicional",
    "name": "id_servicio",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "cargo_adicional",
    "name": "tipo",
    "type": "varchar(30)",
    "nullable": false
  },
  {
    "table": "cargo_adicional",
    "name": "monto",
    "type": "numeric(12,2)",
    "nullable": false
  },
  {
    "table": "cargo_adicional",
    "name": "fecha",
    "type": "date",
    "nullable": false
  },
  {
    "table": "cargo_adicional",
    "name": "estado",
    "type": "varchar(30)",
    "nullable": false
  },
  {
    "table": "cargo_adicional",
    "name": "afecta_saldo",
    "type": "boolean",
    "nullable": false
  },
  {
    "table": "cargo_adicional",
    "name": "observacion",
    "type": "text",
    "nullable": true
  },
  {
    "table": "cargo_adicional",
    "name": "id_usuario_responsable",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "cargo_adicional",
    "name": "fecha_registro",
    "type": "timestamptz",
    "nullable": false
  },
  {
    "table": "cliente",
    "name": "id_cliente",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "cliente",
    "name": "id_empresa",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "cliente",
    "name": "rut",
    "type": "varchar(12)",
    "nullable": true
  },
  {
    "table": "cliente",
    "name": "nombre_completo",
    "type": "varchar(120)",
    "nullable": false
  },
  {
    "table": "cliente",
    "name": "email",
    "type": "varchar(120)",
    "nullable": true
  },
  {
    "table": "cliente",
    "name": "telefono",
    "type": "varchar(20)",
    "nullable": true
  },
  {
    "table": "cliente",
    "name": "password_portal_hash",
    "type": "varchar(72)",
    "nullable": true
  },
  {
    "table": "cliente",
    "name": "estado",
    "type": "varchar(40)",
    "nullable": false
  },
  {
    "table": "cliente",
    "name": "es_conflictivo",
    "type": "boolean",
    "nullable": true
  },
  {
    "table": "cliente",
    "name": "importado_masivo",
    "type": "boolean",
    "nullable": true
  },
  {
    "table": "cliente",
    "name": "origen_contacto",
    "type": "varchar(40)",
    "nullable": true
  },
  {
    "table": "cliente",
    "name": "datos_tecnicos",
    "type": "jsonb",
    "nullable": true
  },
  {
    "table": "cliente",
    "name": "fecha_creacion",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "cliente",
    "name": "obs_conflictivo",
    "type": "text",
    "nullable": true
  },
  {
    "table": "contrato",
    "name": "id_contrato",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "contrato",
    "name": "id_cliente",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "contrato",
    "name": "id_plan",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "contrato",
    "name": "id_empresa",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "contrato",
    "name": "fecha_inicio",
    "type": "date",
    "nullable": false
  },
  {
    "table": "contrato",
    "name": "dia_vencimiento",
    "type": "smallint",
    "nullable": false
  },
  {
    "table": "contrato",
    "name": "estado",
    "type": "varchar(40)",
    "nullable": false
  },
  {
    "table": "contrato",
    "name": "fecha_suspension",
    "type": "date",
    "nullable": true
  },
  {
    "table": "contrato",
    "name": "id_zona_pago",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "contrato",
    "name": "proveedor_contrato",
    "type": "varchar(40)",
    "nullable": true
  },
  {
    "table": "contrato",
    "name": "numero_contrato_externo",
    "type": "varchar(80)",
    "nullable": true
  },
  {
    "table": "contrato",
    "name": "folio_contrato_externo",
    "type": "varchar(80)",
    "nullable": true
  },
  {
    "table": "contrato",
    "name": "url_contrato_pdf",
    "type": "text",
    "nullable": true
  },
  {
    "table": "contrato",
    "name": "fecha_generacion_contrato",
    "type": "date",
    "nullable": true
  },
  {
    "table": "contrato",
    "name": "fecha_envio_cliente",
    "type": "date",
    "nullable": true
  },
  {
    "table": "contrato",
    "name": "observacion_contrato",
    "type": "text",
    "nullable": true
  },
  {
    "table": "contrato",
    "name": "fecha_firma_manual",
    "type": "date",
    "nullable": true
  },
  {
    "table": "contrato",
    "name": "id_usuario_firma_manual",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "contrato",
    "name": "observacion_firma_manual",
    "type": "text",
    "nullable": true
  },
  {
    "table": "contrato",
    "name": "id_prospecto",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "contrato",
    "name": "direccion_instalacion",
    "type": "varchar(200)",
    "nullable": true
  },
  {
    "table": "contrato",
    "name": "comuna_instalacion",
    "type": "varchar(80)",
    "nullable": true
  },
  {
    "table": "contrato",
    "name": "ciudad_instalacion",
    "type": "varchar(80)",
    "nullable": true
  },
  {
    "table": "contrato_digital",
    "name": "id_contrato_digital",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "contrato_digital",
    "name": "id_contrato",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "contrato_digital",
    "name": "id_cliente",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "contrato_digital",
    "name": "id_empresa",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "contrato_digital",
    "name": "url_documento",
    "type": "text",
    "nullable": false
  },
  {
    "table": "contrato_digital",
    "name": "hash_documento",
    "type": "varchar(128)",
    "nullable": false
  },
  {
    "table": "contrato_digital",
    "name": "estado_firma",
    "type": "varchar(30)",
    "nullable": false
  },
  {
    "table": "contrato_digital",
    "name": "fecha_generacion",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "contrato_digital",
    "name": "fecha_firma",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "contrato_digital",
    "name": "id_usuario_generador",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "contrato_digital",
    "name": "version",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "convenio_pago",
    "name": "id_convenio",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "convenio_pago",
    "name": "id_empresa",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "convenio_pago",
    "name": "id_cliente",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "convenio_pago",
    "name": "id_servicio",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "convenio_pago",
    "name": "id_contrato",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "convenio_pago",
    "name": "id_factura",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "convenio_pago",
    "name": "monto_comprometido",
    "type": "numeric(12,2)",
    "nullable": false
  },
  {
    "table": "convenio_pago",
    "name": "cantidad_cuotas",
    "type": "smallint",
    "nullable": false
  },
  {
    "table": "convenio_pago",
    "name": "condiciones",
    "type": "text",
    "nullable": false
  },
  {
    "table": "convenio_pago",
    "name": "fecha_inicio",
    "type": "date",
    "nullable": false
  },
  {
    "table": "convenio_pago",
    "name": "estado",
    "type": "varchar(20)",
    "nullable": false
  },
  {
    "table": "convenio_pago",
    "name": "id_usuario_responsable",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "convenio_pago",
    "name": "id_usuario_aprobador",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "convenio_pago",
    "name": "fecha_registro",
    "type": "timestamptz",
    "nullable": false
  },
  {
    "table": "convenio_pago",
    "name": "fecha_aprobacion",
    "type": "timestamptz",
    "nullable": true
  },
  {
    "table": "cotizacion",
    "name": "id_cotizacion",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "cotizacion",
    "name": "id_prospecto",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "cotizacion",
    "name": "id_plan",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "cotizacion",
    "name": "pdf_url",
    "type": "text",
    "nullable": true
  },
  {
    "table": "cotizacion",
    "name": "fecha_envio",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "cotizacion",
    "name": "factibilidad_verificada",
    "type": "boolean",
    "nullable": true
  },
  {
    "table": "credenciales_tvip",
    "name": "id_credencial",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "credenciales_tvip",
    "name": "id_contrato",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "credenciales_tvip",
    "name": "usuario_tvip",
    "type": "varchar(80)",
    "nullable": true
  },
  {
    "table": "credenciales_tvip",
    "name": "password_tvip_hash",
    "type": "varchar(72)",
    "nullable": true
  },
  {
    "table": "credenciales_tvip",
    "name": "fecha_generacion",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "cuota_convenio_pago",
    "name": "id_cuota",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "cuota_convenio_pago",
    "name": "id_convenio",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "cuota_convenio_pago",
    "name": "numero",
    "type": "smallint",
    "nullable": false
  },
  {
    "table": "cuota_convenio_pago",
    "name": "monto",
    "type": "numeric(12,2)",
    "nullable": false
  },
  {
    "table": "cuota_convenio_pago",
    "name": "fecha_vencimiento",
    "type": "date",
    "nullable": false
  },
  {
    "table": "cuota_convenio_pago",
    "name": "estado",
    "type": "varchar(20)",
    "nullable": false
  },
  {
    "table": "cuota_convenio_pago",
    "name": "fecha_pago",
    "type": "date",
    "nullable": true
  },
  {
    "table": "direccion_servicio",
    "name": "id_direccion",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "direccion_servicio",
    "name": "id_cliente",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "direccion_servicio",
    "name": "direccion_completa",
    "type": "varchar(200)",
    "nullable": false
  },
  {
    "table": "direccion_servicio",
    "name": "comuna",
    "type": "varchar(80)",
    "nullable": false
  },
  {
    "table": "direccion_servicio",
    "name": "ciudad",
    "type": "varchar(80)",
    "nullable": true
  },
  {
    "table": "direccion_servicio",
    "name": "es_principal",
    "type": "boolean",
    "nullable": true
  },
  {
    "table": "documento_tributario_externo",
    "name": "id_documento",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "documento_tributario_externo",
    "name": "id_empresa",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "documento_tributario_externo",
    "name": "tipo_documento",
    "type": "varchar(20)",
    "nullable": false
  },
  {
    "table": "documento_tributario_externo",
    "name": "folio_o_numero",
    "type": "varchar(80)",
    "nullable": false
  },
  {
    "table": "documento_tributario_externo",
    "name": "folio_normalizado",
    "type": "varchar(80)",
    "nullable": false
  },
  {
    "table": "documento_tributario_externo",
    "name": "emisor_proveedor",
    "type": "varchar(160)",
    "nullable": false
  },
  {
    "table": "documento_tributario_externo",
    "name": "emisor_normalizado",
    "type": "varchar(160)",
    "nullable": false
  },
  {
    "table": "documento_tributario_externo",
    "name": "fecha_emision",
    "type": "date",
    "nullable": false
  },
  {
    "table": "documento_tributario_externo",
    "name": "monto_neto",
    "type": "numeric(14,2)",
    "nullable": true
  },
  {
    "table": "documento_tributario_externo",
    "name": "monto_exento",
    "type": "numeric(14,2)",
    "nullable": true
  },
  {
    "table": "documento_tributario_externo",
    "name": "iva",
    "type": "numeric(14,2)",
    "nullable": true
  },
  {
    "table": "documento_tributario_externo",
    "name": "monto_total",
    "type": "numeric(14,2)",
    "nullable": false
  },
  {
    "table": "documento_tributario_externo",
    "name": "url_documento",
    "type": "text",
    "nullable": true
  },
  {
    "table": "documento_tributario_externo",
    "name": "referencia_externa",
    "type": "varchar(200)",
    "nullable": true
  },
  {
    "table": "documento_tributario_externo",
    "name": "estado",
    "type": "varchar(20)",
    "nullable": false
  },
  {
    "table": "documento_tributario_externo",
    "name": "fuente",
    "type": "varchar(30)",
    "nullable": false
  },
  {
    "table": "documento_tributario_externo",
    "name": "id_cliente",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "documento_tributario_externo",
    "name": "id_contrato",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "documento_tributario_externo",
    "name": "id_factura",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "documento_tributario_externo",
    "name": "id_cargo_adicional",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "documento_tributario_externo",
    "name": "id_usuario_registro",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "documento_tributario_externo",
    "name": "fecha_registro",
    "type": "timestamptz",
    "nullable": false
  },
  {
    "table": "documento_tributario_externo",
    "name": "fecha_actualizacion",
    "type": "timestamptz",
    "nullable": false
  },
  {
    "table": "evento_gestion_comercial",
    "name": "id_evento",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "evento_gestion_comercial",
    "name": "id_empresa",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "evento_gestion_comercial",
    "name": "id_cliente",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "evento_gestion_comercial",
    "name": "id_servicio",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "evento_gestion_comercial",
    "name": "id_contrato",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "evento_gestion_comercial",
    "name": "id_factura",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "evento_gestion_comercial",
    "name": "tipo",
    "type": "varchar(40)",
    "nullable": false
  },
  {
    "table": "evento_gestion_comercial",
    "name": "canal",
    "type": "varchar(20)",
    "nullable": false
  },
  {
    "table": "evento_gestion_comercial",
    "name": "estado_gestion",
    "type": "varchar(30)",
    "nullable": false
  },
  {
    "table": "evento_gestion_comercial",
    "name": "fecha",
    "type": "timestamptz",
    "nullable": false
  },
  {
    "table": "evento_gestion_comercial",
    "name": "observacion",
    "type": "text",
    "nullable": true
  },
  {
    "table": "evento_gestion_comercial",
    "name": "id_usuario_responsable",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "evento_gestion_comercial",
    "name": "created_at",
    "type": "timestamptz",
    "nullable": false
  },
  {
    "table": "factura",
    "name": "id_factura",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "factura",
    "name": "id_contrato",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "factura",
    "name": "periodo_mes",
    "type": "smallint",
    "nullable": false
  },
  {
    "table": "factura",
    "name": "periodo_anio",
    "type": "smallint",
    "nullable": false
  },
  {
    "table": "factura",
    "name": "monto",
    "type": "numeric(10,2)",
    "nullable": true
  },
  {
    "table": "factura",
    "name": "fecha_emision",
    "type": "date",
    "nullable": true
  },
  {
    "table": "factura",
    "name": "fecha_limite_pago",
    "type": "date",
    "nullable": false
  },
  {
    "table": "factura",
    "name": "estado",
    "type": "varchar(20)",
    "nullable": false
  },
  {
    "table": "factura",
    "name": "tipo_documento",
    "type": "varchar(30)",
    "nullable": true
  },
  {
    "table": "factura",
    "name": "folio_externo",
    "type": "varchar(80)",
    "nullable": true
  },
  {
    "table": "garantia_comercial",
    "name": "id_garantia",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "garantia_comercial",
    "name": "id_empresa",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "garantia_comercial",
    "name": "id_cliente",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "garantia_comercial",
    "name": "id_servicio",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "garantia_comercial",
    "name": "id_contrato",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "garantia_comercial",
    "name": "numero_serie_equipo",
    "type": "varchar(80)",
    "nullable": true
  },
  {
    "table": "garantia_comercial",
    "name": "tipo",
    "type": "varchar(60)",
    "nullable": false
  },
  {
    "table": "garantia_comercial",
    "name": "fecha_inicio",
    "type": "date",
    "nullable": false
  },
  {
    "table": "garantia_comercial",
    "name": "fecha_termino",
    "type": "date",
    "nullable": false
  },
  {
    "table": "garantia_comercial",
    "name": "cobertura",
    "type": "text",
    "nullable": false
  },
  {
    "table": "garantia_comercial",
    "name": "monto",
    "type": "numeric(12,2)",
    "nullable": true
  },
  {
    "table": "garantia_comercial",
    "name": "observaciones",
    "type": "text",
    "nullable": true
  },
  {
    "table": "garantia_comercial",
    "name": "estado",
    "type": "varchar(20)",
    "nullable": false
  },
  {
    "table": "garantia_comercial",
    "name": "id_usuario_responsable",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "garantia_comercial",
    "name": "created_at",
    "type": "timestamptz",
    "nullable": false
  },
  {
    "table": "garantia_comercial",
    "name": "updated_at",
    "type": "timestamptz",
    "nullable": false
  },
  {
    "table": "historial_cambio_plan",
    "name": "id_cambio_plan",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "historial_cambio_plan",
    "name": "id_contrato",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "historial_cambio_plan",
    "name": "id_cliente",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "historial_cambio_plan",
    "name": "id_empresa",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "historial_cambio_plan",
    "name": "id_plan_anterior",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "historial_cambio_plan",
    "name": "id_plan_nuevo",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "historial_cambio_plan",
    "name": "fecha_efectiva",
    "type": "date",
    "nullable": false
  },
  {
    "table": "historial_cambio_plan",
    "name": "motivo",
    "type": "text",
    "nullable": false
  },
  {
    "table": "historial_cambio_plan",
    "name": "observaciones",
    "type": "text",
    "nullable": true
  },
  {
    "table": "historial_cambio_plan",
    "name": "precio_anterior",
    "type": "numeric(10,2)",
    "nullable": true
  },
  {
    "table": "historial_cambio_plan",
    "name": "precio_nuevo",
    "type": "numeric(10,2)",
    "nullable": true
  },
  {
    "table": "historial_cambio_plan",
    "name": "id_usuario_registro",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "historial_cambio_plan",
    "name": "fecha_registro",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "historial_cambio_plan",
    "name": "estado_cambio",
    "type": "varchar(20)",
    "nullable": false
  },
  {
    "table": "historial_cambio_plan",
    "name": "fecha_aplicacion",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "observacion_operativa",
    "name": "id_observacion",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "observacion_operativa",
    "name": "tipo_entidad",
    "type": "varchar(40)",
    "nullable": false
  },
  {
    "table": "observacion_operativa",
    "name": "id_entidad",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "observacion_operativa",
    "name": "id_cliente",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "observacion_operativa",
    "name": "id_empresa",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "observacion_operativa",
    "name": "id_usuario",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "observacion_operativa",
    "name": "observacion",
    "type": "text",
    "nullable": false
  },
  {
    "table": "observacion_operativa",
    "name": "visibilidad",
    "type": "varchar(20)",
    "nullable": true
  },
  {
    "table": "observacion_operativa",
    "name": "fecha_creacion",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "pago",
    "name": "id_pago",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "pago",
    "name": "id_factura",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "pago",
    "name": "id_cliente",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "pago",
    "name": "monto",
    "type": "numeric(10,2)",
    "nullable": false
  },
  {
    "table": "pago",
    "name": "fecha_pago",
    "type": "timestamp",
    "nullable": false
  },
  {
    "table": "pago",
    "name": "codigo_transaccion",
    "type": "varchar(100)",
    "nullable": true
  },
  {
    "table": "pago",
    "name": "pasarela",
    "type": "varchar(30)",
    "nullable": false
  },
  {
    "table": "pago",
    "name": "token_transaccional",
    "type": "varchar(200)",
    "nullable": true
  },
  {
    "table": "pago",
    "name": "comprobante_pdf_url",
    "type": "text",
    "nullable": true
  },
  {
    "table": "plan",
    "name": "id_plan",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "plan",
    "name": "id_empresa",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "plan",
    "name": "nombre_comercial",
    "type": "varchar(100)",
    "nullable": false
  },
  {
    "table": "plan",
    "name": "tipo_plan",
    "type": "varchar(40)",
    "nullable": false
  },
  {
    "table": "plan",
    "name": "tipo_cliente",
    "type": "varchar(20)",
    "nullable": false
  },
  {
    "table": "plan",
    "name": "velocidad_mbps",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "plan",
    "name": "precio_mensual",
    "type": "numeric(10,2)",
    "nullable": false
  },
  {
    "table": "plan",
    "name": "descripcion",
    "type": "text",
    "nullable": true
  },
  {
    "table": "plan",
    "name": "activo",
    "type": "boolean",
    "nullable": true
  },
  {
    "table": "plan_zona_precio",
    "name": "id_plan_zona_precio",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "plan_zona_precio",
    "name": "id_plan",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "plan_zona_precio",
    "name": "id_zona_pago",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "plan_zona_precio",
    "name": "precio_mensual",
    "type": "numeric(10,2)",
    "nullable": false
  },
  {
    "table": "plan_zona_precio",
    "name": "valor_instalacion",
    "type": "numeric(10,2)",
    "nullable": true
  },
  {
    "table": "plan_zona_precio",
    "name": "activo",
    "type": "boolean",
    "nullable": true
  },
  {
    "table": "plan_zona_precio",
    "name": "fecha_inicio",
    "type": "date",
    "nullable": true
  },
  {
    "table": "plan_zona_precio",
    "name": "fecha_fin",
    "type": "date",
    "nullable": true
  },
  {
    "table": "prorroga_pago",
    "name": "id_prorroga",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "prorroga_pago",
    "name": "id_empresa",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "prorroga_pago",
    "name": "id_cliente",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "prorroga_pago",
    "name": "id_contrato",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "prorroga_pago",
    "name": "id_factura",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "prorroga_pago",
    "name": "fecha_original",
    "type": "date",
    "nullable": false
  },
  {
    "table": "prorroga_pago",
    "name": "nueva_fecha",
    "type": "date",
    "nullable": false
  },
  {
    "table": "prorroga_pago",
    "name": "motivo",
    "type": "text",
    "nullable": false
  },
  {
    "table": "prorroga_pago",
    "name": "estado",
    "type": "varchar(20)",
    "nullable": false
  },
  {
    "table": "prorroga_pago",
    "name": "id_usuario_responsable",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "prorroga_pago",
    "name": "fecha_registro",
    "type": "timestamptz",
    "nullable": false
  },
  {
    "table": "prospecto",
    "name": "id_prospecto",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "prospecto",
    "name": "id_empresa",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "prospecto",
    "name": "id_usuario_comercial",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "prospecto",
    "name": "id_cliente",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "prospecto",
    "name": "rut",
    "type": "varchar(12)",
    "nullable": true
  },
  {
    "table": "prospecto",
    "name": "nombre_completo",
    "type": "varchar(120)",
    "nullable": true
  },
  {
    "table": "prospecto",
    "name": "email",
    "type": "varchar(120)",
    "nullable": true
  },
  {
    "table": "prospecto",
    "name": "telefono",
    "type": "varchar(20)",
    "nullable": true
  },
  {
    "table": "prospecto",
    "name": "direccion",
    "type": "varchar(200)",
    "nullable": true
  },
  {
    "table": "prospecto",
    "name": "estado_pipeline",
    "type": "varchar(30)",
    "nullable": true
  },
  {
    "table": "prospecto",
    "name": "motivo_perdida",
    "type": "varchar(30)",
    "nullable": true
  },
  {
    "table": "prospecto",
    "name": "origen_contacto",
    "type": "varchar(40)",
    "nullable": true
  },
  {
    "table": "prospecto",
    "name": "tiempo_conversion_dias",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "prospecto",
    "name": "fecha_creacion",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "prospecto",
    "name": "fecha_conversion",
    "type": "date",
    "nullable": true
  },
  {
    "table": "prospecto",
    "name": "observacion_perdida",
    "type": "text",
    "nullable": true
  },
  {
    "table": "prospecto",
    "name": "fecha_perdida",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "prospecto",
    "name": "id_usuario_perdida",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "prospecto",
    "name": "comuna",
    "type": "varchar(80)",
    "nullable": true
  },
  {
    "table": "prospecto",
    "name": "region",
    "type": "varchar(80)",
    "nullable": true
  },
  {
    "table": "prospecto",
    "name": "latitud",
    "type": "double precision",
    "nullable": true
  },
  {
    "table": "prospecto",
    "name": "longitud",
    "type": "double precision",
    "nullable": true
  },
  {
    "table": "prospecto",
    "name": "id_zona_pago",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "prospecto",
    "name": "clasificacion_comercial",
    "type": "varchar(40)",
    "nullable": true
  },
  {
    "table": "prospecto",
    "name": "disponible_remarketing",
    "type": "boolean",
    "nullable": true
  },
  {
    "table": "servicio_contratado",
    "name": "id_servicio",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "servicio_contratado",
    "name": "id_cliente",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "servicio_contratado",
    "name": "id_empresa",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "servicio_contratado",
    "name": "id_contrato",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "servicio_contratado",
    "name": "id_direccion",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "servicio_contratado",
    "name": "tipo_servicio",
    "type": "varchar(40)",
    "nullable": false
  },
  {
    "table": "servicio_contratado",
    "name": "estado_operativo",
    "type": "varchar(30)",
    "nullable": false
  },
  {
    "table": "servicio_contratado",
    "name": "observaciones",
    "type": "text",
    "nullable": true
  },
  {
    "table": "servicio_contratado",
    "name": "datos_tecnicos",
    "type": "jsonb",
    "nullable": true
  },
  {
    "table": "servicio_contratado",
    "name": "fecha_creacion",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "servicio_contratado",
    "name": "id_zona_pago",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "servicio_contratado",
    "name": "fecha_activacion",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "solicitud_cliente",
    "name": "id_solicitud",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "solicitud_cliente",
    "name": "id_cliente",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "solicitud_cliente",
    "name": "id_prospecto",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "solicitud_cliente",
    "name": "id_servicio",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "solicitud_cliente",
    "name": "id_empresa",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "solicitud_cliente",
    "name": "tipo_solicitud",
    "type": "varchar(60)",
    "nullable": false
  },
  {
    "table": "solicitud_cliente",
    "name": "canal_origen",
    "type": "varchar(40)",
    "nullable": true
  },
  {
    "table": "solicitud_cliente",
    "name": "estado",
    "type": "varchar(30)",
    "nullable": false
  },
  {
    "table": "solicitud_cliente",
    "name": "factible",
    "type": "boolean",
    "nullable": true
  },
  {
    "table": "solicitud_cliente",
    "name": "motivo_no_factible",
    "type": "text",
    "nullable": true
  },
  {
    "table": "solicitud_cliente",
    "name": "descripcion",
    "type": "text",
    "nullable": true
  },
  {
    "table": "solicitud_cliente",
    "name": "observaciones",
    "type": "text",
    "nullable": true
  },
  {
    "table": "solicitud_cliente",
    "name": "id_usuario_registro",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "solicitud_cliente",
    "name": "fecha_creacion",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "solicitud_cliente",
    "name": "fecha_cierre",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "solicitud_retiro_servicio",
    "name": "id_solicitud_retiro",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "solicitud_retiro_servicio",
    "name": "id_empresa",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "solicitud_retiro_servicio",
    "name": "id_cliente",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "solicitud_retiro_servicio",
    "name": "id_servicio",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "solicitud_retiro_servicio",
    "name": "id_contrato",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "solicitud_retiro_servicio",
    "name": "motivo",
    "type": "text",
    "nullable": false
  },
  {
    "table": "solicitud_retiro_servicio",
    "name": "fecha_solicitada",
    "type": "date",
    "nullable": false
  },
  {
    "table": "solicitud_retiro_servicio",
    "name": "estado",
    "type": "varchar(30)",
    "nullable": false
  },
  {
    "table": "solicitud_retiro_servicio",
    "name": "estado_despacho_tecnico",
    "type": "varchar(40)",
    "nullable": false
  },
  {
    "table": "solicitud_retiro_servicio",
    "name": "id_usuario_responsable",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "solicitud_retiro_servicio",
    "name": "observaciones",
    "type": "text",
    "nullable": true
  },
  {
    "table": "solicitud_retiro_servicio",
    "name": "created_at",
    "type": "timestamp",
    "nullable": false
  },
  {
    "table": "solicitud_retiro_servicio",
    "name": "updated_at",
    "type": "timestamp",
    "nullable": false
  },
  {
    "table": "zona_pago",
    "name": "id_zona_pago",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "zona_pago",
    "name": "id_empresa",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "zona_pago",
    "name": "nombre_zona",
    "type": "varchar(80)",
    "nullable": false
  },
  {
    "table": "zona_pago",
    "name": "comuna",
    "type": "varchar(80)",
    "nullable": true
  },
  {
    "table": "zona_pago",
    "name": "descripcion",
    "type": "text",
    "nullable": true
  },
  {
    "table": "zona_pago",
    "name": "dia_vencimiento_sugerido",
    "type": "smallint",
    "nullable": true
  },
  {
    "table": "zona_pago",
    "name": "activo",
    "type": "boolean",
    "nullable": true
  },
  {
    "table": "zona_pago",
    "name": "tipo_zona",
    "type": "varchar(30)",
    "nullable": true
  },
  {
    "table": "zona_pago",
    "name": "id_zona_padre",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "zona_pago",
    "name": "poligono_geojson",
    "type": "jsonb",
    "nullable": true
  },
  {
    "table": "zona_pago",
    "name": "centro_lat",
    "type": "double precision",
    "nullable": true
  },
  {
    "table": "zona_pago",
    "name": "centro_lng",
    "type": "double precision",
    "nullable": true
  },
  {
    "table": "zona_pago",
    "name": "prioridad",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "zona_pago",
    "name": "fuente_cobertura",
    "type": "varchar(30)",
    "nullable": true
  },
  {
    "table": "zona_pago",
    "name": "fecha_inicio",
    "type": "date",
    "nullable": true
  },
  {
    "table": "zona_pago",
    "name": "fecha_fin",
    "type": "date",
    "nullable": true
  },
  {
    "table": "alerta_monitoreo",
    "name": "id_alerta",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "alerta_monitoreo",
    "name": "id_empresa",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "alerta_monitoreo",
    "name": "tipo",
    "type": "varchar(30)",
    "nullable": false
  },
  {
    "table": "alerta_monitoreo",
    "name": "severidad",
    "type": "varchar(15)",
    "nullable": true
  },
  {
    "table": "alerta_monitoreo",
    "name": "mensaje",
    "type": "text",
    "nullable": true
  },
  {
    "table": "alerta_monitoreo",
    "name": "id_registro_ont",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "alerta_monitoreo",
    "name": "id_cliente",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "alerta_monitoreo",
    "name": "clave_caja",
    "type": "varchar(120)",
    "nullable": true
  },
  {
    "table": "alerta_monitoreo",
    "name": "id_caja_nap",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "alerta_monitoreo",
    "name": "afectados",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "alerta_monitoreo",
    "name": "id_ot_generada",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "alerta_monitoreo",
    "name": "resuelta",
    "type": "boolean",
    "nullable": false
  },
  {
    "table": "alerta_monitoreo",
    "name": "resuelta_por",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "alerta_monitoreo",
    "name": "observacion_resolucion",
    "type": "text",
    "nullable": true
  },
  {
    "table": "alerta_monitoreo",
    "name": "creada_en",
    "type": "timestamp",
    "nullable": false
  },
  {
    "table": "alerta_monitoreo",
    "name": "resuelta_en",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "caja_nap",
    "name": "id_caja_nap",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "caja_nap",
    "name": "id_empresa",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "caja_nap",
    "name": "id_mufa",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "caja_nap",
    "name": "identificador_unico",
    "type": "varchar(50)",
    "nullable": true
  },
  {
    "table": "caja_nap",
    "name": "numero_poste",
    "type": "varchar(30)",
    "nullable": true
  },
  {
    "table": "caja_nap",
    "name": "zona",
    "type": "varchar(80)",
    "nullable": true
  },
  {
    "table": "caja_nap",
    "name": "capacidad_puertos",
    "type": "smallint",
    "nullable": true
  },
  {
    "table": "caja_nap",
    "name": "latitud",
    "type": "numeric(9,6)",
    "nullable": true
  },
  {
    "table": "caja_nap",
    "name": "longitud",
    "type": "numeric(9,6)",
    "nullable": true
  },
  {
    "table": "categoria_falla",
    "name": "id_categoria",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "categoria_falla",
    "name": "nombre",
    "type": "varchar(80)",
    "nullable": false
  },
  {
    "table": "categoria_falla",
    "name": "sla_horas",
    "type": "smallint",
    "nullable": true
  },
  {
    "table": "evidencia_foto",
    "name": "id_foto",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "evidencia_foto",
    "name": "id_ot",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "evidencia_foto",
    "name": "url_cloudinary",
    "type": "text",
    "nullable": false
  },
  {
    "table": "evidencia_foto",
    "name": "formato",
    "type": "varchar(5)",
    "nullable": true
  },
  {
    "table": "evidencia_foto",
    "name": "tamano_kb",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "evidencia_foto",
    "name": "fecha_subida",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "historial_conexion_ont",
    "name": "id_historial_ont",
    "type": "bigint",
    "nullable": false
  },
  {
    "table": "historial_conexion_ont",
    "name": "id_unidad",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "historial_conexion_ont",
    "name": "evento",
    "type": "varchar(15)",
    "nullable": true
  },
  {
    "table": "historial_conexion_ont",
    "name": "timestamp",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "historial_conexion_ont",
    "name": "id_registro_ont",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "historial_ot",
    "name": "id_historial_ot",
    "type": "bigint",
    "nullable": false
  },
  {
    "table": "historial_ot",
    "name": "id_ot",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "historial_ot",
    "name": "id_usuario",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "historial_ot",
    "name": "estado_anterior",
    "type": "varchar(25)",
    "nullable": true
  },
  {
    "table": "historial_ot",
    "name": "estado_nuevo",
    "type": "varchar(25)",
    "nullable": true
  },
  {
    "table": "historial_ot",
    "name": "observaciones",
    "type": "text",
    "nullable": true
  },
  {
    "table": "historial_ot",
    "name": "fecha_hora",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "llamada_cortes",
    "name": "id_llamada",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "llamada_cortes",
    "name": "id_ot",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "llamada_cortes",
    "name": "resultado",
    "type": "varchar(15)",
    "nullable": false
  },
  {
    "table": "llamada_cortes",
    "name": "observaciones",
    "type": "text",
    "nullable": true
  },
  {
    "table": "llamada_cortes",
    "name": "fecha_llamada",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "monitoreo_ont",
    "name": "id_monitoreo",
    "type": "bigint",
    "nullable": false
  },
  {
    "table": "monitoreo_ont",
    "name": "id_unidad",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "monitoreo_ont",
    "name": "id_cliente",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "monitoreo_ont",
    "name": "id_caja_nap",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "monitoreo_ont",
    "name": "potencia_actual_dbm",
    "type": "numeric(5,2)",
    "nullable": true
  },
  {
    "table": "monitoreo_ont",
    "name": "timestamp_medicion",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "monitoreo_ont",
    "name": "estado_conexion",
    "type": "varchar(15)",
    "nullable": true
  },
  {
    "table": "monitoreo_ont",
    "name": "id_registro_ont",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "mufa",
    "name": "id_mufa",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "mufa",
    "name": "id_tarjeta_pon",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "mufa",
    "name": "identificador",
    "type": "varchar(50)",
    "nullable": true
  },
  {
    "table": "mufa",
    "name": "ubicacion",
    "type": "varchar(200)",
    "nullable": true
  },
  {
    "table": "olt",
    "name": "id_olt",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "olt",
    "name": "id_empresa",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "olt",
    "name": "nombre",
    "type": "varchar(80)",
    "nullable": true
  },
  {
    "table": "olt",
    "name": "ubicacion",
    "type": "varchar(200)",
    "nullable": true
  },
  {
    "table": "olt",
    "name": "ip_gestion",
    "type": "varchar(45)",
    "nullable": true
  },
  {
    "table": "orden_trabajo",
    "name": "id_ot",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "orden_trabajo",
    "name": "id_empresa",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "orden_trabajo",
    "name": "id_cliente",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "orden_trabajo",
    "name": "id_tecnico",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "orden_trabajo",
    "name": "id_tecnico_externo",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "orden_trabajo",
    "name": "id_direccion",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "orden_trabajo",
    "name": "id_servicio",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "orden_trabajo",
    "name": "id_ticket",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "orden_trabajo",
    "name": "codigo_seguimiento",
    "type": "varchar(32)",
    "nullable": true
  },
  {
    "table": "orden_trabajo",
    "name": "tipo_ot",
    "type": "varchar(20)",
    "nullable": false
  },
  {
    "table": "orden_trabajo",
    "name": "prioridad",
    "type": "varchar(10)",
    "nullable": false
  },
  {
    "table": "orden_trabajo",
    "name": "estado",
    "type": "varchar(25)",
    "nullable": false
  },
  {
    "table": "orden_trabajo",
    "name": "fecha_creacion",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "orden_trabajo",
    "name": "fecha_programada",
    "type": "timestamptz",
    "nullable": true
  },
  {
    "table": "orden_trabajo",
    "name": "fecha_completada",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "orden_trabajo",
    "name": "potencia_optica_dbm",
    "type": "numeric(5,2)",
    "nullable": true
  },
  {
    "table": "orden_trabajo",
    "name": "observaciones",
    "type": "text",
    "nullable": true
  },
  {
    "table": "orden_trabajo",
    "name": "resuelto_remotamente",
    "type": "boolean",
    "nullable": true
  },
  {
    "table": "orden_trabajo",
    "name": "id_prospecto",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "orden_trabajo",
    "name": "id_categoria_falla",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "orden_trabajo",
    "name": "id_caja_nap",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "orden_trabajo",
    "name": "categoria_falla_otro",
    "type": "varchar(120)",
    "nullable": true
  },
  {
    "table": "orden_trabajo",
    "name": "obs_cliente_ausente",
    "type": "varchar(500)",
    "nullable": true
  },
  {
    "table": "orden_trabajo",
    "name": "alerta_detenida_descartada_en",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "orden_trabajo",
    "name": "alerta_detenida_descartada_por",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "orden_trabajo",
    "name": "cierre_equipos",
    "type": "jsonb",
    "nullable": true
  },
  {
    "table": "puerto_nap",
    "name": "id_puerto",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "puerto_nap",
    "name": "id_caja_nap",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "puerto_nap",
    "name": "numero_puerto",
    "type": "smallint",
    "nullable": true
  },
  {
    "table": "puerto_nap",
    "name": "estado",
    "type": "varchar(20)",
    "nullable": true
  },
  {
    "table": "puerto_nap",
    "name": "id_cliente_asociado",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "punto_cobertura",
    "name": "id_punto",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "punto_cobertura",
    "name": "id_empresa",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "punto_cobertura",
    "name": "latitud",
    "type": "numeric(9,6)",
    "nullable": false
  },
  {
    "table": "punto_cobertura",
    "name": "longitud",
    "type": "numeric(9,6)",
    "nullable": false
  },
  {
    "table": "punto_cobertura",
    "name": "densidad_cobertura",
    "type": "numeric(5,2)",
    "nullable": true
  },
  {
    "table": "punto_cobertura",
    "name": "tipo_cobertura",
    "type": "varchar(20)",
    "nullable": true
  },
  {
    "table": "registro_ont",
    "name": "id_registro_ont",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "registro_ont",
    "name": "id_empresa",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "registro_ont",
    "name": "numero_serie",
    "type": "varchar(80)",
    "nullable": false
  },
  {
    "table": "registro_ont",
    "name": "id_externo",
    "type": "varchar(40)",
    "nullable": true
  },
  {
    "table": "registro_ont",
    "name": "olt_externo",
    "type": "varchar(40)",
    "nullable": true
  },
  {
    "table": "registro_ont",
    "name": "board",
    "type": "smallint",
    "nullable": true
  },
  {
    "table": "registro_ont",
    "name": "puerto_pon",
    "type": "smallint",
    "nullable": true
  },
  {
    "table": "registro_ont",
    "name": "zona",
    "type": "varchar(80)",
    "nullable": true
  },
  {
    "table": "registro_ont",
    "name": "odb",
    "type": "varchar(50)",
    "nullable": true
  },
  {
    "table": "registro_ont",
    "name": "modelo",
    "type": "varchar(80)",
    "nullable": true
  },
  {
    "table": "registro_ont",
    "name": "nombre_cliente_ext",
    "type": "varchar(160)",
    "nullable": true
  },
  {
    "table": "registro_ont",
    "name": "direccion_cliente_ext",
    "type": "varchar(200)",
    "nullable": true
  },
  {
    "table": "registro_ont",
    "name": "id_unidad",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "registro_ont",
    "name": "id_cliente",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "registro_ont",
    "name": "id_caja_nap",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "registro_ont",
    "name": "caja_confirmada_por",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "registro_ont",
    "name": "caja_confirmada_en",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "registro_ont",
    "name": "primera_vez",
    "type": "timestamp",
    "nullable": false
  },
  {
    "table": "registro_ont",
    "name": "ultima_vez",
    "type": "timestamp",
    "nullable": false
  },
  {
    "table": "tarjeta_pon",
    "name": "id_tarjeta",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "tarjeta_pon",
    "name": "id_olt",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "tarjeta_pon",
    "name": "numero_tarjeta",
    "type": "smallint",
    "nullable": true
  },
  {
    "table": "tarjeta_pon",
    "name": "total_puertos",
    "type": "smallint",
    "nullable": true
  },
  {
    "table": "tecnico_externo",
    "name": "id_tecnico_ext",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "tecnico_externo",
    "name": "nombre_completo",
    "type": "varchar(120)",
    "nullable": false
  },
  {
    "table": "tecnico_externo",
    "name": "empresa",
    "type": "varchar(100)",
    "nullable": true
  },
  {
    "table": "tecnico_externo",
    "name": "telefono",
    "type": "varchar(20)",
    "nullable": true
  },
  {
    "table": "tecnico_externo",
    "name": "activo",
    "type": "boolean",
    "nullable": true
  },
  {
    "table": "ticket",
    "name": "id_ticket",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "ticket",
    "name": "id_cliente",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "ticket",
    "name": "id_empresa",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "ticket",
    "name": "id_servicio",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "ticket",
    "name": "id_usuario_asignado",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "ticket",
    "name": "id_categoria",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "ticket",
    "name": "id_conversacion_bot",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "ticket",
    "name": "codigo_seguimiento",
    "type": "varchar(20)",
    "nullable": true
  },
  {
    "table": "ticket",
    "name": "prioridad",
    "type": "varchar(10)",
    "nullable": false
  },
  {
    "table": "ticket",
    "name": "estado",
    "type": "varchar(20)",
    "nullable": false
  },
  {
    "table": "ticket",
    "name": "descripcion",
    "type": "text",
    "nullable": true
  },
  {
    "table": "ticket",
    "name": "fecha_creacion",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "ticket",
    "name": "fecha_cierre",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "ticket",
    "name": "origen",
    "type": "varchar(20)",
    "nullable": true
  },
  {
    "table": "ticket",
    "name": "resuelto_remotamente",
    "type": "boolean",
    "nullable": true
  },
  {
    "table": "uso_material_ot",
    "name": "id_uso",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "uso_material_ot",
    "name": "id_ot",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "uso_material_ot",
    "name": "id_tipo_equipo",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "uso_material_ot",
    "name": "id_unidad",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "uso_material_ot",
    "name": "cantidad",
    "type": "numeric(10,2)",
    "nullable": false
  },
  {
    "table": "configuracion_seo",
    "name": "id_seo",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "configuracion_seo",
    "name": "id_empresa",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "configuracion_seo",
    "name": "seccion_url",
    "type": "varchar(200)",
    "nullable": false
  },
  {
    "table": "configuracion_seo",
    "name": "meta_titulo",
    "type": "varchar(70)",
    "nullable": true
  },
  {
    "table": "configuracion_seo",
    "name": "meta_descripcion",
    "type": "varchar(160)",
    "nullable": true
  },
  {
    "table": "configuracion_seo",
    "name": "og_tags",
    "type": "jsonb",
    "nullable": true
  },
  {
    "table": "configuracion_seo",
    "name": "fecha_actualizacion",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "consentimiento_cookies",
    "name": "id_consentimiento",
    "type": "bigint",
    "nullable": false
  },
  {
    "table": "consentimiento_cookies",
    "name": "id_cliente",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "consentimiento_cookies",
    "name": "ip_anonimizada",
    "type": "varchar(45)",
    "nullable": true
  },
  {
    "table": "consentimiento_cookies",
    "name": "version_documento",
    "type": "varchar(20)",
    "nullable": true
  },
  {
    "table": "consentimiento_cookies",
    "name": "fecha_aceptacion",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "consentimiento_cookies",
    "name": "acepto",
    "type": "boolean",
    "nullable": false
  },
  {
    "table": "intento_fallido",
    "name": "id_intento",
    "type": "bigint",
    "nullable": false
  },
  {
    "table": "intento_fallido",
    "name": "id_empresa",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "intento_fallido",
    "name": "ip_address",
    "type": "varchar(45)",
    "nullable": false
  },
  {
    "table": "intento_fallido",
    "name": "rut_intentado",
    "type": "varchar(50)",
    "nullable": true
  },
  {
    "table": "intento_fallido",
    "name": "timestamp",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "intento_fallido",
    "name": "bloqueado_hasta",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "lista_negra",
    "name": "id_vetado",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "lista_negra",
    "name": "id_cliente",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "lista_negra",
    "name": "rut_vetado",
    "type": "varchar(12)",
    "nullable": false
  },
  {
    "table": "lista_negra",
    "name": "direccion_vetada",
    "type": "text",
    "nullable": true
  },
  {
    "table": "lista_negra",
    "name": "motivo",
    "type": "text",
    "nullable": false
  },
  {
    "table": "lista_negra",
    "name": "fecha_registro",
    "type": "date",
    "nullable": true
  },
  {
    "table": "lista_negra",
    "name": "id_usuario_registro",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "sesion_portal",
    "name": "id_sesion",
    "type": "bigint",
    "nullable": false
  },
  {
    "table": "sesion_portal",
    "name": "id_cliente",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "sesion_portal",
    "name": "token",
    "type": "text",
    "nullable": false
  },
  {
    "table": "sesion_portal",
    "name": "fecha_inicio",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "sesion_portal",
    "name": "fecha_expiracion",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "sesion_portal",
    "name": "ip_origen",
    "type": "varchar(45)",
    "nullable": true
  },
  {
    "table": "solicitud_contrasena_wifi",
    "name": "id_solicitud",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "solicitud_contrasena_wifi",
    "name": "id_contrato",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "solicitud_contrasena_wifi",
    "name": "id_cliente",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "solicitud_contrasena_wifi",
    "name": "password_nueva_cifrada",
    "type": "text",
    "nullable": true
  },
  {
    "table": "solicitud_contrasena_wifi",
    "name": "estado",
    "type": "varchar(20)",
    "nullable": false
  },
  {
    "table": "solicitud_contrasena_wifi",
    "name": "fecha_solicitud",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "solicitud_contrasena_wifi",
    "name": "fecha_procesada",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "canal_whatsapp",
    "name": "id_canal",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "canal_whatsapp",
    "name": "id_empresa",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "canal_whatsapp",
    "name": "numero_telefono",
    "type": "varchar(20)",
    "nullable": true
  },
  {
    "table": "canal_whatsapp",
    "name": "nombre_canal",
    "type": "varchar(80)",
    "nullable": true
  },
  {
    "table": "canal_whatsapp",
    "name": "activo",
    "type": "boolean",
    "nullable": true
  },
  {
    "table": "conversacion_bot",
    "name": "id_conversacion",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "conversacion_bot",
    "name": "id_cliente",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "conversacion_bot",
    "name": "id_canal_wa",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "conversacion_bot",
    "name": "plataforma",
    "type": "varchar(20)",
    "nullable": true
  },
  {
    "table": "conversacion_bot",
    "name": "fecha_inicio",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "conversacion_bot",
    "name": "fecha_fin",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "conversacion_bot",
    "name": "derivada_humano",
    "type": "boolean",
    "nullable": true
  },
  {
    "table": "log_notificacion",
    "name": "id_notificacion",
    "type": "bigint",
    "nullable": false
  },
  {
    "table": "log_notificacion",
    "name": "id_cliente",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "log_notificacion",
    "name": "id_plantilla",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "log_notificacion",
    "name": "canal",
    "type": "varchar(20)",
    "nullable": true
  },
  {
    "table": "log_notificacion",
    "name": "fecha_envio",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "log_notificacion",
    "name": "estado_envio",
    "type": "varchar(20)",
    "nullable": true
  },
  {
    "table": "log_notificacion",
    "name": "mensaje_enviado",
    "type": "text",
    "nullable": true
  },
  {
    "table": "log_notificacion",
    "name": "id_alerta",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "mensaje_bot",
    "name": "id_mensaje",
    "type": "bigint",
    "nullable": false
  },
  {
    "table": "mensaje_bot",
    "name": "id_conversacion",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "mensaje_bot",
    "name": "rol",
    "type": "varchar(15)",
    "nullable": true
  },
  {
    "table": "mensaje_bot",
    "name": "contenido",
    "type": "text",
    "nullable": true
  },
  {
    "table": "mensaje_bot",
    "name": "timestamp",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "mensaje_bot",
    "name": "datos_sensibles",
    "type": "boolean",
    "nullable": true
  },
  {
    "table": "mensaje_whatsapp",
    "name": "id_mensaje_wa",
    "type": "bigint",
    "nullable": false
  },
  {
    "table": "mensaje_whatsapp",
    "name": "id_canal",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "mensaje_whatsapp",
    "name": "id_cliente",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "mensaje_whatsapp",
    "name": "id_plantilla_wa",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "mensaje_whatsapp",
    "name": "contenido",
    "type": "text",
    "nullable": true
  },
  {
    "table": "mensaje_whatsapp",
    "name": "timestamp",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "mensaje_whatsapp",
    "name": "origen",
    "type": "varchar(10)",
    "nullable": true
  },
  {
    "table": "mensaje_whatsapp",
    "name": "estado",
    "type": "varchar(15)",
    "nullable": true
  },
  {
    "table": "plantilla_notificacion",
    "name": "id_plantilla",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "plantilla_notificacion",
    "name": "tipo_evento",
    "type": "varchar(60)",
    "nullable": true
  },
  {
    "table": "plantilla_notificacion",
    "name": "canal",
    "type": "varchar(20)",
    "nullable": false
  },
  {
    "table": "plantilla_notificacion",
    "name": "contenido_texto",
    "type": "text",
    "nullable": true
  },
  {
    "table": "plantilla_notificacion",
    "name": "activa",
    "type": "boolean",
    "nullable": true
  },
  {
    "table": "plantilla_notificacion",
    "name": "id_empresa",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "plantilla_notificacion",
    "name": "tiempo_estimado_reparacion",
    "type": "varchar(60)",
    "nullable": true
  },
  {
    "table": "plantilla_whatsapp",
    "name": "id_plantilla_wa",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "plantilla_whatsapp",
    "name": "id_canal",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "plantilla_whatsapp",
    "name": "nombre_plantilla",
    "type": "varchar(80)",
    "nullable": true
  },
  {
    "table": "plantilla_whatsapp",
    "name": "contenido",
    "type": "text",
    "nullable": true
  },
  {
    "table": "plantilla_whatsapp",
    "name": "tipo_uso",
    "type": "varchar(40)",
    "nullable": true
  },
  {
    "table": "integracion_activacion",
    "name": "id_activacion",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "integracion_activacion",
    "name": "event_id",
    "type": "varchar(100)",
    "nullable": true
  },
  {
    "table": "integracion_activacion",
    "name": "trace_id",
    "type": "varchar(100)",
    "nullable": true
  },
  {
    "table": "integracion_activacion",
    "name": "id_empresa",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "integracion_activacion",
    "name": "id_ot",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "integracion_activacion",
    "name": "id_cliente_externo",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "integracion_activacion",
    "name": "rut_cliente",
    "type": "varchar(20)",
    "nullable": true
  },
  {
    "table": "integracion_activacion",
    "name": "id_servicio_externo",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "integracion_activacion",
    "name": "id_contrato_externo",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "integracion_activacion",
    "name": "payload",
    "type": "jsonb",
    "nullable": true
  },
  {
    "table": "integracion_activacion",
    "name": "estado_proceso",
    "type": "varchar(40)",
    "nullable": false
  },
  {
    "table": "integracion_activacion",
    "name": "equipos_asociados",
    "type": "jsonb",
    "nullable": true
  },
  {
    "table": "integracion_activacion",
    "name": "discrepancias",
    "type": "jsonb",
    "nullable": true
  },
  {
    "table": "integracion_activacion",
    "name": "fecha_proceso",
    "type": "timestamptz",
    "nullable": true
  },
  {
    "table": "integracion_activacion_g1",
    "name": "id_integracion",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "integracion_activacion_g1",
    "name": "id_empresa",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "integracion_activacion_g1",
    "name": "id_cliente",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "integracion_activacion_g1",
    "name": "id_servicio",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "integracion_activacion_g1",
    "name": "id_contrato",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "integracion_activacion_g1",
    "name": "id_ot_g3",
    "type": "varchar(100)",
    "nullable": false
  },
  {
    "table": "integracion_activacion_g1",
    "name": "numero_serie",
    "type": "varchar(80)",
    "nullable": true
  },
  {
    "table": "integracion_activacion_g1",
    "name": "event_id",
    "type": "varchar(120)",
    "nullable": false
  },
  {
    "table": "integracion_activacion_g1",
    "name": "trace_id",
    "type": "varchar(120)",
    "nullable": false
  },
  {
    "table": "integracion_activacion_g1",
    "name": "estado_integracion",
    "type": "varchar(50)",
    "nullable": false
  },
  {
    "table": "integracion_activacion_g1",
    "name": "intentos",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "integracion_activacion_g1",
    "name": "ultimo_intento",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "integracion_activacion_g1",
    "name": "ultimo_error_sanitizado",
    "type": "varchar(500)",
    "nullable": true
  },
  {
    "table": "integracion_activacion_g1",
    "name": "payload_hash",
    "type": "varchar(64)",
    "nullable": false
  },
  {
    "table": "integracion_activacion_g1",
    "name": "payload_snapshot",
    "type": "jsonb",
    "nullable": true
  },
  {
    "table": "integracion_activacion_g1",
    "name": "respuesta_estado_g1",
    "type": "jsonb",
    "nullable": true
  },
  {
    "table": "integracion_activacion_g1",
    "name": "fecha_completado",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "integracion_activacion_g1",
    "name": "created_at",
    "type": "timestamp",
    "nullable": false
  },
  {
    "table": "integracion_activacion_g1",
    "name": "updated_at",
    "type": "timestamp",
    "nullable": false
  },
  {
    "table": "integracion_activacion_g1",
    "name": "numeros_serie",
    "type": "text[]",
    "nullable": false
  },
  {
    "table": "integracion_cierre",
    "name": "id_cierre",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "integracion_cierre",
    "name": "clave_idempotencia",
    "type": "varchar(120)",
    "nullable": false
  },
  {
    "table": "integracion_cierre",
    "name": "id_ot",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "integracion_cierre",
    "name": "id_empresa",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "integracion_cierre",
    "name": "tipo_ot",
    "type": "varchar(30)",
    "nullable": true
  },
  {
    "table": "integracion_cierre",
    "name": "payload",
    "type": "jsonb",
    "nullable": false
  },
  {
    "table": "integracion_cierre",
    "name": "estado_proceso",
    "type": "varchar(40)",
    "nullable": false
  },
  {
    "table": "integracion_cierre",
    "name": "discrepancias",
    "type": "jsonb",
    "nullable": true
  },
  {
    "table": "integracion_cierre",
    "name": "acciones_aplicadas",
    "type": "jsonb",
    "nullable": true
  },
  {
    "table": "integracion_cierre",
    "name": "fecha_proceso",
    "type": "timestamptz",
    "nullable": true
  },
  {
    "table": "integracion_cierre",
    "name": "srv",
    "type": "varchar(20)",
    "nullable": true
  },
  {
    "table": "integracion_cierre",
    "name": "id_tecnico",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "integracion_cierre",
    "name": "materiales_aplicados",
    "type": "jsonb",
    "nullable": true
  },
  {
    "table": "integracion_evento_entrante",
    "name": "id_evento",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "integracion_evento_entrante",
    "name": "id_integracion",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "integracion_evento_entrante",
    "name": "source",
    "type": "varchar(30)",
    "nullable": false
  },
  {
    "table": "integracion_evento_entrante",
    "name": "event_type",
    "type": "varchar(50)",
    "nullable": false
  },
  {
    "table": "integracion_evento_entrante",
    "name": "external_reference",
    "type": "varchar(120)",
    "nullable": false
  },
  {
    "table": "integracion_evento_entrante",
    "name": "payload_hash",
    "type": "varchar(64)",
    "nullable": false
  },
  {
    "table": "integracion_evento_entrante",
    "name": "processed_at",
    "type": "timestamp",
    "nullable": false
  },
  {
    "table": "integracion_evento_entrante",
    "name": "result",
    "type": "jsonb",
    "nullable": true
  },
  {
    "table": "integracion_instalacion_g3",
    "name": "id_integracion",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "integracion_instalacion_g3",
    "name": "id_empresa",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "integracion_instalacion_g3",
    "name": "id_prospecto",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "integracion_instalacion_g3",
    "name": "id_cliente",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "integracion_instalacion_g3",
    "name": "id_contrato",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "integracion_instalacion_g3",
    "name": "id_plan",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "integracion_instalacion_g3",
    "name": "id_servicio",
    "type": "integer",
    "nullable": true
  },
  {
    "table": "integracion_instalacion_g3",
    "name": "request_id",
    "type": "uuid",
    "nullable": false
  },
  {
    "table": "integracion_instalacion_g3",
    "name": "trace_id",
    "type": "uuid",
    "nullable": false
  },
  {
    "table": "integracion_instalacion_g3",
    "name": "id_ot_g3",
    "type": "varchar(100)",
    "nullable": true
  },
  {
    "table": "integracion_instalacion_g3",
    "name": "codigo_ot_g3",
    "type": "varchar(100)",
    "nullable": true
  },
  {
    "table": "integracion_instalacion_g3",
    "name": "estado_integracion",
    "type": "varchar(30)",
    "nullable": false
  },
  {
    "table": "integracion_instalacion_g3",
    "name": "estado_ot_g3",
    "type": "varchar(50)",
    "nullable": true
  },
  {
    "table": "integracion_instalacion_g3",
    "name": "estado_original_g3",
    "type": "varchar(100)",
    "nullable": true
  },
  {
    "table": "integracion_instalacion_g3",
    "name": "fecha_solicitud",
    "type": "timestamp",
    "nullable": false
  },
  {
    "table": "integracion_instalacion_g3",
    "name": "ultimo_intento",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "integracion_instalacion_g3",
    "name": "fecha_ultima_sincronizacion",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "integracion_instalacion_g3",
    "name": "intentos",
    "type": "integer",
    "nullable": false
  },
  {
    "table": "integracion_instalacion_g3",
    "name": "ultimo_error_sanitizado",
    "type": "text",
    "nullable": true
  },
  {
    "table": "integracion_instalacion_g3",
    "name": "payload_hash",
    "type": "varchar(64)",
    "nullable": false
  },
  {
    "table": "integracion_instalacion_g3",
    "name": "payload_snapshot",
    "type": "jsonb",
    "nullable": false
  },
  {
    "table": "integracion_instalacion_g3",
    "name": "fecha_cierre_procesado",
    "type": "timestamp",
    "nullable": true
  },
  {
    "table": "integracion_instalacion_g3",
    "name": "created_at",
    "type": "timestamp",
    "nullable": false
  },
  {
    "table": "integracion_instalacion_g3",
    "name": "updated_at",
    "type": "timestamp",
    "nullable": false
  }
];
