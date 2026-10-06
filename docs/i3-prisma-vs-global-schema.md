# Proyección Prisma G8 frente al contrato global

Hash canónico: 6f3c9afdfc8693730a26a4f7f3dc58e81e0046ee74136daef077e39bce8ab20e. Modelos G8: 61.

Prisma es una proyección; los objetos globales no modelados se conservan. OWNER_EXTERNAL significa fuera de la proyección; ownership funcional se indica por separado. FK_MISMATCH con Prisma null significa relación física fuera de la proyección (se conserva en PostgreSQL). INDEX_MISMATCH con Prisma null significa índice global no modelado (incluye parciales/expresiones); conservarlo, jamás usar db push para quitarlo. El contrato vigente incluye integracion_activacion_g1.payload_snapshot, solicitud_instalacion_integracion con definición G3 confirmada y la propuesta coordinada G2 de plan de interés, metadatos de pago/comprobante y resultado WiFi idempotente. Los default y checks SQL se validan en el verificador físico, no se infieren de @default de aplicación.

Antes: ver i3-prisma-vs-global-before.json como evidencia histórica del contrato anterior. Después: {"MATCH":821,"PRISMA_ONLY":55,"INDEX_MISMATCH":59,"FK_MISMATCH":71,"TYPE_WIDENING_REQUIRED":1,"COLUMN_GLOBAL_ONLY":35,"OWNER_EXTERNAL":325}.

|Tabla|Objeto|Owner|Estado|Prisma|Global|
|---|---|---|---|---|---|
|empresa|id_empresa|COMPARTIDO|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|empresa|nombre|COMPARTIDO|MATCH|{"type":"varchar(100)","nullable":false}|{"type":"varchar(100)","nullable":false}|
|empresa|rut_empresa|COMPARTIDO|MATCH|{"type":"varchar(12)","nullable":true}|{"type":"varchar(12)","nullable":true}|
|empresa|esquema_db|COMPARTIDO|MATCH|{"type":"varchar(50)","nullable":true}|{"type":"varchar(50)","nullable":true}|
|empresa|PRIMARY KEY|COMPARTIDO|MATCH|["id_empresa"]|["id_empresa"]|
|empresa|INDEX:rut_empresa|COMPARTIDO|MATCH|{"columns":["rut_empresa"],"unique":true}|null|
|usuario|id_usuario|COMPARTIDO|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|usuario|id_empresa|COMPARTIDO|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|usuario|nombre_completo|COMPARTIDO|MATCH|{"type":"varchar(150)","nullable":false}|{"type":"varchar(150)","nullable":false}|
|usuario|nombre_usuario|COMPARTIDO|MATCH|{"type":"varchar(50)","nullable":true}|{"type":"varchar(50)","nullable":true}|
|usuario|email|COMPARTIDO|MATCH|{"type":"varchar(150)","nullable":true}|{"type":"varchar(150)","nullable":true}|
|usuario|password_hash|COMPARTIDO|MATCH|{"type":"varchar(255)","nullable":false}|{"type":"varchar(255)","nullable":false}|
|usuario|version_sesion|COMPARTIDO|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|usuario|activo|COMPARTIDO|MATCH|{"type":"boolean","nullable":true}|{"type":"boolean","nullable":true}|
|usuario|fecha_creacion|COMPARTIDO|MATCH|{"type":"timestamptz","nullable":true}|{"type":"timestamptz","nullable":true}|
|usuario|es_password_temporal|COMPARTIDO|MATCH|{"type":"boolean","nullable":true}|{"type":"boolean","nullable":true}|
|usuario|intentos_fallidos|COMPARTIDO|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|usuario|PRIMARY KEY|COMPARTIDO|MATCH|["id_usuario"]|["id_usuario"]|
|usuario|FK:empresa|COMPARTIDO|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|usuario|INDEX:nombre_usuario|COMPARTIDO|MATCH|{"columns":["nombre_usuario"],"unique":true}|null|
|usuario|INDEX:email|COMPARTIDO|MATCH|{"columns":["email"],"unique":true}|null|
|rol|id_rol|COMPARTIDO|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|rol|nombre_rol|COMPARTIDO|MATCH|{"type":"varchar(50)","nullable":false}|{"type":"varchar(50)","nullable":false}|
|rol|descripcion|COMPARTIDO|MATCH|{"type":"text","nullable":true}|{"type":"text","nullable":true}|
|rol|PRIMARY KEY|COMPARTIDO|MATCH|["id_rol"]|["id_rol"]|
|rol|INDEX:nombre_rol|COMPARTIDO|MATCH|{"columns":["nombre_rol"],"unique":true}|null|
|usuario_rol|id_usuario_rol|COMPARTIDO|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|usuario_rol|id_usuario|COMPARTIDO|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|usuario_rol|id_rol|COMPARTIDO|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|usuario_rol|fecha_asignacion|COMPARTIDO|MATCH|{"type":"timestamptz","nullable":true}|{"type":"timestamptz","nullable":true}|
|usuario_rol|PRIMARY KEY|COMPARTIDO|MATCH|["id_usuario_rol"]|["id_usuario_rol"]|
|usuario_rol|FK:usuario|COMPARTIDO|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|usuario_rol|FK:rol|COMPARTIDO|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|usuario_rol|INDEX:id_usuario,id_rol|COMPARTIDO|MATCH|{"columns":["id_usuario","id_rol"],"unique":true}|null|
|log_auditoria|id_log|COMPARTIDO|MATCH|{"type":"bigint","nullable":false}|{"type":"bigint","nullable":false}|
|log_auditoria|id_usuario|COMPARTIDO|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|log_auditoria|accion|COMPARTIDO|MATCH|{"type":"varchar(100)","nullable":false}|{"type":"varchar(100)","nullable":false}|
|log_auditoria|entidad_afectada|COMPARTIDO|MATCH|{"type":"varchar(100)","nullable":true}|{"type":"varchar(100)","nullable":true}|
|log_auditoria|id_entidad_afectada|COMPARTIDO|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|log_auditoria|valor_anterior|COMPARTIDO|MATCH|{"type":"jsonb","nullable":true}|{"type":"jsonb","nullable":true}|
|log_auditoria|valor_nuevo|COMPARTIDO|MATCH|{"type":"jsonb","nullable":true}|{"type":"jsonb","nullable":true}|
|log_auditoria|ip_origen|COMPARTIDO|MATCH|{"type":"varchar(45)","nullable":true}|{"type":"varchar(45)","nullable":true}|
|log_auditoria|fecha_hora|COMPARTIDO|MATCH|{"type":"timestamptz","nullable":true}|{"type":"timestamptz","nullable":true}|
|log_auditoria|PRIMARY KEY|COMPARTIDO|MATCH|["id_log"]|["id_log"]|
|log_auditoria|FK:usuario|COMPARTIDO|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|cliente|id_cliente|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|cliente|id_empresa|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|cliente|rut|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(12)","nullable":true}|{"type":"varchar(12)","nullable":true}|
|cliente|nombre_completo|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(120)","nullable":false}|{"type":"varchar(120)","nullable":false}|
|cliente|email|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(120)","nullable":true}|{"type":"varchar(120)","nullable":true}|
|cliente|telefono|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(20)","nullable":true}|{"type":"varchar(20)","nullable":true}|
|cliente|password_portal_hash|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(72)","nullable":true}|{"type":"varchar(72)","nullable":true}|
|cliente|estado|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(40)","nullable":false}|{"type":"varchar(40)","nullable":false}|
|cliente|es_conflictivo|G8 (coordinar columnas compartidas)|MATCH|{"type":"boolean","nullable":true}|{"type":"boolean","nullable":true}|
|cliente|importado_masivo|G8 (coordinar columnas compartidas)|MATCH|{"type":"boolean","nullable":true}|{"type":"boolean","nullable":true}|
|cliente|obs_conflictivo|G8 (coordinar columnas compartidas)|MATCH|{"type":"text","nullable":true}|{"type":"text","nullable":true}|
|cliente|origen_contacto|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(40)","nullable":true}|{"type":"varchar(40)","nullable":true}|
|cliente|datos_tecnicos|G8 (coordinar columnas compartidas)|MATCH|{"type":"jsonb","nullable":true}|{"type":"jsonb","nullable":true}|
|cliente|fecha_creacion|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamp","nullable":true}|{"type":"timestamp","nullable":true}|
|cliente|PRIMARY KEY|G8 (coordinar columnas compartidas)|MATCH|["id_cliente"]|["id_cliente"]|
|cliente|FK:empresa|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|cliente|INDEX:rut|G8 (coordinar columnas compartidas)|MATCH|{"columns":["rut"],"unique":true}|null|
|prospecto|id_prospecto|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|prospecto|id_empresa|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|prospecto|id_usuario_comercial|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|prospecto|id_cliente|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|prospecto|rut|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(12)","nullable":true}|{"type":"varchar(12)","nullable":true}|
|prospecto|nombre_completo|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(120)","nullable":true}|{"type":"varchar(120)","nullable":true}|
|prospecto|email|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(120)","nullable":true}|{"type":"varchar(120)","nullable":true}|
|prospecto|telefono|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(20)","nullable":true}|{"type":"varchar(20)","nullable":true}|
|prospecto|direccion|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(200)","nullable":true}|{"type":"varchar(200)","nullable":true}|
|prospecto|comuna|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(80)","nullable":true}|{"type":"varchar(80)","nullable":true}|
|prospecto|region|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(80)","nullable":true}|{"type":"varchar(80)","nullable":true}|
|prospecto|latitud|G8 (coordinar columnas compartidas)|MATCH|{"type":"double precision","nullable":true}|{"type":"double precision","nullable":true}|
|prospecto|longitud|G8 (coordinar columnas compartidas)|MATCH|{"type":"double precision","nullable":true}|{"type":"double precision","nullable":true}|
|prospecto|id_zona_pago|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|prospecto|id_plan_interes|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|prospecto|estado_pipeline|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(30)","nullable":true}|{"type":"varchar(30)","nullable":true}|
|prospecto|motivo_perdida|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(30)","nullable":true}|{"type":"varchar(30)","nullable":true}|
|prospecto|observacion_perdida|G8 (coordinar columnas compartidas)|MATCH|{"type":"text","nullable":true}|{"type":"text","nullable":true}|
|prospecto|fecha_perdida|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamp","nullable":true}|{"type":"timestamp","nullable":true}|
|prospecto|id_usuario_perdida|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|prospecto|origen_contacto|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(40)","nullable":true}|{"type":"varchar(40)","nullable":true}|
|prospecto|tiempo_conversion_dias|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|prospecto|clasificacion_comercial|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(40)","nullable":true}|{"type":"varchar(40)","nullable":true}|
|prospecto|disponible_remarketing|G8 (coordinar columnas compartidas)|MATCH|{"type":"boolean","nullable":true}|{"type":"boolean","nullable":true}|
|prospecto|fecha_creacion|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamp","nullable":true}|{"type":"timestamp","nullable":true}|
|prospecto|fecha_conversion|G8 (coordinar columnas compartidas)|MATCH|{"type":"date","nullable":true}|{"type":"date","nullable":true}|
|prospecto|PRIMARY KEY|G8 (coordinar columnas compartidas)|MATCH|["id_prospecto"]|["id_prospecto"]|
|prospecto|FK:empresa|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|prospecto|FK:usuarioComercial|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|prospecto|FK:cliente|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|prospecto|FK:zonaPago|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|
|prospecto|FK:planInteres|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|
|prospecto|INDEX:id_empresa,id_zona_pago|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_empresa","id_zona_pago"],"unique":false}|null|
|prospecto|INDEX:id_empresa,id_plan_interes|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_empresa","id_plan_interes"],"unique":false}|null|
|prospecto|INDEX:id_empresa,clasificacion_comercial|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_empresa","clasificacion_comercial"],"unique":false}|null|
|plan|id_plan|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|plan|id_empresa|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|plan|nombre_comercial|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(100)","nullable":false}|{"type":"varchar(100)","nullable":false}|
|plan|tipo_plan|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(40)","nullable":false}|{"type":"varchar(40)","nullable":false}|
|plan|tipo_cliente|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(20)","nullable":false}|{"type":"varchar(20)","nullable":false}|
|plan|velocidad_mbps|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|plan|precio_mensual|G8 (coordinar columnas compartidas)|MATCH|{"type":"numeric(10,2)","nullable":false}|{"type":"numeric(10,2)","nullable":false}|
|plan|descripcion|G8 (coordinar columnas compartidas)|MATCH|{"type":"text","nullable":true}|{"type":"text","nullable":true}|
|plan|activo|G8 (coordinar columnas compartidas)|MATCH|{"type":"boolean","nullable":true}|{"type":"boolean","nullable":true}|
|plan|PRIMARY KEY|G8 (coordinar columnas compartidas)|MATCH|["id_plan"]|["id_plan"]|
|plan|FK:empresa|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|cotizacion|id_cotizacion|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|cotizacion|id_prospecto|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|cotizacion|id_plan|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|cotizacion|pdf_url|G8 (coordinar columnas compartidas)|MATCH|{"type":"text","nullable":true}|{"type":"text","nullable":true}|
|cotizacion|fecha_envio|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamp","nullable":true}|{"type":"timestamp","nullable":true}|
|cotizacion|factibilidad_verificada|G8 (coordinar columnas compartidas)|MATCH|{"type":"boolean","nullable":true}|{"type":"boolean","nullable":true}|
|cotizacion|PRIMARY KEY|G8 (coordinar columnas compartidas)|MATCH|["id_cotizacion"]|["id_cotizacion"]|
|cotizacion|FK:prospecto|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|cotizacion|FK:plan|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|contrato|id_contrato|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|contrato|id_cliente|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|contrato|id_prospecto|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|contrato|id_plan|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|contrato|id_empresa|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|contrato|id_zona_pago|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|contrato|fecha_inicio|G8 (coordinar columnas compartidas)|MATCH|{"type":"date","nullable":false}|{"type":"date","nullable":false}|
|contrato|dia_vencimiento|G8 (coordinar columnas compartidas)|MATCH|{"type":"smallint","nullable":false}|{"type":"smallint","nullable":false}|
|contrato|estado|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(40)","nullable":false}|{"type":"varchar(40)","nullable":false}|
|contrato|fecha_suspension|G8 (coordinar columnas compartidas)|MATCH|{"type":"date","nullable":true}|{"type":"date","nullable":true}|
|contrato|proveedor_contrato|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(40)","nullable":true}|{"type":"varchar(40)","nullable":true}|
|contrato|numero_contrato_externo|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(80)","nullable":true}|{"type":"varchar(80)","nullable":true}|
|contrato|folio_contrato_externo|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(80)","nullable":true}|{"type":"varchar(80)","nullable":true}|
|contrato|url_contrato_pdf|G8 (coordinar columnas compartidas)|MATCH|{"type":"text","nullable":true}|{"type":"text","nullable":true}|
|contrato|fecha_generacion_contrato|G8 (coordinar columnas compartidas)|MATCH|{"type":"date","nullable":true}|{"type":"date","nullable":true}|
|contrato|fecha_envio_cliente|G8 (coordinar columnas compartidas)|MATCH|{"type":"date","nullable":true}|{"type":"date","nullable":true}|
|contrato|observacion_contrato|G8 (coordinar columnas compartidas)|MATCH|{"type":"text","nullable":true}|{"type":"text","nullable":true}|
|contrato|fecha_firma_manual|G8 (coordinar columnas compartidas)|MATCH|{"type":"date","nullable":true}|{"type":"date","nullable":true}|
|contrato|id_usuario_firma_manual|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|contrato|observacion_firma_manual|G8 (coordinar columnas compartidas)|MATCH|{"type":"text","nullable":true}|{"type":"text","nullable":true}|
|contrato|direccion_instalacion|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(200)","nullable":true}|{"type":"varchar(200)","nullable":true}|
|contrato|comuna_instalacion|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(80)","nullable":true}|{"type":"varchar(80)","nullable":true}|
|contrato|ciudad_instalacion|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(80)","nullable":true}|{"type":"varchar(80)","nullable":true}|
|contrato|PRIMARY KEY|G8 (coordinar columnas compartidas)|MATCH|["id_contrato"]|["id_contrato"]|
|contrato|FK:plan|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|contrato|FK:cliente|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|contrato|FK:prospecto|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|contrato|FK:zonaPago|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|factura|id_factura|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|factura|id_contrato|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|factura|periodo_mes|G8 (coordinar columnas compartidas)|MATCH|{"type":"smallint","nullable":false}|{"type":"smallint","nullable":false}|
|factura|periodo_anio|G8 (coordinar columnas compartidas)|MATCH|{"type":"smallint","nullable":false}|{"type":"smallint","nullable":false}|
|factura|monto|G8 (coordinar columnas compartidas)|MATCH|{"type":"numeric(10,2)","nullable":true}|{"type":"numeric(10,2)","nullable":true}|
|factura|fecha_emision|G8 (coordinar columnas compartidas)|MATCH|{"type":"date","nullable":true}|{"type":"date","nullable":true}|
|factura|fecha_limite_pago|G8 (coordinar columnas compartidas)|MATCH|{"type":"date","nullable":false}|{"type":"date","nullable":false}|
|factura|estado|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(20)","nullable":false}|{"type":"varchar(20)","nullable":false}|
|factura|tipo_documento|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(30)","nullable":true}|{"type":"varchar(30)","nullable":true}|
|factura|folio_externo|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(80)","nullable":true}|{"type":"varchar(80)","nullable":true}|
|factura|PRIMARY KEY|G8 (coordinar columnas compartidas)|MATCH|["id_factura"]|["id_factura"]|
|factura|FK:contrato|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|factura|INDEX:folio_externo|G8 (coordinar columnas compartidas)|MATCH|{"columns":["folio_externo"],"unique":false}|null|
|pago|id_pago|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|pago|id_factura|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|pago|id_cliente|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|pago|monto|G8 (coordinar columnas compartidas)|MATCH|{"type":"numeric(10,2)","nullable":false}|{"type":"numeric(10,2)","nullable":false}|
|pago|fecha_pago|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamp","nullable":false}|{"type":"timestamp","nullable":false}|
|pago|codigo_transaccion|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(100)","nullable":true}|{"type":"varchar(100)","nullable":true}|
|pago|codigo_autorizacion|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(100)","nullable":true}|{"type":"varchar(100)","nullable":true}|
|pago|pasarela|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(30)","nullable":false}|{"type":"varchar(30)","nullable":false}|
|pago|token_transaccional|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(200)","nullable":true}|{"type":"varchar(200)","nullable":true}|
|pago|comprobante_pdf_url|G8 (coordinar columnas compartidas)|MATCH|{"type":"text","nullable":true}|{"type":"text","nullable":true}|
|pago|comprobante_estado|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(20)","nullable":false}|{"type":"varchar(20)","nullable":false}|
|pago|PRIMARY KEY|G8 (coordinar columnas compartidas)|MATCH|["id_pago"]|["id_pago"]|
|pago|FK:factura|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|pago|INDEX:codigo_transaccion|G8 (coordinar columnas compartidas)|MATCH|{"columns":["codigo_transaccion"],"unique":true}|null|
|tax_emission_intent|id_intencion|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"uuid","nullable":false}|null|
|tax_emission_intent|id_empresa|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"integer","nullable":false}|null|
|tax_emission_intent|id_factura|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"integer","nullable":false}|null|
|tax_emission_intent|id_pago|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"integer","nullable":true}|null|
|tax_emission_intent|business_key|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"varchar(120)","nullable":false}|null|
|tax_emission_intent|policy_version|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"varchar(64)","nullable":false}|null|
|tax_emission_intent|ambiente|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"varchar(20)","nullable":false}|null|
|tax_emission_intent|proveedor|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"varchar(30)","nullable":false}|null|
|tax_emission_intent|tipo_dte|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"integer","nullable":false}|null|
|tax_emission_intent|formato|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"integer","nullable":false}|null|
|tax_emission_intent|fingerprint|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"char(64)","nullable":false}|null|
|tax_emission_intent|folio_esperado|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"varchar(10)","nullable":false}|null|
|tax_emission_intent|estado|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"varchar(30)","nullable":false}|null|
|tax_emission_intent|intentos|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"integer","nullable":false}|null|
|tax_emission_intent|claim_id|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"uuid","nullable":true}|null|
|tax_emission_intent|folio|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"varchar(10)","nullable":true}|null|
|tax_emission_intent|ultimo_error|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"varchar(64)","nullable":true}|null|
|tax_emission_intent|artefacto_url|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"text","nullable":true}|null|
|tax_emission_intent|artefacto_estado|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"varchar(30)","nullable":false}|null|
|tax_emission_intent|email_estado|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"varchar(30)","nullable":false}|null|
|tax_emission_intent|fecha_email_inicio|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"timestamptz(3)","nullable":true}|null|
|tax_emission_intent|email_intentos|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"integer","nullable":false}|null|
|tax_emission_intent|fecha_proximo_email|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"timestamptz(3)","nullable":true}|null|
|tax_emission_intent|ultimo_error_email|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"varchar(64)","nullable":true}|null|
|tax_emission_intent|fecha_creacion|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"timestamptz(3)","nullable":false}|null|
|tax_emission_intent|fecha_inicio|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"timestamptz(3)","nullable":true}|null|
|tax_emission_intent|fecha_envio|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"timestamptz(3)","nullable":true}|null|
|tax_emission_intent|fecha_actualizacion|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"timestamptz(3)","nullable":false}|null|
|tax_emission_intent|PRIMARY KEY|G8 (coordinar columnas compartidas)|INDEX_MISMATCH|["id_intencion"]|null|
|tax_emission_intent|FK:empresa|G8 (coordinar columnas compartidas)|FK_MISMATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|null|
|tax_emission_intent|FK:factura|G8 (coordinar columnas compartidas)|FK_MISMATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|null|
|tax_emission_intent|FK:pago|G8 (coordinar columnas compartidas)|FK_MISMATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|null|
|tax_emission_intent|INDEX:id_empresa,ambiente,business_key|G8 (coordinar columnas compartidas)|INDEX_MISMATCH|{"columns":["id_empresa","ambiente","business_key"],"unique":true}|null|
|tax_emission_intent|INDEX:id_empresa,estado,fecha_actualizacion|G8 (coordinar columnas compartidas)|INDEX_MISMATCH|{"columns":["id_empresa","estado","fecha_actualizacion"],"unique":false}|null|
|tax_payment_job|id_trabajo|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"uuid","nullable":false}|null|
|tax_payment_job|id_empresa|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"integer","nullable":false}|null|
|tax_payment_job|id_factura|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"integer","nullable":false}|null|
|tax_payment_job|id_pago|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"integer","nullable":false}|null|
|tax_payment_job|id_cliente|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"integer","nullable":false}|null|
|tax_payment_job|monto|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"numeric(10,2)","nullable":false}|null|
|tax_payment_job|ambiente|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"varchar(20)","nullable":false}|null|
|tax_payment_job|policy_version|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"varchar(64)","nullable":false}|null|
|tax_payment_job|profile_hash|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"char(64)","nullable":false}|null|
|tax_payment_job|documento|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"bytea","nullable":true}|null|
|tax_payment_job|tipo_dte|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"integer","nullable":true}|null|
|tax_payment_job|formato|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"integer","nullable":true}|null|
|tax_payment_job|folio_esperado|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"varchar(10)","nullable":true}|null|
|tax_payment_job|email|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"varchar(120)","nullable":true}|null|
|tax_payment_job|nombre_cliente|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"varchar(120)","nullable":false}|null|
|tax_payment_job|estado|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"varchar(30)","nullable":false}|null|
|tax_payment_job|ultimo_error|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"varchar(64)","nullable":true}|null|
|tax_payment_job|fecha_creacion|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"timestamptz(3)","nullable":false}|null|
|tax_payment_job|PRIMARY KEY|G8 (coordinar columnas compartidas)|INDEX_MISMATCH|["id_trabajo"]|null|
|tax_payment_job|FK:empresa|G8 (coordinar columnas compartidas)|FK_MISMATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|null|
|tax_payment_job|FK:factura|G8 (coordinar columnas compartidas)|FK_MISMATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|null|
|tax_payment_job|FK:pago|G8 (coordinar columnas compartidas)|FK_MISMATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|null|
|tax_payment_job|INDEX:id_pago|G8 (coordinar columnas compartidas)|INDEX_MISMATCH|{"columns":["id_pago"],"unique":true}|null|
|tax_payment_job|INDEX:estado,fecha_creacion|G8 (coordinar columnas compartidas)|INDEX_MISMATCH|{"columns":["estado","fecha_creacion"],"unique":false}|null|
|documento_tributario_externo|id_documento|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|documento_tributario_externo|id_empresa|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|documento_tributario_externo|tipo_documento|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(20)","nullable":false}|{"type":"varchar(20)","nullable":false}|
|documento_tributario_externo|folio_o_numero|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(80)","nullable":false}|{"type":"varchar(80)","nullable":false}|
|documento_tributario_externo|folio_normalizado|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(80)","nullable":false}|{"type":"varchar(80)","nullable":false}|
|documento_tributario_externo|emisor_proveedor|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(160)","nullable":false}|{"type":"varchar(160)","nullable":false}|
|documento_tributario_externo|emisor_normalizado|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(160)","nullable":false}|{"type":"varchar(160)","nullable":false}|
|documento_tributario_externo|fecha_emision|G8 (coordinar columnas compartidas)|MATCH|{"type":"date","nullable":false}|{"type":"date","nullable":false}|
|documento_tributario_externo|monto_neto|G8 (coordinar columnas compartidas)|MATCH|{"type":"numeric(14,2)","nullable":true}|{"type":"numeric(14,2)","nullable":true}|
|documento_tributario_externo|monto_exento|G8 (coordinar columnas compartidas)|MATCH|{"type":"numeric(14,2)","nullable":true}|{"type":"numeric(14,2)","nullable":true}|
|documento_tributario_externo|iva|G8 (coordinar columnas compartidas)|MATCH|{"type":"numeric(14,2)","nullable":true}|{"type":"numeric(14,2)","nullable":true}|
|documento_tributario_externo|monto_total|G8 (coordinar columnas compartidas)|MATCH|{"type":"numeric(14,2)","nullable":false}|{"type":"numeric(14,2)","nullable":false}|
|documento_tributario_externo|url_documento|G8 (coordinar columnas compartidas)|MATCH|{"type":"text","nullable":true}|{"type":"text","nullable":true}|
|documento_tributario_externo|referencia_externa|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(200)","nullable":true}|{"type":"varchar(200)","nullable":true}|
|documento_tributario_externo|estado|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(20)","nullable":false}|{"type":"varchar(20)","nullable":false}|
|documento_tributario_externo|fuente|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(30)","nullable":false}|{"type":"varchar(30)","nullable":false}|
|documento_tributario_externo|id_cliente|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|documento_tributario_externo|id_contrato|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|documento_tributario_externo|id_factura|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|documento_tributario_externo|id_cargo_adicional|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|documento_tributario_externo|id_usuario_registro|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|documento_tributario_externo|fecha_registro|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamptz","nullable":false}|{"type":"timestamptz","nullable":false}|
|documento_tributario_externo|fecha_actualizacion|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamptz","nullable":false}|{"type":"timestamptz","nullable":false}|
|documento_tributario_externo|PRIMARY KEY|G8 (coordinar columnas compartidas)|MATCH|["id_documento"]|["id_documento"]|
|documento_tributario_externo|FK:empresa|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|documento_tributario_externo|FK:cliente|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|
|documento_tributario_externo|FK:contrato|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|
|documento_tributario_externo|FK:factura|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|
|documento_tributario_externo|FK:cargoAdicional|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|
|documento_tributario_externo|FK:usuarioRegistro|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|documento_tributario_externo|INDEX:id_empresa,tipo_documento,emisor_normalizado,folio_normalizado|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_empresa","tipo_documento","emisor_normalizado","folio_normalizado"],"unique":true}|null|
|documento_tributario_externo|INDEX:id_empresa,fecha_emision|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_empresa","fecha_emision"],"unique":false}|null|
|documento_tributario_externo|INDEX:id_cliente,fecha_emision|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_cliente","fecha_emision"],"unique":false}|null|
|documento_tributario_externo|INDEX:id_contrato|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_contrato"],"unique":false}|null|
|documento_tributario_externo|INDEX:id_factura|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_factura"],"unique":false}|null|
|documento_tributario_externo|INDEX:id_cargo_adicional|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_cargo_adicional"],"unique":false}|null|
|documento_tributario_externo|INDEX:id_empresa,estado|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_empresa","estado"],"unique":false}|null|
|direccion_servicio|id_direccion|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|direccion_servicio|id_cliente|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|direccion_servicio|direccion_completa|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(200)","nullable":false}|{"type":"varchar(200)","nullable":false}|
|direccion_servicio|comuna|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(80)","nullable":false}|{"type":"varchar(80)","nullable":false}|
|direccion_servicio|ciudad|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(80)","nullable":true}|{"type":"varchar(80)","nullable":true}|
|direccion_servicio|es_principal|G8 (coordinar columnas compartidas)|MATCH|{"type":"boolean","nullable":true}|{"type":"boolean","nullable":true}|
|direccion_servicio|PRIMARY KEY|G8 (coordinar columnas compartidas)|MATCH|["id_direccion"]|["id_direccion"]|
|direccion_servicio|FK:cliente|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|orden_trabajo|id_ot|G3/Ops|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|orden_trabajo|id_empresa|G3/Ops|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|orden_trabajo|id_cliente|G3/Ops|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|orden_trabajo|id_tecnico|G3/Ops|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|orden_trabajo|id_tecnico_externo|G3/Ops|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|orden_trabajo|id_direccion|G3/Ops|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|orden_trabajo|id_servicio|G3/Ops|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|orden_trabajo|id_prospecto|G3/Ops|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|orden_trabajo|id_ticket|G3/Ops|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|orden_trabajo|codigo_seguimiento|G3/Ops|MATCH|{"type":"varchar(32)","nullable":true}|{"type":"varchar(32)","nullable":true}|
|orden_trabajo|tipo_ot|G3/Ops|MATCH|{"type":"varchar(20)","nullable":false}|{"type":"varchar(20)","nullable":false}|
|orden_trabajo|prioridad|G3/Ops|MATCH|{"type":"varchar(10)","nullable":false}|{"type":"varchar(10)","nullable":false}|
|orden_trabajo|estado|G3/Ops|MATCH|{"type":"varchar(25)","nullable":false}|{"type":"varchar(25)","nullable":false}|
|orden_trabajo|fecha_creacion|G3/Ops|MATCH|{"type":"timestamp","nullable":true}|{"type":"timestamp","nullable":true}|
|orden_trabajo|fecha_programada|G3/Ops|MATCH|{"type":"timestamptz","nullable":true}|{"type":"timestamptz","nullable":true}|
|orden_trabajo|fecha_completada|G3/Ops|MATCH|{"type":"timestamp","nullable":true}|{"type":"timestamp","nullable":true}|
|orden_trabajo|potencia_optica_dbm|G3/Ops|MATCH|{"type":"numeric(5,2)","nullable":true}|{"type":"numeric(5,2)","nullable":true}|
|orden_trabajo|observaciones|G3/Ops|MATCH|{"type":"text","nullable":true}|{"type":"text","nullable":true}|
|orden_trabajo|resuelto_remotamente|G3/Ops|MATCH|{"type":"boolean","nullable":true}|{"type":"boolean","nullable":true}|
|orden_trabajo|PRIMARY KEY|G3/Ops|MATCH|["id_ot"]|["id_ot"]|
|orden_trabajo|FK:servicio|G3/Ops|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|orden_trabajo|FK:prospecto|G3/Ops|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|orden_trabajo|INDEX:id_ticket|G3/Ops|MATCH|{"columns":["id_ticket"],"unique":true}|null|
|orden_trabajo|INDEX:codigo_seguimiento|G3/Ops|MATCH|{"columns":["codigo_seguimiento"],"unique":true}|null|
|categoria_falla|id_categoria|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|categoria_falla|nombre|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(80)","nullable":false}|{"type":"varchar(80)","nullable":false}|
|categoria_falla|sla_horas|G8 (coordinar columnas compartidas)|MATCH|{"type":"smallint","nullable":true}|{"type":"smallint","nullable":true}|
|categoria_falla|PRIMARY KEY|G8 (coordinar columnas compartidas)|MATCH|["id_categoria"]|["id_categoria"]|
|categoria_falla|INDEX:nombre|G8 (coordinar columnas compartidas)|MATCH|{"columns":["nombre"],"unique":true}|null|
|ticket|id_ticket|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|ticket|id_cliente|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|ticket|id_empresa|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|ticket|id_servicio|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|ticket|id_usuario_asignado|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|ticket|id_categoria|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|ticket|id_conversacion_bot|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|ticket|codigo_seguimiento|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(20)","nullable":true}|{"type":"varchar(20)","nullable":true}|
|ticket|prioridad|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(10)","nullable":false}|{"type":"varchar(10)","nullable":false}|
|ticket|estado|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(20)","nullable":false}|{"type":"varchar(20)","nullable":false}|
|ticket|descripcion|G8 (coordinar columnas compartidas)|MATCH|{"type":"text","nullable":true}|{"type":"text","nullable":true}|
|ticket|fecha_creacion|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamp","nullable":true}|{"type":"timestamp","nullable":true}|
|ticket|fecha_cierre|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamp","nullable":true}|{"type":"timestamp","nullable":true}|
|ticket|origen|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(20)","nullable":true}|{"type":"varchar(20)","nullable":true}|
|ticket|resuelto_remotamente|G8 (coordinar columnas compartidas)|MATCH|{"type":"boolean","nullable":true}|{"type":"boolean","nullable":true}|
|ticket|PRIMARY KEY|G8 (coordinar columnas compartidas)|MATCH|["id_ticket"]|["id_ticket"]|
|ticket|FK:servicio|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|ticket|INDEX:id_conversacion_bot|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_conversacion_bot"],"unique":true}|null|
|ticket|INDEX:codigo_seguimiento|G8 (coordinar columnas compartidas)|MATCH|{"columns":["codigo_seguimiento"],"unique":true}|null|
|integracion_resultado_wifi_g2|id_resultado|G8/G2|MATCH|{"type":"bigint","nullable":false}|{"type":"bigint","nullable":false}|
|integracion_resultado_wifi_g2|request_id|G8/G2|MATCH|{"type":"varchar(100)","nullable":false}|{"type":"varchar(100)","nullable":false}|
|integracion_resultado_wifi_g2|trace_id|G8/G2|MATCH|{"type":"varchar(100)","nullable":true}|{"type":"varchar(100)","nullable":true}|
|integracion_resultado_wifi_g2|id_empresa|G8/G2|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|integracion_resultado_wifi_g2|id_ticket|G8/G2|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|integracion_resultado_wifi_g2|payload_hash|G8/G2|MATCH|{"type":"varchar(64)","nullable":false}|{"type":"varchar(64)","nullable":false}|
|integracion_resultado_wifi_g2|exito|G8/G2|MATCH|{"type":"boolean","nullable":false}|{"type":"boolean","nullable":false}|
|integracion_resultado_wifi_g2|resultado_tecnico|G8/G2|MATCH|{"type":"text","nullable":false}|{"type":"text","nullable":false}|
|integracion_resultado_wifi_g2|estado_ticket_resultante|G8/G2|MATCH|{"type":"varchar(20)","nullable":false}|{"type":"varchar(20)","nullable":false}|
|integracion_resultado_wifi_g2|fecha_recepcion|G8/G2|MATCH|{"type":"timestamptz","nullable":false}|{"type":"timestamptz","nullable":false}|
|integracion_resultado_wifi_g2|PRIMARY KEY|G8/G2|MATCH|["id_resultado"]|["id_resultado"]|
|integracion_resultado_wifi_g2|FK:empresa|G8/G2|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|integracion_resultado_wifi_g2|FK:ticket|G8/G2|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|integracion_resultado_wifi_g2|INDEX:request_id|G8/G2|MATCH|{"columns":["request_id"],"unique":true}|null|
|integracion_resultado_wifi_g2|INDEX:id_ticket,fecha_recepcion|G8/G2|MATCH|{"columns":["id_ticket","fecha_recepcion"],"unique":false}|null|
|integracion_resultado_wifi_g2|INDEX:id_empresa,fecha_recepcion|G8/G2|MATCH|{"columns":["id_empresa","fecha_recepcion"],"unique":false}|null|
|tipo_equipo|id_tipo_equipo|G1|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|tipo_equipo|id_empresa|G1|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|tipo_equipo|nombre|G1|MATCH|{"type":"varchar(100)","nullable":false}|{"type":"varchar(100)","nullable":false}|
|tipo_equipo|categoria|G1|MATCH|{"type":"varchar(40)","nullable":true}|{"type":"varchar(40)","nullable":true}|
|tipo_equipo|requiere_serie_individual|G1|MATCH|{"type":"boolean","nullable":true}|{"type":"boolean","nullable":true}|
|tipo_equipo|ficha_tecnica_pdf_url|G1|MATCH|{"type":"text","nullable":true}|{"type":"text","nullable":true}|
|tipo_equipo|activo|G1|MATCH|{"type":"boolean","nullable":true}|{"type":"boolean","nullable":true}|
|tipo_equipo|PRIMARY KEY|G1|MATCH|["id_tipo_equipo"]|["id_tipo_equipo"]|
|unidad_equipo|id_unidad|G1|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|unidad_equipo|id_tipo_equipo|G1|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|unidad_equipo|id_empresa|G1|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|unidad_equipo|numero_serie|G1|MATCH|{"type":"varchar(80)","nullable":false}|{"type":"varchar(80)","nullable":false}|
|unidad_equipo|modelo|G1|MATCH|{"type":"varchar(80)","nullable":true}|{"type":"varchar(80)","nullable":true}|
|unidad_equipo|estado|G1|MATCH|{"type":"varchar(30)","nullable":false}|{"type":"varchar(30)","nullable":false}|
|unidad_equipo|fecha_adquisicion|G1|MATCH|{"type":"date","nullable":true}|{"type":"date","nullable":true}|
|unidad_equipo|fecha_venc_garantia|G1|MATCH|{"type":"date","nullable":true}|{"type":"date","nullable":true}|
|unidad_equipo|diagnostico_tecnico|G1|MATCH|{"type":"text","nullable":true}|{"type":"text","nullable":true}|
|unidad_equipo|id_cliente_instalado|G1|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|unidad_equipo|id_servicio|G1|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|unidad_equipo|id_bodega_actual|G1|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|unidad_equipo|numero_poste|G1|MATCH|{"type":"varchar(30)","nullable":true}|{"type":"varchar(30)","nullable":true}|
|unidad_equipo|id_caja_nap|G1|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|unidad_equipo|modalidad_asignacion|G1|MATCH|{"type":"varchar(30)","nullable":true}|{"type":"varchar(30)","nullable":true}|
|unidad_equipo|valor_arriendo_mensual|G1|MATCH|{"type":"numeric(10,2)","nullable":true}|{"type":"numeric(10,2)","nullable":true}|
|unidad_equipo|fecha_inicio_asignacion|G1|MATCH|{"type":"date","nullable":true}|{"type":"date","nullable":true}|
|unidad_equipo|PRIMARY KEY|G1|MATCH|["id_unidad"]|["id_unidad"]|
|unidad_equipo|FK:servicio|G1|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|unidad_equipo|INDEX:numero_serie|G1|MATCH|{"columns":["numero_serie"],"unique":true}|null|
|bodega|id_bodega|G1|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|bodega|id_empresa|G1|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|bodega|nombre|G1|MATCH|{"type":"varchar(100)","nullable":false}|{"type":"varchar(100)","nullable":false}|
|bodega|direccion|G1|MATCH|{"type":"varchar(200)","nullable":true}|{"type":"varchar(200)","nullable":true}|
|bodega|activa|G1|MATCH|{"type":"boolean","nullable":true}|{"type":"boolean","nullable":true}|
|bodega|PRIMARY KEY|G1|MATCH|["id_bodega"]|["id_bodega"]|
|movimiento_inventario|id_movimiento|G1|MATCH|{"type":"bigint","nullable":false}|{"type":"bigint","nullable":false}|
|movimiento_inventario|id_tipo_equipo|G1|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|movimiento_inventario|id_unidad|G1|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|movimiento_inventario|id_empresa_origen|G1|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|movimiento_inventario|id_empresa_destino|G1|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|movimiento_inventario|id_bodega_origen|G1|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|movimiento_inventario|id_bodega_destino|G1|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|movimiento_inventario|id_usuario|G1|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|movimiento_inventario|tipo_movimiento|G1|MATCH|{"type":"varchar(30)","nullable":true}|{"type":"varchar(30)","nullable":true}|
|movimiento_inventario|cantidad|G1|MATCH|{"type":"numeric(10,2)","nullable":true}|{"type":"numeric(10,2)","nullable":true}|
|movimiento_inventario|fecha|G1|MATCH|{"type":"timestamp","nullable":true}|{"type":"timestamp","nullable":true}|
|movimiento_inventario|referencia_id|G1|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|movimiento_inventario|PRIMARY KEY|G1|MATCH|["id_movimiento"]|["id_movimiento"]|
|historial_estado_equipo|id_historial|G1|MATCH|{"type":"bigint","nullable":false}|{"type":"bigint","nullable":false}|
|historial_estado_equipo|id_unidad|G1|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|historial_estado_equipo|id_usuario|G1|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|historial_estado_equipo|estado_anterior|G1|MATCH|{"type":"varchar(30)","nullable":true}|{"type":"varchar(30)","nullable":true}|
|historial_estado_equipo|estado_nuevo|G1|MATCH|{"type":"varchar(30)","nullable":true}|{"type":"varchar(30)","nullable":true}|
|historial_estado_equipo|motivo|G1|MATCH|{"type":"text","nullable":true}|{"type":"text","nullable":true}|
|historial_estado_equipo|fecha_hora|G1|MATCH|{"type":"timestamp","nullable":true}|{"type":"timestamp","nullable":true}|
|historial_estado_equipo|PRIMARY KEY|G1|MATCH|["id_historial"]|["id_historial"]|
|historial_ot|id_historial_ot|G3/Ops|MATCH|{"type":"bigint","nullable":false}|{"type":"bigint","nullable":false}|
|historial_ot|id_ot|G3/Ops|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|historial_ot|id_usuario|G3/Ops|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|historial_ot|estado_anterior|G3/Ops|MATCH|{"type":"varchar(25)","nullable":true}|{"type":"varchar(25)","nullable":true}|
|historial_ot|estado_nuevo|G3/Ops|MATCH|{"type":"varchar(25)","nullable":true}|{"type":"varchar(25)","nullable":true}|
|historial_ot|observaciones|G3/Ops|MATCH|{"type":"text","nullable":true}|{"type":"text","nullable":true}|
|historial_ot|fecha_hora|G3/Ops|MATCH|{"type":"timestamp","nullable":true}|{"type":"timestamp","nullable":true}|
|historial_ot|PRIMARY KEY|G3/Ops|MATCH|["id_historial_ot"]|["id_historial_ot"]|
|servicio_contratado|id_servicio|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|servicio_contratado|id_cliente|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|servicio_contratado|id_empresa|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|servicio_contratado|id_contrato|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|servicio_contratado|id_direccion|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|servicio_contratado|id_zona_pago|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|servicio_contratado|tipo_servicio|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(40)","nullable":false}|{"type":"varchar(40)","nullable":false}|
|servicio_contratado|estado_operativo|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(30)","nullable":false}|{"type":"varchar(30)","nullable":false}|
|servicio_contratado|observaciones|G8 (coordinar columnas compartidas)|MATCH|{"type":"text","nullable":true}|{"type":"text","nullable":true}|
|servicio_contratado|datos_tecnicos|G8 (coordinar columnas compartidas)|MATCH|{"type":"jsonb","nullable":true}|{"type":"jsonb","nullable":true}|
|servicio_contratado|fecha_creacion|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamp","nullable":true}|{"type":"timestamp","nullable":true}|
|servicio_contratado|fecha_activacion|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamp","nullable":true}|{"type":"timestamp","nullable":true}|
|servicio_contratado|PRIMARY KEY|G8 (coordinar columnas compartidas)|MATCH|["id_servicio"]|["id_servicio"]|
|servicio_contratado|FK:cliente|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|servicio_contratado|FK:empresa|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|servicio_contratado|FK:contrato|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|servicio_contratado|FK:direccion|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|servicio_contratado|FK:zonaPago|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|solicitud_cliente|id_solicitud|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|solicitud_cliente|id_cliente|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|solicitud_cliente|id_prospecto|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|solicitud_cliente|id_servicio|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|solicitud_cliente|id_empresa|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|solicitud_cliente|tipo_solicitud|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(60)","nullable":false}|{"type":"varchar(60)","nullable":false}|
|solicitud_cliente|canal_origen|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(40)","nullable":true}|{"type":"varchar(40)","nullable":true}|
|solicitud_cliente|estado|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(30)","nullable":false}|{"type":"varchar(30)","nullable":false}|
|solicitud_cliente|factible|G8 (coordinar columnas compartidas)|MATCH|{"type":"boolean","nullable":true}|{"type":"boolean","nullable":true}|
|solicitud_cliente|motivo_no_factible|G8 (coordinar columnas compartidas)|MATCH|{"type":"text","nullable":true}|{"type":"text","nullable":true}|
|solicitud_cliente|descripcion|G8 (coordinar columnas compartidas)|MATCH|{"type":"text","nullable":true}|{"type":"text","nullable":true}|
|solicitud_cliente|observaciones|G8 (coordinar columnas compartidas)|MATCH|{"type":"text","nullable":true}|{"type":"text","nullable":true}|
|solicitud_cliente|id_usuario_registro|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|solicitud_cliente|fecha_creacion|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamp","nullable":true}|{"type":"timestamp","nullable":true}|
|solicitud_cliente|fecha_cierre|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamp","nullable":true}|{"type":"timestamp","nullable":true}|
|solicitud_cliente|PRIMARY KEY|G8 (coordinar columnas compartidas)|MATCH|["id_solicitud"]|["id_solicitud"]|
|solicitud_cliente|FK:cliente|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|solicitud_cliente|FK:servicio|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|solicitud_cliente|FK:empresa|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|solicitud_cliente|FK:usuarioRegistro|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|observacion_operativa|id_observacion|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|observacion_operativa|tipo_entidad|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(40)","nullable":false}|{"type":"varchar(40)","nullable":false}|
|observacion_operativa|id_entidad|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|observacion_operativa|id_cliente|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|observacion_operativa|id_empresa|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|observacion_operativa|id_usuario|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|observacion_operativa|observacion|G8 (coordinar columnas compartidas)|MATCH|{"type":"text","nullable":false}|{"type":"text","nullable":false}|
|observacion_operativa|visibilidad|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(20)","nullable":true}|{"type":"varchar(20)","nullable":true}|
|observacion_operativa|fecha_creacion|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamp","nullable":true}|{"type":"timestamp","nullable":true}|
|observacion_operativa|PRIMARY KEY|G8 (coordinar columnas compartidas)|MATCH|["id_observacion"]|["id_observacion"]|
|observacion_operativa|FK:usuario|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|zona_pago|id_zona_pago|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|zona_pago|id_empresa|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|zona_pago|nombre_zona|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(80)","nullable":false}|{"type":"varchar(80)","nullable":false}|
|zona_pago|comuna|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(80)","nullable":true}|{"type":"varchar(80)","nullable":true}|
|zona_pago|descripcion|G8 (coordinar columnas compartidas)|MATCH|{"type":"text","nullable":true}|{"type":"text","nullable":true}|
|zona_pago|dia_vencimiento_sugerido|G8 (coordinar columnas compartidas)|MATCH|{"type":"smallint","nullable":true}|{"type":"smallint","nullable":true}|
|zona_pago|activo|G8 (coordinar columnas compartidas)|MATCH|{"type":"boolean","nullable":true}|{"type":"boolean","nullable":true}|
|zona_pago|tipo_zona|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(30)","nullable":true}|{"type":"varchar(30)","nullable":true}|
|zona_pago|id_zona_padre|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|zona_pago|poligono_geojson|G8 (coordinar columnas compartidas)|MATCH|{"type":"jsonb","nullable":true}|{"type":"jsonb","nullable":true}|
|zona_pago|centro_lat|G8 (coordinar columnas compartidas)|MATCH|{"type":"double precision","nullable":true}|{"type":"double precision","nullable":true}|
|zona_pago|centro_lng|G8 (coordinar columnas compartidas)|MATCH|{"type":"double precision","nullable":true}|{"type":"double precision","nullable":true}|
|zona_pago|prioridad|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|zona_pago|fuente_cobertura|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(30)","nullable":true}|{"type":"varchar(30)","nullable":true}|
|zona_pago|fecha_inicio|G8 (coordinar columnas compartidas)|MATCH|{"type":"date","nullable":true}|{"type":"date","nullable":true}|
|zona_pago|fecha_fin|G8 (coordinar columnas compartidas)|MATCH|{"type":"date","nullable":true}|{"type":"date","nullable":true}|
|zona_pago|PRIMARY KEY|G8 (coordinar columnas compartidas)|MATCH|["id_zona_pago"]|["id_zona_pago"]|
|zona_pago|FK:empresa|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|zona_pago|FK:zonaPadre|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|zona_pago|INDEX:id_empresa,tipo_zona,activo|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_empresa","tipo_zona","activo"],"unique":false}|null|
|zona_pago|INDEX:id_zona_padre|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_zona_padre"],"unique":false}|null|
|zona_pago|INDEX:fecha_inicio,fecha_fin|G8 (coordinar columnas compartidas)|MATCH|{"columns":["fecha_inicio","fecha_fin"],"unique":false}|null|
|integracion_instalacion_g3|id_integracion|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|integracion_instalacion_g3|id_empresa|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|integracion_instalacion_g3|id_prospecto|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|integracion_instalacion_g3|id_cliente|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|integracion_instalacion_g3|id_contrato|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|integracion_instalacion_g3|id_plan|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|integracion_instalacion_g3|id_servicio|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|integracion_instalacion_g3|request_id|G8 (coordinar columnas compartidas)|MATCH|{"type":"uuid","nullable":false}|{"type":"uuid","nullable":false}|
|integracion_instalacion_g3|trace_id|G8 (coordinar columnas compartidas)|MATCH|{"type":"uuid","nullable":false}|{"type":"uuid","nullable":false}|
|integracion_instalacion_g3|id_ot_g3|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(100)","nullable":true}|{"type":"varchar(100)","nullable":true}|
|integracion_instalacion_g3|codigo_ot_g3|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(100)","nullable":true}|{"type":"varchar(100)","nullable":true}|
|integracion_instalacion_g3|estado_integracion|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(30)","nullable":false}|{"type":"varchar(30)","nullable":false}|
|integracion_instalacion_g3|estado_ot_g3|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(50)","nullable":true}|{"type":"varchar(50)","nullable":true}|
|integracion_instalacion_g3|estado_original_g3|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(100)","nullable":true}|{"type":"varchar(100)","nullable":true}|
|integracion_instalacion_g3|fecha_solicitud|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamp","nullable":false}|{"type":"timestamp","nullable":false}|
|integracion_instalacion_g3|ultimo_intento|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamp","nullable":true}|{"type":"timestamp","nullable":true}|
|integracion_instalacion_g3|fecha_ultima_sincronizacion|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamp","nullable":true}|{"type":"timestamp","nullable":true}|
|integracion_instalacion_g3|intentos|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|integracion_instalacion_g3|ultimo_error_sanitizado|G8 (coordinar columnas compartidas)|MATCH|{"type":"text","nullable":true}|{"type":"text","nullable":true}|
|integracion_instalacion_g3|payload_hash|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(64)","nullable":false}|{"type":"varchar(64)","nullable":false}|
|integracion_instalacion_g3|payload_snapshot|G8 (coordinar columnas compartidas)|MATCH|{"type":"jsonb","nullable":false}|{"type":"jsonb","nullable":false}|
|integracion_instalacion_g3|fecha_cierre_procesado|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamp","nullable":true}|{"type":"timestamp","nullable":true}|
|integracion_instalacion_g3|created_at|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamp","nullable":false}|{"type":"timestamp","nullable":false}|
|integracion_instalacion_g3|updated_at|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamp","nullable":false}|{"type":"timestamp","nullable":false}|
|integracion_instalacion_g3|PRIMARY KEY|G8 (coordinar columnas compartidas)|MATCH|["id_integracion"]|["id_integracion"]|
|integracion_instalacion_g3|FK:empresa|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|integracion_instalacion_g3|FK:prospecto|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|
|integracion_instalacion_g3|FK:cliente|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|
|integracion_instalacion_g3|FK:contrato|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|integracion_instalacion_g3|FK:plan|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|integracion_instalacion_g3|FK:servicio|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|
|integracion_instalacion_g3|INDEX:request_id|G8 (coordinar columnas compartidas)|MATCH|{"columns":["request_id"],"unique":true}|null|
|integracion_instalacion_g3|INDEX:id_empresa,estado_integracion,fecha_solicitud|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_empresa","estado_integracion","fecha_solicitud"],"unique":false}|null|
|integracion_instalacion_g3|INDEX:id_empresa,id_ot_g3|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_empresa","id_ot_g3"],"unique":false}|null|
|integracion_instalacion_g3|INDEX:id_empresa,codigo_ot_g3|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_empresa","codigo_ot_g3"],"unique":false}|null|
|integracion_instalacion_g3|INDEX:id_contrato,fecha_solicitud|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_contrato","fecha_solicitud"],"unique":false}|null|
|integracion_evento_entrante|id_evento|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|integracion_evento_entrante|id_integracion|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|integracion_evento_entrante|source|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(30)","nullable":false}|{"type":"varchar(30)","nullable":false}|
|integracion_evento_entrante|event_type|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(50)","nullable":false}|{"type":"varchar(50)","nullable":false}|
|integracion_evento_entrante|external_reference|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(120)","nullable":false}|{"type":"varchar(120)","nullable":false}|
|integracion_evento_entrante|payload_hash|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(64)","nullable":false}|{"type":"varchar(64)","nullable":false}|
|integracion_evento_entrante|processed_at|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamp","nullable":false}|{"type":"timestamp","nullable":false}|
|integracion_evento_entrante|result|G8 (coordinar columnas compartidas)|MATCH|{"type":"jsonb","nullable":true}|{"type":"jsonb","nullable":true}|
|integracion_evento_entrante|PRIMARY KEY|G8 (coordinar columnas compartidas)|MATCH|["id_evento"]|["id_evento"]|
|integracion_evento_entrante|FK:integracion|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|integracion_evento_entrante|INDEX:id_integracion,event_type|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_integracion","event_type"],"unique":true}|null|
|integracion_evento_entrante|INDEX:external_reference,payload_hash|G8 (coordinar columnas compartidas)|MATCH|{"columns":["external_reference","payload_hash"],"unique":false}|null|
|integracion_activacion_g1|payload_snapshot|G8 (coordinar columnas compartidas)|MATCH|{"type":"jsonb","nullable":true}|{"type":"jsonb","nullable":true}|
|integracion_activacion_g1|id_integracion|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|integracion_activacion_g1|id_empresa|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|integracion_activacion_g1|id_cliente|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|integracion_activacion_g1|id_servicio|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|integracion_activacion_g1|id_contrato|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|integracion_activacion_g1|id_ot_g3|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(100)","nullable":false}|{"type":"varchar(100)","nullable":false}|
|integracion_activacion_g1|numero_serie|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(80)","nullable":true}|{"type":"varchar(80)","nullable":true}|
|integracion_activacion_g1|numeros_serie|G8 (coordinar columnas compartidas)|MATCH|{"type":"text[]","nullable":false}|{"type":"text[]","nullable":false}|
|integracion_activacion_g1|event_id|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(120)","nullable":false}|{"type":"varchar(120)","nullable":false}|
|integracion_activacion_g1|trace_id|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(120)","nullable":false}|{"type":"varchar(120)","nullable":false}|
|integracion_activacion_g1|estado_integracion|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(50)","nullable":false}|{"type":"varchar(50)","nullable":false}|
|integracion_activacion_g1|intentos|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|integracion_activacion_g1|ultimo_intento|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamp","nullable":true}|{"type":"timestamp","nullable":true}|
|integracion_activacion_g1|ultimo_error_sanitizado|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(500)","nullable":true}|{"type":"varchar(500)","nullable":true}|
|integracion_activacion_g1|payload_hash|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(64)","nullable":false}|{"type":"varchar(64)","nullable":false}|
|integracion_activacion_g1|respuesta_estado_g1|G8 (coordinar columnas compartidas)|MATCH|{"type":"jsonb","nullable":true}|{"type":"jsonb","nullable":true}|
|integracion_activacion_g1|fecha_completado|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamp","nullable":true}|{"type":"timestamp","nullable":true}|
|integracion_activacion_g1|created_at|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamp","nullable":false}|{"type":"timestamp","nullable":false}|
|integracion_activacion_g1|updated_at|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamp","nullable":false}|{"type":"timestamp","nullable":false}|
|integracion_activacion_g1|PRIMARY KEY|G8 (coordinar columnas compartidas)|MATCH|["id_integracion"]|["id_integracion"]|
|integracion_activacion_g1|FK:empresa|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|integracion_activacion_g1|FK:cliente|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|integracion_activacion_g1|FK:servicio|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|integracion_activacion_g1|FK:contrato|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|integracion_activacion_g1|INDEX:event_id|G8 (coordinar columnas compartidas)|MATCH|{"columns":["event_id"],"unique":true}|null|
|integracion_activacion_g1|INDEX:id_empresa,estado_integracion,created_at|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_empresa","estado_integracion","created_at"],"unique":false}|null|
|integracion_activacion_g1|INDEX:id_servicio,created_at|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_servicio","created_at"],"unique":false}|null|
|garantia_comercial|id_garantia|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|garantia_comercial|id_empresa|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|garantia_comercial|id_cliente|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|garantia_comercial|id_servicio|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|garantia_comercial|id_contrato|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|garantia_comercial|numero_serie_equipo|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(80)","nullable":true}|{"type":"varchar(80)","nullable":true}|
|garantia_comercial|tipo|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(60)","nullable":false}|{"type":"varchar(60)","nullable":false}|
|garantia_comercial|fecha_inicio|G8 (coordinar columnas compartidas)|MATCH|{"type":"date","nullable":false}|{"type":"date","nullable":false}|
|garantia_comercial|fecha_termino|G8 (coordinar columnas compartidas)|MATCH|{"type":"date","nullable":false}|{"type":"date","nullable":false}|
|garantia_comercial|cobertura|G8 (coordinar columnas compartidas)|MATCH|{"type":"text","nullable":false}|{"type":"text","nullable":false}|
|garantia_comercial|monto|G8 (coordinar columnas compartidas)|MATCH|{"type":"numeric(12,2)","nullable":true}|{"type":"numeric(12,2)","nullable":true}|
|garantia_comercial|observaciones|G8 (coordinar columnas compartidas)|MATCH|{"type":"text","nullable":true}|{"type":"text","nullable":true}|
|garantia_comercial|estado|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(20)","nullable":false}|{"type":"varchar(20)","nullable":false}|
|garantia_comercial|id_usuario_responsable|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|garantia_comercial|created_at|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamptz","nullable":false}|{"type":"timestamptz","nullable":false}|
|garantia_comercial|updated_at|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamptz","nullable":false}|{"type":"timestamptz","nullable":false}|
|garantia_comercial|PRIMARY KEY|G8 (coordinar columnas compartidas)|MATCH|["id_garantia"]|["id_garantia"]|
|garantia_comercial|FK:empresa|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|garantia_comercial|FK:cliente|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|garantia_comercial|FK:servicio|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|garantia_comercial|FK:contrato|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|garantia_comercial|FK:responsable|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|garantia_comercial|INDEX:id_empresa,estado,fecha_termino|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_empresa","estado","fecha_termino"],"unique":false}|null|
|garantia_comercial|INDEX:id_cliente,fecha_inicio|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_cliente","fecha_inicio"],"unique":false}|null|
|garantia_comercial|INDEX:id_servicio,estado|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_servicio","estado"],"unique":false}|null|
|solicitud_retiro_servicio|id_solicitud_retiro|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|solicitud_retiro_servicio|id_empresa|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|solicitud_retiro_servicio|id_cliente|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|solicitud_retiro_servicio|id_servicio|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|solicitud_retiro_servicio|id_contrato|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|solicitud_retiro_servicio|motivo|G8 (coordinar columnas compartidas)|MATCH|{"type":"text","nullable":false}|{"type":"text","nullable":false}|
|solicitud_retiro_servicio|fecha_solicitada|G8 (coordinar columnas compartidas)|MATCH|{"type":"date","nullable":false}|{"type":"date","nullable":false}|
|solicitud_retiro_servicio|estado|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(30)","nullable":false}|{"type":"varchar(30)","nullable":false}|
|solicitud_retiro_servicio|estado_despacho_tecnico|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(40)","nullable":false}|{"type":"varchar(40)","nullable":false}|
|solicitud_retiro_servicio|id_usuario_responsable|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|solicitud_retiro_servicio|observaciones|G8 (coordinar columnas compartidas)|MATCH|{"type":"text","nullable":true}|{"type":"text","nullable":true}|
|solicitud_retiro_servicio|created_at|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamp","nullable":false}|{"type":"timestamp","nullable":false}|
|solicitud_retiro_servicio|updated_at|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamp","nullable":false}|{"type":"timestamp","nullable":false}|
|solicitud_retiro_servicio|PRIMARY KEY|G8 (coordinar columnas compartidas)|MATCH|["id_solicitud_retiro"]|["id_solicitud_retiro"]|
|solicitud_retiro_servicio|FK:empresa|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|solicitud_retiro_servicio|FK:cliente|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|solicitud_retiro_servicio|FK:servicio|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|solicitud_retiro_servicio|FK:contrato|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|
|solicitud_retiro_servicio|FK:responsable|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|solicitud_retiro_servicio|INDEX:id_empresa,estado,fecha_solicitada|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_empresa","estado","fecha_solicitada"],"unique":false}|null|
|solicitud_retiro_servicio|INDEX:id_servicio,created_at|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_servicio","created_at"],"unique":false}|null|
|evento_gestion_comercial|id_evento|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|evento_gestion_comercial|id_empresa|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|evento_gestion_comercial|id_cliente|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|evento_gestion_comercial|id_servicio|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|evento_gestion_comercial|id_contrato|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|evento_gestion_comercial|id_factura|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|evento_gestion_comercial|tipo|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(40)","nullable":false}|{"type":"varchar(40)","nullable":false}|
|evento_gestion_comercial|canal|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(20)","nullable":false}|{"type":"varchar(20)","nullable":false}|
|evento_gestion_comercial|estado_gestion|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(30)","nullable":false}|{"type":"varchar(30)","nullable":false}|
|evento_gestion_comercial|fecha|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamptz","nullable":false}|{"type":"timestamptz","nullable":false}|
|evento_gestion_comercial|observacion|G8 (coordinar columnas compartidas)|MATCH|{"type":"text","nullable":true}|{"type":"text","nullable":true}|
|evento_gestion_comercial|id_usuario_responsable|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|evento_gestion_comercial|created_at|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamptz","nullable":false}|{"type":"timestamptz","nullable":false}|
|evento_gestion_comercial|PRIMARY KEY|G8 (coordinar columnas compartidas)|MATCH|["id_evento"]|["id_evento"]|
|evento_gestion_comercial|FK:empresa|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|evento_gestion_comercial|FK:cliente|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|evento_gestion_comercial|FK:servicio|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|
|evento_gestion_comercial|FK:contrato|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|
|evento_gestion_comercial|FK:factura|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|
|evento_gestion_comercial|FK:responsable|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|evento_gestion_comercial|INDEX:id_empresa,tipo,fecha|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_empresa","tipo","fecha"],"unique":false}|null|
|evento_gestion_comercial|INDEX:id_cliente,fecha|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_cliente","fecha"],"unique":false}|null|
|evento_gestion_comercial|INDEX:id_factura|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_factura"],"unique":false}|null|
|convenio_pago|id_convenio|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|convenio_pago|id_empresa|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|convenio_pago|id_cliente|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|convenio_pago|id_servicio|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|convenio_pago|id_contrato|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|convenio_pago|id_factura|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|convenio_pago|monto_comprometido|G8 (coordinar columnas compartidas)|MATCH|{"type":"numeric(12,2)","nullable":false}|{"type":"numeric(12,2)","nullable":false}|
|convenio_pago|cantidad_cuotas|G8 (coordinar columnas compartidas)|MATCH|{"type":"smallint","nullable":false}|{"type":"smallint","nullable":false}|
|convenio_pago|condiciones|G8 (coordinar columnas compartidas)|MATCH|{"type":"text","nullable":false}|{"type":"text","nullable":false}|
|convenio_pago|fecha_inicio|G8 (coordinar columnas compartidas)|MATCH|{"type":"date","nullable":false}|{"type":"date","nullable":false}|
|convenio_pago|estado|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(20)","nullable":false}|{"type":"varchar(20)","nullable":false}|
|convenio_pago|id_usuario_responsable|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|convenio_pago|id_usuario_aprobador|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|convenio_pago|fecha_registro|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamptz","nullable":false}|{"type":"timestamptz","nullable":false}|
|convenio_pago|fecha_aprobacion|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamptz","nullable":true}|{"type":"timestamptz","nullable":true}|
|convenio_pago|PRIMARY KEY|G8 (coordinar columnas compartidas)|MATCH|["id_convenio"]|["id_convenio"]|
|convenio_pago|FK:empresa|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|convenio_pago|FK:cliente|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|convenio_pago|FK:servicio|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|
|convenio_pago|FK:contrato|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|
|convenio_pago|FK:factura|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|
|convenio_pago|FK:responsable|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|convenio_pago|FK:aprobador|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|
|convenio_pago|INDEX:id_empresa,estado,fecha_inicio|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_empresa","estado","fecha_inicio"],"unique":false}|null|
|convenio_pago|INDEX:id_cliente,estado|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_cliente","estado"],"unique":false}|null|
|convenio_pago|INDEX:id_factura|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_factura"],"unique":false}|null|
|cuota_convenio_pago|id_cuota|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|cuota_convenio_pago|id_convenio|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|cuota_convenio_pago|numero|G8 (coordinar columnas compartidas)|MATCH|{"type":"smallint","nullable":false}|{"type":"smallint","nullable":false}|
|cuota_convenio_pago|monto|G8 (coordinar columnas compartidas)|MATCH|{"type":"numeric(12,2)","nullable":false}|{"type":"numeric(12,2)","nullable":false}|
|cuota_convenio_pago|fecha_vencimiento|G8 (coordinar columnas compartidas)|MATCH|{"type":"date","nullable":false}|{"type":"date","nullable":false}|
|cuota_convenio_pago|estado|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(20)","nullable":false}|{"type":"varchar(20)","nullable":false}|
|cuota_convenio_pago|fecha_pago|G8 (coordinar columnas compartidas)|MATCH|{"type":"date","nullable":true}|{"type":"date","nullable":true}|
|cuota_convenio_pago|PRIMARY KEY|G8 (coordinar columnas compartidas)|MATCH|["id_cuota"]|["id_cuota"]|
|cuota_convenio_pago|FK:convenio|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|cuota_convenio_pago|INDEX:id_convenio,numero|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_convenio","numero"],"unique":true}|null|
|cuota_convenio_pago|INDEX:fecha_vencimiento,estado|G8 (coordinar columnas compartidas)|MATCH|{"columns":["fecha_vencimiento","estado"],"unique":false}|null|
|prorroga_pago|id_prorroga|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|prorroga_pago|id_empresa|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|prorroga_pago|id_cliente|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|prorroga_pago|id_contrato|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|prorroga_pago|id_factura|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|prorroga_pago|fecha_original|G8 (coordinar columnas compartidas)|MATCH|{"type":"date","nullable":false}|{"type":"date","nullable":false}|
|prorroga_pago|nueva_fecha|G8 (coordinar columnas compartidas)|MATCH|{"type":"date","nullable":false}|{"type":"date","nullable":false}|
|prorroga_pago|motivo|G8 (coordinar columnas compartidas)|MATCH|{"type":"text","nullable":false}|{"type":"text","nullable":false}|
|prorroga_pago|estado|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(20)","nullable":false}|{"type":"varchar(20)","nullable":false}|
|prorroga_pago|id_usuario_responsable|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|prorroga_pago|fecha_registro|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamptz","nullable":false}|{"type":"timestamptz","nullable":false}|
|prorroga_pago|PRIMARY KEY|G8 (coordinar columnas compartidas)|MATCH|["id_prorroga"]|["id_prorroga"]|
|prorroga_pago|FK:empresa|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|prorroga_pago|FK:cliente|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|prorroga_pago|FK:contrato|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|
|prorroga_pago|FK:factura|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|prorroga_pago|FK:responsable|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|prorroga_pago|INDEX:id_empresa,estado,nueva_fecha|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_empresa","estado","nueva_fecha"],"unique":false}|null|
|prorroga_pago|INDEX:id_factura,fecha_registro|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_factura","fecha_registro"],"unique":false}|null|
|cambio_condicion_pago|id_cambio|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|cambio_condicion_pago|id_empresa|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|cambio_condicion_pago|id_cliente|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|cambio_condicion_pago|id_contrato|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|cambio_condicion_pago|id_factura|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|cambio_condicion_pago|tipo_cambio|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(30)","nullable":false}|{"type":"varchar(30)","nullable":false}|
|cambio_condicion_pago|valor_anterior|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(40)","nullable":false}|{"type":"varchar(40)","nullable":false}|
|cambio_condicion_pago|valor_nuevo|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(40)","nullable":false}|{"type":"varchar(40)","nullable":false}|
|cambio_condicion_pago|justificacion|G8 (coordinar columnas compartidas)|MATCH|{"type":"text","nullable":false}|{"type":"text","nullable":false}|
|cambio_condicion_pago|id_usuario_responsable|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|cambio_condicion_pago|fecha_registro|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamptz","nullable":false}|{"type":"timestamptz","nullable":false}|
|cambio_condicion_pago|PRIMARY KEY|G8 (coordinar columnas compartidas)|MATCH|["id_cambio"]|["id_cambio"]|
|cambio_condicion_pago|FK:empresa|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|cambio_condicion_pago|FK:cliente|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|cambio_condicion_pago|FK:contrato|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|
|cambio_condicion_pago|FK:factura|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|
|cambio_condicion_pago|FK:responsable|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|cambio_condicion_pago|INDEX:id_empresa,tipo_cambio,fecha_registro|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_empresa","tipo_cambio","fecha_registro"],"unique":false}|null|
|cambio_condicion_pago|INDEX:id_cliente,fecha_registro|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_cliente","fecha_registro"],"unique":false}|null|
|cargo_adicional|id_cargo|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|cargo_adicional|id_empresa|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|cargo_adicional|id_cliente|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|cargo_adicional|id_contrato|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|cargo_adicional|id_servicio|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|cargo_adicional|tipo|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(30)","nullable":false}|{"type":"varchar(30)","nullable":false}|
|cargo_adicional|monto|G8 (coordinar columnas compartidas)|MATCH|{"type":"numeric(12,2)","nullable":false}|{"type":"numeric(12,2)","nullable":false}|
|cargo_adicional|fecha|G8 (coordinar columnas compartidas)|MATCH|{"type":"date","nullable":false}|{"type":"date","nullable":false}|
|cargo_adicional|estado|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(30)","nullable":false}|{"type":"varchar(30)","nullable":false}|
|cargo_adicional|afecta_saldo|G8 (coordinar columnas compartidas)|MATCH|{"type":"boolean","nullable":false}|{"type":"boolean","nullable":false}|
|cargo_adicional|observacion|G8 (coordinar columnas compartidas)|MATCH|{"type":"text","nullable":true}|{"type":"text","nullable":true}|
|cargo_adicional|id_usuario_responsable|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|cargo_adicional|fecha_registro|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamptz","nullable":false}|{"type":"timestamptz","nullable":false}|
|cargo_adicional|PRIMARY KEY|G8 (coordinar columnas compartidas)|MATCH|["id_cargo"]|["id_cargo"]|
|cargo_adicional|FK:empresa|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|cargo_adicional|FK:cliente|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|cargo_adicional|FK:contrato|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|
|cargo_adicional|FK:servicio|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|
|cargo_adicional|FK:responsable|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|{"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|cargo_adicional|INDEX:id_empresa,estado,fecha|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_empresa","estado","fecha"],"unique":false}|null|
|cargo_adicional|INDEX:id_cliente,fecha_registro|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_cliente","fecha_registro"],"unique":false}|null|
|plan_zona_precio|id_plan_zona_precio|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|plan_zona_precio|id_plan|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|plan_zona_precio|id_zona_pago|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|plan_zona_precio|precio_mensual|G8 (coordinar columnas compartidas)|MATCH|{"type":"numeric(10,2)","nullable":false}|{"type":"numeric(10,2)","nullable":false}|
|plan_zona_precio|valor_instalacion|G8 (coordinar columnas compartidas)|MATCH|{"type":"numeric(10,2)","nullable":true}|{"type":"numeric(10,2)","nullable":true}|
|plan_zona_precio|activo|G8 (coordinar columnas compartidas)|MATCH|{"type":"boolean","nullable":true}|{"type":"boolean","nullable":true}|
|plan_zona_precio|fecha_inicio|G8 (coordinar columnas compartidas)|MATCH|{"type":"date","nullable":true}|{"type":"date","nullable":true}|
|plan_zona_precio|fecha_fin|G8 (coordinar columnas compartidas)|MATCH|{"type":"date","nullable":true}|{"type":"date","nullable":true}|
|plan_zona_precio|PRIMARY KEY|G8 (coordinar columnas compartidas)|MATCH|["id_plan_zona_precio"]|["id_plan_zona_precio"]|
|plan_zona_precio|FK:plan|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|plan_zona_precio|FK:zonaPago|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|plan_zona_precio|INDEX:id_plan,id_zona_pago|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_plan","id_zona_pago"],"unique":false}|null|
|plan_zona_precio|INDEX:id_zona_pago,activo,fecha_inicio,fecha_fin|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_zona_pago","activo","fecha_inicio","fecha_fin"],"unique":false}|null|
|historial_cambio_plan|id_cambio_plan|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|historial_cambio_plan|id_contrato|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|historial_cambio_plan|id_cliente|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|historial_cambio_plan|id_empresa|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|historial_cambio_plan|id_plan_anterior|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|historial_cambio_plan|id_plan_nuevo|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|historial_cambio_plan|fecha_efectiva|G8 (coordinar columnas compartidas)|MATCH|{"type":"date","nullable":false}|{"type":"date","nullable":false}|
|historial_cambio_plan|motivo|G8 (coordinar columnas compartidas)|MATCH|{"type":"text","nullable":false}|{"type":"text","nullable":false}|
|historial_cambio_plan|observaciones|G8 (coordinar columnas compartidas)|MATCH|{"type":"text","nullable":true}|{"type":"text","nullable":true}|
|historial_cambio_plan|precio_anterior|G8 (coordinar columnas compartidas)|MATCH|{"type":"numeric(10,2)","nullable":true}|{"type":"numeric(10,2)","nullable":true}|
|historial_cambio_plan|precio_nuevo|G8 (coordinar columnas compartidas)|MATCH|{"type":"numeric(10,2)","nullable":true}|{"type":"numeric(10,2)","nullable":true}|
|historial_cambio_plan|id_usuario_registro|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|historial_cambio_plan|fecha_registro|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamp","nullable":true}|{"type":"timestamp","nullable":true}|
|historial_cambio_plan|estado_cambio|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(20)","nullable":false}|{"type":"varchar(20)","nullable":false}|
|historial_cambio_plan|fecha_aplicacion|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamp","nullable":true}|{"type":"timestamp","nullable":true}|
|historial_cambio_plan|PRIMARY KEY|G8 (coordinar columnas compartidas)|MATCH|["id_cambio_plan"]|["id_cambio_plan"]|
|historial_cambio_plan|FK:contrato|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|historial_cambio_plan|FK:cliente|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|historial_cambio_plan|FK:planAnterior|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|historial_cambio_plan|FK:planNuevo|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|contrato_digital|id_contrato_digital|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|contrato_digital|id_contrato|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|contrato_digital|id_cliente|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|contrato_digital|id_empresa|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|contrato_digital|url_documento|G8 (coordinar columnas compartidas)|MATCH|{"type":"text","nullable":false}|{"type":"text","nullable":false}|
|contrato_digital|hash_documento|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(128)","nullable":false}|{"type":"varchar(128)","nullable":false}|
|contrato_digital|estado_firma|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(30)","nullable":false}|{"type":"varchar(30)","nullable":false}|
|contrato_digital|fecha_generacion|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamp","nullable":true}|{"type":"timestamp","nullable":true}|
|contrato_digital|fecha_firma|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamp","nullable":true}|{"type":"timestamp","nullable":true}|
|contrato_digital|id_usuario_generador|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|contrato_digital|version|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|contrato_digital|PRIMARY KEY|G8 (coordinar columnas compartidas)|MATCH|["id_contrato_digital"]|["id_contrato_digital"]|
|contrato_digital|FK:contrato|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|contrato_digital|FK:cliente|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|contrato_digital|FK:usuarioGenerador|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|{"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|plantilla_notificacion|id_plantilla|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|plantilla_notificacion|tipo_evento|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(60)","nullable":true}|{"type":"varchar(60)","nullable":true}|
|plantilla_notificacion|canal|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(20)","nullable":false}|{"type":"varchar(20)","nullable":false}|
|plantilla_notificacion|contenido_texto|G8 (coordinar columnas compartidas)|MATCH|{"type":"text","nullable":true}|{"type":"text","nullable":true}|
|plantilla_notificacion|activa|G8 (coordinar columnas compartidas)|MATCH|{"type":"boolean","nullable":true}|{"type":"boolean","nullable":true}|
|plantilla_notificacion|id_empresa|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|plantilla_notificacion|PRIMARY KEY|G8 (coordinar columnas compartidas)|MATCH|["id_plantilla"]|["id_plantilla"]|
|plantilla_notificacion|FK:empresa|G8 (coordinar columnas compartidas)|MATCH|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|{"onDelete":"SET NULL","onUpdate":"CASCADE"}|
|plantilla_notificacion|INDEX:id_empresa|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_empresa"],"unique":false}|null|
|log_notificacion|id_notificacion|G8 (coordinar columnas compartidas)|MATCH|{"type":"bigint","nullable":false}|{"type":"bigint","nullable":false}|
|log_notificacion|id_cliente|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|log_notificacion|id_plantilla|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|log_notificacion|canal|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(20)","nullable":true}|{"type":"varchar(20)","nullable":true}|
|log_notificacion|fecha_envio|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamp","nullable":true}|{"type":"timestamp","nullable":true}|
|log_notificacion|estado_envio|G8 (coordinar columnas compartidas)|TYPE_WIDENING_REQUIRED|{"type":"varchar(30)","nullable":true}|{"type":"varchar(20)","nullable":true}|
|log_notificacion|id_empresa|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"integer","nullable":true}|null|
|log_notificacion|proveedor|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"varchar(20)","nullable":true}|null|
|log_notificacion|correlation_id|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"uuid","nullable":true}|null|
|log_notificacion|payload_hash|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"char(64)","nullable":true}|null|
|log_notificacion|provider_message_id|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"varchar(512)","nullable":true}|null|
|log_notificacion|mensaje|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"jsonb","nullable":true}|null|
|log_notificacion|intentos|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"integer","nullable":false}|null|
|log_notificacion|fecha_inicio|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"timestamptz(3)","nullable":true}|null|
|log_notificacion|ultimo_error|G8 (coordinar columnas compartidas)|PRISMA_ONLY|{"type":"varchar(64)","nullable":true}|null|
|log_notificacion|PRIMARY KEY|G8 (coordinar columnas compartidas)|MATCH|["id_notificacion"]|["id_notificacion"]|
|log_notificacion|INDEX:correlation_id|G8 (coordinar columnas compartidas)|INDEX_MISMATCH|{"columns":["correlation_id"],"unique":true}|null|
|log_notificacion|INDEX:provider_message_id|G8 (coordinar columnas compartidas)|INDEX_MISMATCH|{"columns":["provider_message_id"],"unique":true}|null|
|log_notificacion|INDEX:proveedor,estado_envio,fecha_envio|G8 (coordinar columnas compartidas)|INDEX_MISMATCH|{"columns":["proveedor","estado_envio","fecha_envio"],"unique":false}|null|
|stock_consumible|id_stock|G1|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|stock_consumible|id_tipo_equipo|G1|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|stock_consumible|id_bodega|G1|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|stock_consumible|cantidad_disponible|G1|MATCH|{"type":"numeric(10,2)","nullable":true}|{"type":"numeric(10,2)","nullable":true}|
|stock_consumible|umbral_minimo|G1|MATCH|{"type":"numeric(10,2)","nullable":true}|{"type":"numeric(10,2)","nullable":true}|
|stock_consumible|PRIMARY KEY|G1|MATCH|["id_stock"]|["id_stock"]|
|caja_nap|id_caja_nap|G3/Ops|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|caja_nap|id_empresa|G3/Ops|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|caja_nap|id_mufa|G3/Ops|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|caja_nap|identificador_unico|G3/Ops|MATCH|{"type":"varchar(50)","nullable":true}|{"type":"varchar(50)","nullable":true}|
|caja_nap|numero_poste|G3/Ops|MATCH|{"type":"varchar(30)","nullable":true}|{"type":"varchar(30)","nullable":true}|
|caja_nap|zona|G3/Ops|MATCH|{"type":"varchar(80)","nullable":true}|{"type":"varchar(80)","nullable":true}|
|caja_nap|capacidad_puertos|G3/Ops|MATCH|{"type":"smallint","nullable":true}|{"type":"smallint","nullable":true}|
|caja_nap|latitud|G3/Ops|MATCH|{"type":"numeric(9,6)","nullable":true}|{"type":"numeric(9,6)","nullable":true}|
|caja_nap|longitud|G3/Ops|MATCH|{"type":"numeric(9,6)","nullable":true}|{"type":"numeric(9,6)","nullable":true}|
|caja_nap|PRIMARY KEY|G3/Ops|MATCH|["id_caja_nap"]|["id_caja_nap"]|
|caja_nap|INDEX:identificador_unico|G3/Ops|MATCH|{"columns":["identificador_unico"],"unique":true}|null|
|baja_equipo|id_baja|G1|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|baja_equipo|id_unidad|G1|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|baja_equipo|id_usuario|G1|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|baja_equipo|motivo_baja|G1|MATCH|{"type":"text","nullable":false}|{"type":"text","nullable":false}|
|baja_equipo|tipo_baja|G1|MATCH|{"type":"varchar(20)","nullable":true}|{"type":"varchar(20)","nullable":true}|
|baja_equipo|donacion_destinatario|G1|MATCH|{"type":"varchar(150)","nullable":true}|{"type":"varchar(150)","nullable":true}|
|baja_equipo|fecha_baja|G1|MATCH|{"type":"date","nullable":true}|{"type":"date","nullable":true}|
|baja_equipo|PRIMARY KEY|G1|MATCH|["id_baja"]|["id_baja"]|
|lista_negra|id_vetado|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|lista_negra|id_cliente|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|lista_negra|rut_vetado|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(12)","nullable":false}|{"type":"varchar(12)","nullable":false}|
|lista_negra|direccion_vetada|G8 (coordinar columnas compartidas)|MATCH|{"type":"text","nullable":true}|{"type":"text","nullable":true}|
|lista_negra|motivo|G8 (coordinar columnas compartidas)|MATCH|{"type":"text","nullable":false}|{"type":"text","nullable":false}|
|lista_negra|fecha_registro|G8 (coordinar columnas compartidas)|MATCH|{"type":"date","nullable":true}|{"type":"date","nullable":true}|
|lista_negra|id_usuario_registro|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|lista_negra|PRIMARY KEY|G8 (coordinar columnas compartidas)|MATCH|["id_vetado"]|["id_vetado"]|
|evidencia_foto|id_foto|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|evidencia_foto|id_ot|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|evidencia_foto|url_cloudinary|G8 (coordinar columnas compartidas)|MATCH|{"type":"text","nullable":false}|{"type":"text","nullable":false}|
|evidencia_foto|formato|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(5)","nullable":true}|{"type":"varchar(5)","nullable":true}|
|evidencia_foto|tamano_kb|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|evidencia_foto|fecha_subida|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamp","nullable":true}|{"type":"timestamp","nullable":true}|
|evidencia_foto|PRIMARY KEY|G8 (coordinar columnas compartidas)|MATCH|["id_foto"]|["id_foto"]|
|transferencia_equipo|id_transferencia|G1|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|transferencia_equipo|id_empresa_origen|G1|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|transferencia_equipo|id_empresa_destino|G1|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|transferencia_equipo|id_usuario_registro|G1|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|transferencia_equipo|fecha_transferencia|G1|MATCH|{"type":"date","nullable":true}|{"type":"date","nullable":true}|
|transferencia_equipo|observaciones|G1|MATCH|{"type":"text","nullable":true}|{"type":"text","nullable":true}|
|transferencia_equipo|PRIMARY KEY|G1|MATCH|["id_transferencia"]|["id_transferencia"]|
|uso_material_ot|id_uso|G3/Ops|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|uso_material_ot|id_ot|G3/Ops|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|uso_material_ot|id_tipo_equipo|G3/Ops|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|uso_material_ot|id_unidad|G3/Ops|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|uso_material_ot|cantidad|G3/Ops|MATCH|{"type":"numeric(10,2)","nullable":false}|{"type":"numeric(10,2)","nullable":false}|
|uso_material_ot|PRIMARY KEY|G3/Ops|MATCH|["id_uso"]|["id_uso"]|
|intento_fallido|id_intento|G2|MATCH|{"type":"bigint","nullable":false}|{"type":"bigint","nullable":false}|
|intento_fallido|id_empresa|G2|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|intento_fallido|ip_address|G2|MATCH|{"type":"varchar(45)","nullable":false}|{"type":"varchar(45)","nullable":false}|
|intento_fallido|rut_intentado|G2|MATCH|{"type":"varchar(50)","nullable":true}|{"type":"varchar(50)","nullable":true}|
|intento_fallido|timestamp|G2|MATCH|{"type":"timestamp","nullable":true}|{"type":"timestamp","nullable":true}|
|intento_fallido|bloqueado_hasta|G2|MATCH|{"type":"timestamp","nullable":true}|{"type":"timestamp","nullable":true}|
|intento_fallido|PRIMARY KEY|G2|MATCH|["id_intento"]|["id_intento"]|
|credenciales_tvip|id_credencial|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|credenciales_tvip|id_contrato|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|credenciales_tvip|usuario_tvip|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(80)","nullable":true}|{"type":"varchar(80)","nullable":true}|
|credenciales_tvip|password_tvip_hash|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(72)","nullable":true}|{"type":"varchar(72)","nullable":true}|
|credenciales_tvip|fecha_generacion|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamp","nullable":true}|{"type":"timestamp","nullable":true}|
|credenciales_tvip|PRIMARY KEY|G8 (coordinar columnas compartidas)|MATCH|["id_credencial"]|["id_credencial"]|
|credenciales_tvip|INDEX:id_contrato|G8 (coordinar columnas compartidas)|MATCH|{"columns":["id_contrato"],"unique":true}|null|
|olt|id_olt|G3/Ops|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|olt|id_empresa|G3/Ops|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|olt|nombre|G3/Ops|MATCH|{"type":"varchar(80)","nullable":true}|{"type":"varchar(80)","nullable":true}|
|olt|ubicacion|G3/Ops|MATCH|{"type":"varchar(200)","nullable":true}|{"type":"varchar(200)","nullable":true}|
|olt|ip_gestion|G3/Ops|MATCH|{"type":"varchar(45)","nullable":true}|{"type":"varchar(45)","nullable":true}|
|olt|PRIMARY KEY|G3/Ops|MATCH|["id_olt"]|["id_olt"]|
|tarjeta_pon|id_tarjeta|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|tarjeta_pon|id_olt|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|tarjeta_pon|numero_tarjeta|G8 (coordinar columnas compartidas)|MATCH|{"type":"smallint","nullable":true}|{"type":"smallint","nullable":true}|
|tarjeta_pon|total_puertos|G8 (coordinar columnas compartidas)|MATCH|{"type":"smallint","nullable":true}|{"type":"smallint","nullable":true}|
|tarjeta_pon|PRIMARY KEY|G8 (coordinar columnas compartidas)|MATCH|["id_tarjeta"]|["id_tarjeta"]|
|mufa|id_mufa|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|mufa|id_tarjeta_pon|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|mufa|identificador|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(50)","nullable":true}|{"type":"varchar(50)","nullable":true}|
|mufa|ubicacion|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(200)","nullable":true}|{"type":"varchar(200)","nullable":true}|
|mufa|PRIMARY KEY|G8 (coordinar columnas compartidas)|MATCH|["id_mufa"]|["id_mufa"]|
|puerto_nap|id_puerto|G3/Ops|MATCH|{"type":"integer","nullable":false}|{"type":"integer","nullable":false}|
|puerto_nap|id_caja_nap|G3/Ops|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|puerto_nap|numero_puerto|G3/Ops|MATCH|{"type":"smallint","nullable":true}|{"type":"smallint","nullable":true}|
|puerto_nap|estado|G3/Ops|MATCH|{"type":"varchar(20)","nullable":true}|{"type":"varchar(20)","nullable":true}|
|puerto_nap|id_cliente_asociado|G3/Ops|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|puerto_nap|PRIMARY KEY|G3/Ops|MATCH|["id_puerto"]|["id_puerto"]|
|monitoreo_ont|id_monitoreo|G3/Ops|MATCH|{"type":"bigint","nullable":false}|{"type":"bigint","nullable":false}|
|monitoreo_ont|id_unidad|G3/Ops|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|monitoreo_ont|id_cliente|G3/Ops|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|monitoreo_ont|id_caja_nap|G3/Ops|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|monitoreo_ont|potencia_actual_dbm|G3/Ops|MATCH|{"type":"numeric(5,2)","nullable":true}|{"type":"numeric(5,2)","nullable":true}|
|monitoreo_ont|timestamp_medicion|G3/Ops|MATCH|{"type":"timestamp","nullable":true}|{"type":"timestamp","nullable":true}|
|monitoreo_ont|estado_conexion|G3/Ops|MATCH|{"type":"varchar(15)","nullable":true}|{"type":"varchar(15)","nullable":true}|
|monitoreo_ont|PRIMARY KEY|G3/Ops|MATCH|["id_monitoreo"]|["id_monitoreo"]|
|historial_conexion_ont|id_historial_ont|G8 (coordinar columnas compartidas)|MATCH|{"type":"bigint","nullable":false}|{"type":"bigint","nullable":false}|
|historial_conexion_ont|id_unidad|G8 (coordinar columnas compartidas)|MATCH|{"type":"integer","nullable":true}|{"type":"integer","nullable":true}|
|historial_conexion_ont|evento|G8 (coordinar columnas compartidas)|MATCH|{"type":"varchar(15)","nullable":true}|{"type":"varchar(15)","nullable":true}|
|historial_conexion_ont|timestamp|G8 (coordinar columnas compartidas)|MATCH|{"type":"timestamp","nullable":true}|{"type":"timestamp","nullable":true}|
|historial_conexion_ont|PRIMARY KEY|G8 (coordinar columnas compartidas)|MATCH|["id_historial_ont"]|["id_historial_ont"]|
|empresa|umbral_desconexion_min|COMPARTIDO|COLUMN_GLOBAL_ONLY|null|{"type":"smallint","nullable":true}|
|usuario|bloqueado_hasta|COMPARTIDO|COLUMN_GLOBAL_ONLY|null|{"type":"timestamptz","nullable":true}|
|usuario|debe_cambiar_password|COMPARTIDO|COLUMN_GLOBAL_ONLY|null|{"type":"boolean","nullable":true}|
|usuario|rut|COMPARTIDO|COLUMN_GLOBAL_ONLY|null|{"type":"varchar(12)","nullable":true}|
|asignacion_equipo_servicio|id_asignacion|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|asignacion_equipo_servicio|id_unidad|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|asignacion_equipo_servicio|id_empresa|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|asignacion_equipo_servicio|event_id|G1|OWNER_EXTERNAL|null|{"type":"varchar(100)","nullable":true}|
|asignacion_equipo_servicio|id_cliente_externo|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|asignacion_equipo_servicio|rut_cliente|G1|OWNER_EXTERNAL|null|{"type":"varchar(20)","nullable":true}|
|asignacion_equipo_servicio|id_servicio_externo|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|asignacion_equipo_servicio|id_contrato_externo|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|asignacion_equipo_servicio|id_ot|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|asignacion_equipo_servicio|fecha_instalacion|G1|OWNER_EXTERNAL|null|{"type":"timestamptz","nullable":false}|
|asignacion_equipo_servicio|fecha_retiro|G1|OWNER_EXTERNAL|null|{"type":"timestamptz","nullable":true}|
|asignacion_equipo_servicio|activa|G1|OWNER_EXTERNAL|null|{"type":"boolean","nullable":false}|
|asignacion_equipo_servicio|origen|G1|OWNER_EXTERNAL|null|{"type":"varchar(30)","nullable":true}|
|asignacion_equipo_servicio|trace_id|G1|OWNER_EXTERNAL|null|{"type":"varchar(100)","nullable":true}|
|bodega|id_usuario_responsable|G1|COLUMN_GLOBAL_ONLY|null|{"type":"integer","nullable":true}|
|detalle_orden_ingreso|id_detalle|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|detalle_orden_ingreso|id_orden|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|detalle_orden_ingreso|id_tipo_equipo|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|detalle_orden_ingreso|cantidad_solicitada|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|detalle_orden_ingreso|cantidad_recibida|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|donacion|id_donacion|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|donacion|nombre_institucion|G1|OWNER_EXTERNAL|null|{"type":"varchar(100)","nullable":false}|
|donacion|rut_institucion|G1|OWNER_EXTERNAL|null|{"type":"varchar(12)","nullable":false}|
|donacion|fecha_donacion|G1|OWNER_EXTERNAL|null|{"type":"date","nullable":false}|
|donacion|numero_resolucion|G1|OWNER_EXTERNAL|null|{"type":"varchar(30)","nullable":true}|
|donacion|id_usuario|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|donacion|id_empresa|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|donacion|fecha_creacion|G1|OWNER_EXTERNAL|null|{"type":"timestamptz","nullable":true}|
|donacion_detalle|id_detalle|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|donacion_detalle|id_donacion|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|donacion_detalle|id_unidad|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|inventario_personal_tecnico|id_inventario|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|inventario_personal_tecnico|id_tecnico|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|inventario_personal_tecnico|id_tipo_equipo|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|inventario_personal_tecnico|cantidad|G1|OWNER_EXTERNAL|null|{"type":"numeric(10,2)","nullable":true}|
|inventario_personal_tecnico|fecha_actualizacion|G1|OWNER_EXTERNAL|null|{"type":"timestamptz","nullable":true}|
|orden_ingreso|id_orden|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|orden_ingreso|id_proveedor|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|orden_ingreso|id_bodega|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|orden_ingreso|id_empresa|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|orden_ingreso|id_usuario_registro|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|orden_ingreso|fecha_creacion|G1|OWNER_EXTERNAL|null|{"type":"timestamptz","nullable":true}|
|orden_ingreso|fecha_recepcion|G1|OWNER_EXTERNAL|null|{"type":"date","nullable":true}|
|orden_ingreso|estado|G1|OWNER_EXTERNAL|null|{"type":"varchar(30)","nullable":true}|
|orden_ingreso|factura_proveedor|G1|OWNER_EXTERNAL|null|{"type":"varchar(50)","nullable":true}|
|orden_ingreso|correlativo|G1|OWNER_EXTERNAL|null|{"type":"varchar(10)","nullable":true}|
|orden_ingreso|numero_documento|G1|OWNER_EXTERNAL|null|{"type":"varchar(30)","nullable":true}|
|orden_ingreso|fecha_documento|G1|OWNER_EXTERNAL|null|{"type":"date","nullable":true}|
|orden_ingreso|id_empresa_destino|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|orden_ingreso|id_bodega_destino|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|orden_ingreso_detalle|id_detalle|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|orden_ingreso_detalle|id_orden|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|orden_ingreso_detalle|id_tipo_equipo|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|orden_ingreso_detalle|cantidad_esperada|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|orden_ingreso_detalle|garantia_dias|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|orden_ingreso_detalle|cantidad_recibida|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|prestamo_detalle|id_detalle|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|prestamo_detalle|id_prestamo|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|prestamo_detalle|id_unidad|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|prestamo_detalle|id_tipo_equipo|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|prestamo_detalle|cantidad|G1|OWNER_EXTERNAL|null|{"type":"numeric(10,2)","nullable":true}|
|prestamo_detalle|cantidad_retornada|G1|OWNER_EXTERNAL|null|{"type":"numeric(10,2)","nullable":true}|
|prestamo_externo|id_prestamo|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|prestamo_externo|id_unidad|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|prestamo_externo|id_empresa_prestamista|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|prestamo_externo|destinatario|G1|OWNER_EXTERNAL|null|{"type":"varchar(100)","nullable":true}|
|prestamo_externo|motivo|G1|OWNER_EXTERNAL|null|{"type":"text","nullable":true}|
|prestamo_externo|fecha_salida|G1|OWNER_EXTERNAL|null|{"type":"timestamptz","nullable":true}|
|prestamo_externo|fecha_retorno_esperada|G1|OWNER_EXTERNAL|null|{"type":"date","nullable":true}|
|prestamo_externo|fecha_retorno_real|G1|OWNER_EXTERNAL|null|{"type":"date","nullable":true}|
|prestamo_externo|estado|G1|OWNER_EXTERNAL|null|{"type":"varchar(20)","nullable":true}|
|prestamo_externo|condicion_retorno|G1|OWNER_EXTERNAL|null|{"type":"text","nullable":true}|
|prestamo_externo|tipo|G1|OWNER_EXTERNAL|null|{"type":"varchar(30)","nullable":true}|
|prestamo_externo|id_empresa|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|prestamo_externo|nombre_receptor|G1|OWNER_EXTERNAL|null|{"type":"varchar(80)","nullable":true}|
|prestamo_externo|rut_receptor|G1|OWNER_EXTERNAL|null|{"type":"varchar(12)","nullable":true}|
|prestamo_externo|fecha_retorno_estimada|G1|OWNER_EXTERNAL|null|{"type":"date","nullable":true}|
|prestamo_externo|detalle|G1|OWNER_EXTERNAL|null|{"type":"text","nullable":true}|
|prestamo_externo|resultado|G1|OWNER_EXTERNAL|null|{"type":"varchar(20)","nullable":true}|
|prestamo_externo|id_usuario_registro|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|prestamo_externo|correlativo|G1|OWNER_EXTERNAL|null|{"type":"varchar(12)","nullable":true}|
|prestamo_externo|id_bodega_origen|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|prestamo_retorno|id_retorno|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|prestamo_retorno|id_detalle|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|prestamo_retorno|cantidad|G1|OWNER_EXTERNAL|null|{"type":"numeric(10,2)","nullable":true}|
|prestamo_retorno|fecha_retorno|G1|OWNER_EXTERNAL|null|{"type":"timestamptz","nullable":false}|
|prestamo_retorno|observacion|G1|OWNER_EXTERNAL|null|{"type":"varchar(300)","nullable":true}|
|prestamo_retorno|id_usuario|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|proveedor|id_proveedor|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|proveedor|nombre_comercial|G1|OWNER_EXTERNAL|null|{"type":"varchar(100)","nullable":false}|
|proveedor|rut_proveedor|G1|OWNER_EXTERNAL|null|{"type":"varchar(12)","nullable":true}|
|proveedor|contacto|G1|OWNER_EXTERNAL|null|{"type":"varchar(80)","nullable":true}|
|proveedor|telefono|G1|OWNER_EXTERNAL|null|{"type":"varchar(20)","nullable":true}|
|proveedor|email|G1|OWNER_EXTERNAL|null|{"type":"varchar(150)","nullable":true}|
|proveedor|rut|G1|OWNER_EXTERNAL|null|{"type":"varchar(12)","nullable":true}|
|proveedor|nombre_contacto|G1|OWNER_EXTERNAL|null|{"type":"varchar(80)","nullable":true}|
|proveedor|activa|G1|OWNER_EXTERNAL|null|{"type":"boolean","nullable":true}|
|proveedor|fecha_creacion|G1|OWNER_EXTERNAL|null|{"type":"timestamptz","nullable":true}|
|proveedor_tipo_equipo|id|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|proveedor_tipo_equipo|id_proveedor|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|proveedor_tipo_equipo|id_tipo_equipo|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|salida_bodega|id_salida|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|salida_bodega|id_tecnico|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|salida_bodega|id_bodega_origen|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|salida_bodega|fecha_hora|G1|OWNER_EXTERNAL|null|{"type":"timestamptz","nullable":true}|
|salida_bodega|id_empresa|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|salida_bodega|id_usuario_registro|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|salida_detalle|id_detalle|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|salida_detalle|id_salida|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|salida_detalle|id_tipo_equipo|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|salida_detalle|id_unidad|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|salida_detalle|cantidad|G1|OWNER_EXTERNAL|null|{"type":"numeric(10,2)","nullable":true}|
|secuencia_srv|id_empresa|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|secuencia_srv|anio|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|secuencia_srv|ultimo|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|solicitud_baja|id_solicitud|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|solicitud_baja|id_unidad|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|solicitud_baja|id_empresa|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|solicitud_baja|id_usuario_solicitante|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|solicitud_baja|motivo|G1|OWNER_EXTERNAL|null|{"type":"varchar(40)","nullable":false}|
|solicitud_baja|motivo_otro|G1|OWNER_EXTERNAL|null|{"type":"varchar(200)","nullable":true}|
|solicitud_baja|estado|G1|OWNER_EXTERNAL|null|{"type":"varchar(30)","nullable":false}|
|solicitud_baja|id_usuario_aprobador|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|solicitud_baja|fecha_solicitud|G1|OWNER_EXTERNAL|null|{"type":"timestamptz","nullable":true}|
|solicitud_baja|fecha_resolucion|G1|OWNER_EXTERNAL|null|{"type":"timestamptz","nullable":true}|
|solicitud_baja|motivo_rechazo|G1|OWNER_EXTERNAL|null|{"type":"varchar(200)","nullable":true}|
|tipo_equipo|marca|G1|COLUMN_GLOBAL_ONLY|null|{"type":"varchar(50)","nullable":true}|
|tipo_equipo|modelo|G1|COLUMN_GLOBAL_ONLY|null|{"type":"varchar(50)","nullable":true}|
|tipo_equipo|descripcion_tecnica|G1|COLUMN_GLOBAL_ONLY|null|{"type":"varchar(500)","nullable":true}|
|tipo_equipo|unidad_medida|G1|COLUMN_GLOBAL_ONLY|null|{"type":"varchar(20)","nullable":true}|
|tipo_equipo|garantia_dias|G1|COLUMN_GLOBAL_ONLY|null|{"type":"integer","nullable":true}|
|tipo_equipo|ficha_tecnica_nombre|G1|COLUMN_GLOBAL_ONLY|null|{"type":"varchar(255)","nullable":true}|
|unidad_equipo|mac_address|G1|COLUMN_GLOBAL_ONLY|null|{"type":"varchar(17)","nullable":true}|
|unidad_equipo|proveedor|G1|COLUMN_GLOBAL_ONLY|null|{"type":"varchar(80)","nullable":true}|
|unidad_equipo|observaciones|G1|COLUMN_GLOBAL_ONLY|null|{"type":"varchar(300)","nullable":true}|
|unidad_equipo|ubicacion_fisica|G1|COLUMN_GLOBAL_ONLY|null|{"type":"varchar(60)","nullable":true}|
|unidad_equipo|motivo_baja|G1|COLUMN_GLOBAL_ONLY|null|{"type":"varchar(40)","nullable":true}|
|unidad_equipo|motivo_baja_detalle|G1|COLUMN_GLOBAL_ONLY|null|{"type":"varchar(200)","nullable":true}|
|unidad_equipo|id_tecnico_asignado|G1|COLUMN_GLOBAL_ONLY|null|{"type":"integer","nullable":true}|
|unidad_equipo|cliente_rut|G1|COLUMN_GLOBAL_ONLY|null|{"type":"varchar(20)","nullable":true}|
|unidad_equipo|cliente_nombre|G1|COLUMN_GLOBAL_ONLY|null|{"type":"varchar(150)","nullable":true}|
|unidad_equipo|direccion_instalacion|G1|COLUMN_GLOBAL_ONLY|null|{"type":"varchar(300)","nullable":true}|
|unidad_equipo|comuna_instalacion|G1|COLUMN_GLOBAL_ONLY|null|{"type":"varchar(100)","nullable":true}|
|unidad_equipo|srv|G1|COLUMN_GLOBAL_ONLY|null|{"type":"varchar(20)","nullable":true}|
|alerta_monitoreo|id_alerta|G3/Ops|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|alerta_monitoreo|id_empresa|G3/Ops|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|alerta_monitoreo|tipo|G3/Ops|OWNER_EXTERNAL|null|{"type":"varchar(30)","nullable":false}|
|alerta_monitoreo|severidad|G3/Ops|OWNER_EXTERNAL|null|{"type":"varchar(15)","nullable":true}|
|alerta_monitoreo|mensaje|G3/Ops|OWNER_EXTERNAL|null|{"type":"text","nullable":true}|
|alerta_monitoreo|id_registro_ont|G3/Ops|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|alerta_monitoreo|id_cliente|G3/Ops|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|alerta_monitoreo|clave_caja|G3/Ops|OWNER_EXTERNAL|null|{"type":"varchar(120)","nullable":true}|
|alerta_monitoreo|id_caja_nap|G3/Ops|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|alerta_monitoreo|afectados|G3/Ops|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|alerta_monitoreo|id_ot_generada|G3/Ops|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|alerta_monitoreo|resuelta|G3/Ops|OWNER_EXTERNAL|null|{"type":"boolean","nullable":false}|
|alerta_monitoreo|resuelta_por|G3/Ops|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|alerta_monitoreo|observacion_resolucion|G3/Ops|OWNER_EXTERNAL|null|{"type":"text","nullable":true}|
|alerta_monitoreo|creada_en|G3/Ops|OWNER_EXTERNAL|null|{"type":"timestamp","nullable":false}|
|alerta_monitoreo|resuelta_en|G3/Ops|OWNER_EXTERNAL|null|{"type":"timestamp","nullable":true}|
|historial_conexion_ont|id_registro_ont|G8 (coordinar columnas compartidas)|COLUMN_GLOBAL_ONLY|null|{"type":"integer","nullable":true}|
|llamada_cortes|id_llamada|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|llamada_cortes|id_ot|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|llamada_cortes|resultado|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"varchar(15)","nullable":false}|
|llamada_cortes|observaciones|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"text","nullable":true}|
|llamada_cortes|fecha_llamada|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"timestamp","nullable":true}|
|monitoreo_ont|id_registro_ont|G3/Ops|COLUMN_GLOBAL_ONLY|null|{"type":"integer","nullable":true}|
|orden_trabajo|id_categoria_falla|G3/Ops|COLUMN_GLOBAL_ONLY|null|{"type":"integer","nullable":true}|
|orden_trabajo|id_caja_nap|G3/Ops|COLUMN_GLOBAL_ONLY|null|{"type":"integer","nullable":true}|
|orden_trabajo|categoria_falla_otro|G3/Ops|COLUMN_GLOBAL_ONLY|null|{"type":"varchar(120)","nullable":true}|
|orden_trabajo|obs_cliente_ausente|G3/Ops|COLUMN_GLOBAL_ONLY|null|{"type":"varchar(500)","nullable":true}|
|orden_trabajo|alerta_detenida_descartada_en|G3/Ops|COLUMN_GLOBAL_ONLY|null|{"type":"timestamp","nullable":true}|
|orden_trabajo|alerta_detenida_descartada_por|G3/Ops|COLUMN_GLOBAL_ONLY|null|{"type":"integer","nullable":true}|
|orden_trabajo|cierre_equipos|G3/Ops|COLUMN_GLOBAL_ONLY|null|{"type":"jsonb","nullable":true}|
|punto_cobertura|id_punto|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|punto_cobertura|id_empresa|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|punto_cobertura|latitud|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"numeric(9,6)","nullable":false}|
|punto_cobertura|longitud|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"numeric(9,6)","nullable":false}|
|punto_cobertura|densidad_cobertura|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"numeric(5,2)","nullable":true}|
|punto_cobertura|tipo_cobertura|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"varchar(20)","nullable":true}|
|registro_ont|id_registro_ont|G3/Ops|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|registro_ont|id_empresa|G3/Ops|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|registro_ont|numero_serie|G3/Ops|OWNER_EXTERNAL|null|{"type":"varchar(80)","nullable":false}|
|registro_ont|id_externo|G3/Ops|OWNER_EXTERNAL|null|{"type":"varchar(40)","nullable":true}|
|registro_ont|olt_externo|G3/Ops|OWNER_EXTERNAL|null|{"type":"varchar(40)","nullable":true}|
|registro_ont|board|G3/Ops|OWNER_EXTERNAL|null|{"type":"smallint","nullable":true}|
|registro_ont|puerto_pon|G3/Ops|OWNER_EXTERNAL|null|{"type":"smallint","nullable":true}|
|registro_ont|zona|G3/Ops|OWNER_EXTERNAL|null|{"type":"varchar(80)","nullable":true}|
|registro_ont|odb|G3/Ops|OWNER_EXTERNAL|null|{"type":"varchar(50)","nullable":true}|
|registro_ont|modelo|G3/Ops|OWNER_EXTERNAL|null|{"type":"varchar(80)","nullable":true}|
|registro_ont|nombre_cliente_ext|G3/Ops|OWNER_EXTERNAL|null|{"type":"varchar(160)","nullable":true}|
|registro_ont|direccion_cliente_ext|G3/Ops|OWNER_EXTERNAL|null|{"type":"varchar(200)","nullable":true}|
|registro_ont|id_unidad|G3/Ops|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|registro_ont|id_cliente|G3/Ops|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|registro_ont|id_caja_nap|G3/Ops|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|registro_ont|caja_confirmada_por|G3/Ops|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|registro_ont|caja_confirmada_en|G3/Ops|OWNER_EXTERNAL|null|{"type":"timestamp","nullable":true}|
|registro_ont|primera_vez|G3/Ops|OWNER_EXTERNAL|null|{"type":"timestamp","nullable":false}|
|registro_ont|ultima_vez|G3/Ops|OWNER_EXTERNAL|null|{"type":"timestamp","nullable":false}|
|tecnico_externo|id_tecnico_ext|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|tecnico_externo|nombre_completo|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"varchar(120)","nullable":false}|
|tecnico_externo|empresa|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"varchar(100)","nullable":true}|
|tecnico_externo|telefono|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"varchar(20)","nullable":true}|
|tecnico_externo|activo|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"boolean","nullable":true}|
|configuracion_seo|id_seo|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|configuracion_seo|id_empresa|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|configuracion_seo|seccion_url|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"varchar(200)","nullable":false}|
|configuracion_seo|meta_titulo|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"varchar(70)","nullable":true}|
|configuracion_seo|meta_descripcion|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"varchar(160)","nullable":true}|
|configuracion_seo|og_tags|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"jsonb","nullable":true}|
|configuracion_seo|fecha_actualizacion|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"timestamp","nullable":true}|
|consentimiento_cookies|id_consentimiento|G2|OWNER_EXTERNAL|null|{"type":"bigint","nullable":false}|
|consentimiento_cookies|id_cliente|G2|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|consentimiento_cookies|ip_anonimizada|G2|OWNER_EXTERNAL|null|{"type":"varchar(45)","nullable":true}|
|consentimiento_cookies|version_documento|G2|OWNER_EXTERNAL|null|{"type":"varchar(20)","nullable":true}|
|consentimiento_cookies|fecha_aceptacion|G2|OWNER_EXTERNAL|null|{"type":"timestamp","nullable":true}|
|consentimiento_cookies|acepto|G2|OWNER_EXTERNAL|null|{"type":"boolean","nullable":false}|
|sesion_portal|id_sesion|G2|OWNER_EXTERNAL|null|{"type":"bigint","nullable":false}|
|sesion_portal|id_cliente|G2|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|sesion_portal|token|G2|OWNER_EXTERNAL|null|{"type":"text","nullable":false}|
|sesion_portal|fecha_inicio|G2|OWNER_EXTERNAL|null|{"type":"timestamp","nullable":true}|
|sesion_portal|fecha_expiracion|G2|OWNER_EXTERNAL|null|{"type":"timestamp","nullable":true}|
|sesion_portal|ip_origen|G2|OWNER_EXTERNAL|null|{"type":"varchar(45)","nullable":true}|
|solicitud_contrasena_wifi|id_solicitud|G2|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|solicitud_contrasena_wifi|id_contrato|G2|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|solicitud_contrasena_wifi|id_cliente|G2|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|solicitud_contrasena_wifi|password_nueva_cifrada|G2|OWNER_EXTERNAL|null|{"type":"text","nullable":true}|
|solicitud_contrasena_wifi|estado|G2|OWNER_EXTERNAL|null|{"type":"varchar(20)","nullable":false}|
|solicitud_contrasena_wifi|fecha_solicitud|G2|OWNER_EXTERNAL|null|{"type":"timestamp","nullable":true}|
|solicitud_contrasena_wifi|fecha_procesada|G2|OWNER_EXTERNAL|null|{"type":"timestamp","nullable":true}|
|canal_whatsapp|id_canal|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|canal_whatsapp|id_empresa|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|canal_whatsapp|numero_telefono|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"varchar(20)","nullable":true}|
|canal_whatsapp|nombre_canal|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"varchar(80)","nullable":true}|
|canal_whatsapp|activo|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"boolean","nullable":true}|
|conversacion_bot|id_conversacion|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|conversacion_bot|id_cliente|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|conversacion_bot|id_canal_wa|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|conversacion_bot|plataforma|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"varchar(20)","nullable":true}|
|conversacion_bot|fecha_inicio|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"timestamp","nullable":true}|
|conversacion_bot|fecha_fin|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"timestamp","nullable":true}|
|conversacion_bot|derivada_humano|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"boolean","nullable":true}|
|log_notificacion|mensaje_enviado|G8 (coordinar columnas compartidas)|COLUMN_GLOBAL_ONLY|null|{"type":"text","nullable":true}|
|log_notificacion|id_alerta|G8 (coordinar columnas compartidas)|COLUMN_GLOBAL_ONLY|null|{"type":"integer","nullable":true}|
|mensaje_bot|id_mensaje|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"bigint","nullable":false}|
|mensaje_bot|id_conversacion|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|mensaje_bot|rol|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"varchar(15)","nullable":true}|
|mensaje_bot|contenido|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"text","nullable":true}|
|mensaje_bot|timestamp|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"timestamp","nullable":true}|
|mensaje_bot|datos_sensibles|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"boolean","nullable":true}|
|mensaje_whatsapp|id_mensaje_wa|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"bigint","nullable":false}|
|mensaje_whatsapp|id_canal|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|mensaje_whatsapp|id_cliente|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|mensaje_whatsapp|id_plantilla_wa|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|mensaje_whatsapp|contenido|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"text","nullable":true}|
|mensaje_whatsapp|timestamp|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"timestamp","nullable":true}|
|mensaje_whatsapp|origen|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"varchar(10)","nullable":true}|
|mensaje_whatsapp|estado|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"varchar(15)","nullable":true}|
|plantilla_notificacion|tiempo_estimado_reparacion|G8 (coordinar columnas compartidas)|COLUMN_GLOBAL_ONLY|null|{"type":"varchar(60)","nullable":true}|
|plantilla_whatsapp|id_plantilla_wa|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|plantilla_whatsapp|id_canal|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|plantilla_whatsapp|nombre_plantilla|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"varchar(80)","nullable":true}|
|plantilla_whatsapp|contenido|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"text","nullable":true}|
|plantilla_whatsapp|tipo_uso|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"type":"varchar(40)","nullable":true}|
|integracion_activacion|id_activacion|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|integracion_activacion|event_id|G1|OWNER_EXTERNAL|null|{"type":"varchar(100)","nullable":true}|
|integracion_activacion|trace_id|G1|OWNER_EXTERNAL|null|{"type":"varchar(100)","nullable":true}|
|integracion_activacion|id_empresa|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|integracion_activacion|id_ot|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|integracion_activacion|id_cliente_externo|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|integracion_activacion|rut_cliente|G1|OWNER_EXTERNAL|null|{"type":"varchar(20)","nullable":true}|
|integracion_activacion|id_servicio_externo|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|integracion_activacion|id_contrato_externo|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|integracion_activacion|payload|G1|OWNER_EXTERNAL|null|{"type":"jsonb","nullable":true}|
|integracion_activacion|estado_proceso|G1|OWNER_EXTERNAL|null|{"type":"varchar(40)","nullable":false}|
|integracion_activacion|equipos_asociados|G1|OWNER_EXTERNAL|null|{"type":"jsonb","nullable":true}|
|integracion_activacion|discrepancias|G1|OWNER_EXTERNAL|null|{"type":"jsonb","nullable":true}|
|integracion_activacion|fecha_proceso|G1|OWNER_EXTERNAL|null|{"type":"timestamptz","nullable":true}|
|integracion_cierre|id_cierre|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|integracion_cierre|clave_idempotencia|G1|OWNER_EXTERNAL|null|{"type":"varchar(120)","nullable":false}|
|integracion_cierre|id_ot|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|integracion_cierre|id_empresa|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|integracion_cierre|tipo_ot|G1|OWNER_EXTERNAL|null|{"type":"varchar(30)","nullable":true}|
|integracion_cierre|payload|G1|OWNER_EXTERNAL|null|{"type":"jsonb","nullable":false}|
|integracion_cierre|estado_proceso|G1|OWNER_EXTERNAL|null|{"type":"varchar(40)","nullable":false}|
|integracion_cierre|discrepancias|G1|OWNER_EXTERNAL|null|{"type":"jsonb","nullable":true}|
|integracion_cierre|acciones_aplicadas|G1|OWNER_EXTERNAL|null|{"type":"jsonb","nullable":true}|
|integracion_cierre|fecha_proceso|G1|OWNER_EXTERNAL|null|{"type":"timestamptz","nullable":true}|
|integracion_cierre|srv|G1|OWNER_EXTERNAL|null|{"type":"varchar(20)","nullable":true}|
|integracion_cierre|id_tecnico|G1|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|integracion_cierre|materiales_aplicados|G1|OWNER_EXTERNAL|null|{"type":"jsonb","nullable":true}|
|solicitud_instalacion_integracion|id_solicitud|G3|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|solicitud_instalacion_integracion|request_id|G3|OWNER_EXTERNAL|null|{"type":"varchar(100)","nullable":false}|
|solicitud_instalacion_integracion|trace_id|G3|OWNER_EXTERNAL|null|{"type":"varchar(100)","nullable":false}|
|solicitud_instalacion_integracion|hash_payload|G3|OWNER_EXTERNAL|null|{"type":"varchar(64)","nullable":false}|
|solicitud_instalacion_integracion|id_empresa|G3|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|solicitud_instalacion_integracion|id_prospecto_externo|G3|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|solicitud_instalacion_integracion|id_contrato_externo|G3|OWNER_EXTERNAL|null|{"type":"integer","nullable":false}|
|solicitud_instalacion_integracion|id_plan_externo|G3|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|solicitud_instalacion_integracion|rut|G3|OWNER_EXTERNAL|null|{"type":"varchar(12)","nullable":false}|
|solicitud_instalacion_integracion|nombre_completo|G3|OWNER_EXTERNAL|null|{"type":"varchar(120)","nullable":false}|
|solicitud_instalacion_integracion|telefono|G3|OWNER_EXTERNAL|null|{"type":"varchar(21)","nullable":false}|
|solicitud_instalacion_integracion|direccion_completa|G3|OWNER_EXTERNAL|null|{"type":"varchar(200)","nullable":false}|
|solicitud_instalacion_integracion|comuna|G3|OWNER_EXTERNAL|null|{"type":"varchar(80)","nullable":false}|
|solicitud_instalacion_integracion|ciudad|G3|OWNER_EXTERNAL|null|{"type":"varchar(80)","nullable":true}|
|solicitud_instalacion_integracion|observaciones|G3|OWNER_EXTERNAL|null|{"type":"text","nullable":true}|
|solicitud_instalacion_integracion|requisitos_equipamiento|G3|OWNER_EXTERNAL|null|{"type":"jsonb","nullable":true}|
|solicitud_instalacion_integracion|id_ot|G3|OWNER_EXTERNAL|null|{"type":"integer","nullable":true}|
|solicitud_instalacion_integracion|estado|G3|OWNER_EXTERNAL|null|{"type":"varchar(30)","nullable":false}|
|solicitud_instalacion_integracion|fecha_creacion|G3|OWNER_EXTERNAL|null|{"type":"timestamptz","nullable":false}|
|solicitud_instalacion_integracion|fecha_actualizacion|G3|OWNER_EXTERNAL|null|{"type":"timestamptz","nullable":false}|
|asignacion_equipo_servicio|INDEX:ux_asignacion_evento_unidad|G1|INDEX_MISMATCH|null|"(event_id, id_unidad)"|
|canal_whatsapp|INDEX:canal_whatsapp_numero_telefono_key|G8 (coordinar columnas compartidas)|INDEX_MISMATCH|null|"(numero_telefono)"|
|configuracion_seo|INDEX:configuracion_seo_id_empresa_seccion_url_key|G8 (coordinar columnas compartidas)|INDEX_MISMATCH|null|"(id_empresa, seccion_url)"|
|contrato_digital|INDEX:uq_contrato_digital_version|G8 (coordinar columnas compartidas)|INDEX_MISMATCH|null|"(id_contrato, version)"|
|garantia_comercial|INDEX:garantia_comercial_activa_periodo_key|G8 (coordinar columnas compartidas)|INDEX_MISMATCH|null|"(id_servicio, tipo, fecha_inicio, fecha_termino) WHERE ((estado)::text = 'ACTIVA'::text)"|
|historial_cambio_plan|INDEX:uq_cambio_plan_pendiente|G8 (coordinar columnas compartidas)|INDEX_MISMATCH|null|"(id_contrato) WHERE ((estado_cambio)::text = 'Pendiente'::text)"|
|integracion_activacion|INDEX:integracion_activacion_event_id_key|G1|INDEX_MISMATCH|null|"(event_id)"|
|integracion_cierre|INDEX:integracion_cierre_clave_idempotencia_key|G1|INDEX_MISMATCH|null|"(clave_idempotencia)"|
|solicitud_instalacion_integracion|INDEX:solicitud_instalacion_integracion_request_id_key|G3|INDEX_MISMATCH|null|"(request_id)"|
|solicitud_instalacion_integracion|INDEX:solicitud_instalacion_integracion_id_ot_key|G3|INDEX_MISMATCH|null|"(id_ot)"|
|inventario_personal_tecnico|INDEX:uq_inventario_tecnico_tipo|G1|INDEX_MISMATCH|null|"(id_tecnico, id_tipo_equipo)"|
|llamada_cortes|INDEX:llamada_cortes_id_ot_key|G8 (coordinar columnas compartidas)|INDEX_MISMATCH|null|"(id_ot)"|
|orden_ingreso|INDEX:orden_ingreso_correlativo_key|G1|INDEX_MISMATCH|null|"(correlativo)"|
|plan_zona_precio|INDEX:uq_plan_zona_precio_activo|G8 (coordinar columnas compartidas)|INDEX_MISMATCH|null|"(id_plan, id_zona_pago) WHERE (activo = true)"|
|prestamo_externo|INDEX:prestamo_externo_correlativo_key|G1|INDEX_MISMATCH|null|"(correlativo)"|
|proveedor|INDEX:proveedor_rut_key|G1|INDEX_MISMATCH|null|"(rut)"|
|proveedor_tipo_equipo|INDEX:uq_pte|G1|INDEX_MISMATCH|null|"(id_proveedor, id_tipo_equipo)"|
|registro_ont|INDEX:registro_ont_numero_serie_key|G3/Ops|INDEX_MISMATCH|null|"(numero_serie)"|
|unidad_equipo|INDEX:unidad_equipo_mac_address_key|G1|INDEX_MISMATCH|null|"(mac_address)"|
|zona_pago|INDEX:uq_zona_pago_empresa_nombre|G8 (coordinar columnas compartidas)|INDEX_MISMATCH|null|"(COALESCE(id_empresa, 0), lower((nombre_zona)::text))"|
|alerta_monitoreo|INDEX:alerta_monitoreo_id_empresa_resuelta_idx|G3/Ops|INDEX_MISMATCH|null|"(id_empresa, resuelta)"|
|alerta_monitoreo|INDEX:alerta_monitoreo_tipo_clave_caja_resuelta_idx|G3/Ops|INDEX_MISMATCH|null|"(tipo, clave_caja, resuelta)"|
|asignacion_equipo_servicio|INDEX:ix_asignacion_empresa_servicio_activa|G1|INDEX_MISMATCH|null|"(id_empresa, id_servicio_externo, activa)"|
|cliente|INDEX:cliente_id_empresa_fecha_creacion_idx|G8 (coordinar columnas compartidas)|INDEX_MISMATCH|null|"(id_empresa, fecha_creacion)"|
|contrato|INDEX:idx_contrato_estado_cliente|G8 (coordinar columnas compartidas)|INDEX_MISMATCH|null|"(id_cliente, estado)"|
|contrato|INDEX:idx_contrato_id_prospecto|G8 (coordinar columnas compartidas)|INDEX_MISMATCH|null|"(id_prospecto)"|
|direccion_servicio|INDEX:direccion_servicio_id_cliente_idx|G8 (coordinar columnas compartidas)|INDEX_MISMATCH|null|"(id_cliente)"|
|historial_cambio_plan|INDEX:idx_cambio_plan_ejecucion|G8 (coordinar columnas compartidas)|INDEX_MISMATCH|null|"(estado_cambio, fecha_efectiva)"|
|historial_cambio_plan|INDEX:idx_historial_cambio_plan_contrato|G8 (coordinar columnas compartidas)|INDEX_MISMATCH|null|"(id_contrato)"|
|historial_ot|INDEX:historial_ot_id_ot_fecha_hora_idx|G3/Ops|INDEX_MISMATCH|null|"(id_ot, fecha_hora)"|
|solicitud_instalacion_integracion|INDEX:solicitud_instalacion_integracion_id_empresa_idx|G3|INDEX_MISMATCH|null|"(id_empresa)"|
|intento_fallido|INDEX:intento_fallido_rut_intentado_bloqueado_hasta_idx|G2|INDEX_MISMATCH|null|"(rut_intentado, bloqueado_hasta)"|
|log_notificacion|INDEX:log_notificacion_id_alerta_idx|G8 (coordinar columnas compartidas)|INDEX_MISMATCH|null|"(id_alerta)"|
|log_notificacion|INDEX:log_notificacion_id_cliente_idx|G8 (coordinar columnas compartidas)|INDEX_MISMATCH|null|"(id_cliente)"|
|monitoreo_ont|INDEX:monitoreo_ont_id_registro_ont_timestamp_medicion_idx|G3/Ops|INDEX_MISMATCH|null|"(id_registro_ont, timestamp_medicion)"|
|observacion_operativa|INDEX:idx_observacion_operativa_entidad|G8 (coordinar columnas compartidas)|INDEX_MISMATCH|null|"(tipo_entidad, id_entidad)"|
|orden_trabajo|INDEX:orden_trabajo_id_caja_nap_idx|G3/Ops|INDEX_MISMATCH|null|"(id_caja_nap)"|
|orden_trabajo|INDEX:orden_trabajo_id_cliente_idx|G3/Ops|INDEX_MISMATCH|null|"(id_cliente)"|
|orden_trabajo|INDEX:orden_trabajo_id_empresa_estado_idx|G3/Ops|INDEX_MISMATCH|null|"(id_empresa, estado)"|
|orden_trabajo|INDEX:orden_trabajo_id_empresa_fecha_creacion_idx|G3/Ops|INDEX_MISMATCH|null|"(id_empresa, fecha_creacion)"|
|orden_trabajo|INDEX:orden_trabajo_id_empresa_tipo_ot_idx|G3/Ops|INDEX_MISMATCH|null|"(id_empresa, tipo_ot)"|
|orden_trabajo|INDEX:idx_orden_trabajo_id_prospecto|G3/Ops|INDEX_MISMATCH|null|"(id_prospecto)"|
|orden_trabajo|INDEX:orden_trabajo_id_tecnico_estado_idx|G3/Ops|INDEX_MISMATCH|null|"(id_tecnico, estado)"|
|plan|INDEX:plan_id_empresa_idx|G8 (coordinar columnas compartidas)|INDEX_MISMATCH|null|"(id_empresa)"|
|registro_ont|INDEX:registro_ont_id_empresa_idx|G3/Ops|INDEX_MISMATCH|null|"(id_empresa)"|
|solicitud_cliente|INDEX:idx_solicitud_cliente_cliente|G8 (coordinar columnas compartidas)|INDEX_MISMATCH|null|"(id_cliente)"|
|solicitud_cliente|INDEX:idx_solicitud_cliente_servicio|G8 (coordinar columnas compartidas)|INDEX_MISMATCH|null|"(id_servicio)"|
|stock_consumible|INDEX:stock_consumible_id_tipo_equipo_idx|G1|INDEX_MISMATCH|null|"(id_tipo_equipo)"|
|tipo_equipo|INDEX:tipo_equipo_id_empresa_idx|G1|INDEX_MISMATCH|null|"(id_empresa)"|
|usuario|INDEX:usuario_id_empresa_idx|COMPARTIDO|INDEX_MISMATCH|null|"(id_empresa)"|
|alerta_monitoreo|FK:alerta_monitoreo_id_caja_nap_fkey|G3/Ops|OWNER_EXTERNAL|null|{"columns":["id_caja_nap"],"referencedTable":"caja_nap","referencedColumns":["id_caja_nap"],"onDelete":"SET NULL","onUpdate":"CASCADE"}|
|alerta_monitoreo|FK:alerta_monitoreo_id_cliente_fkey|G3/Ops|OWNER_EXTERNAL|null|{"columns":["id_cliente"],"referencedTable":"cliente","referencedColumns":["id_cliente"],"onDelete":"SET NULL","onUpdate":"CASCADE"}|
|alerta_monitoreo|FK:alerta_monitoreo_id_empresa_fkey|G3/Ops|OWNER_EXTERNAL|null|{"columns":["id_empresa"],"referencedTable":"empresa","referencedColumns":["id_empresa"],"onDelete":"RESTRICT","onUpdate":"CASCADE"}|
|alerta_monitoreo|FK:alerta_monitoreo_id_ot_generada_fkey|G3/Ops|OWNER_EXTERNAL|null|{"columns":["id_ot_generada"],"referencedTable":"orden_trabajo","referencedColumns":["id_ot"],"onDelete":"SET NULL","onUpdate":"CASCADE"}|
|alerta_monitoreo|FK:alerta_monitoreo_id_registro_ont_fkey|G3/Ops|OWNER_EXTERNAL|null|{"columns":["id_registro_ont"],"referencedTable":"registro_ont","referencedColumns":["id_registro_ont"],"onDelete":"SET NULL","onUpdate":"CASCADE"}|
|alerta_monitoreo|FK:alerta_monitoreo_resuelta_por_fkey|G3/Ops|OWNER_EXTERNAL|null|{"columns":["resuelta_por"],"referencedTable":"usuario","referencedColumns":["id_usuario"],"onDelete":"SET NULL","onUpdate":"CASCADE"}|
|asignacion_equipo_servicio|FK:fk_asignacion_unidad|G1|OWNER_EXTERNAL|null|{"columns":["id_unidad"],"referencedTable":"unidad_equipo","referencedColumns":["id_unidad"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|baja_equipo|FK:fk_baja_equipo_id_unidad|G1|FK_MISMATCH|null|{"columns":["id_unidad"],"referencedTable":"unidad_equipo","referencedColumns":["id_unidad"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|baja_equipo|FK:fk_baja_equipo_id_usuario|G1|FK_MISMATCH|null|{"columns":["id_usuario"],"referencedTable":"usuario","referencedColumns":["id_usuario"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|bodega|FK:fk_bodega_id_empresa|G1|FK_MISMATCH|null|{"columns":["id_empresa"],"referencedTable":"empresa","referencedColumns":["id_empresa"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|caja_nap|FK:fk_caja_nap_id_empresa|G3/Ops|FK_MISMATCH|null|{"columns":["id_empresa"],"referencedTable":"empresa","referencedColumns":["id_empresa"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|caja_nap|FK:fk_caja_nap_id_mufa|G3/Ops|FK_MISMATCH|null|{"columns":["id_mufa"],"referencedTable":"mufa","referencedColumns":["id_mufa"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|canal_whatsapp|FK:fk_canal_whatsapp_id_empresa|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"columns":["id_empresa"],"referencedTable":"empresa","referencedColumns":["id_empresa"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|configuracion_seo|FK:fk_configuracion_seo_id_empresa|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"columns":["id_empresa"],"referencedTable":"empresa","referencedColumns":["id_empresa"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|consentimiento_cookies|FK:fk_consentimiento_cookies_id_cliente|G2|OWNER_EXTERNAL|null|{"columns":["id_cliente"],"referencedTable":"cliente","referencedColumns":["id_cliente"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|contrato|FK:fk_contrato_id_empresa|G8 (coordinar columnas compartidas)|FK_MISMATCH|null|{"columns":["id_empresa"],"referencedTable":"empresa","referencedColumns":["id_empresa"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|conversacion_bot|FK:fk_conversacion_bot_id_canal_wa|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"columns":["id_canal_wa"],"referencedTable":"canal_whatsapp","referencedColumns":["id_canal"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|conversacion_bot|FK:fk_conversacion_bot_id_cliente|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"columns":["id_cliente"],"referencedTable":"cliente","referencedColumns":["id_cliente"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|credenciales_tvip|FK:fk_credenciales_tvip_id_contrato|G8 (coordinar columnas compartidas)|FK_MISMATCH|null|{"columns":["id_contrato"],"referencedTable":"contrato","referencedColumns":["id_contrato"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|detalle_orden_ingreso|FK:fk_detalle_orden_ingreso_id_orden|G1|OWNER_EXTERNAL|null|{"columns":["id_orden"],"referencedTable":"orden_ingreso","referencedColumns":["id_orden"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|detalle_orden_ingreso|FK:fk_detalle_orden_ingreso_id_tipo_equipo|G1|OWNER_EXTERNAL|null|{"columns":["id_tipo_equipo"],"referencedTable":"tipo_equipo","referencedColumns":["id_tipo_equipo"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|donacion_detalle|FK:fk_donacion_detalle_donacion|G1|OWNER_EXTERNAL|null|{"columns":["id_donacion"],"referencedTable":"donacion","referencedColumns":["id_donacion"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|donacion_detalle|FK:fk_donacion_detalle_unidad|G1|OWNER_EXTERNAL|null|{"columns":["id_unidad"],"referencedTable":"unidad_equipo","referencedColumns":["id_unidad"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|evidencia_foto|FK:fk_evidencia_foto_id_ot|G8 (coordinar columnas compartidas)|FK_MISMATCH|null|{"columns":["id_ot"],"referencedTable":"orden_trabajo","referencedColumns":["id_ot"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|historial_conexion_ont|FK:historial_conexion_ont_id_registro_ont_fkey|G8 (coordinar columnas compartidas)|FK_MISMATCH|null|{"columns":["id_registro_ont"],"referencedTable":"registro_ont","referencedColumns":["id_registro_ont"],"onDelete":"SET NULL","onUpdate":"CASCADE"}|
|historial_conexion_ont|FK:fk_historial_conexion_ont_id_unidad|G8 (coordinar columnas compartidas)|FK_MISMATCH|null|{"columns":["id_unidad"],"referencedTable":"unidad_equipo","referencedColumns":["id_unidad"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|historial_estado_equipo|FK:fk_historial_estado_equipo_id_unidad|G1|FK_MISMATCH|null|{"columns":["id_unidad"],"referencedTable":"unidad_equipo","referencedColumns":["id_unidad"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|historial_estado_equipo|FK:fk_historial_estado_equipo_id_usuario|G1|FK_MISMATCH|null|{"columns":["id_usuario"],"referencedTable":"usuario","referencedColumns":["id_usuario"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|historial_ot|FK:fk_historial_ot_id_ot|G3/Ops|FK_MISMATCH|null|{"columns":["id_ot"],"referencedTable":"orden_trabajo","referencedColumns":["id_ot"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|historial_ot|FK:fk_historial_ot_id_usuario|G3/Ops|FK_MISMATCH|null|{"columns":["id_usuario"],"referencedTable":"usuario","referencedColumns":["id_usuario"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|solicitud_instalacion_integracion|FK:solicitud_instalacion_integracion_id_ot_fkey|G3|OWNER_EXTERNAL|null|{"columns":["id_ot"],"referencedTable":"orden_trabajo","referencedColumns":["id_ot"],"onDelete":"SET NULL","onUpdate":"CASCADE"}|
|intento_fallido|FK:fk_intento_fallido_id_empresa|G2|FK_MISMATCH|null|{"columns":["id_empresa"],"referencedTable":"empresa","referencedColumns":["id_empresa"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|lista_negra|FK:fk_lista_negra_id_cliente|G8 (coordinar columnas compartidas)|FK_MISMATCH|null|{"columns":["id_cliente"],"referencedTable":"cliente","referencedColumns":["id_cliente"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|lista_negra|FK:fk_lista_negra_id_usuario_registro|G8 (coordinar columnas compartidas)|FK_MISMATCH|null|{"columns":["id_usuario_registro"],"referencedTable":"usuario","referencedColumns":["id_usuario"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|llamada_cortes|FK:fk_llamada_cortes_id_ot|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"columns":["id_ot"],"referencedTable":"orden_trabajo","referencedColumns":["id_ot"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|log_notificacion|FK:log_notificacion_id_alerta_fkey|G8 (coordinar columnas compartidas)|FK_MISMATCH|null|{"columns":["id_alerta"],"referencedTable":"alerta_monitoreo","referencedColumns":["id_alerta"],"onDelete":"SET NULL","onUpdate":"CASCADE"}|
|log_notificacion|FK:fk_log_notificacion_id_cliente|G8 (coordinar columnas compartidas)|FK_MISMATCH|null|{"columns":["id_cliente"],"referencedTable":"cliente","referencedColumns":["id_cliente"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|log_notificacion|FK:fk_log_notificacion_id_plantilla|G8 (coordinar columnas compartidas)|FK_MISMATCH|null|{"columns":["id_plantilla"],"referencedTable":"plantilla_notificacion","referencedColumns":["id_plantilla"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|mensaje_bot|FK:fk_mensaje_bot_id_conversacion|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"columns":["id_conversacion"],"referencedTable":"conversacion_bot","referencedColumns":["id_conversacion"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|mensaje_whatsapp|FK:fk_mensaje_whatsapp_id_canal|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"columns":["id_canal"],"referencedTable":"canal_whatsapp","referencedColumns":["id_canal"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|mensaje_whatsapp|FK:fk_mensaje_whatsapp_id_cliente|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"columns":["id_cliente"],"referencedTable":"cliente","referencedColumns":["id_cliente"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|mensaje_whatsapp|FK:fk_mensaje_whatsapp_id_plantilla_wa|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"columns":["id_plantilla_wa"],"referencedTable":"plantilla_whatsapp","referencedColumns":["id_plantilla_wa"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|monitoreo_ont|FK:fk_monitoreo_ont_id_caja_nap|G3/Ops|FK_MISMATCH|null|{"columns":["id_caja_nap"],"referencedTable":"caja_nap","referencedColumns":["id_caja_nap"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|monitoreo_ont|FK:fk_monitoreo_ont_id_cliente|G3/Ops|FK_MISMATCH|null|{"columns":["id_cliente"],"referencedTable":"cliente","referencedColumns":["id_cliente"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|monitoreo_ont|FK:monitoreo_ont_id_registro_ont_fkey|G3/Ops|FK_MISMATCH|null|{"columns":["id_registro_ont"],"referencedTable":"registro_ont","referencedColumns":["id_registro_ont"],"onDelete":"SET NULL","onUpdate":"CASCADE"}|
|monitoreo_ont|FK:fk_monitoreo_ont_id_unidad|G3/Ops|FK_MISMATCH|null|{"columns":["id_unidad"],"referencedTable":"unidad_equipo","referencedColumns":["id_unidad"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|movimiento_inventario|FK:fk_movimiento_inventario_id_bodega_destino|G1|FK_MISMATCH|null|{"columns":["id_bodega_destino"],"referencedTable":"bodega","referencedColumns":["id_bodega"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|movimiento_inventario|FK:fk_movimiento_inventario_id_bodega_origen|G1|FK_MISMATCH|null|{"columns":["id_bodega_origen"],"referencedTable":"bodega","referencedColumns":["id_bodega"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|movimiento_inventario|FK:fk_movimiento_inventario_id_empresa_destino|G1|FK_MISMATCH|null|{"columns":["id_empresa_destino"],"referencedTable":"empresa","referencedColumns":["id_empresa"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|movimiento_inventario|FK:fk_movimiento_inventario_id_empresa_origen|G1|FK_MISMATCH|null|{"columns":["id_empresa_origen"],"referencedTable":"empresa","referencedColumns":["id_empresa"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|movimiento_inventario|FK:fk_movimiento_inventario_id_tipo_equipo|G1|FK_MISMATCH|null|{"columns":["id_tipo_equipo"],"referencedTable":"tipo_equipo","referencedColumns":["id_tipo_equipo"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|movimiento_inventario|FK:fk_movimiento_inventario_id_unidad|G1|FK_MISMATCH|null|{"columns":["id_unidad"],"referencedTable":"unidad_equipo","referencedColumns":["id_unidad"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|movimiento_inventario|FK:fk_movimiento_inventario_id_usuario|G1|FK_MISMATCH|null|{"columns":["id_usuario"],"referencedTable":"usuario","referencedColumns":["id_usuario"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|mufa|FK:fk_mufa_id_tarjeta_pon|G8 (coordinar columnas compartidas)|FK_MISMATCH|null|{"columns":["id_tarjeta_pon"],"referencedTable":"tarjeta_pon","referencedColumns":["id_tarjeta"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|olt|FK:fk_olt_id_empresa|G3/Ops|FK_MISMATCH|null|{"columns":["id_empresa"],"referencedTable":"empresa","referencedColumns":["id_empresa"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|orden_ingreso|FK:fk_orden_ingreso_id_bodega|G1|OWNER_EXTERNAL|null|{"columns":["id_bodega"],"referencedTable":"bodega","referencedColumns":["id_bodega"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|orden_ingreso|FK:fk_oi_bodega|G1|OWNER_EXTERNAL|null|{"columns":["id_bodega_destino"],"referencedTable":"bodega","referencedColumns":["id_bodega"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|orden_ingreso|FK:fk_orden_ingreso_id_empresa|G1|OWNER_EXTERNAL|null|{"columns":["id_empresa"],"referencedTable":"empresa","referencedColumns":["id_empresa"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|orden_ingreso|FK:fk_orden_ingreso_id_proveedor|G1|OWNER_EXTERNAL|null|{"columns":["id_proveedor"],"referencedTable":"proveedor","referencedColumns":["id_proveedor"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|orden_ingreso|FK:fk_orden_ingreso_id_usuario_registro|G1|OWNER_EXTERNAL|null|{"columns":["id_usuario_registro"],"referencedTable":"usuario","referencedColumns":["id_usuario"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|orden_ingreso_detalle|FK:fk_oid_orden|G1|OWNER_EXTERNAL|null|{"columns":["id_orden"],"referencedTable":"orden_ingreso","referencedColumns":["id_orden"],"onDelete":"CASCADE","onUpdate":"NO ACTION"}|
|orden_ingreso_detalle|FK:fk_oid_tipo_equipo|G1|OWNER_EXTERNAL|null|{"columns":["id_tipo_equipo"],"referencedTable":"tipo_equipo","referencedColumns":["id_tipo_equipo"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|orden_trabajo|FK:orden_trabajo_id_caja_nap_fkey|G3/Ops|FK_MISMATCH|null|{"columns":["id_caja_nap"],"referencedTable":"caja_nap","referencedColumns":["id_caja_nap"],"onDelete":"SET NULL","onUpdate":"CASCADE"}|
|orden_trabajo|FK:orden_trabajo_id_categoria_falla_fkey|G3/Ops|FK_MISMATCH|null|{"columns":["id_categoria_falla"],"referencedTable":"categoria_falla","referencedColumns":["id_categoria"],"onDelete":"SET NULL","onUpdate":"CASCADE"}|
|orden_trabajo|FK:fk_orden_trabajo_id_cliente|G3/Ops|FK_MISMATCH|null|{"columns":["id_cliente"],"referencedTable":"cliente","referencedColumns":["id_cliente"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|orden_trabajo|FK:fk_orden_trabajo_id_direccion|G3/Ops|FK_MISMATCH|null|{"columns":["id_direccion"],"referencedTable":"direccion_servicio","referencedColumns":["id_direccion"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|orden_trabajo|FK:fk_orden_trabajo_id_empresa|G3/Ops|FK_MISMATCH|null|{"columns":["id_empresa"],"referencedTable":"empresa","referencedColumns":["id_empresa"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|orden_trabajo|FK:fk_orden_trabajo_id_tecnico|G3/Ops|FK_MISMATCH|null|{"columns":["id_tecnico"],"referencedTable":"usuario","referencedColumns":["id_usuario"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|orden_trabajo|FK:fk_orden_trabajo_id_tecnico_externo|G3/Ops|FK_MISMATCH|null|{"columns":["id_tecnico_externo"],"referencedTable":"tecnico_externo","referencedColumns":["id_tecnico_ext"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|orden_trabajo|FK:fk_orden_trabajo_id_ticket|G3/Ops|FK_MISMATCH|null|{"columns":["id_ticket"],"referencedTable":"ticket","referencedColumns":["id_ticket"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|pago|FK:fk_pago_id_cliente|G8 (coordinar columnas compartidas)|FK_MISMATCH|null|{"columns":["id_cliente"],"referencedTable":"cliente","referencedColumns":["id_cliente"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|plantilla_whatsapp|FK:fk_plantilla_whatsapp_id_canal|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"columns":["id_canal"],"referencedTable":"canal_whatsapp","referencedColumns":["id_canal"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|prestamo_detalle|FK:fk_prestamo_detalle_prestamo|G1|OWNER_EXTERNAL|null|{"columns":["id_prestamo"],"referencedTable":"prestamo_externo","referencedColumns":["id_prestamo"],"onDelete":"CASCADE","onUpdate":"NO ACTION"}|
|prestamo_detalle|FK:fk_prestamo_detalle_unidad|G1|OWNER_EXTERNAL|null|{"columns":["id_unidad"],"referencedTable":"unidad_equipo","referencedColumns":["id_unidad"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|prestamo_externo|FK:fk_prestamo_externo_id_empresa_prestamista|G1|OWNER_EXTERNAL|null|{"columns":["id_empresa_prestamista"],"referencedTable":"empresa","referencedColumns":["id_empresa"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|prestamo_externo|FK:fk_prestamo_externo_id_unidad|G1|OWNER_EXTERNAL|null|{"columns":["id_unidad"],"referencedTable":"unidad_equipo","referencedColumns":["id_unidad"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|prestamo_retorno|FK:fk_prestamo_retorno_detalle|G1|OWNER_EXTERNAL|null|{"columns":["id_detalle"],"referencedTable":"prestamo_detalle","referencedColumns":["id_detalle"],"onDelete":"CASCADE","onUpdate":"NO ACTION"}|
|prospecto|FK:fk_prospecto_id_usuario_perdida|G8 (coordinar columnas compartidas)|FK_MISMATCH|null|{"columns":["id_usuario_perdida"],"referencedTable":"usuario","referencedColumns":["id_usuario"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|proveedor_tipo_equipo|FK:fk_pte_proveedor|G1|OWNER_EXTERNAL|null|{"columns":["id_proveedor"],"referencedTable":"proveedor","referencedColumns":["id_proveedor"],"onDelete":"CASCADE","onUpdate":"NO ACTION"}|
|proveedor_tipo_equipo|FK:fk_pte_tipo_equipo|G1|OWNER_EXTERNAL|null|{"columns":["id_tipo_equipo"],"referencedTable":"tipo_equipo","referencedColumns":["id_tipo_equipo"],"onDelete":"CASCADE","onUpdate":"NO ACTION"}|
|puerto_nap|FK:fk_puerto_nap_id_caja_nap|G3/Ops|FK_MISMATCH|null|{"columns":["id_caja_nap"],"referencedTable":"caja_nap","referencedColumns":["id_caja_nap"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|puerto_nap|FK:fk_puerto_nap_id_cliente_asociado|G3/Ops|FK_MISMATCH|null|{"columns":["id_cliente_asociado"],"referencedTable":"cliente","referencedColumns":["id_cliente"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|punto_cobertura|FK:fk_punto_cobertura_id_empresa|G8 (coordinar columnas compartidas)|OWNER_EXTERNAL|null|{"columns":["id_empresa"],"referencedTable":"empresa","referencedColumns":["id_empresa"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|registro_ont|FK:registro_ont_caja_confirmada_por_fkey|G3/Ops|OWNER_EXTERNAL|null|{"columns":["caja_confirmada_por"],"referencedTable":"usuario","referencedColumns":["id_usuario"],"onDelete":"SET NULL","onUpdate":"CASCADE"}|
|registro_ont|FK:registro_ont_id_empresa_fkey|G3/Ops|OWNER_EXTERNAL|null|{"columns":["id_empresa"],"referencedTable":"empresa","referencedColumns":["id_empresa"],"onDelete":"SET NULL","onUpdate":"CASCADE"}|
|salida_detalle|FK:fk_salida_detalle_salida|G1|OWNER_EXTERNAL|null|{"columns":["id_salida"],"referencedTable":"salida_bodega","referencedColumns":["id_salida"],"onDelete":"CASCADE","onUpdate":"NO ACTION"}|
|sesion_portal|FK:fk_sesion_portal_id_cliente|G2|OWNER_EXTERNAL|null|{"columns":["id_cliente"],"referencedTable":"cliente","referencedColumns":["id_cliente"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|solicitud_baja|FK:fk_solicitud_baja_unidad|G1|OWNER_EXTERNAL|null|{"columns":["id_unidad"],"referencedTable":"unidad_equipo","referencedColumns":["id_unidad"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|solicitud_contrasena_wifi|FK:fk_solicitud_contrasena_wifi_id_cliente|G2|OWNER_EXTERNAL|null|{"columns":["id_cliente"],"referencedTable":"cliente","referencedColumns":["id_cliente"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|solicitud_contrasena_wifi|FK:fk_solicitud_contrasena_wifi_id_contrato|G2|OWNER_EXTERNAL|null|{"columns":["id_contrato"],"referencedTable":"contrato","referencedColumns":["id_contrato"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|stock_consumible|FK:fk_stock_consumible_id_bodega|G1|FK_MISMATCH|null|{"columns":["id_bodega"],"referencedTable":"bodega","referencedColumns":["id_bodega"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|stock_consumible|FK:fk_stock_consumible_id_tipo_equipo|G1|FK_MISMATCH|null|{"columns":["id_tipo_equipo"],"referencedTable":"tipo_equipo","referencedColumns":["id_tipo_equipo"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|tarjeta_pon|FK:fk_tarjeta_pon_id_olt|G8 (coordinar columnas compartidas)|FK_MISMATCH|null|{"columns":["id_olt"],"referencedTable":"olt","referencedColumns":["id_olt"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|ticket|FK:fk_ticket_id_categoria|G8 (coordinar columnas compartidas)|FK_MISMATCH|null|{"columns":["id_categoria"],"referencedTable":"categoria_falla","referencedColumns":["id_categoria"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|ticket|FK:fk_ticket_id_cliente|G8 (coordinar columnas compartidas)|FK_MISMATCH|null|{"columns":["id_cliente"],"referencedTable":"cliente","referencedColumns":["id_cliente"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|ticket|FK:fk_ticket_id_conversacion_bot|G8 (coordinar columnas compartidas)|FK_MISMATCH|null|{"columns":["id_conversacion_bot"],"referencedTable":"conversacion_bot","referencedColumns":["id_conversacion"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|ticket|FK:fk_ticket_id_empresa|G8 (coordinar columnas compartidas)|FK_MISMATCH|null|{"columns":["id_empresa"],"referencedTable":"empresa","referencedColumns":["id_empresa"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|ticket|FK:fk_ticket_id_usuario_asignado|G8 (coordinar columnas compartidas)|FK_MISMATCH|null|{"columns":["id_usuario_asignado"],"referencedTable":"usuario","referencedColumns":["id_usuario"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|tipo_equipo|FK:fk_tipo_equipo_id_empresa|G1|FK_MISMATCH|null|{"columns":["id_empresa"],"referencedTable":"empresa","referencedColumns":["id_empresa"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|transferencia_equipo|FK:fk_transferencia_equipo_id_empresa_destino|G1|FK_MISMATCH|null|{"columns":["id_empresa_destino"],"referencedTable":"empresa","referencedColumns":["id_empresa"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|transferencia_equipo|FK:fk_transferencia_equipo_id_empresa_origen|G1|FK_MISMATCH|null|{"columns":["id_empresa_origen"],"referencedTable":"empresa","referencedColumns":["id_empresa"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|transferencia_equipo|FK:fk_transferencia_equipo_id_usuario_registro|G1|FK_MISMATCH|null|{"columns":["id_usuario_registro"],"referencedTable":"usuario","referencedColumns":["id_usuario"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|unidad_equipo|FK:fk_unidad_equipo_id_bodega_actual|G1|FK_MISMATCH|null|{"columns":["id_bodega_actual"],"referencedTable":"bodega","referencedColumns":["id_bodega"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|unidad_equipo|FK:fk_unidad_equipo_id_caja_nap|G1|FK_MISMATCH|null|{"columns":["id_caja_nap"],"referencedTable":"caja_nap","referencedColumns":["id_caja_nap"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|unidad_equipo|FK:fk_unidad_equipo_id_cliente_instalado|G1|FK_MISMATCH|null|{"columns":["id_cliente_instalado"],"referencedTable":"cliente","referencedColumns":["id_cliente"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|unidad_equipo|FK:fk_unidad_equipo_id_empresa|G1|FK_MISMATCH|null|{"columns":["id_empresa"],"referencedTable":"empresa","referencedColumns":["id_empresa"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|unidad_equipo|FK:fk_unidad_equipo_id_tipo_equipo|G1|FK_MISMATCH|null|{"columns":["id_tipo_equipo"],"referencedTable":"tipo_equipo","referencedColumns":["id_tipo_equipo"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|uso_material_ot|FK:fk_uso_material_ot_id_ot|G3/Ops|FK_MISMATCH|null|{"columns":["id_ot"],"referencedTable":"orden_trabajo","referencedColumns":["id_ot"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|uso_material_ot|FK:fk_uso_material_ot_id_tipo_equipo|G3/Ops|FK_MISMATCH|null|{"columns":["id_tipo_equipo"],"referencedTable":"tipo_equipo","referencedColumns":["id_tipo_equipo"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
|uso_material_ot|FK:fk_uso_material_ot_id_unidad|G3/Ops|FK_MISMATCH|null|{"columns":["id_unidad"],"referencedTable":"unidad_equipo","referencedColumns":["id_unidad"],"onDelete":"NO ACTION","onUpdate":"NO ACTION"}|
