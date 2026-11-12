# Revisión técnica de la migración `002_service_withdrawal.sql` (y la propuesta `003`)

Fecha: 12-11-2026 · Estado: **NO EJECUTADA en ningún ambiente. Pendiente de aprobación.**
Archivos: `db/g8/migrations/002_service_withdrawal.sql`, `002_service_withdrawal.grants.sql`, `002_service_withdrawal.verify.sql`, `003_withdrawal_unrecovered_exception.sql`.

La revisión es estática: lectura del SQL, contraste con el código que lo usa y 13 pruebas automáticas (`service-withdrawal-boundaries.spec.ts`). **No se validó la sintaxis contra un servidor PostgreSQL**, porque eso implicaría ejecutarla. Con aprobación, el primer paso sería hacerlo en una base desechable vacía (procedimiento abajo).

## 1. Qué crea

| Objeto | Propósito | Unicidad e integridad |
|---|---|---|
| Esquema `g8_retiros` | Espacio privado de G8, igual que `g8_contratos` | `REVOKE ALL … FROM PUBLIC` |
| `solicitud_ticket` | Vínculo 1:1:1 solicitud ↔ aviso previo ↔ ticket «Baja de servicio» | PK por solicitud, UNIQUE por ticket, CHECK de ids positivos |
| `solicitud_g3` | Correlación con la OT de G3 y evidencia técnica | PK por solicitud, UNIQUE `clave_solicitud` y `(id_empresa, id_ot_g3)`; CHECK de estados; `cierre_aprobado` solo con `COMPLETADA`; `aplicado_en` solo con cierre aprobado |
| `recepcion_g1` | Recepción física confirmada por G1, por equipo | PK `(solicitud, serie)`, UNIQUE `(empresa, clave_evento, serie)` contra eventos duplicados; serie normalizada; estado de recepción válido |
| `003` `excepcion_no_recuperado` | Decisión comercial sobre equipos no recuperados (solo propuesta) | Append-only, UNIQUE por auditoría, motivo y responsable obligatorios |

## 2. Lista de verificación pedida

| Requisito | Resultado | Evidencia |
|---|---|---|
| Solo estructuras bajo autoridad de G8 | Cumple | Todos los `CREATE` apuntan a `g8_retiros.*` (prueba automática); sin `public.` en el código ejecutable |
| No rompe tablas, claves, permisos ni contratos de G1/G2/G3 | Cumple | Sin `ALTER TABLE`, FK, triggers ni `GRANT` en la migración; no referencia tablas públicas. Crear tablas en un esquema nuevo no toma locks sobre tablas compartidas. Verificación V7: 0 dependencias externas |
| Preserva históricos y datos existentes | Cumple | Sin `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `DROP` ni `RENAME`; sin backfill. V6 compara huellas de 6 tablas públicas antes y después |
| Integridad, unicidad e idempotencia | Cumple | Claves y CHECK de la tabla 1. `IF NOT EXISTS` en todos los objetos: reejecutar no cambia nada (prueba automática) |
| Compatible con Prisma y el esquema real | Cumple, con una salvedad | Sin modelo Prisma: la aplicación usa SQL calificado, igual que `g8_contratos`. `schema.prisma` no declara `schemas`, así que `prisma db pull` y la auditoría Prisma-vs-global solo ven `public` (sin cambios). La salvedad: no se probó contra el PostgreSQL de destino |
| Respaldo, verificación pre/post y recuperación | Cumple | Procedimiento en la sección 3 y `002_service_withdrawal.verify.sql` (solo lectura, `READ ONLY` y `ROLLBACK`) |
| Sin seeds ni datos manuales | Cumple | Sin DML (prueba automática) |
| Flujo bloqueado sin la migración | Cumple | Sonda `to_regclass`: sin las tablas, `initiate` y `:id/ticket` responden `WITHDRAWAL_LINK_STORAGE_PENDING` y `finalize` responde `WITHDRAWAL_CLOSURE_NOT_AVAILABLE`, sin escribir (pruebas y verificación en vivo contra la QA) |

Permisos: `002_service_withdrawal.grants.sql` concede al rol de la aplicación (variable `g8_runtime_role`) `USAGE` y `SELECT/INSERT`, más `UPDATE` solo en `solicitud_g3`. Nunca concede `DELETE`, ni nada a `PUBLIC`, ni cambia propietarios o contraseñas.

## 3. Procedimiento propuesto (solo con aprobación, primero en QA aislada)

1. **Confirmar el destino**: ejecutar V1 de `verify.sql` y comprobar base, rol, servidor y puerto. En este equipo el 5433 del anfitrión es un PostgreSQL nativo, no la QA.
2. **Respaldo**: `pg_dump --format=custom --file=antes-002.dump <base>`. Comprobar el archivo con `pg_restore --list`.
3. **Verificación previa**: guardar la salida de `verify.sql`. V5 debe dar 0 si se aplicará el endurecimiento opcional.
4. **Aplicar** `002_service_withdrawal.sql` con el rol propietario del esquema y luego `grants.sql` con `-v g8_runtime_role=<rol>`.
5. **Verificación posterior**: V2 debe listar 3 tablas, V3 las restricciones sin FK y V4 debe quedar vacía. V6 debe mostrar huellas idénticas a las previas y V7 debe dar 0.
6. **Aplicación**: `GET /service-withdrawals/eligibility/:id` debe devolver `habilitado: true`. `finalize` sigue bloqueado mientras falte el contrato G3, porque el despacho no está implementado.
7. **Recuperación**: sin uso, `DROP SCHEMA g8_retiros CASCADE` y la aplicación vuelve sola al modo bloqueado. Con uso, exportar el esquema con `pg_dump --schema=g8_retiros`, archivarlo y no borrar.

Validación sintáctica previa recomendada (requiere aprobación): aplicar en un contenedor `postgres:15-alpine` desechable y vacío, nunca en QA compartida ni en la VPS, solo para confirmar que el SQL compila y que reejecutarlo no cambia nada.

## 4. Riesgos y observaciones

- **Sin FK hacia `public`**: es una decisión deliberada, igual que en `g8_contratos`, para no tomar locks ni acoplarse a tablas de otros grupos. La integridad referencial la garantiza la aplicación bajo `FOR UPDATE`. Si alguien borrara un ticket, el vínculo quedaría huérfano; hoy ninguna ruta borra tickets.
- **Propietario del esquema**: `AUTHORIZATION CURRENT_USER` deja como dueño al rol que ejecuta. Debe ser el rol administrativo de G8, no el de la aplicación.
- **Endurecimiento opcional** (índice único parcial en `solicitud_retiro_servicio`): está comentado. Toca una tabla pública de G8 y requiere `CONCURRENTLY` fuera de transacción.
- **`003`**: no debe aplicarse hasta aprobar la excepción comercial. Mientras `UNRECOVERED_EQUIPMENT_EXCEPTION_ENABLED = false`, la aplicación no la lee.
