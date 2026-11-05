-- Datos demo opcionales para zonas, solicitudes y observaciones.
INSERT INTO zona_pago (id_empresa, nombre_zona, comuna, descripcion, dia_vencimiento_sugerido, activo)
SELECT e.id_empresa, 'Zona centro', 'Comuna centro', 'Zona comercial de referencia para pruebas locales', 5, TRUE
FROM empresa e
WHERE NOT EXISTS (
  SELECT 1 FROM zona_pago z WHERE z.id_empresa = e.id_empresa AND LOWER(z.nombre_zona) = 'zona centro'
);

INSERT INTO plan_zona_precio (id_plan, id_zona_pago, precio_mensual, valor_instalacion, activo)
SELECT p.id_plan, z.id_zona_pago, p.precio_mensual, 0, TRUE
FROM plan p
JOIN zona_pago z ON z.id_empresa = p.id_empresa
WHERE z.nombre_zona = 'Zona centro'
  AND NOT EXISTS (
    SELECT 1 FROM plan_zona_precio rule
    WHERE rule.id_plan = p.id_plan AND rule.id_zona_pago = z.id_zona_pago AND rule.activo = TRUE
  );

UPDATE contrato c
SET id_zona_pago = z.id_zona_pago
FROM zona_pago z
WHERE c.id_zona_pago IS NULL
  AND c.id_empresa = z.id_empresa
  AND z.nombre_zona = 'Zona centro';

UPDATE servicio_contratado s
SET id_zona_pago = c.id_zona_pago
FROM contrato c
WHERE s.id_zona_pago IS NULL
  AND s.id_contrato = c.id_contrato
  AND c.id_zona_pago IS NOT NULL;

UPDATE unidad_equipo
SET modalidad_asignacion = 'Propiedad empresa'
WHERE modalidad_asignacion IS NULL
  AND estado = 'Instalado';

INSERT INTO solicitud_cliente (
  id_cliente,
  id_servicio,
  id_empresa,
  tipo_solicitud,
  canal_origen,
  estado,
  factible,
  descripcion,
  observaciones,
  fecha_creacion
)
SELECT c.id_cliente, s.id_servicio, COALESCE(s.id_empresa, c.id_empresa), 'Cambio de plan', 'CRM', 'Abierta', TRUE,
       'Solicitud demo para seguimiento comercial consolidado.',
       'Registro inicial generado por seed local RF-69.',
       NOW()
FROM cliente c
JOIN servicio_contratado s ON s.id_cliente = c.id_cliente
WHERE NOT EXISTS (
  SELECT 1 FROM solicitud_cliente sc
  WHERE sc.id_cliente = c.id_cliente AND sc.tipo_solicitud = 'Cambio de plan' AND sc.descripcion LIKE 'Solicitud demo%'
)
LIMIT 1;

INSERT INTO observacion_operativa (
  tipo_entidad,
  id_entidad,
  id_cliente,
  id_empresa,
  observacion,
  visibilidad,
  fecha_creacion
)
SELECT 'Cliente', c.id_cliente, c.id_cliente, c.id_empresa,
       'Observacion contextual demo para validar historial operativo.',
       'Interna',
       NOW()
FROM cliente c
WHERE NOT EXISTS (
  SELECT 1 FROM observacion_operativa o
  WHERE o.tipo_entidad = 'Cliente'
    AND o.id_entidad = c.id_cliente
    AND o.observacion LIKE 'Observacion contextual demo%'
)
LIMIT 1;
