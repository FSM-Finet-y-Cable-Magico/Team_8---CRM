-- Backfill historico opcional. No forma parte del bootstrap de esquema limpio.
UPDATE cliente
SET origen_contacto = COALESCE(origen_contacto, 'Dato historico')
WHERE origen_contacto IS NULL;

UPDATE prospecto
SET origen_contacto = COALESCE(origen_contacto, 'Dato historico')
WHERE origen_contacto IS NULL;

INSERT INTO servicio_contratado (
  id_cliente,
  id_empresa,
  id_contrato,
  id_direccion,
  tipo_servicio,
  estado_operativo,
  observaciones,
  datos_tecnicos
)
SELECT
  customer.id_cliente,
  contract.id_empresa,
  contract.id_contrato,
  service_address.id_direccion,
  CASE
    WHEN lower(plan.tipo_plan) LIKE '%tv%' THEN 'Internet + Television'
    ELSE 'Internet'
  END,
  CASE
    WHEN customer.estado IN ('Suspendido', 'Baja') THEN customer.estado
    WHEN contract.estado IN ('Activo', 'Suspendido', 'Baja') THEN contract.estado
    ELSE 'Pendiente Instalacion'
  END,
  'Servicio generado desde contrato existente para habilitar perfil individual',
  jsonb_build_object(
    'plan', plan.nombre_comercial,
    'velocidadMbps', plan.velocidad_mbps,
    'origen', COALESCE(customer.origen_contacto, 'Dato historico')
  )
FROM contrato contract
JOIN cliente customer ON customer.id_cliente = contract.id_cliente
LEFT JOIN plan ON plan.id_plan = contract.id_plan
LEFT JOIN LATERAL (
  SELECT address.id_direccion
  FROM direccion_servicio address
  WHERE address.id_cliente = customer.id_cliente
  ORDER BY address.es_principal DESC NULLS LAST, address.id_direccion DESC
  LIMIT 1
) service_address ON TRUE
WHERE contract.id_cliente IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM servicio_contratado existing_service
    WHERE existing_service.id_contrato = contract.id_contrato
  );

UPDATE unidad_equipo equipment
SET id_servicio = (
  SELECT service.id_servicio
  FROM servicio_contratado service
  WHERE service.id_cliente = equipment.id_cliente_instalado
    AND (service.id_empresa = equipment.id_empresa OR service.id_empresa IS NULL OR equipment.id_empresa IS NULL)
  ORDER BY service.id_servicio DESC
  LIMIT 1
)
WHERE equipment.id_servicio IS NULL
  AND equipment.id_cliente_instalado IS NOT NULL;

UPDATE ticket support_ticket
SET id_servicio = (
  SELECT service.id_servicio
  FROM servicio_contratado service
  WHERE service.id_cliente = support_ticket.id_cliente
    AND (service.id_empresa = support_ticket.id_empresa OR service.id_empresa IS NULL OR support_ticket.id_empresa IS NULL)
  ORDER BY service.id_servicio DESC
  LIMIT 1
)
WHERE support_ticket.id_servicio IS NULL
  AND support_ticket.id_cliente IS NOT NULL;

UPDATE orden_trabajo work_order
SET id_servicio = (
  SELECT service.id_servicio
  FROM servicio_contratado service
  WHERE service.id_cliente = work_order.id_cliente
    AND (service.id_empresa = work_order.id_empresa OR service.id_empresa IS NULL OR work_order.id_empresa IS NULL)
  ORDER BY service.id_servicio DESC
  LIMIT 1
)
WHERE work_order.id_servicio IS NULL
  AND work_order.id_cliente IS NOT NULL;
