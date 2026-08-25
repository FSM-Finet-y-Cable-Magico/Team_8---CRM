# Corrección del flujo Prospecto → Cliente pendiente de firma

## Problema original

La vista `Gestionar prospecto` mezclaba etapas comerciales previas a cliente con acciones operativas propias de clientes y servicios. Desde el modal se podía modificar manualmente el estado del pipeline, registrar contratación, marcar pérdida como una sección principal y avanzar hacia instalación. Esto hacía que el flujo real quedara difuso y podía convertir una oportunidad en servicio/instalación antes de registrar formalmente la referencia del contrato externo.

## Nueva regla de negocio

Prospectos termina cuando la oportunidad queda formalizada como cliente pendiente de firma de contrato. La firma, confirmación final de plan, generación de orden de instalación, servicio pendiente de instalación y cierre técnico pertenecen a la siguiente etapa de Gestión de Clientes.

Flujo implementado en esta fase:

1. Prospecto.
2. Factibilidad técnica.
3. Cotización.
4. Registro de contrato externo gestionado en Facturación.cl.
5. Conversión a cliente en estado `Pendiente firma contrato`.

## Qué se eliminó del modal de Prospectos

- Selector genérico de cambio manual de estado.
- Acción visible de agendar/generar instalación.
- Contratación entendida como servicio activo o instalación programada.
- Sección grande de pérdida de prospecto.
- Cualquier noción de firma de contrato dentro de Prospectos.
- Cualquier generación de contrato PDF propio desde el CRM.

El endpoint histórico de actualización manual de pipeline se mantiene por compatibilidad, pero deja de formar parte del flujo principal visible.

## Qué se agregó

- Dirección del prospecto en el encabezado del modal.
- Factibilidad como control de avance a cotización.
- Bloque de registro de contrato externo con proveedor `FACTURACION_CL`.
- Campos de referencia externa:
  - número de contrato externo;
  - folio externo;
  - URL de PDF externo;
  - fecha de generación;
  - fecha de envío al cliente;
  - observación del contrato.
- Acción secundaria `Marcar como perdido` con pop-up interno.
- Motivo y observación obligatoria para pérdida.
- Conversión de prospecto a cliente pendiente de firma sin crear servicio ni OT.

## Contrato externo Facturación.cl

El CRM no emite contratos ni consume API de Facturación.cl en esta fase. Solo registra la referencia del contrato gestionado externamente.

Reglas aplicadas:

- No se inventa formato de contrato.
- No se genera PDF de contrato propio.
- No se simula firma electrónica.
- No se guardan credenciales de Facturación.cl.
- Al menos una referencia externa debe informarse: número, folio, URL u observación.

## Endpoints modificados

- `GET /api/prospects`: ahora lista prospectos activos no convertidos. Excluye registros con `idCliente` y excluye `Perdido` por defecto.
- `POST /api/prospects/:id/feasibility`: `No Factible` ya no marca automáticamente como perdido; deja el estado en `No Factible`.
- `POST /api/prospects/:id/quotes`: bloquea cotización si el prospecto está `No Factible` o `Perdido`.
- `POST /api/prospects/:id/contracts`: registra contrato externo, crea/actualiza cliente pendiente de firma y no crea servicio ni OT.
- `POST /api/prospects/:id/loss`: exige observación y guarda detalle, fecha y responsable.

## Estados usados

Prospecto:

- `Prospecto Nuevo`
- `Contactado`
- `En Factibilidad`
- `Factible`
- `No Factible`
- `Cotizacion Enviada`
- `Contrato externo registrado`
- `Perdido`

Cliente:

- `Pendiente firma contrato`
- Estados operativos existentes: `Activo`, `Moroso`, `Suspendido`, `En Mantencion`, `Baja`.

Contrato:

- `Pendiente firma contrato` para contratos externos registrados desde Prospectos.

## Cambios de datos

Se agregaron campos aditivos para trazabilidad:

- `prospecto.observacion_perdida`
- `prospecto.fecha_perdida`
- `prospecto.id_usuario_perdida`
- metadata externa nullable en `contrato` para proveedor, número, folio, URL, fechas y observación.

También se amplió el largo de `cliente.estado` y `contrato.estado` para soportar `Pendiente firma contrato`.

## Qué queda fuera de esta fase

- Firma de contrato desde Clientes.
- Confirmación/asignación final de plan desde Clientes.
- Generación de orden de instalación desde Cliente/Servicio.
- Servicio pendiente de instalación.
- Cierre técnico y activación de servicio.
- Integración real con Facturación.cl.
- WhatsApp API o mensajes comerciales copiables.
- Reorganización completa de Gestión de Clientes.

## Siguiente fase de Gestión de Clientes

La próxima etapa debe reorganizar `CustomersPanel` para continuar el flujo:

Cliente pendiente de firma → Confirmación de firma de contrato → Confirmación/asignación de plan → Orden de instalación → Servicio pendiente instalación → Servicio activo.

Las acciones deben mostrarse secuencialmente según estado del cliente, contrato y servicio.

## Pruebas previstas

- Prospecto no factible no puede cotizar ni registrar contrato externo.
- Registrar contrato externo convierte a cliente pendiente de firma.
- Prospecto convertido deja de aparecer en tabla de prospectos activos.
- Cliente pendiente de firma aparece en tabla de clientes.
- Registrar contrato externo guarda metadata externa mínima.
- Marcar como perdido exige motivo y observación.
- Prospecto perdido no aparece como cliente.
- Registrar contrato externo no crea OT.
- Registrar contrato externo no crea servicio activo.
- No se genera contrato PDF propio ni se llama API real de Facturación.cl.

## Riesgos pendientes

- El módulo de contratos digitales existente sigue disponible en Clientes para flujos históricos, pero no se usa desde Prospectos.
- Algunos estados antiguos del pipeline se mantienen en backend por compatibilidad con datos existentes.
- La experiencia completa de Cliente pendiente de firma depende de la siguiente fase sobre `CustomersPanel`.
