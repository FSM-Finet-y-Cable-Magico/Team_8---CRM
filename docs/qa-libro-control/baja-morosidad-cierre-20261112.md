# Baja por morosidad, retiro de equipos y retorno a Prospectos: informe de cierre

Fecha: 12-11-2026 · Rama local `integrate/p0b-jean-claude-20261112` (sin push) · Base: merge PR #80 `1b5c09b9` · Worktree `Team_8---CRM-Revision-Merge80`.

## Resultado en una frase

**El flujo NO está operativo de extremo a extremo.** Todo lo que depende solo de G8 está implementado y probado. Lo que necesita la migración `g8_retiros` (pendiente de aprobación) o el contrato S2S con G3/G1 (no ratificado) queda preparado y **bloqueado de forma explícita**: responde un código claro y no escribe nada.

| Pieza | Estado |
|---|---|
| Elegibilidad de la baja por morosidad (backend + ficha del Libro de control) | **Operativa** (solo lectura) |
| Bloqueo de la baja directa por morosidad (`PATCH /services/:id/deactivate`) | **Operativa** |
| Retorno del excliente a Prospectos y etiqueta financiera calculada | **Operativa** (se activa con cada baja efectiva) |
| Bloqueo de recontratación por deuda (guarda existente, verificada) | **Operativa** |
| Solicitud + ticket «Baja de servicio» + vínculo con el aviso (`initiate`) | **Bloqueada**: requiere la migración `db/g8/migrations/002_service_withdrawal.sql` |
| Despacho de OT BAJA a G3 y recepción del cierre | **Bloqueada**: contrato G3 no ratificado (`baja-morosidad-contrato-g3-g1.md`) |
| Baja efectiva por retiro técnico (`finalize`) | **Bloqueada**: requiere la migración y la evidencia de G3 y G1 |

## Fase 1: requisitos frente a lo existente

| Requisito | Antes | Cambio | Archivo | Prueba | Resultado | Dependencia | Estado |
|---|---|---|---|---|---|---|---|
| A. Suspensión ≠ baja | `billing` suspende; nada daba de baja por suspensión | Sin cambios en suspensión, `Moroso` ni reactivación | — | Suites de billing (76) intactas | OK | — | Completado |
| B. Inicio desde Libro de control con formulario guiado | Aviso en la ficha; solicitud solo desde Clientes | Botón «Iniciar baja y retiro» en la ficha de Jean (solo con servicio suspendido) y sub-modal con datos precargados, requisitos, observación y confirmación | `ControlBookDrawer.tsx`, `ControlBookWithdrawal.tsx` | 9 + 3 pruebas de UI | OK, verificado en Edge | Migración para registrar | Parcial |
| B. Validaciones del backend (empresa, suspendido, contrato, deuda, aviso, permisos, duplicado, baja previa) | En `create()` sin convenio ni consulta previa | Evaluador puro compartido; el convenio activo bloquea; `GET /service-withdrawals/eligibility/:id` | `withdrawal-eligibility.ts`, `common/overdue-debt.ts` | 19 (reglas) + 46 (flujo) | OK | — | Completado |
| C. Solicitud + ticket «Baja de servicio» atómicos e idempotentes | Solicitud sin vínculo; ticket bloqueado | `initiate` y `:id/ticket`: categoría por nombre oficial en el catálogo de la conexión, vínculo estructurado, auditoría y rollback total; reintento devuelve la misma operación | `service-withdrawal.service.ts`, `tickets.service.ts` (`createWithdrawalTicket`), `withdrawal.storage.ts` | Doble clic, reintento, duplicado, 5 fallos de escritura, categoría ausente/técnica/duplicada/interna, ID en otro ambiente, vínculo inconsistente | OK | Migración `g8_retiros` | Bloqueado (preparado) |
| C. Relación estructurada (no texto ni JSON de auditoría) | No existía | Tablas privadas `g8_retiros.solicitud_ticket` y `solicitud_g3`, sin FK ni locks sobre tablas compartidas | `db/g8/migrations/002_service_withdrawal.sql` | 7 pruebas de límites (aditiva, sin DML, sin `public.`) | No ejecutada | Propietario del esquema | Propuesta |
| D. Contrato S2S con G3 | Ninguno para BAJA | Constructor de solicitud con clave idempotente y validador del evento de cierre (funciones puras) | `g3-withdrawal-contract.ts` | 20 | OK | G3 | Bloqueado (preparado) |
| E. Equipos e inventario G1 | G8 lee `unidad_equipo` | Evaluación del cierre: retiro físico ≠ recepción en bodega, faltantes, parcial, conciliación | `withdrawal-closure.ts` | 20 | OK | G1 (estados y recepción) | Bloqueado (preparado) |
| F. Baja efectiva separada del ticket | `deactivate()` podía dar `Baja` a un suspendido con deuda si no había solicitud | `deactivate()` rechaza la morosidad de hecho (`MOROSITY_WITHDRAWAL_REQUIRED`); `finalize` aplica la baja solo con evidencia, de forma idempotente y sin tocar deuda | `services.service.ts`, `service-withdrawal.service.ts` | 19 (seguridad de baja) + 12 (finalize) | OK; verificado en vivo contra la QA | G3/G1 + migración para `finalize` | Parcial |
| G. Excliente visible en Prospectos | Filtro `idCliente: null`; nadie lo marcaba | Opción B controlada: reutiliza o crea UN prospecto vinculado al mismo cliente; visibilidad dinámica por empresa; etiqueta calculada al listar | `common/returning-customer.ts`, `customer-lifecycle.ts`, `prospects.service.ts`, `ProspectsPanel.tsx` | 26 + 1 de UI; 180 de Prospectos intactas | OK | — | Completado |
| H. Recontratación condicionada a deuda | Guarda en contratación, generación, firma y conversión | Posición de deuda extraída (misma semántica); pruebas propias del excliente y presencia de la guarda en cada punto | `common/customer-debt.ts`, `contract-debt.guard.ts` | 16 (guarda) + 12 nuevas | OK | — | Completado |

### Opción elegida para el excliente (G)

**Opción B controlada**, por ser la de menor riesgo para P0-A:

- La Opción A (proyección sin filas) obligaba a unir `cliente` y `prospecto` en una consulta paginada nueva, con riesgo para la búsqueda y la paginación cerradas en P0-A.
- La Opción B reutiliza la misma consulta, la paginación y el aislamiento por empresa, y conserva `idCliente`, de modo que facturas, contratos, pagos, tickets y auditorías siguen asociados a la misma persona.
- Reglas: nunca se crea ni modifica el cliente. Un prospecto existente con el mismo RUT pero sin vínculo **no** se toca: queda auditado para revisión. La fila deja de verse sola si la persona vuelve a tener un servicio o contrato operativo en esa empresa.
- El flujo de gestión del prospecto ya bloquea acciones de pipeline cuando hay `idCliente`. La recontratación usa `createCustomerContract`, protegida por la guarda de deuda.

## Commits de esta sesión (rama local)

| SHA | Contenido |
|---|---|
| `b4439871` | Consolidación P0-B sobre el merge #80 (14 archivos; incluye el ajuste aprobado de `external-tax-documents.boundaries.spec.ts`) |
| `23dc6c45` | Posición de deuda y deuda vencida compartidas |
| `6974ce22` | Retorno del excliente a Prospectos |
| `45d4dda6` | La baja directa no puede saltarse el retiro por morosidad |
| `53cfb536` | Baja guiada: elegibilidad, `initiate`, ticket vinculado, `finalize` bloqueado, propuesta `g8_retiros` |
| `42e24bb4` | Contrato G3 propuesto (funciones puras) |
| `2c5de07d` | UI: «Iniciar baja y retiro» y etiqueta de excliente |
| `8752c9b2` | UI: requisitos con la lista de detalle de la ficha |
| `ac2d56bc` | Pruebas de recontratación condicionada a deuda |
| `ca2bba7d` | Contrato G3/G1 propuesto y pendientes del entorno QA |
| (este) | Informe de cierre y capturas |

Diff desde el merge #80 (antes de este informe): 49 archivos, +3359 / −193. Solo baja por morosidad (desde `b4439871`): 36 archivos, +2682 / −68. Autoría de los commits: «Claude Code» con trailer de coautoría, por falta de `user.*` en la configuración de Git. Puede reescribirse antes del PR.

## Pruebas (HEAD `ca2bba7d`, verificación final)

| Conjunto | Resultado |
|---|---|
| Backend Jest `--runInBand` | **2116 aprobadas, 0 fallidas, 52 omitidas** (112 suites: 106 OK, 6 omitidas). Antes de esta sesión: 1954 / 0 / 52 |
| Backend `tsc`, `nest build`, ESLint | Sin errores |
| Frontend `node --test` | **258 de 258** (antes 245); runtime 3 de 3 |
| Frontend `tsc -b`, `vite build` | Sin errores |
| Frontend ESLint | 0 errores, 78 avisos (los mismos 78 previos; ninguno en archivos nuevos) |
| Herramientas globales | 38 de 38 |

Pruebas existentes ajustadas, sin relajar validaciones:

- `prospects.service.spec.ts`: se añade `empresa.findMany → []` al fixture de búsqueda. Sin empresas, la consulta conserva su forma.
- `service-retirement-safety.spec.ts`: se simulan `contrato.count`, `factura` y `prospecto`. Una baja que deja al cliente sin relación operativa ahora audita también `MARCAR_EXCLIENTE_PROSPECTO`.
- `control-book-record.test.mjs` (Jean): se declara el mock del nuevo sub-modal en el arnés.
- Un test de PDF de contratos falló una vez en un lote paralelo y pasa en solitario y en serie (sensible a la carga, sin relación con estos cambios).

## Verificación en vivo contra la QA local (solo lectura)

Backend de la rama en un contenedor temporal dentro de la red Docker de QA (`db:5432`, nunca el 5433 del anfitrión), con integraciones apagadas y un token firmado localmente (sin login).

- Elegibilidad: servicio 48 elegible; 54 y 3 sin aviso previo; 55 con solicitud activa. Deuda y aviso coinciden con el Libro de control.
- `initiate` → `WITHDRAWAL_LINK_STORAGE_PENDING`. `:id/ticket` → igual. `finalize` → `WITHDRAWAL_CLOSURE_NOT_AVAILABLE`.
- `PATCH /services/48/deactivate` (suspendido con deuda) → `MOROSITY_WITHDRAWAL_REQUIRED`.
- Edge sin interfaz, escritorio y móvil: la ficha de un cliente suspendido muestra 7 acciones; la de un cliente sin suspensión, exactamente las 6 de Jean. El sub-modal tiene el registro deshabilitado y explica por qué. Sin desbordamiento horizontal, sin errores de consola y ninguna petición distinta de `GET` durante la navegación.
- Base QA: hash de contenido de 12 tablas idéntico antes y después.
- Capturas: `docs/evidencias/baja-morosidad-20261112/`.

## Permisos y empresas

- `eligibility`, `initiate` y `:id/ticket`: Administrador, Comercial y Soporte (Terreno no inicia bajas). `finalize`: solo Administrador. Fijado en `service-withdrawal-boundaries.spec.ts`.
- La empresa ajena se rechaza antes de consultar deuda o aviso y antes de abrir la transacción.
- Excliente y deuda se evalúan por empresa: una relación o deuda en Cable Mágico no afecta a FiNet ni al revés.
- El botón de la ficha exige el permiso de gestión comercial de la ficha.

## Preservación visual

- Sin CSS nuevo, sin estilos en línea ni hojas nuevas. Una prueba verifica que el sub-modal solo usa clases ya definidas en `commercial-control-book.css`.
- La ficha de Jean solo cambia cuando el plan elegido tiene un servicio suspendido: el séptimo botón ocupa una fila propia, por el `flex-wrap` del grupo de acciones.
- Prospectos: solo cambia el texto de la celda de estado para los excliente. Sin barras, contadores ni banners.
- Tickets, Clientes, pagos y contratos: sin cambios de interfaz.

## Datos y sistemas externos

- **VPS y `finet_global_validacion`: no se accedió.** Sin seeds, migraciones, `db push` ni SQL de datos. La migración 002 está versionada y no se ejecutó en ningún ambiente.
- Repositorios G1, G2 y G3: solo lectura de un clon para el diagnóstico; sin cambios.
- QA local: solo lecturas (hashes idénticos). Contenedor, tokens y procesos temporales eliminados.
- Sin push, PR, merge ni despliegue. La worktree original `Team_8---CRM-LibroControl` está intacta: HEAD `a8e757ee`, 22 líneas de estado y staging de `db/` y `tmp/` sin tocar.

## Riesgos y decisiones pendientes

1. **Aprobar y aplicar la migración `002_service_withdrawal.sql`** (propietario del esquema). Hasta entonces la baja guiada no registra nada.
2. **Ratificar el contrato con G3**: endpoint S2S para OT BAJA, correlación, aviso al aprobar, faltantes. Revisar también dos hallazgos de G3: el puerto NAP se libera al cierre del técnico y no se revierte al rechazar, y el cierre corregido repite la clave idempotente.
3. **G1**: qué estado acredita la recepción física y qué pasa con `id_servicio` al retirar.
4. **Política de recepción**: ¿basta el retiro físico (`En revisión`) o se exige `En bodega`? Hoy el valor por defecto es el retiro físico.
5. **Equipos no recuperados y pago durante el retiro**: hoy bloquean la baja; falta el proceso comercial.
6. **Solicitudes desde Clientes**: `POST /service-withdrawals` sigue creando solicitudes por morosidad sin ticket. Con la migración aplicada, `:id/ticket` permite vincularlas. Decidir si Clientes debe redirigir al Libro de control.
7. **Baja administrativa y Prospectos**: una baja legítima por otro motivo que deja al cliente sin relación operativa también lo devuelve a Prospectos como excliente (regla 11). Validar con negocio.
8. **QA**: añadir `orden_trabajo.cierre_equipos` en la QA aislada; tabla de contratos recortada a 390 px. Ver `qa-entorno-pendientes-20261112.md`.

## Cómo revisar y preparar el PR

1. En `C:\Users\Manguera\CRM Finet proyect\Team_8---CRM-Revision-Merge80`: `git log --oneline 1b5c09b9..integrate/p0b-jean-claude-20261112` y `git show <sha>` por commit.
2. Pruebas: `npm ci` (una sola vez, desde la raíz), `npm run prisma:generate`, `cd backend && npx jest --runInBand`, `cd ../frontend && npm test`, `npm run test:global-tools` (raíz).
3. Opcional: reescribir la autoría (`git rebase 1b5c09b9 --exec "git commit --amend --no-edit --reset-author"` con su identidad configurada).
4. Cuando autorice: `git push -u origin integrate/p0b-jean-claude-20261112` y PR hacia `develop`, adjuntando este informe y `baja-morosidad-contrato-g3-g1.md`.
5. No aplicar la migración 002 ni activar el despacho a G3 antes de las aprobaciones de los puntos 1 a 3.
