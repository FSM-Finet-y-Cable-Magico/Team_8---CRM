# Baja por morosidad: contrato propuesto con G3 (OT BAJA) y G1 (equipos)

Fecha: 12-11-2026 · Rama local `integrate/p0b-jean-claude-20261112` · **Estado: PROPUESTO, NO RATIFICADO.**

G8 no crea registros en tablas de G3 ni de G1, no usa `POST /api/tickets/:id/work-order` (sigue respondiendo 410) y no simula confirmaciones. Mientras este contrato no esté ratificado, la solicitud de retiro queda con `estadoDespachoTecnico = 'BLOQUEADO_CONTRATO_G3'` y la baja efectiva responde `WITHDRAWAL_CLOSURE_NOT_AVAILABLE`.

Código preparado en G8 (funciones puras, sin red ni endpoint): `backend/src/g3-integration/g3-withdrawal-contract.ts` (20 pruebas) y `withdrawal-closure.ts` (20 pruebas).

## 1. Lo que hoy existe en G3 (lectura del repositorio `Team-3-FSM`, rama `main`, `d3726cc`)

| Tema | Evidencia en G3 | Consecuencia para G8 |
|---|---|---|
| Tipo de OT | `CrearOtDto.tipo_ot` acepta `BAJA` | El tipo existe |
| Creación | `POST /ordenes`, solo `ADMIN`/`JEFE_TECNICO`, identifica al cliente por `rut_cliente` | No hay endpoint S2S para que G8 pida una OT BAJA |
| Integraciones expuestas | `POST /integraciones/instalaciones`, `POST /integraciones/tickets`, `GET /integraciones/ordenes/:id/cierre`, `GET /integraciones/estados-equipo`, `POST /integraciones/contrasena-wifi` | Ninguna cubre retiros |
| Aviso de cierre (fan-out) | Payload con `clave_idempotencia = id_ot:fecha_completada`, `tipo_ot`, `equipos_retirados`, y referencias `request_id`, `trace_id`, `id_prospecto`, `id_contrato`, `id_plan` | No transporta servicio, solicitud de retiro ni ticket |
| Momento del aviso | `CIERRE_FAN_OUT_MOMENTO`; por defecto `CIERRE` (al cerrar el técnico, antes de aprobar) | Un cierre avisado puede ser rechazado después |
| Rechazo de cierre | `rechazarCierre` devuelve la OT a `EN_CURSO`, borra `cierre_equipos` y conserva `fecha_completada` | El siguiente cierre reutiliza la misma clave idempotente |
| Puerto NAP en BAJA | `cerrarOT` ejecuta `moverPuerto(..., 'desconectar')` **al cierre del técnico**; `rechazarCierre` no lo revierte | Tras un rechazo, el puerto queda `LIBRE` aunque el equipo siga en el domicilio |
| Equipos | G3 nunca escribe `unidad_equipo`: envía `RETIRADO_PARA_DIAGNOSTICO` y G1 lo pasa a `En revisión`; diagnósticos de una lista fija de G1 | La recepción física la confirma G1, no G3 |

En G8, `POST /api/integrations/g3/events/work-order-closed` solo acepta `tipo_ot` `INSTALACION` o `REPARACION`: un aviso de BAJA hoy se rechaza con 400. No hay riesgo de activación falsa, pero tampoco existe un canal de entrada para retiros.

## 2. Solicitud de OT BAJA (G8 → G3), propuesta

`buildG3WithdrawalRequest()` construye:

| Campo | Origen en G8 | Nota |
|---|---|---|
| `request_id` | `g8-retiro-{id_empresa}-{id_solicitud_retiro}` | Clave idempotente determinista: un reintento no duplica la OT |
| `trace_id` | UUID v4 | Trazabilidad |
| `tipo_ot` / `motivo` | `BAJA` / `MOROSIDAD` | |
| `id_empresa` | Servicio | Aislamiento FiNet / Cable Mágico |
| `id_cliente_externo`, `id_contrato_externo`, `id_servicio_externo` | Servicio y contrato validados bajo bloqueo | |
| `id_solicitud_retiro_externa`, `id_ticket_externo` | Solicitud y ticket «Baja de servicio» vinculados | |
| `rut_cliente` | Cliente (cuerpo-dígito) | G3 identifica clientes por RUT |
| `direccion_retiro`, `comuna_retiro` | Dirección de instalación | |
| `observaciones` | Gestión de cobranza | Sin montos, deuda ni credenciales |

Respuesta esperada de G3: `202` con `{ id_ot, estado }` la primera vez y la **misma** OT ante el mismo `request_id`. Un rechazo debe incluir un código estable (`CLIENTE_NO_ENCONTRADO`, `SERVICIO_SIN_DIRECCION`, `OT_BAJA_ACTIVA`, etc.).

## 3. Evento de la OT de retiro (G3 → G8), propuesta

`parseG3WithdrawalEvent()` valida antes de guardar la evidencia en `g8_retiros.solicitud_g3`:

- `clave_idempotencia`, `request_id`, `id_ot`, `id_empresa`, `id_solicitud_retiro_externa` (deben coincidir con la solicitud).
- `estado_ot` ∈ `PENDIENTE`, `ASIGNADA`, `EN_CURSO`, `PENDIENTE_CLIENTE_AUSENTE`, `PENDIENTE_APROBACION`, `COMPLETADA`, `CANCELADA`.
- `cierre_aprobado` (solo `true` con `COMPLETADA`).
- `fecha_completada`.
- `equipos_retirados[]` con `numero_serie` y `diagnostico`, que debe pertenecer a la lista fija de G1.
- `equipos_faltantes[]` con `numero_serie` y `motivo`.

Se rechazan campos fuera de contrato, referencias cruzadas y series repetidas. Un webhook repetido produce el mismo recibo, sin movimientos duplicados. El evento **no** aplica la baja por sí solo.

## 4. Cuándo G8 aplica la baja efectiva (`assessWithdrawalClosure`)

| Situación | Resultado |
|---|---|
| Sin OT aceptada o sin evidencia | Bloqueado (`SIN_EVIDENCIA_TECNICA`) |
| OT `PENDIENTE` / `ASIGNADA` / `EN_CURSO` (incluye cierre rechazado) | Bloqueado |
| `PENDIENTE_APROBACION` | Bloqueado: el cierre no es definitivo |
| `CANCELADA` | Bloqueado |
| Equipos faltantes declarados | Bloqueado: no se asume retiro completo |
| Un equipo del servicio sigue `Instalado en cliente` en G1 | Bloqueado (`RETIRO_PARCIAL`) |
| Serie informada que G1 no confirma fuera del domicilio | Bloqueado (`INVENTARIO_SIN_CONFIRMAR`) |
| OT `COMPLETADA` + aprobada, sin faltantes y G1 confirma `En revisión`, `En bodega`, `En préstamo externo` o `Dado de baja` | Aplica la baja |
| Política opcional `requireWarehouseReception` | Exige además `En bodega` (decisión pendiente) |

La baja aplica sobre entidades de G8 en una transacción: servicio `Baja`; contrato `Baja` solo si no le quedan servicios operativos; estado del cliente recalculado; solicitud `CERRADA`; recibo marcado como aplicado y retorno a Prospectos. No toca deudas, facturas, pagos ni inventario. Si falla localmente, se reintenta con el recibo ya guardado, sin volver a pedir nada a G3.

## 5. Mensaje técnico para G3 (para revisar y enviar)

> Hola equipo G3. Para la baja por morosidad, G8 necesita solicitar una OT `BAJA` y recibir su resultado sin escribir en sus tablas. Proponemos:
> 1. **Endpoint S2S** `POST /integraciones/ordenes-baja` (misma autenticación que `/integraciones/instalaciones`), con el cuerpo de la sección 2. Debe ser idempotente por `request_id` y devolver la misma OT en cada reintento.
> 2. **Correlación**: guardar `id_servicio_externo`, `id_solicitud_retiro_externa` e `id_ticket_externo` en `solicitud_integracion` (o equivalente) e incluirlos en el aviso de cierre y en `GET /integraciones/ordenes/:id/cierre`.
> 3. **Aviso de cierre de BAJA**: enviarlo solo al **aprobar** (`CIERRE_FAN_OUT_MOMENTO=APROBACION`) o incluir `cierre_aprobado`/`estado_ot` para que G8 distinga un cierre provisional. Hoy el valor por defecto avisa al cierre del técnico y un rechazo posterior no se comunica.
> 4. **Faltantes**: informar `equipos_faltantes` (serie y motivo) además de `equipos_retirados`.
> 5. **Puerto NAP**: en una OT BAJA el puerto se libera en `cerrarOT`, antes de la aprobación, y `rechazarCierre` no lo vuelve a ocupar. ¿Pueden mover la desconexión a la aprobación o revertirla al rechazar?
> 6. **Clave tras rechazo**: `fecha_completada` se conserva después de un rechazo, así que el cierre corregido repite la clave idempotente. Confirmen qué campo distingue el cierre corregido del rechazado.
>
> G8 no usará `POST /ordenes` ni escribirá en `orden_trabajo`. Adjuntamos los validadores y sus pruebas (`g3-withdrawal-contract.ts`).

## 6. Mensaje técnico para G1 (para revisar y enviar)

> Hola equipo G1. En la baja por morosidad G8 solo **lee** el estado de los equipos para no dar de baja con equipos aún en el domicilio. Necesitamos confirmar:
> 1. Que una unidad retirada pasa de `Instalado en cliente` a `En revisión` al procesar la acción `RETIRADO_PARA_DIAGNOSTICO` de G3, y qué ocurre con `id_servicio` e `id_cliente_instalado` (¿se limpian?).
> 2. Qué estado o evento acredita la **recepción física** en taller o bodega: ¿`En revisión` ya implica recepción o solo retiro declarado?
> 3. Si existe un endpoint de consulta por número de serie o por servicio para no depender de la tabla compartida `unidad_equipo`.
> 4. Cómo tratan un aviso de cierre duplicado (misma `clave_idempotencia`) y un cierre rechazado por G3 después del aviso.
>
> G8 no modificará `unidad_equipo` ni enviará movimientos de inventario.

## 7. Decisiones pendientes

1. **Política de recepción**: ¿la baja comercial exige solo el retiro físico (`En revisión`) o también la recepción en bodega (`En bodega`)?
2. **Equipos no recuperados**: ¿qué proceso comercial corresponde (cargo, cobranza, cierre con excepción autorizada)? Hoy G8 bloquea.
3. **Pago durante el retiro**: si el cliente paga y se reactiva, la baja efectiva se rechaza (`WITHDRAWAL_SERVICE_STATE_CHANGED`). Falta definir quién cancela la solicitud y qué se pide a G3 para anular la OT.
4. **Endurecimiento opcional** del índice único parcial en `solicitud_retiro_servicio` (comentado en la migración 002).
