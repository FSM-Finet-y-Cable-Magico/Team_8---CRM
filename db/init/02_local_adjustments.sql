ALTER TABLE usuario
  ADD COLUMN IF NOT EXISTS es_password_temporal BOOLEAN DEFAULT TRUE;

ALTER TABLE usuario
  ADD COLUMN IF NOT EXISTS intentos_fallidos INTEGER DEFAULT 0;

ALTER TABLE cliente
  ADD COLUMN IF NOT EXISTS obs_conflictivo TEXT;

ALTER TABLE cliente
  ADD COLUMN IF NOT EXISTS importado_masivo BOOLEAN DEFAULT FALSE;

ALTER TABLE cliente
  ADD COLUMN IF NOT EXISTS origen_contacto VARCHAR(40);

ALTER TABLE cliente
  ADD COLUMN IF NOT EXISTS datos_tecnicos JSONB;

ALTER TABLE prospecto
  ADD COLUMN IF NOT EXISTS origen_contacto VARCHAR(40);

CREATE TABLE IF NOT EXISTS servicio_contratado (
    id_servicio                    SERIAL         PRIMARY KEY,
    id_cliente                     INTEGER        NOT NULL,
    id_empresa                     INTEGER,
    id_contrato                    INTEGER,
    id_direccion                   INTEGER,
    tipo_servicio                  VARCHAR(40)    NOT NULL,
    estado_operativo               VARCHAR(30)    NOT NULL,
    observaciones                  TEXT,
    datos_tecnicos                 JSONB,
    fecha_creacion                 TIMESTAMP      DEFAULT NOW()
);

ALTER TABLE ticket
  ADD COLUMN IF NOT EXISTS id_servicio INTEGER;

ALTER TABLE unidad_equipo
  ADD COLUMN IF NOT EXISTS id_servicio INTEGER;

ALTER TABLE orden_trabajo
  ADD COLUMN IF NOT EXISTS id_servicio INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_servicio_contratado_id_cliente') THEN
    ALTER TABLE servicio_contratado
      ADD CONSTRAINT fk_servicio_contratado_id_cliente FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_servicio_contratado_id_empresa') THEN
    ALTER TABLE servicio_contratado
      ADD CONSTRAINT fk_servicio_contratado_id_empresa FOREIGN KEY (id_empresa) REFERENCES empresa(id_empresa);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_servicio_contratado_id_contrato') THEN
    ALTER TABLE servicio_contratado
      ADD CONSTRAINT fk_servicio_contratado_id_contrato FOREIGN KEY (id_contrato) REFERENCES contrato(id_contrato);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_servicio_contratado_id_direccion') THEN
    ALTER TABLE servicio_contratado
      ADD CONSTRAINT fk_servicio_contratado_id_direccion FOREIGN KEY (id_direccion) REFERENCES direccion_servicio(id_direccion);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ticket_id_servicio') THEN
    ALTER TABLE ticket
      ADD CONSTRAINT fk_ticket_id_servicio FOREIGN KEY (id_servicio) REFERENCES servicio_contratado(id_servicio);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_unidad_equipo_id_servicio') THEN
    ALTER TABLE unidad_equipo
      ADD CONSTRAINT fk_unidad_equipo_id_servicio FOREIGN KEY (id_servicio) REFERENCES servicio_contratado(id_servicio);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_orden_trabajo_id_servicio') THEN
    ALTER TABLE orden_trabajo
      ADD CONSTRAINT fk_orden_trabajo_id_servicio FOREIGN KEY (id_servicio) REFERENCES servicio_contratado(id_servicio);
  END IF;
END $$;

-- Una misma cuenta de cliente puede originarse en procesos comerciales de
-- FiNet y Cable Magico. Cada prospecto conserva su empresa y comparte cliente.
ALTER TABLE prospecto
  DROP CONSTRAINT IF EXISTS prospecto_id_cliente_key;

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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'usuario_rol_id_usuario_id_rol_key'
  ) THEN
    ALTER TABLE usuario_rol
      ADD CONSTRAINT usuario_rol_id_usuario_id_rol_key UNIQUE (id_usuario, id_rol);
  END IF;
END $$;
