# G8 — Baja por morosidad integrada con G3 y G1: informe de las fases 1 a 5

**Fecha:** 13-11-2026 · **Rama:** `feat/g8-baja-morosidad-g1-g3-20261113`, creada desde `origin/main` `1db94534` en un clon independiente.
**Estado:** desarrollado y probado en aislamiento (simuladores HTTP, PostgreSQL efímera). **Nada se ejecutó en la VPS ni en una base compartida. No hay PR, merge ni despliegue.** El despacho a G3 y la baja efectiva quedan **apagados por defecto**.

Fuentes contrastadas:
- G3 `Team-3-FSM` `main` `8a8e5dd0b82e25001bddad8b98602bcb90181505`: `integraciones.controller.ts`, `bajas.service.ts`, `dto/solicitud-baja.dto.ts`, `ordenes/fan-out/payload-cierre.ts`, `momento-fan-out.ts`, migración `20261112190000_solicitud_baja_integracion` y `docker-compose.vps.yml`.
- Contrato G1 `respuesta-g1-a-g8-recepcion-equipos` (12-11-2026), tal como lo citan los documentos de FINET. **El archivo original no estuvo disponible en este equipo.**
- PR #81 (`integrate/p0b-jean-claude-20261112` `c3486103`), usado solo como referencia.

## 1. Commits

| Fase | Commit | Contenido |
|---|---|---|
| 1 | `f9a0340` | Compatibilidad del cierre compartido de G3 (400 en REPARACION **e INSTALACION** desde el 08-11). |
| 2 | `d899df4` | Elegibilidad, inicio atómico, despacho idempotente de OT BAJA, seguimiento GET y cancelación; almacenamiento `g8_retiros` y migración 002 revisada (sin ejecutar). |
| 3 | `43dc120` | Validador y handler propios del cierre BAJA, recepción G1 y conciliación pura. |
| 4 | `9b32d09` | Finalización comercial transaccional, apagada por defecto. |
| 5 | (este commit) | Migración probada en PostgreSQL efímera; corrección de dos defectos encontrados con SQL real; este informe. |

## 2. Fase 1 — HTTP 400 en cierres de REPARACION

**Causa reproducida** con fixtures que copian la forma exacta de `construirPayloadCierre` en G3 `8a8e5dd0`. El `ValidationPipe` global de G8 (`whitelist` + `forbidNonWhitelisted`) rechazaba campos que G3 agregó al payload compartido sin versionarlo:

| Fecha | Commit G3 | Campos nuevos |
|---|---|---|
| 08-11-2026 | `e64c183` | `falla_reportada`, `solucion_aplicada`, `resultado` |
| 12-11-2026 | `1194e22` | `equipos_faltantes`, `id_cliente_externo`, `id_servicio`, `id_solicitud_retiro`, `id_ticket_externo` y `con_dano` dentro de cada equipo |

Rechazos exactos, uno por cada campo: `whitelistValidation`. **El problema afectaba también a INSTALACION.**

**Corrección:**
- El DTO declara los 9 campos con tipos estrictos: `resultado` ∈ {`RESUELTO`, `PARCIAL`, `SIN_SOLUCION`}; identificadores enteros positivos o `null`; faltantes con serie y motivo; `con_dano` booleano.
- Cualquier otro campo sigue rechazándose con 400.
- INSTALACION y REPARACION rechazan identificadores de BAJA, e INSTALACION rechaza datos de reparación.
- Los campos compartidos `null` o vacíos se excluyen de la huella. Así, un cierre histórico reenviado no produce un falso 409, y webhook y conciliación generan el mismo hash.
- REPARACION sigue siendo solo un acuse 200, sin tracking, eventos, auditoría ni activación.

**Pendiente con G3:** confirmar con un payload real anonimizado de producción que el 400 que vieron corresponde a estos campos, y acordar que todo cambio de campos S2S se avise con fixtures antes de desplegarse.

## 3. Contratos verificados (ejemplos sanitizados)

### 3.1 G8 → G3 `POST /api/integraciones/ordenes-baja` (`X-API-KEY`)

```json
{ "request_id": "g8-retiro-1-15", "trace_id": "7d1f2c3a-9b8e-4c6d-a1b2-3c4d5e6f7a8b", "tipo_ot": "BAJA", "motivo": "MOROSIDAD",
  "id_empresa": 1, "id_cliente_externo": 33, "id_contrato_externo": 20, "id_servicio_externo": 61,
  "id_solicitud_retiro_externa": 15, "id_ticket_externo": 77, "rut_cliente": "12345678-5",
  "direccion_retiro": "Calle QA 123", "comuna_retiro": "Ñuñoa", "observaciones": "Aviso previo enviado" }
```

| Respuesta G3 | Tratamiento en G8 |
|---|---|
| `201 {success:true,data:{request_id,trace_id,id_ot,tipo_ot:"BAJA",estado,fecha_creacion}}` | ACEPTADA |
| `200 {success:true,data:{request_id,id_ot,estado,duplicado:true}}` | ACEPTADA (repetición). No se exigen `trace_id` ni fecha. |
| `409 REQUEST_ID_CON_OTRO_CONTENIDO` / `OT_BAJA_ACTIVA`; `404 CLIENTE_NO_ENCONTRADO`; `422 DIRECCION_INVALIDA`; `403 EMPRESA_NO_CORRESPONDE`; `400 REQUEST_ID_INCONSISTENTE`; `401` | RECHAZADA: revisión, sin reintento. |
| `5xx`, `408`, `429`, red o timeout | REINTENTABLE con el **mismo snapshot**, con backoff (1, 5, 15, 60 y 180 min) y un máximo de 6 intentos. |
| 2xx con otro `request_id`/`trace_id`, sin `id_ot` o con otro tipo | INCONSISTENTE: no se acepta como éxito. |

G3 calcula el hash del **cuerpo completo**, `trace_id` incluido. Por eso G8 persiste el snapshot una sola vez, verifica su hash antes de cada envío y lo reenvía byte a byte.

### 3.2 Cancelación y seguimiento

- **`POST /ordenes-baja/:request_id/cancelacion {motivo}`:**
  - `200 {estado:"CANCELADA", duplicado}`: cancelada.
  - `409 CANCELACION_NO_APLICABLE` (desde `PENDIENTE_APROBACION`): se registra y se informa, **sin** marcar la solicitud como cancelada.
  - `404 SOLICITUD_NO_ENCONTRADA` tras un intento fallido: se cancela localmente.
- **`GET /ordenes/:id?id_empresa=N`:** exige la misma OT, la misma empresa, `tipo_ot=BAJA` y un estado del catálogo. `origen_integracion` es `null` en BAJA y no se exige; si viene con datos de instalación, se trata como inconsistente.

### 3.3 G3 → G8: cierre BAJA (misma ruta S2S del webhook existente)

Forma real de `construirPayloadCierre`:
- `clave_idempotencia: "baja:930"`, `tipo_ot: "BAJA"`;
- `request_id` y `trace_id` en la raíz;
- `id_contrato`, `id_servicio`, `id_solicitud_retiro`, `id_cliente_externo` e `id_ticket_externo`;
- `equipos_retirados[]` y `equipos_faltantes[]`;
- `id_prospecto` e `id_plan` en `null`, y datos de reparación en `null`.

**No trae `estado_ot` ni `cierre_aprobado`.** G3 solo lo envía en APROBACION. G8:
- lo valida con un contrato propio;
- lo correlaciona contra el snapshot y el vínculo persistidos (empresa, solicitud, OT, trace, servicio, contrato, cliente y ticket);
- lo guarda de forma idempotente: mismo contenido es duplicado, otro contenido es 409 y conserva el original;
- lo corrobora con el GET de OT.

**El webhook nunca aplica la baja.**

### 3.4 G8 → G1 `GET /api/integraciones/recepciones?id_empresa=1&request_id=g8-retiro-1-15&id_ot=930`

```json
{ "success": true, "data": { "clave_evento": "g1-recepcion-1-930-501", "id_empresa": 1, "id_ot_g3": 930, "request_id": "g8-retiro-1-15",
  "tipo_ot": "BAJA", "estado_recepcion": "COMPLETA", "equipos": [ { "numero_serie": "QA-ONT-RET-1", "resultado": "RECIBIDO",
  "estado_g1": "En revisión", "fecha_recepcion": "2026-11-13T15:00:00.000Z", "id_servicio_externo": 61, "detalle": null } ] } }
```

| Respuesta G1 | Tratamiento en G8 |
|---|---|
| `404` | Pendiente; no escribe nada. |
| `401` / `403` | Bloqueo de configuración. |
| `5xx` | Reintentable. |
| Empresa, OT, solicitud o tipo ajenos; campos fuera de contrato; series duplicadas | Se rechaza y no se guarda. |

Cada `clave_evento` se guarda como versión inmutable; la misma clave con otro contenido es conflicto.

### 3.5 Discrepancias y supuestos

1. El PR #81 exigía `clave = id_ot:fecha` y `cierre_aprobado`. Se reemplazó por `baja:{id_ot}` más un GET `COMPLETADA`.
2. El contrato G1 del PR #81 rechazaba `tipo_ot`, `estado_recepcion`, `id_servicio_externo`, `detalle` y la envoltura; se reescribió.
3. Su migración restringía `estado_g1` a estados de inventario; ahora la decisión se basa en `resultado` (`RECIBIDO` o `RECIBIDO_CON_DANO`).
4. **Supuesto a confirmar con G1:** el formato `clave_evento = g1-recepcion-{empresa}-{ot}-{cierre}`. Si G1 usa otro, G8 falla en modo cerrado (no finaliza).
5. **G3 busca al cliente por RUT dentro de la empresa en su propia base**, y compara `comuna_retiro` con la dirección principal que G3 tiene del cliente. Si G3 no conoce al cliente o su comuna difiere de la del servicio en G8, responde 404 o 422 y la solicitud queda en revisión.
6. G3 deja `id_ticket_externo` como opcional; G8 siempre lo envía y lo verifica en el cierre.

## 4. Flujo y endpoints G8 (JWT, roles `MANAGE_CUSTOMER_REQUESTS`, alcance por empresa)

| Endpoint | Efecto |
|---|---|
| `GET /service-withdrawals/eligibility/:idServicio` | Solo lectura: requisitos, deuda y capacidades. |
| `POST /service-withdrawals/initiate` | En una transacción bajo `FOR UPDATE` del servicio crea la solicitud, el ticket «Baja de servicio», el vínculo, la auditoría y el snapshot. Un doble clic devuelve la misma operación. Si el despacho está habilitado, envía **después** del commit. |
| `POST /service-withdrawals/:id/dispatch` | Envío o reintento idempotente (claim atómico, revalidación de deuda). |
| `POST /service-withdrawals/:id/order-status` | GET de la OT, con límite de 1 por minuto. |
| `POST /service-withdrawals/:id/cancel` | Cancelación coordinada con G3. El `PATCH` manual ya no puede cancelar una solicitud gestionada con G3. |
| `POST /service-withdrawals/:id/reception-sync` | GET a G1 y versión inmutable. |
| `POST /service-withdrawals/:id/finalize` | Baja efectiva (ver §5). |
| Webhook `POST /api/integraciones/fsm/ordenes/:id/cierre` (alias `/api/integrations/g3/events/work-order-closed`) | `tipo_ot=BAJA` va a su handler; INSTALACION y REPARACION no cambian. |

**Interruptores (ambos `false` por defecto):**
- `G3_WITHDRAWAL_DISPATCH_ENABLED`: envío de OT a G3.
- `WITHDRAWAL_FINALIZE_ENABLED`: baja efectiva.

Sin el esquema `g8_retiros` aplicado, el flujo responde bloqueado y no escribe nada. Para cierres de G3 responde 503, para que G3 reintente.

## 5. Finalización (Fase 4)

**Antes de la transacción:**
- GET forzado de la OT: G3 debe informar `COMPLETADA`.
- Lectura en G1 de los equipos aún asociados al servicio. Si G1 no responde, no se aplica.

**Dentro de una transacción**, con bloqueos de servicio, contrato y cliente:
- revalida relaciones y suspensión;
- recalcula la deuda: un pago posterior al retiro exige una decisión comercial y no aplica la baja ni reactiva;
- concilia la evidencia, y para continuar exige:
  - OT `COMPLETADA` y cierre BAJA recibido;
  - recepción `COMPLETA`, con cada serie retirada `RECIBIDO` o `RECIBIDO_CON_DANO` para la misma OT y servicio;
  - sin series ajenas ni duplicadas;
  - sin faltantes (la excepción por equipos no recuperados sigue deshabilitada);
  - ningún equipo aún asociado al servicio en G1.
- Si todo se cumple:
  - servicio a `Baja`;
  - contrato a `Baja` solo si no le quedan servicios operativos;
  - estado del cliente recalculado con **todos** sus servicios, de ambas empresas;
  - solicitud `CERRADA`, evidencia marcada como aplicada y auditoría.

Una falla de escritura o de auditoría revierte todo, y repetir la operación es idempotente. No se tocan pagos, facturas, documentos firmados, inventario G1 ni registros de G2/G3.

**Retorno a Prospectos:** `main` **no tiene** una regla vigente. La marca `EXCLIENTE` del PR #81 es una propuesta que modifica Prospectos (módulo que la rama de tickets también cambió). Se informa como `SIN_REGLA_VIGENTE` y requiere decisión de FINET. El ticket «Baja de servicio» queda abierto: también falta decidir si se resuelve automáticamente al aplicar la baja.

## 6. Base de datos y seguridad (Fase 5)

### 6.1 Migración privada 002 (revisada, NO ejecutada en ningún ambiente compartido)

Prueba en una **PostgreSQL 16 efímera** (contenedor desechable `g8moro-ephemeral`, `127.0.0.1:18451`, con el esquema global vacío de `db/global/init-global.sql`):

| Paso | Resultado |
|---|---|
| `verify.sql` antes, sin esquema | OK. La versión del PR #81 falla con `schema "g8_retiros" does not exist` por el cast `::regnamespace`; se corrigió con `to_regnamespace()`. |
| `002_service_withdrawal.sql` ejecutada dos veces | OK (idempotente). |
| `grants.sql` con un rol de aplicación de prueba | OK: USAGE, más SELECT/INSERT/UPDATE en `solicitud_g3` y SELECT/INSERT en el resto, **sin DELETE**. |
| `verify.sql` después | 3 tablas; PK, UNIQUE y CHECK; 0 FK; nada concedido a PUBLIC; huellas de las tablas públicas **idénticas** antes y después. |
| V7 «dependencias externas» | Daba 2 por las tablas TOAST internas de PostgreSQL (falsa alarma heredada del PR #81). Corregido: 0. |
| SQL real del almacenamiento como rol de aplicación (spec `withdrawal.storage.postgres.integration.spec.ts`, 5/5) | Encontró un **defecto real**: una columna ambigua en `findReceptions`, corregida. También confirmó claim atómico, uuid/jsonb, versiones de recepción, las CHECK de request/cierre/aplicado y que el rol **no puede** hacer DELETE ni UPDATE de evidencia. Todo con rollback: 0 filas al terminar. |

### 6.2 Plan SQL seguro (requiere aprobación separada del propietario del esquema y un respaldo)

1. **Identificar la base efectiva de G8.** El compose de G3 indica que desde el 05-11-2026 cada grupo usa su propia base en la VPS (la de G8 en el 15432). Confirmarlo con la fase A del kit de tickets, que imprime host, puerto y base de `DATABASE_URL` sin credenciales. **No asumir `finet_global_validacion`.**
2. Hacer un respaldo verificado de esa base.
3. Ejecutar `002_service_withdrawal.verify.sql` y guardar la salida.
4. Como propietario del esquema, aplicar `002_service_withdrawal.sql` y luego `002_service_withdrawal.grants.sql` con `-v g8_runtime_role=<rol de la app>`.
5. Repetir `verify.sql` y comparar: las huellas V6 deben ser idénticas, V3 sin FK y V7 en 0.
6. Rollback si no hubo uso: `DROP SCHEMA g8_retiros CASCADE`, que solo contiene objetos de este archivo. Si hubo uso: `pg_dump --schema=g8_retiros` y archivar. La aplicación vuelve sola al modo bloqueado.

El endurecimiento opcional (índice único parcial en `public.solicitud_retiro_servicio`) queda comentado y es decisión del propietario.

### 6.3 Tabla de G3 `solicitud_baja_integracion`

Pertenece a G3. Según `docker-compose.vps.yml`, G3 corre su propia PostgreSQL (`127.0.0.1:8305`) con `MIGRAR_AL_ARRANCAR=true`. Por lo tanto, con `8a8e5dd0` desplegado, la tabla ya existiría en **su** base y **G8 no debe crearla ni pedir permisos para ella**.

**Para el operador de G3**, en la cuenta `grupo3`, solo lectura y sin imprimir credenciales:

```bash
docker exec <backend-g3> node -e "const u=new URL(process.env.DATABASE_URL);console.log(u.hostname,u.port||5432,u.pathname.slice(1))"
docker exec <backend-g3> node -e "console.log('MIGRAR_AL_ARRANCAR', process.env.MIGRAR_AL_ARRANCAR ?? '(defecto true)')"
docker exec <db-g3> psql -X -U <usuario> -d <base> -At -c "BEGIN READ ONLY;
  SELECT to_regclass('public.solicitud_baja_integracion') IS NOT NULL, (SELECT tableowner FROM pg_tables WHERE tablename='solicitud_baja_integracion');
  SELECT migration_name, finished_at IS NOT NULL FROM _prisma_migrations WHERE migration_name LIKE '20261112190000%'; COMMIT;"
```

Si G3 apuntara `DATABASE_URL` a una base administrada por otro (con `MIGRAR_AL_ARRANCAR=false`), el administrador de esa base debería aplicar la migración de G3. En ese caso no se duplica ni se crea desde G8.

## 7. Pruebas

| Suite | Resultado |
|---|---|
| `g3-closure.http.spec.ts` (HTTP real: controladores, guard S2S, `ValidationPipe`) | 73/73. Incluye REPARACION e INSTALACION reales, BAJA enrutada, 400 de contratos y BAJA de otra empresa. |
| `g3-closure-contract.spec.ts` | 7/7: huella webhook = conciliación y compatibilidad histórica. |
| `g3-withdrawal-contract.spec.ts` | 42/42: payload, 201/200/409/4xx/5xx, cancelación y GET. |
| `withdrawal-eligibility.spec.ts` | 23/23. |
| `withdrawal-evidence.spec.ts` | 40/40: contrato G1, contrato del cierre BAJA, conciliación y pago durante el retiro. |
| `withdrawal-workflow.dispatch.spec.ts` | 36/36: atomicidad con rollback, doble clic, dos empresas, reintentos, timeout tras crear, concurrencia (un solo POST), deuda regularizada, snapshot alterado, cancelación válida, tardía e idempotente, PATCH bloqueado, sin escrituras prohibidas. |
| `withdrawal-workflow.closure.spec.ts` | 18/18: cierre real, duplicado y conflicto, correlaciones cruzadas, OT aprendida por cierre, 503, G1 pendiente/401/403/5xx, versiones y conflicto. |
| `withdrawal-workflow.finalize.spec.ts` | 13/13: camino feliz, último servicio, multiempresa, apagado, deuda regularizada, bloqueos, G1 caído, reactivación concurrente, auditoría fallida (rollback total), otra empresa, cancelada. |
| `withdrawal.storage.postgres.integration.spec.ts` (PostgreSQL efímera) | 5/5. Se omite por defecto. |
| Backend completo | 2167 pass, 57 skipped (BD), 0 fallos. Lint sin errores en los archivos tocados. |

## 8. Gates pendientes antes de una QA E2E real y de activar

1. Integrar primero el PR de los 7 tickets; luego actualizar esta rama sobre la base resultante y repetir todas las pruebas.
2. **G3:**
   - confirmar el SHA desplegado en la VPS (la API pública en 8343 no lo demuestra), su base efectiva y la existencia de su tabla (§6.3);
   - entregar un payload real anonimizado del cierre REPARACION que dio 400 y del cierre BAJA;
   - acordar datos ficticios: clientes de prueba que **existan en G3** con la misma comuna.
3. **G1:** confirmar el endpoint de recepciones accesible desde la red de G8, el formato de `clave_evento` y fixtures de recepción completa, parcial, con daño y no recibida.
4. **Administrador de BD G8:** aprobar y aplicar la 002 en la base efectiva de G8 según §6.2, con respaldo.
5. **FINET:** decidir el retorno a Prospectos (EXCLIENTE), el cierre del ticket al aplicar la baja y la sincronización automática (hoy el seguimiento es bajo demanda; G3 sugiere cada 5 minutos).
6. **QA E2E coordinada** con datos ficticios: activar `G3_WITHDRAWAL_DISPATCH_ENABLED` solo en esa QA, recorrer el camino feliz y los casos bloqueados, y recién después evaluar `WITHDRAWAL_FINALIZE_ENABLED` con autorización humana explícita.

## 9. Plan de PR

Cuando el PR de tickets esté integrado:
1. Actualizar esta rama sobre la base vigente con integración controlada, sin reescribir commits publicados.
2. Resolver los conflictos esperables en `tickets.service.ts`, `g3-integration.*` y `customers`.
3. Repetir backend completo, auditoría Prisma, build y lint.

Después, abrir **un PR** con destino según la política del equipo, separado en dos partes revisables:
- Fase 1 (REPARACION/INSTALACION), que es urgente y de bajo riesgo; podría extraerse antes como PR independiente.
- Fases 2 a 5 (BAJA), con los interruptores apagados.

Sin merge automático. El PR #81 queda como referencia y no se fusiona.
