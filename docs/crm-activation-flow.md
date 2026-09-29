# Flujo de activacion CRM

## Problema anterior

La contratacion desde Prospectos creaba de inmediato un Cliente, una DireccionServicio y posteriormente un ServicioContratado al confirmar firma. Esto confundia contrato firmado con cliente activo y ocultaba al Prospecto antes de firmar.

## Modelo aplicado

Prospecto -> contrato pendiente de firma -> contrato firmado / Pendiente de activacion -> OT de instalacion -> instalacion completada -> Cliente activo.

Contrato conserva idCliente opcional para historicos. Los nuevos contratos creados desde Prospectos usan idProspecto y guardan una fotografia de direccion, comuna y ciudad. La firma habilita la agenda, pero Cliente, DireccionServicio y ServicioContratado se crean unicamente al completar la OT.

## Estados

- Prospecto activo: no esta perdido, no tiene Cliente historico asociado y no posee contrato firmado.
- Pendiente firma: contrato creado y Prospecto visible.
- Pendiente de activacion: contrato firmado y Prospecto sin Cliente asociado.
- Cliente activo: Cliente con al menos un ServicioContratado Activo.

## Backend y frontend

POST /api/prospects/:id/contracts registra el contrato pendiente.
PATCH /api/contracts/:id/confirm-signature firma sin crear servicio.
GET /api/prospects/pending-activation expone la proyeccion.
GET /api/companies/summary incorpora pendientesActivacion.

El modal de Prospectos mantiene la persona visible hasta la firma. Dashboard separa Prospectos activos, Pendientes de activacion y Clientes activos.

## Gestion de clientes

CustomersPanel diferencia Pendientes de activación y Clientes activos. Pendiente de activación es la proyección de un Prospecto con Contrato firmado y sin Cliente asociado. Puede tener una OT local de instalación asociada directamente por idProspecto. La sección consume GET /api/prospects/pending-activation y muestra persona, contrato, plan y fotografía de dirección prevista.

## Compatibilidad y cierre local

No se migran ni desvinculan Clientes, contratos, servicios u OTs existentes. prepare-installation se conserva para contratos historicos con Cliente. Al completar una OT asociada al prospecto se crean atomicamente Cliente, DireccionServicio y ServicioContratado, se activan contrato y servicio, y se registra la conversion del prospecto.

## Migracion

Se crearon backend/prisma/migrations/20260912150000_crm_activation_flow/migration.sql y backend/prisma/migrations/20260916120000_installation_prospect_flow/migration.sql.

Aplicar posteriormente solo en un entorno aprobado:

npx prisma migrate deploy --schema backend/prisma/schema.prisma

No ejecutar contra Railway compartido sin aprobacion.
