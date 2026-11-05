# Auditoría técnica final de PR #64 — 30-10-2026

**GO_MERGE_DEVELOP=true. GO_DEPLOY_VPS=false.** La recomendación de merge corresponde al código corregido y probado localmente; no certifica producción, proveedores reales ni aceptación visual nueva. No se ejecutó el merge.

## Identidad y alcance

- PR: [#64](https://github.com/FSM-Finet-y-Cable-Magico/Team_8---CRM/pull/64), rama `docs/i4-p0-07-cierre-entrega`, destino `develop`.
- Develop consultado mediante fetch: `6185c22d8a81897dc9e8878ee89301c2089a91c6`; contiene PR #63.
- HEAD inicial auditado: `5b9571a0b1c3bae02bf5dbba8465acae13cdb98c`. Diferencia respecto de develop: 0 commits detrás, 2 delante.
- Correcciones probadas y registradas: `87a263e8fd8933140a809489b566f96439ff1bb5`. Las pruebas se ejecutaron antes de este commit sobre el mismo contenido, identificado mediante hashes en el [resumen sanitizado](p0-07-auditoria-final-pr64.json).
- El commit documental posterior añade este informe y el resumen; no cambia el código probado. El SHA final publicado se obtiene del head de PR #64 y se informa en la entrega.
- Checkout original seguro: inicialmente sin cambios trackeados ni stage; se preservaron los untracked. No se creó otro worktree. `Team_8---CRM-integracion-facturacion` permaneció sin intervención.

## Hallazgos y correcciones

| ID / prioridad original | Evidencia y causa | Corrección y resultado |
| --- | --- | --- |
| F01 / P0 | `contractPlan()` calculaba cobertura sobre un prospecto leído antes del lock y reutilizaba esa lectura. PostgreSQL reprodujo contratación con domicilio desactualizado y sobrescritura de un `Perdido` recién confirmado. | Relectura bajo lock; comparación de empresa, ubicación e identidad; rechazo de pérdida, no factibilidad o activación sobrevenida; revalidación de plan/cotización dentro de la transacción. Ambos casos devuelven 409, sin contrato nuevo y preservando la operación concurrente. |
| F02 / P0 | PDF de cliente compartido usaba `cliente.empresa`, aunque la empresa del contrato fuera otra. Dos pruebas sobre bytes PDF reprodujeron el error. | Consulta mínima del nombre por `Contrato.idEmpresa`, usando la misma conexión transaccional. Ambas direcciones FiNet/Cable Mágico pasan. No cambia respuestas API ni documentos históricos. |
| F03 / P1 | Confirmación toma prospecto antes de contrato; firma actualiza contrato antes de prospecto. La prueba con tres conexiones observó contención real y fallo de una operación en el candidato inicial. | Lock del contrato con `NOWAIT`: si está ocupado devuelve conflicto 409 y libera prospecto, permitiendo finalizar la firma. Relectura y actualización condicional del contrato impiden sobrescribir una firma concurrente. PostgreSQL confirma una sola fila `Firmado`, firma informada y ningún error de bloqueo en la firma. No se cambió el flujo de firma ni G3. |
| F04 / P1 | La limpieza de PDF interpretaba una lectura sin fila como prueba de rollback, incluso tras terminar el callback y perder el resultado de COMMIT. Regresión con fallo inyectado demostró la eliminación insegura. | Si el callback terminó y el commit es incierto, conserva el archivo y registra `CONTRACT_PDF_CLEANUP_PENDING`. Fallos dentro del callback siguen limpiando únicamente el archivo propio. La incertidumbre se probó mediante mock, no mediante corte real de red PostgreSQL. |

No quedan P0 abiertos identificados dentro del alcance revisado. F01–F04 están corregidos. Se añadieron 14 regresiones unitarias y tres escenarios PostgreSQL; no se eliminaron escenarios válidos para obtener resultados verdes.

Se conservaron los intentos fallidos: 11 regresiones fallaban antes de las primeras correcciones; los tres escenarios PostgreSQL nuevos también fallaban. Posteriormente se reprodujo por separado el borrado ante commit incierto. Los errores intermedios de preparación/tipado se corrigieron y no cuentan como pruebas aprobadas. Logs anteriores conservados en `.codex-review/pr64-final-20261030/`.

## Revisión de implementaciones y consumidores

| Área | Comprobaciones |
| --- | --- |
| Prospectos y mapas | Empresa autorizada; respuestas tardías del mapa descartadas; cobertura comercial independiente de geocodificación; planes activos de la empresa y ubicación; cotización persistida; estados protegidos; lock compartido con actualización de ubicación. Coordenadas manuales no inventan comuna. |
| Cotizaciones / SMTP | `generateQuote()` conserva destinatario del prospecto autorizado y empresa del propio prospecto, también para administradores. PR #63 mantiene selección SMTP por empresa, sin fallback a credenciales de otra. La regresión de correo/cotización permanece. |
| Contratos y PDF | Consultas internas usan el cliente transaccional; generación con pool de una conexión; versiones concurrentes; apertura exclusiva y nombres únicos; auditoría transaccional; rollback; acceso por empresa; descarga de bytes históricos; F02/F04. |
| G3 | Preflight JWT/roles; suplemento explícito de comuna faltante con confirmación y auditoría, sin reescribir contrato firmado; contexto y relaciones empresa/contrato/prospecto/plan; snapshot/hash persistidos; diferencia entre POST 409 incompatible y GET cierre pendiente. GET pendiente no activa. |
| G1 y recuperación | Cierre G3 correlacionado antes de activación; equipo y asignación por OT/contrato/servicio/empresa en simulador; recuperación desde intención persistida; rollback de evento/auditorías; concurrencia; ACK perdido y respuesta tardía; no degradación de confirmación ni reactivación comercial duplicada. |
| Fiscal / G2 / cobros | PR #63 conserva autorización por pago/factura/contrato; identidad compartida; unicidad y folios por empresa/ambiente; idempotencia y respuestas inciertas. P0-07 no modifica estos módulos ni contratos S2S. |
| QA | Clúster vacío y capacidad atestada, credenciales sintéticas, bind loopback, bloqueo de conexiones externas, rutas de control autenticadas, entornos limpios y evidencia por run ID; simuladores fuera del arranque productivo. |

La nueva respuesta 409 de confirmación es un conflicto recuperable: actualizar la consulta y comprobar el estado antes de volver a confirmar. El frontend ya muestra el mensaje de error del backend; no requiere cambiar DTO, endpoint ni payload. Dos confirmaciones legítimas siguen reutilizando un contrato pendiente, según QA de cobertura. No hay regeneración de request/event IDs ni aceptación de hashes incompatibles.

## Resultados repetidos sobre el candidato corregido

| Validación | Resultado real |
| --- | --- |
| Backend completo | **1.372 PASS, 0 FAIL, 9 omitidas; 81 suites** |
| Dirigidas: fiscal, SMTP, pagos, G2, Libro Control, importación, G3/G1, prospectos, contratos, cobertura, identidad compartida | **1.030 PASS, 0 FAIL, 2 omitidas; 52 suites**; subconjunto del backend |
| Regresión inmediata de los archivos corregidos | **82/82 PASS**, tres suites; subconjunto del backend |
| Frontend | **54/54 PASS** |
| Herramientas / aceptación / seguridad QA / esquema / runtime | **82/82 PASS** |
| Backend build, frontend TypeScript y Vite | **PASS**; permanece advertencia de tamaño del bundle |
| Backend lint | **PASS**, sin errores |
| Frontend lint | **0 errores, 78 advertencias preexistentes** |
| Prisma generate y validate | **PASS**, sin base compartida ni migraciones |
| Manifiestos y locks raíz/backend/frontend | Consistentes entre sí y con las dependencias instaladas; no se cambiaron versiones ni se repitió `npm ci` en esta auditoría |
| CSV / XLSX | Parse CSV y roundtrip Excel **PASS**; ExcelJS 4.4.0 utiliza UUID 11.1.1 |
| Diff checks y revisión de secretos | **PASS**; detalles y límites abajo |

Los nueve tests omitidos por sus flags de integración están enumerados en el JSON. Los harness PostgreSQL separados sí se ejecutaron; no se reclasifican por ello como aprobados los nueve omitidos. Las cifras de la revisión anterior no sustituyeron ninguna ejecución indicada en esta tabla.

### PostgreSQL 18.6 local: 54 PASS, 0 FAIL

| Harness | Casos | Evidencia |
| --- | ---: | --- |
| Tributación | 17 | Migración en clúster vacío derivado, rollback/historial, catálogo fresco, ambas empresas/ambientes, folios, concurrencia e issuer con transporte simulado |
| Recuperación P0-05 | 8 | Rollback de cierre y auditorías, reinicio, conexiones independientes, confirmación sin reenvío, respuesta tardía e idempotencia G1 simulado |
| Instalación P0-07 | 10 | Comuna, roles, integridad de firma, dos solicitudes aisladas, detalle pendiente, 409 incompatible, cierre y asignación G1 por servicio |
| Cobertura/cotización | 7 | Plan propio y disponible, cotización persistida, bloqueos, confirmaciones concurrentes e interés conservado |
| PDF | 9 | Pools 1/5, versiones consecutivas y concurrentes, fallos de disco/insert/auditoría, descarga histórica, rechazo de empresa ajena |
| Nuevas carreras contractuales | 3 | Ubicación modificada, pérdida confirmada y firma concurrente, mediante conexiones independientes |

Todas las instancias propias terminaron con cleanup confirmado. Instalación dejó 2 efectos G1 simulados para los dos servicios probados; cobertura dejó 0 efectos G1. No se usaron endpoints ni credenciales operativos.

**Los dos PASS tributarios que reproducen factura pagada/cuotas pendientes confirman la existencia del problema; no lo solucionan.** Convenios continúa **FAIL funcional / BLOQUEADO por decisión comercial**, conforme a [la política vigente](../i4-convenios-decision-comercial.md).

### Reproducción

En entorno QA limpio, sin dotenv privados y con proveedores deshabilitados, usar los comandos y barreras del [informe de integración](20-integracion-develop-pr64.md). Esta ejecución empleó un proceso con allowlist de variables, URL sintética inutilizable para los tests unitarios, bloqueo de lectura dotenv privada y sockets externos. Cada harness creó su propia capacidad PostgreSQL y URL efímera; nunca reutilizó `DATABASE_URL` operacional.

Comandos adicionales de la corrección (desde raíz, PostgreSQL 18 instalado en la ruta Windows documentada por los harness):

```powershell
npm --prefix backend run build
npm --prefix backend test -- --runInBand prospects-quote-flow.spec.ts prospects.service.spec.ts contracts-pdf.spec.ts
node scripts/p0-07-contract-concurrency-qa.cjs
```

Comandos de regresión repetidos mediante el wrapper aislado: Jest completo y dirigido; `node --test frontend/tests/*.test.mjs`; las 11 suites de herramientas listadas en 20; Nest build; `tsc -b`; Vite build; ESLint sin `--fix`; Prisma generate/validate; `i4-tax-postgresql-qa.cjs`, `p0-05-postgresql-qa.cjs`, `p0-07-demo-qa.cjs --installation-flow`, `--coverage-flow` y `p0-07-pdf-qa.cjs`. Los logs y hashes están conservados localmente; el JSON versionado contiene únicamente resultados sanitizados y referencias.

## Inventario de los 52 archivos originales frente a develop

El inventario se obtuvo del HEAD inicial exacto. Los seis archivos de corrección son cinco entradas existentes de esta tabla y el nuevo harness. Este informe y su JSON son dos archivos documentales adicionales: el diff final suma **55 archivos**, no 52.

| Archivo | Propósito revisado |
| --- | --- |
| `backend/src/contracts/contracts-pdf.spec.ts` | Regresión de contenido, transacción y archivos PDF |
| `backend/src/contracts/contracts.service.ts` | Generación, versionado y descarga de contratos |
| `backend/src/g3-integration/g3-integration.controller.ts` | Preflight y suplemento autenticados |
| `backend/src/g3-integration/g3-integration.dto.ts` | Validación de comuna y confirmación explícita |
| `backend/src/g3-integration/http-g3-integration.client.spec.ts` | Wrappers, company scope y errores HTTP |
| `backend/src/g3-integration/http-g3-integration.client.ts` | Adaptador G3 y distinción de conflictos |
| `backend/src/g3-integration/installation-integration.service.spec.ts` | Correlación, preflight, permisos y reintentos |
| `backend/src/g3-integration/installation-integration.service.ts` | Contexto, comuna y conciliación segura |
| `backend/src/prospects/prospects-quote-flow.spec.ts` | Cotización, contratación y concurrencia |
| `backend/src/prospects/prospects.service.spec.ts` | Regresión comercial y correo por empresa |
| `backend/src/prospects/prospects.service.ts` | Proyección de cotizaciones, cobertura y contratación |
| `docs/entrega-final/01-estado-final.md` | Estado académico histórico |
| `docs/entrega-final/02-manual-instalacion.md` | Instalación y condiciones de entorno |
| `docs/entrega-final/03-guion-demostracion.md` | Recorrido de aceptación |
| `docs/entrega-final/04-evidencias-validacion.md` | Evidencias y límites históricos |
| `docs/entrega-final/05-dependencias-intergrupos.md` | Dependencias y responsables G1/G2/G3 |
| `docs/entrega-final/06-riesgos-y-criterios-go-no-go.md` | Seguridad e incidentes históricos |
| `docs/entrega-final/07-acta-aislamiento-demo-qa.md` | Condiciones de aislamiento |
| `docs/entrega-final/08-protocolo-ejecucion-y-evidencias.md` | Protocolo de aceptación |
| `docs/entrega-final/09-bitacora-demo.csv` | Bitácora; no certificación automática de UI |
| `docs/entrega-final/10-checklist-publicacion.md` | Controles de publicación |
| `docs/entrega-final/11-resumen-publicable-borrador.md` | Resumen académico histórico |
| `docs/entrega-final/12-resultados-demo-qa.md` | Resultados HTTP históricos |
| `docs/entrega-final/13-correccion-pdf-transaccion-qa.md` | Diagnóstico PDF y evidencia previa |
| `docs/entrega-final/14-demostracion-manual-operador.md` | Separación de aceptación manual |
| `docs/entrega-final/15-datos-qa-y-guion-definitivo-20261028.md` | Datos sintéticos y guion |
| `docs/entrega-final/16-railway-readonly-y-plan-e2e-20261028.md` | Evidencia remota histórica; no repetida aquí |
| `docs/entrega-final/17-cobertura-cotizacion-contratacion-20261028.md` | Correcciones y validación comercial |
| `docs/entrega-final/18-instalacion-comuna-conflicto-g3-qa.md` | Incidentes G3 QA y solución previa |
| `docs/entrega-final/19-consolidacion-publicacion-p0-07.md` | Publicación antes de integrar develop |
| `docs/entrega-final/20-integracion-develop-pr64.md` | Integración PR #63 y baseline anterior |
| `docs/entrega-final/p0-07-validacion-integracion-pr64.json` | Resumen previo sanitizado |
| `docs/entrega-final/p0-07-validacion-publicacion.json` | Resumen de publicación inicial |
| `frontend/src/api.ts` | Tipos y métodos de preflight/suplemento |
| `frontend/src/features/coverage/CommercialCoveragePicker.tsx` | Mapa, respuestas tardías y cobertura por empresa |
| `frontend/src/features/coverage/CoverageZonesPanel.tsx` | Visualización de zonas y aviso de teselas |
| `frontend/src/features/coverage/coverage.css` | Presentación de avisos del mapa |
| `frontend/src/features/installations/G3InstallationStatus.tsx` | Seguimiento, preflight y comuna faltante |
| `frontend/src/features/prospects/ProspectWorkflowPanel.tsx` | Continuidad de plan/cotización/contratación |
| `frontend/tests/coverage-geocoding.test.mjs` | Geocodificación y separación de cobertura |
| `frontend/tests/coverage-quote-workflow.test.mjs` | Planes y continuidad del flujo |
| `frontend/tests/g3-installation-data.test.mjs` | Mensajes y suplemento de instalación |
| `scripts/p0-07-coverage-flow-qa.cjs` | Escenarios HTTP de cobertura/cotización |
| `scripts/p0-07-demo-qa.cjs` | Orquestación de backend y PostgreSQL aislados |
| `scripts/p0-07-demo-qa.test.cjs` | Regresión de simuladores y aislamiento |
| `scripts/p0-07-installation-flow-qa.cjs` | Escenarios HTTP G3/G1 |
| `scripts/p0-07-pdf-qa.cjs` | Procesos independientes y fallos PDF reales |
| `scripts/p0-07-qa-fixtures.cjs` | Fixtures sintéticos, sin datos operativos |
| `scripts/p0-07-qa-http-check.cjs` | Pruebas HTTP auxiliares, distintas de UI |
| `scripts/p0-07-qa-network.cjs` | Allowlist de puertos loopback y redirecciones bloqueadas |
| `scripts/p0-07-qa-prepare.cjs` | Preparación QA mediante flujos normales |
| `scripts/p0-07-qa-providers.cjs` | Simulación G1/G3, idempotencia y correlación |

## Seguridad y preservación

Se verificó por SHA-256 que **66 archivos preexistentes** conservaron sus bytes: `-f`, `output/`, respaldos ignorados, dotenv privados y evidencias anteriores. Los nuevos logs, PDFs, DB temporales y evidencia cruda permanecen fuera del commit. Los documentos 01–20 y sus resúmenes históricos no se sobrescribieron.

Escaneo contextual del candidato: ninguna clave operativa, clave privada ni ruta privada incorporada detectada. Las 11 coincidencias de reglas fueron fixtures de tests, ejemplos sintéticos loopback y documentación ya revisada. No se publicaron valores sensibles. Es un escaneo dirigido, no una certificación universal ni un nuevo examen completo del historial. Los incidentes de dumps/bootstrap y su eventual revocación siguen bajo responsabilidad del propietario, según 06.

## Pendientes de aceptación y despliegue

| Prioridad / tipo | Pendiente, evidencia y acción | Responsable sugerido |
| --- | --- | --- |
| P1 / política comercial | Cuotas pendientes con factura pagada: reproducido en dos escenarios fiscales. Ratificar imputación pago→cuotas; no modificar históricos ni automatizar sin aprobación. | Encargado comercial G8 / profesor |
| P1 / configuración privada | SMTP y perfiles fiscales por empresa, TLS, remitentes y autorización fiscal: local simulado aprobado; pruebas operativas acotadas pendientes. | Operador G8 y responsables de proveedores |
| P1 / contratos externos | E2E real G1/G2/G3 con datos QA ratificados. Los simuladores demuestran lógica local, no disponibilidad ni garantías del proveedor real. No alterar acuerdos congelados. | Responsables G1/G2/G3/G8 |
| P1 / infraestructura | VPS, almacenamiento persistente de PDFs, backup, readiness y aplicación autorizada del plan tributario. No se consultó ni cambió infraestructura; preservar el despliegue existente G3. | Infraestructura y DBA |
| P1 / seguridad histórica | Evidencia de cierre de incidentes históricos y tratamiento de respaldos antes de una distribución más amplia. Esta PR no añade dumps ni los elimina. | Propietario del repositorio |
| P1 / aceptación | Recorrido visual del candidato integrado. Las pruebas actuales son unitarias, HTTP y PostgreSQL; no se abrió navegador ni se generaron capturas nuevas. | QA G8 / profesor |
| P2 / operación PDF | Ante COMMIT incierto, inspeccionar `CONTRACT_PDF_CLEANUP_PENDING`, fila/hash/archivo antes de cualquier eliminación. No existe limpieza automática nueva. Inyección real de pérdida de conexión sigue pendiente. | Operador / QA |
| P2 / QA | Nueve tests opt-in omitidos; simulador cubre una ONT por orden, no certifica inventarios multiequipo reales. Mantener estos límites explícitos. | QA G8 |
| P2 / mantenimiento | 78 advertencias frontend y bundle grande; sin error nuevo ni ampliación de alcance en esta revisión. | Equipo frontend |
| Diferido acordado | WhatsApp conserva código/configuración y permanece deshabilitado; no es criterio académico obligatorio. | Propietario de credenciales |

La evidencia permite integrar la corrección a develop, conservando revisión humana y protecciones de GitHub. El estado de checks remotos debe comprobarse tras el push: un estado vacío no equivale a CI aprobada. La descripción anterior de PR #64 contenía cifras previas y requería actualización; si la integración GitHub mantiene su 403, usar este informe como evidencia vigente y actualizar la descripción por un mantenedor autorizado, sin eludir permisos.

**No se efectuaron escrituras compartidas, emisiones fiscales, correos reales, llamadas a Railway/VPS/proveedores, migraciones externas, merge a develop ni despliegue.**
