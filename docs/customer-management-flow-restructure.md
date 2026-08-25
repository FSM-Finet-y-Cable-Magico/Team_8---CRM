# Reorganización de Gestión de Clientes

## Problema anterior

El modal `Gestionar cliente` mostraba al mismo tiempo dos representaciones de servicios, contratos, formularios técnicos, asociación de equipos, monitoreo, TV IP e historial. Esto duplicaba información y permitía intentar acciones sin el contexto de una contratación o servicio concreto.

## Estructura actual

El modal principal conserva el resumen del cliente y una única lista `Contratos y servicios`. Cada fila representa una contratación y muestra plan, empresa, estado de contrato, estado de servicio, dirección y la acción `Gestionar`.

La acción abre un modal secundario con tres etapas:

1. **Contrato y plan**: muestra datos reales del plan y permite confirmar manualmente la firma o abrir el cambio de plan contextual.
2. **Servicio e instalación**: se habilita solo para contratos firmados. Permite crear un servicio pendiente de instalación y luego generar su OT.
3. **Operación técnica**: se habilita solo cuando existe servicio y organiza resumen, datos técnicos, equipos, tickets/OT e historial en tabs.

## Reglas de negocio

- Un contrato puede existir sin servicio.
- `Confirmar firma de contrato` es una corroboración manual. No emite ni descarga contratos y no consume Facturación.cl.
- Un servicio requiere contrato firmado. Su estado inicial desde este flujo es `Pendiente Instalacion`.
- Una OT de instalación mantiene el servicio pendiente/programado y el cierre técnico continúa en Órdenes de Trabajo.
- `Añadir plan` crea un nuevo contrato `Pendiente firma contrato`; no crea servicio ni OT.
- Si un cliente ya tiene un servicio activo, añadir una contratación pendiente no cambia su estado global `Activo`.
- Si solo hay contrato firmado sin servicio, el cliente queda `Pendiente Instalacion`; si solo hay contratación pendiente, queda `Pendiente firma contrato`.
- La dirección se toma primero del servicio y, si no existe, de la dirección principal o técnica del cliente.

## Endpoints reutilizados y extendidos

- `GET /api/customers`
- `GET /api/services/customer/:idCliente`
- `POST /api/services`
- `PATCH /api/services/:id`
- `POST /api/services/:id/equipment`
- `POST /api/services/:id/install-order`
- `POST /api/contracts` (nueva contratación de cliente)
- `PATCH /api/contracts/:id/confirm-signature` (firma manual)
- `POST /api/contracts/:id/change-plan`

## Cambios de datos

`Contrato` incorpora de forma aditiva `fechaFirmaManual`, `idUsuarioFirmaManual` y `observacionFirmaManual`. El script incremental es `db/init/11_customer_contract_workflow.sql`.

## UI oculta temporalmente

Se retiran del modal principal el acordeón `Conectividad y TV IP`, el monitoreo y el acordeón general de estado/historial. No se elimina backend, tablas ni endpoints preparados para Smart OLT o TV IP.

**Smart OLT:** el monitoreo se oculta hasta disponer de una integración real; no se reemplaza con datos demo.

**Facturación.cl:** la firma y el contrato se corroboran manualmente hasta que exista integración real. Esta fase no genera contratos PDF propios ni llama a una API externa.

## Cobertura y pendientes

Las pruebas de contratos cubren creación sin servicio/OT, firma manual y preservación del estado activo ante una contratación adicional. Las pruebas de servicios cubren el bloqueo de creación antes de la firma y conservan la generación de OT desde servicios pendientes.

Pendientes de una fase posterior: integración real de Facturación.cl, firma electrónica, Smart OLT, TV IP contextual por servicio y reglas comerciales adicionales para cambios de plan entre empresas.
