# Baja por morosidad: contratos con G3 (OT BAJA) y G1 (recepción de equipos)

Fecha: 12-11-2026 · Rama `integrate/p0b-jean-claude-20261112` · **Estado: PROPUESTO, NO RATIFICADO.** Mensajes listos para enviar (secciones 5 y 6).

G8 no crea registros en tablas de G3 ni de G1, no usa `POST /api/tickets/:id/work-order` (sigue respondiendo 410) y no simula confirmaciones. Mientras no haya ratificación:

- La solicitud queda con `estadoDespachoTecnico = 'BLOQUEADO_CONTRATO_G3'`.
- La baja efectiva responde `WITHDRAWAL_CLOSURE_NOT_AVAILABLE`.

Código preparado en G8 (funciones puras, sin red ni endpoint):

| Archivo | Contenido | Pruebas |
|---|---|---|
| `g3-withdrawal-contract.ts` | Solicitud de OT BAJA y evento de cierre de G3 | 20 |
| `g1-reception-contract.ts` | Evento de recepción de G1 | 15 |
| `withdrawal-closure.ts` | Reglas de cierre, excepción y pago | 30 |

## 1. Política de retiro ordinario (ratificada por FINET el 12-11-2026)

Un retiro ordinario está completo solo cuando:

1. G3 aprobó el cierre técnico (OT `COMPLETADA` y aprobada).
2. G1 confirmó la recepción física de cada equipo, correlacionada con la misma OT.
3. G8 validó la relación exacta con el servicio y la solicitud.

Un equipo retirado del domicilio no equivale a un equipo recibido. Un equipo recibido puede quedar `En revisión`: no tiene que estar disponible.

**Equipos no recuperados:** el cierre ordinario sigue bloqueado. Existe una excepción comercial autorizada, con decisión explícita, responsable, motivo y auditoría, que está diseñada y probada pero **deshabilitada** (`UNRECOVERED_EQUIPMENT_EXCEPTION_ENABLED = false`, tabla en la propuesta `003`). No marca equipos como recuperados ni disponibles y no genera cargos.

**Pago durante el retiro** (la baja efectiva recalcula la deuda real antes de aplicar nada):

| Etapa | Acción |
|---|---|
| Antes del despacho | Cancelar la solicitud |
| Con la OT en ejecución | Pedir la cancelación a G3 y esperar su confirmación; G8 no cambia OT ajenas |
| Después del retiro físico | Sin reactivación automática; decisión comercial autorizada con la evidencia técnica |

El pago no borra deuda histórica ni comprobantes: la exigibilidad se recalcula desde facturas y pagos.

## 2. Lo que hoy existe en G3 (repositorio `Team-3-FSM`, `main`, `d3726cc`)

| Tema | Evidencia | Consecuencia |
|---|---|---|
| Tipo de OT | `CrearOtDto.tipo_ot` acepta `BAJA` | El tipo existe |
| Creación | `POST /ordenes`, solo `ADMIN`/`JEFE_TECNICO`, por `rut_cliente` | No hay creación S2S para G8 |
| Aviso de cierre | Clave `id_ot:fecha_completada`; referencias de instalación (`request_id`, `id_prospecto`, `id_contrato`, `id_plan`) | No correlaciona servicio, solicitud ni ticket |
| Momento del aviso | `CIERRE_FAN_OUT_MOMENTO`, por defecto `CIERRE` (antes de aprobar) | Un cierre avisado puede ser rechazado después |
| Rechazo | `rechazarCierre` vuelve a `EN_CURSO`, borra `cierre_equipos` y conserva `fecha_completada` | El cierre corregido repite la clave idempotente |
| Puerto NAP en BAJA | `moverPuerto(..., 'desconectar')` al cierre del técnico; el rechazo no lo revierte | Puerto `LIBRE` con el equipo aún en el domicilio |
| Equipos | G3 no escribe `unidad_equipo`; envía `RETIRADO_PARA_DIAGNOSTICO` y G1 lo pasa a `En revisión` | La recepción la confirma G1 |

En G8, el webhook de cierre solo acepta `INSTALACION` o `REPARACION`: un aviso de BAJA hoy se rechaza con 400, sin efectos.

## 3. Formatos propuestos

**Solicitud G8 → G3** (`buildG3WithdrawalRequest`):

- `request_id = g8-retiro-{id_empresa}-{id_solicitud_retiro}` (idempotente) y `trace_id` UUID v4.
- `tipo_ot: BAJA` y `motivo: MOROSIDAD`.
- Correlación: `id_empresa`, `id_cliente_externo`, `id_contrato_externo`, `id_servicio_externo`, `id_solicitud_retiro_externa`, `id_ticket_externo`.
- Datos de visita: `rut_cliente`, `direccion_retiro`, `comuna_retiro`, `observaciones`. No incluye montos, deuda ni credenciales.

**Evento G3 → G8** (`parseG3WithdrawalEvent`):

- Referencias y estado: `clave_idempotencia = id_ot:fecha_completada`, `request_id`, `id_ot`, `id_empresa`, `id_solicitud_retiro_externa`, `estado_ot`, `cierre_aprobado` (solo con `COMPLETADA`), `fecha_completada`.
- Equipos: `equipos_retirados[]` (serie y diagnóstico de la lista de G1) y `equipos_faltantes[]` (serie y motivo).
- Rechaza campos ajenos, referencias cruzadas y series repetidas.

**Evento G1 → G8** (`parseG1ReceptionEvent`):

- Referencias: `clave_evento`, `id_empresa`, `id_ot_g3`, `request_id`.
- `equipos[]` con:
  - `numero_serie`;
  - `resultado`: `RECIBIDO`, `RECIBIDO_CON_DANO` o `NO_RECIBIDO`;
  - `estado_g1`;
  - `fecha_recepcion`.
- Solo `RECIBIDO` y `RECIBIDO_CON_DANO` confirman una recepción. Un evento repetido no crea movimientos nuevos (clave única en `g8_retiros.recepcion_g1`).

## 4. Cuándo G8 aplica la baja (`assessWithdrawalClosure`)

| Situación | Resultado |
|---|---|
| Sin OT aceptada o sin evidencia | Bloqueado |
| OT `PENDIENTE`, `ASIGNADA`, `EN_CURSO` (incluye cierre rechazado), `PENDIENTE_APROBACION` o `CANCELADA` | Bloqueado |
| Equipos faltantes sin excepción habilitada y autorizada | Bloqueado |
| Equipo del servicio aún `Instalado en cliente` | Bloqueado (retiro parcial) |
| Equipo retirado sin recepción confirmada por G1 | Bloqueado (`RECEPCION_G1_PENDIENTE`) |
| Recepción de otra OT o en un estado que no es de recepción | Bloqueado (`RECEPCION_G1_INCONSISTENTE`) |
| Deuda regularizada | Bloqueado, con la acción que corresponde a la etapa |
| OT aprobada, sin faltantes y G1 confirmó la recepción de cada equipo | Aplica la baja: servicio y contrato (si no le quedan servicios) en `Baja`, solicitud `CERRADA` y retorno a Prospectos; deuda e inventario intactos |

---

## 5. Mensaje para G3 (listo para enviar)

> **Asunto: Contrato S2S para OT de BAJA originadas por el CRM (G8) — propuesta para ratificar**
>
> Hola equipo G3:
>
> Estamos cerrando en el CRM (G8) la baja de servicio por morosidad. La ejecución técnica del retiro es de ustedes y G8 no escribirá en sus tablas ni usará `POST /ordenes`. Necesitamos acordar el siguiente contrato. Adjuntamos los validadores con sus pruebas (`g3-withdrawal-contract.ts`).
>
> **1. Solicitud idempotente de OT BAJA.** Un endpoint S2S, por ejemplo `POST /integraciones/ordenes-baja`, con la misma autenticación que `/integraciones/instalaciones`. El cuerpo incluye `request_id` (`g8-retiro-{id_empresa}-{id_solicitud_retiro}`), `trace_id`, `tipo_ot: BAJA`, `motivo: MOROSIDAD`, `id_empresa`, `id_cliente_externo`, `id_contrato_externo`, `id_servicio_externo`, `id_solicitud_retiro_externa`, `id_ticket_externo`, `rut_cliente`, `direccion_retiro`, `comuna_retiro` y `observaciones`. El mismo `request_id` debe devolver siempre la misma OT.
>
> **2. Correlación.** Guardar los identificadores externos (solicitud, ticket, empresa, cliente, contrato y servicio) y devolverlos en cada aviso y en `GET /integraciones/ordenes/:id/cierre`.
>
> **3. Aceptación o rechazo.** Responder `202` con `{ id_ot, estado }` al aceptar. Si rechazan, usar un código estable (por ejemplo `CLIENTE_NO_ENCONTRADO`, `DIRECCION_INVALIDA`, `OT_BAJA_ACTIVA`, `EMPRESA_NO_CORRESPONDE`) para que G8 lo muestre sin reintentar a ciegas.
>
> **4. Asignación y ejecución.** Informar los cambios de estado (`ASIGNADA`, `EN_CURSO`, `PENDIENTE_CLIENTE_AUSENTE`) por aviso o consulta. G8 solo los muestra; no los usa para cerrar.
>
> **5. Evidencia de retiro.** En el cierre, `equipos_retirados[]` con serie y diagnóstico de la lista de G1 y `equipos_faltantes[]` con serie y motivo para los no recuperados. Un equipo no recuperado nunca debe venir como retirado.
>
> **6. Aviso solo tras el cierre aprobado.** Para OT de BAJA, enviar el aviso de cierre solo cuando el jefe técnico o el administrador aprueba (`CIERRE_FAN_OUT_MOMENTO=APROBACION` o equivalente para este tipo), con `estado_ot: COMPLETADA` y `cierre_aprobado: true`. Hoy el valor por defecto avisa al cierre del técnico y un rechazo posterior no se comunica. Además, como `fecha_completada` se conserva tras un rechazo, el cierre corregido repite la clave idempotente: necesitamos que la clave del cierre aprobado sea distinguible (o confirmar que solo se avisa el aprobado).
>
> **7. Puerto NAP.** En una OT BAJA el puerto se libera en `cerrarOT`, antes de la aprobación, y `rechazarCierre` no lo vuelve a ocupar. Pedimos mover la desconexión a la aprobación o compensarla al rechazar (volver el puerto a `OCUPADO` para ese cliente), para que un cierre no aprobado no deje el puerto libre con el equipo aún en el domicilio.
>
> **8. Cancelaciones durante la ejecución.** Si el cliente regulariza su deuda con la OT en curso, G8 pedirá la cancelación por un endpoint S2S (por ejemplo `POST /integraciones/ordenes-baja/:request_id/cancelacion`) y esperará su confirmación. G8 no cambiará el estado de la OT. Necesitamos saber cuándo aceptan o rechazan la cancelación (por ejemplo, si el retiro ya ocurrió) y que la confirmen con un aviso o una consulta.
>
> Mientras no lo ratifiquemos, el despacho desde G8 queda bloqueado. Quedamos atentos a sus comentarios o a una contrapropuesta.

---

## 6. Mensaje para G1 (listo para enviar)

> **Asunto: Confirmación de recepción de equipos retirados en bajas por morosidad (G8) — propuesta para ratificar**
>
> Hola equipo G1:
>
> En la baja de servicio por morosidad, el CRM (G8) solo aplicará la baja cuando G3 haya aprobado el cierre técnico y ustedes hayan confirmado la recepción física de cada equipo. G8 no modificará `unidad_equipo` ni enviará movimientos de inventario. Adjuntamos el validador propuesto con sus pruebas (`g1-reception-contract.ts`).
>
> **1. Confirmación de recepción por equipo.** Un evento S2S hacia G8, o una consulta autorizada, que confirme la recepción física en bodega o taller de cada equipo retirado. Para G8, «retirado del domicilio» no equivale a «recibido».
>
> **2. Serie y correlación.** Cada confirmación incluye `numero_serie`, `id_ot_g3`, `id_empresa` y el `request_id` de G8 (`g8-retiro-{id_empresa}-{id_solicitud_retiro}`), para atribuirla a la orden y solicitud exactas.
>
> **3. Estado posterior.** Informar el estado de su máquina tras el ingreso (`En revisión`, `En bodega`, `En préstamo externo` o `Dado de baja`) y la fecha de recepción. Un equipo recibido puede quedar `En revisión`; G8 no exige que esté disponible.
>
> **4. Faltantes, dañados o pendientes.** Por equipo, indicar `RECIBIDO`, `RECIBIDO_CON_DANO` o `NO_RECIBIDO`. Un `NO_RECIBIDO` no cuenta como recepción y mantiene la baja bloqueada hasta una decisión comercial autorizada en G8.
>
> **5. Sin movimientos duplicados.** Cada evento con una `clave_evento` estable. Un reenvío con la misma clave no debe producir un segundo movimiento en G1, y G8 tampoco registrará una segunda recepción (clave única por empresa, evento y serie). Confirmen también cómo tratan un aviso de cierre de G3 duplicado o rechazado después de recibido.
>
> **6. Mecanismo autorizado.** Indiquen si prefieren enviar el evento (webhook con API key, como el resto de integraciones) o exponer una consulta por OT o por serie. Pregunta adicional: al pasar una unidad de `Instalado en cliente` a `En revisión`, ¿limpian `id_servicio` e `id_cliente_instalado`?
>
> Mientras no lo ratifiquemos, la baja efectiva en G8 queda bloqueada. Quedamos atentos.

## 7. Decisiones aún abiertas

1. Aprobar la excepción comercial por equipos no recuperados (propuesta `003` y activación de la bandera).
2. Si se aplica el endurecimiento opcional del índice de solicitudes activas.
3. Si las solicitudes por morosidad creadas desde Clientes deben redirigirse al Libro de control.
