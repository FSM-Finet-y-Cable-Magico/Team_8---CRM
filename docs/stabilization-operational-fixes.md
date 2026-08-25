# Estabilizacion operativa previa a Fase Comercial 2

## 1. Objetivo

Sincronizar la experiencia de gestion operativa entre Clientes, Servicios contratados, Ordenes de Trabajo, Prospectos, Planes, Cobranza e Inventario antes de incorporar mensajes comerciales avanzados.

Esta fase no implementa WhatsApp Business API, Facturacion.cl, BeneficioComercial, CargoAdicional, DocumentoTributario ni GarantiaCliente.

## 2. Diagnostico de endpoints y datos

### Clientes y servicios

Endpoints usados por `CustomersPanel`:

| Area | Endpoint | Uso |
| --- | --- | --- |
| Clientes | `GET /api/customers` | Listado base de clientes del CRM. |
| Clientes | `GET /api/customers/search` | Busqueda por RUT, nombre, telefono o contrato. |
| Clientes | `GET /api/customers/:id/history` | Historial operativo, contratos, tickets, ordenes, equipos y observaciones. |
| Clientes | `PATCH /api/customers/:id/status` | Cambio de estado operativo del cliente. |
| Clientes | `PATCH /api/customers/:id/technical-data` | Datos tecnicos generales del cliente. |
| Servicios | `GET /api/services/customer/:idCliente` | Servicios del cliente con contrato, plan, direccion, equipos, tickets, ordenes y solicitudes. |
| Servicios | `PATCH /api/services/:id` | Actualizacion de perfil operativo/tecnico del servicio. |
| Servicios | `POST /api/services` | Alta manual de servicio adicional. |
| Servicios | `POST /api/services/:id/equipment` | Asociacion de equipo instalado a servicio. |
| Servicios | `GET /api/services/:id/install-availability` | Disponibilidad tecnica para instalacion. |
| Servicios | `POST /api/services/:id/install-order` | Generacion de orden de instalacion desde servicio pendiente. |
| Contratos | `POST /api/contracts/:id/change-plan` | Cambio de plan asociado al contrato/servicio. |
| Contratos | `POST /api/contracts/:id/digital-contract` | Generacion de contrato digital. |
| Contratos | `GET /api/contracts/:id/digital-contract/download` | Descarga del ultimo contrato digital. |

Causa detectada: `ServicesService` resolvia direccion alternativa para crear la OT de instalacion, pero el listado/detalle de servicios devolvia `direccion: null` cuando el servicio no tenia `idDireccion`. La UI quedaba obligada a mostrar `Por confirmar` o datos parciales aun cuando existia una direccion principal del cliente.

Solucion aplicada: `ServicesService` ahora resuelve la direccion de servicio antes de devolver `listByCustomer`, `detail`, `create`, `update` y la respuesta de `createInstallOrder`.

### Ordenes de trabajo

Endpoints revisados:

| Endpoint | Uso |
| --- | --- |
| `GET /api/work-orders` | Listado de OT con codigo OT, cliente/prospecto y ticket asociado cuando corresponde. |
| `PATCH /api/work-orders/:id/complete-installation` | Cierre tecnico de instalacion y activacion del servicio/cliente/contrato. |
| `PATCH /api/work-orders/:id/complete-repair` | Cierre de reparacion/soporte y resolucion de ticket asociado. |

Decision aplicada: al generar OT desde servicio, el servicio permanece como `Pendiente Instalacion` hasta el cierre tecnico. La agenda y el estado de la visita quedan representados por la OT pendiente, evitando duplicar estados en servicio y orden.

### Prospectos

Endpoints revisados:

| Endpoint | Uso |
| --- | --- |
| `POST /api/prospects` | Registro de prospecto. |
| `PATCH /api/prospects/:id/pipeline` | Avance del pipeline. |
| `POST /api/prospects/:id/feasibility` | Factibilidad tecnica. |
| `POST /api/prospects/:id/quotes` | Cotizacion. |
| `POST /api/prospects/:id/contracts` | Contratacion/conversion. |
| `POST /api/prospects/:id/install-orders` | Generacion de OT desde prospecto. |

No se modifico el flujo de prospectos. La regla queda: Prospectos maneja preventa; despues de convertir, la gestion operativa debe continuar en Cliente/Servicio.

### Planes

Endpoints revisados:

| Endpoint | Uso |
| --- | --- |
| `GET /api/plans` | Catalogo de planes. |
| `POST /api/plans` | Creacion de plan. |
| `PATCH /api/plans/:id` | Edicion de plan. |
| `PATCH /api/plans/:id/activate` | Activacion. |
| `PATCH /api/plans/:id/deactivate` | Desactivacion. |

No se detecto necesidad de cambiar `PlansPanel` en esta fase. El cambio de plan operativo vive en `POST /api/contracts/:id/change-plan`, actualiza el contrato y mezcla datos comerciales del plan en los servicios asociados.

### Cobranza y Libro Control Comercial

Endpoints revisados:

| Endpoint | Uso |
| --- | --- |
| `GET /api/billing/overview` | Morosidad, facturas vencidas, cortes y notificaciones. |
| `POST /api/billing/payments` | Registro tradicional de pago. |
| `PATCH /api/billing/contracts/:id/suspend` | Suspension por deuda. |
| `GET /api/commercial-control` | Libro Control Comercial calculado. |
| `POST /api/commercial-control/events` | Eventos comerciales historicos. |

No se modifico `BillingPanel` ni `CommercialControlPanel`. La vista actual ya mantiene el Libro Control como seccion aislada, por lo que un fallo de esa seccion no debe romper el resto de Cobranza.

### Inventario

Endpoints revisados:

| Endpoint | Uso |
| --- | --- |
| `GET /api/inventory` | Inventario base. |
| `GET /api/inventory/advanced` | Inventario avanzado. |
| `POST /api/inventory/equipment` | Alta de equipo. |
| `PATCH /api/inventory/equipment/:id/status` | Cambio de estado. |
| `POST /api/inventory/equipment/:id/install` | Instalacion/asociacion a cliente/servicio. |
| `POST /api/services/:id/equipment` | Asociacion rapida desde cliente/servicio. |

No se modifico inventario en esta fase. La consistencia hacia Clientes se apoya en que `GET /api/services/customer/:idCliente` devuelve `equipos` por servicio y se recarga despues de asociar equipo.

## 3. Cambios aplicados

### Backend

- `backend/src/services/services.service.ts`
  - Se agrego resolucion de direccion antes de devolver servicios.
  - `listByCustomer` ahora devuelve servicios con direccion resuelta cuando existe direccion principal del cliente.
  - `detail`, `create`, `update` y `createInstallOrder` devuelven el mismo criterio de direccion.
  - La OT de instalacion desde servicio ya no cambia el servicio a `Instalacion Programada`; mantiene `Pendiente Instalacion` hasta el cierre tecnico.

### Frontend

- `frontend/src/features/customers/CustomersPanel.tsx`
  - Se agrego `serviceAddressLabel` para no mostrar `Por confirmar` si existe direccion real.
  - La seleccion de servicio se mantiene por `idServicio` y ahora valida que el ID preferido exista despues de recargar.
  - La tabla superior de servicios usa la direccion resuelta.
  - El detalle de servicio queda concentrado en el flujo principal por servicio.
  - Se retiro la segunda tabla/perfil duplicado del acordeon inferior.
  - El acordeon inferior queda enfocado en mantenimiento: registrar servicio adicional, actualizar perfil tecnico y asociar equipo.

### Tests

- `backend/src/services/services.service.spec.ts`
  - Se ajusto la expectativa de estado al generar OT desde servicio pendiente.
  - Se agrego prueba de regresion para direccion resuelta en `listByCustomer`.

## 4. Pendientes y riesgos restantes

- `CustomersService.history` aun devuelve un historial agregado separado de la vista principal de servicios; no se modifico para evitar ampliar el alcance.
- `OrdenTrabajo` no tiene relacion Prisma directa con `Usuario`/`Ticket`; algunas vistas de servicio pueden mostrar tecnico por ID si la OT viene desde la relacion del servicio.
- La asignacion de direccion al crear servicio adicional sigue siendo implicita por direccion principal del cliente. Si se requiere elegir direccion especifica por servicio, debe agregarse selector y `idDireccion` en una fase dedicada.
- El archivo `CustomersPanel.tsx` mantiene textos con encoding mixto heredado en algunas zonas no tocadas por esta fase.
- No se ejecuto rediseño global de Cobranza, Planes ni Inventario; solo se reviso la comunicacion y se corrigieron inconsistencias concretas.

## 5. Pruebas recomendadas en navegador

1. Abrir Clientes.
2. Gestionar un cliente con servicios.
3. Confirmar que la tabla superior muestra una direccion real si existe direccion principal.
4. Seleccionar varios servicios y revisar que el detalle cambia por `idServicio`.
5. Confirmar que no aparece una segunda tabla/perfil duplicado en el acordeon de mantenimiento.
6. Generar OT de instalacion desde servicio pendiente con datos demo seguros.
7. Confirmar que la OT aparece en Ordenes de Trabajo.
8. Cerrar la OT y volver a Clientes.
9. Confirmar que el servicio queda activo si corresponde.
10. Registrar pago tradicional y suspension desde Cobranza.
11. Asociar equipo a servicio y confirmar que aparece en el detalle del servicio.

## 6. Recomendacion antes de Fase Comercial 2

Avanzar a Fase Comercial 2 solo despues de validar manualmente Clientes, Servicios, Ordenes de Trabajo y Cobranza con datos demo. La prioridad inmediata debe ser asegurar que el Libro Control Comercial lea estados consistentes despues de pagos, suspensiones y cierres tecnicos.
