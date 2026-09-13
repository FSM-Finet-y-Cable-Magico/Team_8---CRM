# Reestructuracion de gestion de clientes, contratacion e instalacion

## Objetivo

Separar el ciclo comercial y operativo para que una contratacion no solicite datos tecnicos antes de que exista una instalacion real. El flujo queda organizado como:

`Cliente -> contrato y plan -> firma confirmada -> instalacion programada -> cierre tecnico de OT -> servicio activo`.

La gestion posterior de un servicio activo se realiza en un modal distinto y no dentro del wizard de contratacion.

## Arquitectura revisada

- `Plan` define el producto comercial, empresa, velocidad, precio y tipo de plan.
- `Contrato` representa la relacion comercial entre cliente y plan.
- `ServicioContratado` representa la instancia que se instalara o ya opera para ese cliente.
- `OrdenTrabajo` representa la visita de instalacion y queda asociada a cliente, contrato, servicio y plan.
- `UnidadEquipo` representa el equipo fisico que se instala al cerrar una OT.
- `AuditService` conserva trazabilidad de las transiciones relevantes.

Se mantienen los filtros de empresa, permisos existentes y relaciones historicas. No se creo una migracion ni se duplicaron entidades: se reutilizaron los modelos actuales.

## Flujo implementado

### 1. Contrato y plan

El wizard de contratacion solo tiene dos etapas: `Contrato y plan` e `Instalacion`. La primera presenta plan, empresa, velocidad, precio, fecha, direccion y estado como informacion de solo lectura estructurada.

La firma manual se confirma desde esta etapa. La confirmacion crea o reutiliza un `ServicioContratado` en estado `Pendiente Instalacion`, derivando automaticamente `tipoServicio` desde `Plan.tipoPlan`. No se solicita al usuario volver a escoger Internet, Television o Internet + Television.

### 2. Instalacion

La segunda etapa se limita a programar la OT de instalacion. Cliente, contrato, plan, tipo de servicio, direccion y zona se resuelven desde las relaciones existentes. La OT mantiene el servicio en `Pendiente Instalacion` hasta que se complete tecnicamente.

Al crear la OT se refrescan los datos, se muestra una confirmacion temporal y se cierra el modal de contratacion. Si existe una OT de instalacion abierta, se muestra su codigo, estado, visita y tecnico, evitando crear una duplicada.

### 3. Cierre tecnico de la OT

El tecnico registra al cerrar la OT, cuando corresponde:

- numero de serie;
- modelo;
- MAC;
- puerto OLT;
- modalidad de asignacion;
- valor de arriendo solo para modalidad `Arriendo`;
- observaciones tecnicas.

El cierre activa el servicio asociado, actualiza el contrato relacionado, asocia la unidad de inventario al cliente y servicio, conserva su historial y registra auditoria. La informacion tecnica se conserva como historica y no se edita desde el flujo comercial.

### 4. Gestionar servicio activo

Cuando el servicio esta activo, suspendido o dado de baja, `Gestionar` abre `Gestionar servicio` en vez del wizard de contratacion. El modal muestra un resumen comercial y la informacion de instalacion de solo lectura. Sus acciones editables son:

- modificar plan, con una unica observacion opcional;
- dar de baja logica el servicio, con una unica observacion opcional;
- abrir observaciones existentes.

El cambio de plan conserva la trazabilidad del contrato y actualiza el tipo del servicio desde el nuevo plan. La baja no elimina historial y reconcilia el estado del cliente y contrato segun los servicios restantes.

## Estados usados

- Cliente: `Pendiente firma contrato`, `Pendiente Instalacion`, `Activo`, `Suspendido`, `Moroso` y `Baja` segun reglas existentes.
- Contrato: se conserva el estado de firma existente; despues de firma queda listo para instalacion.
- Servicio: `Pendiente Instalacion`, `Activo` y `Baja`.
- Orden de trabajo: los estados de instalacion existentes, incluida `Completada` al cerrar tecnicamente.

La conciliacion del estado del cliente se centraliza en `resolveCustomerLifecycleStatus`, para evitar combinaciones contradictorias entre cliente, contrato y servicio.

## Endpoints y contratos ajustados

- `POST /api/contracts/:id/confirm-manual-signature`: confirma firma y prepara el servicio pendiente de instalacion.
- `POST /api/contracts/:id/prepare-installation`: prepara de forma segura un servicio pendiente para contratos firmados historicos.
- `POST /api/contracts/:id/change-plan`: permite cambio de plan sin exigir un segundo textarea de motivo; mantiene observacion opcional.
- `PATCH /api/services/:id/deactivate`: realiza baja logica del servicio y conserva auditoria.
- `PATCH /api/work-orders/:id/complete-installation`: acepta datos opcionales de equipo y los asocia al servicio al completar la instalacion.

No se modificaron endpoints de portal, cobros, tickets ni Facturacion.cl.

## Cambios de UX

- Informacion de solo lectura presentada como listas estructuradas, no como inputs deshabilitados ni tarjetas individuales.
- Mensajes de exito del flujo usan `useTransientMessage` y desaparecen aproximadamente a los tres segundos.
- Se eliminaron explicaciones permanentes de procesos internos y el tercer paso de operacion tecnica.
- `Ver disponibilidad` es una accion secundaria compacta junto a la fecha de agenda.
- Valor de arriendo no aparece ni se persiste para modalidades distintas de `Arriendo`.

## Auditoria y compatibilidad

Se registran acciones de confirmacion de firma, preparacion de servicio, cambio de plan, baja de servicio, cierre de instalacion y asociacion de equipo mediante el mecanismo de auditoria existente. Las validaciones mantienen empresa, permisos, pertenencia entre entidades e integridad del inventario.

No se introdujo una integracion externa ni se eliminaron datos historicos. Las integraciones de Facturacion.cl, WhatsApp, cambios de equipo, traslados y upgrades quedan fuera de esta fase y deben ejecutarse mediante flujos posteriores u ordenes de trabajo nuevas.

## Validacion prevista

- Cliente sin firma: no puede programar instalacion.
- Contrato firmado: prepara un servicio pendiente y permite agendar una sola OT abierta.
- Cierre de OT: activa el servicio y asocia el equipo real cuando se informa.
- Servicio activo: abre el modal de gestion posterior, no el wizard de contratacion.
- Cambio de plan y baja: mantienen auditoria e historial.
- Equipo sin arriendo: no requiere ni muestra valor de arriendo.
