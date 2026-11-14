# G8 — Suspensión por no pago y baja guiada por morosidad (Documento 2, 13-11-2026)

Este documento **reemplaza** la política de finalización descrita en `informe-fases-1-5-20261113.md` §5 (que exigía recepción completa en G1). Las decisiones funcionales vienen de FINET (Documentos 1 y 2 del 13-11-2026) y no se reabren aquí.

## Resumen del flujo

| Paso | Dónde | Qué ocurre | Qué NO ocurre |
|---|---|---|---|
| 1. Elegibilidad del corte | Backend (`GET /billing/contracts/:id/suspension-eligibility`) | Se calcula automáticamente con la misma regla que usa la suspensión. | No suspende nada. No hay cron. |
| 2. «Suspender servicio» | Libro de Control → ficha → contrato/plan | El usuario confirma. `PATCH /billing/contracts/:id/suspend` vuelve a evaluar la regla dentro de una transacción Serializable y suspende contrato, servicios activos de ese contrato y empresa, y cliente (si no hay otra empresa). Auditoría `SUSPENDER_SERVICIO_NO_PAGO` con motivo `NO PAGO`. | No toca otros contratos ni otras empresas. No borra deuda. |
| 3. «Dar de baja el servicio» | Libro de Control, solo con un servicio `Suspendido`, en un modal distinto (nunca anidado) | 3 pasos: requisitos → datos y observación → confirmación. `POST /service-withdrawals/initiate` crea en una transacción: solicitud, ticket oficial «Baja de servicio», vínculo privado, snapshot G3 y auditoría. | No cambia el servicio a `Baja`. No promete OT sin respuesta de G3. |
| 4. Seguimiento | Mismo acceso del Libro de Control | Muestra solicitud, ticket, despacho, OT, cierre y baja aplicada. Acciones reales: reenviar orden, consultar estado, cancelar retiro con motivo. | No permite una segunda alta. |
| 5. Orden técnica | G3 | Técnico cierra → `PENDIENTE_APROBACION`; jefe técnico aprueba → `COMPLETADA`. Webhook BAJA `baja:{id_ot}` con la evidencia. | El webhook solo **no** aplica la baja. |
| 6. Baja efectiva | G8, automático (`WithdrawalTrackingProcessor`) o Administrador (`POST /service-withdrawals/:id/finalize`) | GET autenticado de la OT (`COMPLETADA`), cierre BAJA correlacionado, deuda aún exigible y servicio aún suspendido → servicio `Baja`, contrato `Baja` si no quedan servicios operativos, cliente recalculado, excliente en Prospectos, solicitud `CERRADA`, ticket `Cerrado`, auditoría. Todo o nada. | No exige recepción en bodega (G1). No escribe inventario. No crea pagos ni devoluciones. |

## CU-30 Suspensión por no pago: elegibilidad automática, ejecución manual

Regla única (`backend/src/billing/suspension-eligibility.ts`), usada por el botón, el modal y la escritura:
- al menos una factura con **saldo exigible > 0**, **vencida** según su vencimiento efectivo (prórrogas `APROBADA`) por **`diasAtraso >= BILLING_CUT_DAYS`**, y **no cubierta** por un convenio `APROBADO`/`ACTIVO`;
- no habilitan el corte: deuda futura, pagada, anulada, cubierta por convenio vigente, en prórroga vigente o sin monto;
- estado del contrato `Activo`, `Moroso` o `Suspendido` (este último solo completa servicios aún activos; si no queda ninguno es idempotente y no escribe);
- al menos un servicio `Activo` del contrato en la misma empresa.

`BILLING_CUT_DAYS` es el valor configurado del backend; el código usa 5 solo si falta o no es un entero positivo. No se fija 20 ni otro número.

Motivos de rechazo (`requisito`): `CONTRATO_INCONSISTENTE`, `ESTADO_CONTRATO`, `YA_SUSPENDIDO`, `SIN_DEUDA_VENCIDA`, `DEUDA_CUBIERTA_POR_CONVENIO`, `BAJO_UMBRAL_CORTE`, `SIN_SERVICIOS_ACTIVOS`.

`GET /billing/overview` (`cortesProgramados`) usa la misma exclusión por convenio.

`PATCH /billing/contracts/:id/suspend` sigue aceptando llamadas sin cuerpo; el cuerpo opcional `{ observacion }` se audita.

## CU-31 Reactivación por pago

Sin cambios de regla en este bloque: un pago que regulariza la deuda reactiva servicios suspendidos instalados, **excepto** los que tienen un retiro por morosidad activo (se cancela o se resuelve primero). La reactivación manual y por reparación también se rechaza con retiro activo (`SERVICE_WITHDRAWAL_ACTIVE`).

## CU-79 Aviso previo a retiro

Sigue siendo requisito de la baja guiada (`AVISO_PREVIO`). Se registra en el Libro de Control y no crea OT.

## CU-84 Retiro de servicio

- La baja por morosidad se inicia **solo** con `POST /service-withdrawals/initiate` desde el Libro de Control.
- `POST /service-withdrawals` (solicitud genérica de retiro, por ejemplo «Retiro de servicio» desde Solicitudes) rechaza cualquier motivo de morosidad (`MOROSIDAD`, `moroso`, `mora`, `no pago`, `impago`, `falta de pago`, con o sin tildes) y cualquier servicio `Suspendido`: `WITHDRAWAL_GUIDED_FLOW_REQUIRED`.
- `PATCH /service-withdrawals/:id` no cambia una solicitud gestionada con G3 (ya existía).

## Caminos alternativos cerrados

| Camino | Antes | Ahora |
|---|---|---|
| Clientes → «Dar de baja» / «Solicitar retiro por morosidad» | Visible | Eliminado de la interfaz. |
| `PATCH /services/:id/deactivate` | Administrador, Comercial y Soporte | **Excepción administrativa**: solo Administrador, motivo cerrado (`SOLICITUD_CLIENTE_SIN_DEUDA`, `ERROR_DE_REGISTRO`, `SERVICIO_DUPLICADO`, `SIN_COBERTURA_TECNICA`) y justificación de 10 a 1000 caracteres. Rechaza siempre un servicio `Suspendido` y un contrato con deuda vencida exigible, aunque esté cubierta por convenio (`MOROSITY_WITHDRAWAL_REQUIRED`). Auditoría con `tipoBaja: ADMINISTRATIVA`. Sin botón en la interfaz. |
| `POST /tickets` con «Baja de servicio» | Permitido | `WITHDRAWAL_TICKET_CATEGORY_RESERVED`. La categoría se resuelve por nombre oficial canónico, nunca por ID. Sigue en el catálogo, en filtros e históricos. |
| Reclasificar un ticket a «Baja de servicio» | Permitido | `WITHDRAWAL_TICKET_CATEGORY_RESERVED`; tampoco se ofrece en el formulario. |
| Reclasificar, resolver, cerrar o diagnosticar un ticket **vinculado** a una solicitud | Permitido | `WITHDRAWAL_TICKET_MANAGED_BY_FLOW`. Se cierra solo dentro de la finalización. Los tickets históricos de la categoría sin vínculo se gestionan como antes. |

## Finalización: G3 aprueba, G8 aplica (sin exigir bodega)

`assessWithdrawalClosure()` separa:
- **Bloqueos**: `SIN_OT`, `OT_CANCELADA`, `CIERRE_NO_CONFIRMADO` (todo estado distinto de `COMPLETADA`, incluido `PENDIENTE_APROBACION`), `SIN_CIERRE_TECNICO` (sin webhook `baja:{id_ot}` correlacionado), `SERIE_DUPLICADA`, `SERIE_RETIRADA_Y_FALTANTE`.
- **Avisos** (se auditan, no bloquean): `EQUIPOS_FALTANTES`, `SIN_EQUIPOS_RETIRADOS`, `RECEPCION_G1_PENDIENTE`, `RECEPCION_G1_INCOMPLETA`, `RECEPCION_G1_INCONSISTENTE`, `EQUIPO_NO_RECIBIDO`, `SERIE_AJENA`, `EQUIPOS_ASOCIADOS_EN_INVENTARIO`, `INVENTARIO_NO_CONSULTADO`.

La correlación se comprueba en tres momentos: aceptación de la OT (`request_id`, `trace_id`), recepción del webhook (empresa, solicitud, trace, OT, cliente, contrato, servicio, ticket) y GET autenticado de la OT (OT, empresa, tipo BAJA y, si G3 los informa, `request_id`, `trace_id`, servicio, contrato, cliente y ticket).

**Ejecución automática** (`WithdrawalWorkflowService.finalizeApprovedBySystem`): la llama el seguimiento cuando la OT está `COMPLETADA`, el cierre BAJA fue recibido y `WITHDRAWAL_FINALIZE_ENABLED=true`. Reutiliza la misma transacción que `finalize()`. El actor de auditoría es `SISTEMA_G8_SEGUIMIENTO_RETIROS` con `idUsuario` nulo: no se suplanta a ningún Administrador. Requiere también `WITHDRAWAL_TRACKING_ENABLED=true` (es el seguimiento quien la ejecuta). Si G1 falla, se aplica igual y queda el aviso; si la baja no se aplica, el error se reintenta con espera creciente.

**Pagos durante el retiro**:
- antes del despacho: el despacho se rechaza (`WITHDRAWAL_DEBT_REGULARIZED`, acción `CANCELAR_SOLICITUD`);
- con la orden en ejecución: se cancela en G3 (permitido hasta `EN_CURSO`);
- después del retiro: no se aplica la baja ni se reactiva; queda `DECISION_COMERCIAL_REQUERIDA`.

## Interruptores

`G3_WITHDRAWAL_DISPATCH_ENABLED`, `WITHDRAWAL_TRACKING_ENABLED` y `WITHDRAWAL_FINALIZE_ENABLED` siguen en `false` por defecto. Cualquier habilitación es un cambio de configuración explícito, reversible y separado del despliegue de imágenes.

## Pendiente de verificación operativa (NO VERIFICADO desde este entorno)

- Valor efectivo de `BILLING_CUT_DAYS` en el backend de la VPS.
- Valores efectivos de los tres interruptores.
- Migraciones privadas `002_service_withdrawal.sql` **y** `003_withdrawal_voluntary_termination.sql`, con sus grants, en `finet-postgres-global` / `finet_global_validacion`. La 003 es obligatoria: la restricción de la 002 exigía la recepción G1 para marcar la baja aplicada. Sin ambas, el flujo responde bloqueado y no escribe nada. Ver `termino-voluntario-20261113.md`.
- E2E real con G3 (OT de prueba con técnico y aprobación) y G1.

## Fuera de alcance

Cargos adicionales pendientes de facturación, unificación de convenios y prórrogas en un modal, datos SQL históricos incompletos, fallos de la vista de instalaciones, firma electrónica, pagos de Facturación.cl y nuevas funcionalidades de G1/G2/G3.
