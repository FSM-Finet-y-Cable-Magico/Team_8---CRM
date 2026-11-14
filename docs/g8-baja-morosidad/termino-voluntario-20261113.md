# G8 — Dos motivos de retiro, un mismo motor técnico (ajuste del Documento 2, 13-11-2026)

Complementa `flujo-suspension-baja-20261113.md`. No cambia la suspensión, los dos modales del Libro de Control ni el cierre por aprobación de G3.

## Flujos

| | A. Baja por morosidad | B. Término voluntario |
|---|---|---|
| Inicio | Libro de Control, después de una suspensión válida | Tickets: categoría «Término de servicio» |
| Requisitos comerciales | Gestión, aviso previo, deuda exigible sin convenio ni prórroga que lo impida | Identidad y autorización del titular, cliente/empresa/contrato/servicio coherentes, sin término previo. **Sin** suspensión, deuda cero, convenio ni aviso de cobranza |
| Ticket | «Baja de servicio» (reservada) | «Término de servicio» (nueva, solo G8) |
| Término comercial | Al aprobarse la OT en G3 (`COMPLETADA`) y conciliar el cierre | **Inmediato, al registrar** (sin visita técnica, G1 ni G3) |
| OT técnica | BAJA, `motivo=MOROSIDAD` | BAJA, `motivo=VOLUNTARIA` (solo cuando G3 lo ratifique) |
| Cierre técnico | Aplica la baja comercial | Cierra solicitud y ticket; **no** vuelve a tocar la relación comercial |
| Deuda | Se conserva; restringe recontratar | Igual |
| Excliente | Prospectos de la empresa si fue la última relación | Igual |

Ambos usan `WithdrawalWorkflowService`: el mismo despacho idempotente (snapshot + `request_id`), seguimiento, cancelación, recepción del cierre BAJA y evidencia.

## Término voluntario (`POST /service-withdrawals/voluntary`)

En **una** transacción con bloqueos:
1. Valida el RUT contra el titular del servicio, la empresa del usuario, el contrato y la confirmación de identidad o autorización.
2. Crea el ticket «Término de servicio», con fecha y hora del requerimiento, canal, solicitante (titular o representante) y evidencia.
3. Crea la solicitud `VOLUNTARIA`, el vínculo privado (causa `VOLUNTARIA`, sin aviso) y el snapshot G3 con `motivo=VOLUNTARIA`.
4. Registra el término en `g8_retiros.termino_servicio`.
5. Aplica el término comercial: servicio `Baja`; contrato `Baja` solo si no le quedan servicios operativos; cliente recalculado; excliente en Prospectos.
6. Audita `TERMINO_VOLUNTARIO_SERVICIO` (`deudaConservada: true`, `esperaG3: false`).

Casos especiales:
- **Duplicados:** repetir devuelve la misma operación, sin segundo ticket, solicitud ni OT.
- **Varios servicios:** cada término es independiente. El contrato pasa a `Baja` solo con el último.
- **Cambio de motivo** (hay un retiro por morosidad activo en **el mismo servicio y empresa**; nunca se reutiliza la OT de otro servicio del cliente):
  - nunca enviado a G3, o rechazado por G3 sin OT creada: se cancela y lo reemplaza la solicitud voluntaria;
  - ya enviado (aceptado, en curso o reintentable): se reutiliza esa OT, sin segunda OT. La solicitud conserva su motivo histórico `MOROSIDAD` y su snapshot.
  - Su cierre técnico solo cierra la solicitud y los dos tickets. Ambos quedan con resultado `RETIRO_TRAS_TERMINO_VOLUNTARIO`; ninguno informa una baja por morosidad.
  - No hay segunda baja comercial: no se registra `APLICAR_BAJA_POR_RETIRO_MOROSIDAD`.
- **Concurrencia:** el término y la baja por morosidad bloquean el mismo servicio (`FOR UPDATE`). Si la baja se aplica primero, el término responde `SERVICE_ALREADY_TERMINATED`; si el término va primero, la finalización hace solo el cierre técnico. Siempre hay una única terminación comercial.
- **Solicitudes genéricas:** no se migran ni transforman los registros históricos. Los nuevos términos voluntarios se registran en Tickets; la solicitud genérica «Retiro de servicio» se mantiene para los demás motivos válidos y su ayuda lo indica.
- **Datos de retiro incompletos** (sin dirección o RUT válido): el término comercial igual se aplica y el retiro queda pendiente de datos (`DATOS_INCOMPLETOS`).
- **Retraso o falla de G3:** no afecta al término. El envío queda reintentable.
- `POST /tickets` y la reclasificación rechazan «Término de servicio» (`TERMINATION_TICKET_FLOW_REQUIRED`).
- `POST /service-withdrawals` rechaza el motivo `VOLUNTARIA` (`TERMINATION_FLOW_REQUIRED`).

**Plazo normativo:** el término se aplica al registrar el requerimiento, así que cualquier plazo se cumple por construcción. G8 no codifica un número de días.

## Migración privada 003 (`db/g8/migrations/003_withdrawal_voluntary_termination.sql`) — PENDIENTE DE APROBACIÓN

**Hallazgo:** la 002 define `solicitud_g3_aplicado_check` con `recepcion_clave_evento IS NOT NULL`. Con la política del Documento 2 (G1 informativo), marcar la baja como aplicada **habría fallado en PostgreSQL** sin recepción G1. Los tests en memoria no podían verlo.

La 003, aditiva e idempotente, solo toca el esquema `g8_retiros`:
- reemplaza esa restricción por `estado_ot = 'COMPLETADA' AND cierre_clave IS NOT NULL`;
- `solicitud_ticket`: agrega la columna `causa`; `id_aviso` pasa a ser obligatorio **solo** para `MOROSIDAD` y prohibido para `VOLUNTARIA`, de modo que no se fabrican avisos;
- crea la tabla `termino_servicio`: una fila por servicio y por ticket, con requerimiento, canal, solicitante, evidencia, término comercial y cierre técnico.

Se acompaña de `003_withdrawal_voluntary_termination.grants.sql` (sin DELETE; UPDATE solo de `cierre_tecnico_en`) y de `003_withdrawal_voluntary_termination.verify.sql` (solo lectura).

La aplicación exige 002 **y** 003. Con solo la 002 responde `WITHDRAWAL_STORAGE_NOT_AVAILABLE` y no escribe nada, en lugar de fallar al aplicar.

**Verificado estáticamente** (`withdrawal-boundaries.spec.ts`):
- la 002 no se editó;
- los vínculos históricos quedan `MOROSIDAD` con su aviso y cumplen el nuevo CHECK;
- cada restricción reemplazada se elimina con `IF EXISTS` antes de crearse;
- la unicidad de la 002 no se toca y el término es único por servicio, ticket y solicitud;
- los permisos no incluyen DELETE ni PUBLIC;
- el código solo marca una baja como aplicada después de exigir lo mismo que el nuevo CHECK (OT `COMPLETADA` y cierre `baja:{id_ot}`).

**No validado en PostgreSQL desde este entorno:** no se permite crear bases. La spec `withdrawal.storage.postgres.integration.spec.ts` incluye dos pruebas de la 003, la baja aplicada sin recepción y la causa en el vínculo. Las ejecuta quien aplique 002 y 003 en una base efímera autorizada (`G8_WITHDRAWAL_PG_TEST_URL`).

## Catálogo de tickets (`db/proposals/g8-termino-servicio-catalog.sql`) — PROPUESTA

- Inserción aditiva de **una** fila «Término de servicio», con el serial de la tabla (sin ID fijo).
- `tipo='ATENCION'` si la columna existe.
- SLA copiado de «Baja de servicio».
- Idempotente; aborta si hay duplicados.
- No renombra «Baja de servicio» ni reutiliza su ID.
- Requiere la autorización del propietario del catálogo, compartido con G2 y G3.

Mientras no se inserte, la opción no aparece en Tickets y el flujo B responde `TERMINATION_TICKET_CATEGORY_UNAVAILABLE` sin escribir. El contrato de 7 categorías G2/G8 no cambia: «Término de servicio» es una categoría propia de G8.

## Extensión mínima que debe ratificar G3 (no se modificó su repositorio)

El endpoint S2S `POST /api/integraciones/ordenes-baja` recibe `motivo`, pero hoy interpreta toda solicitud como morosidad. Para conservar ambos motivos, G3 debe:
1. aceptar `motivo ∈ {MOROSIDAD, VOLUNTARIA}` en la OT de tipo `BAJA`, sin cambiar `tipo_ot` ni los estados (`PENDIENTE` … `PENDIENTE_APROBACION` → `COMPLETADA`, `CANCELADA`);
2. conservar y devolver el `motivo` de la OT en el GET de la OT y en el cierre BAJA (opcional, pero recomendable para la conciliación);
3. no condicionar una OT `VOLUNTARIA` a reglas de morosidad de su lado;
4. mantener la idempotencia por `request_id` y la cancelación hasta `EN_CURSO`.

Hasta la ratificación, G8 prepara el snapshot `VOLUNTARIA` pero **no lo envía** (`G3_VOLUNTARY_NOT_RATIFIED`). El interruptor `G3_WITHDRAWAL_VOLUNTARY_ENABLED` está en `false` por defecto. G8 nunca envía un término voluntario como `MOROSIDAD`.

## Interruptores

| Interruptor | Efecto | Por defecto |
|---|---|---|
| `G3_WITHDRAWAL_DISPATCH_ENABLED` | Envío de OT BAJA | `false` |
| `G3_WITHDRAWAL_VOLUNTARY_ENABLED` | Envío de OT BAJA con `motivo=VOLUNTARIA` (además del anterior) | `false` |
| `WITHDRAWAL_TRACKING_ENABLED` | Seguimiento automático | `false` |
| `WITHDRAWAL_FINALIZE_ENABLED` | Baja por morosidad y cierre técnico tras el término | `false` |

El término comercial voluntario **no** depende de ningún interruptor: solo requiere la 003 y la categoría en el catálogo.

## Recontratación y excliente

Reutiliza `ensureFormerCustomerProspect()` y la guarda de deuda por empresa (`customer-debt.ts`):
- el excliente se ve en los Prospectos de la empresa mientras no tenga una nueva relación operativa, con o sin deuda;
- con deuda pendiente no puede completar una nueva contratación hasta regularizarla.

## Pendiente

- Aprobación y ejecución de la 002 y la 003, y validación en PostgreSQL por el propietario del esquema.
- Inserción autorizada de «Término de servicio» en el catálogo.
- Ratificación de G3 para `VOLUNTARIA`.
- Las solicitudes genéricas «Retiro de servicio» de Solicitudes siguen siendo genéricas (no aplican término): decidir si se migran al formulario de término.
