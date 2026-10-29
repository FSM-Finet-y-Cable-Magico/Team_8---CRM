# Evidencias ejecutadas y límites

> Consolidación 29-10-2026: este documento conserva resultados y sesiones históricas. El estado de publicación vigente está en [19](19-consolidacion-publicacion-p0-07.md). Las sesiones con TTL vencido no deben reutilizarse. Las referencias a `evidencias-qa/` corresponden a archivos locales preservados, excluidos de este PR; el resumen automatizado publicable está en [validación](p0-07-validacion-publicacion.json). La distribución académica y la certificación productiva siguen separadas de esta PR.

Fecha de verificación P0-07: 26-10-2026. Base:
`a8d2598151c988ef8f4f4a09977fe36167d79f62`.
Solo documentación nueva; no modificación de código productivo ni de tests.

## 1. Resultados nuevos de P0-07

| Comando / comprobación | Resultado observado | Lo que no demuestra |
| --- | --- | --- |
| `npm run test:i3-release -- --output-dir <temporal>` | Exit 0; 16 grupos PASS, 0 FAIL, 13 BLOCKED; RELEASE_READY=false | No ejecuta las verificaciones externas/operativas bloqueadas |
| Backend completo dentro del runner | **1.247 PASS, 0 FAIL, 8 SKIP**, 80 suites aprobadas | No conecta a DB compartida; ocho casos optativos no ejecutados |
| SMTP dentro del backend | 27 PASS, incluido TLS y configuración OpenSSL independiente | No envío ni recepción real |
| `npm --prefix frontend test` | **44 PASS** | Pruebas de componentes; no recorrido de navegador |
| `npm run test:global-tools` | **26 PASS** | Verificadores/fixtures, no catálogo productivo actual |
| `node --test scripts/p0-05-qa-isolation.test.mjs` | **4 PASS** | Barreras de aislamiento; no repite los ocho escenarios PostgreSQL |
| Runtime frontend dentro del runner | **3 PASS** | Inspección estática, no Nginx ejecutado |
| Prototipo DTE dentro del runner | PASS | No emisión fiscal real |
| `git fsck --connectivity-only --no-reflogs` | Exit 0 | No certifica ausencia de secretos ni autorización de distribución |
| `git diff --check` y revisión de enlaces locales | PASS al cerrar el paquete | No sustituyen aceptación comercial |

Los SKIP corresponden a CRM, commercial, coverage, external-tax-documents
PostgreSQL y local-db-bootstrap. No se habilitaron contra `.env` o DB existente.
No se ejecutaron migraciones, seeds, pagos ni envíos externos.

Resultados y escáner saneado fuera del repositorio:
`<ruta-temporal-local-no-publicada>`.
Archivos relevantes: `release/local-acceptance.json`, `release/runner/i3-jest.json`,
`frontend.log`, `tools.log`, `isolation.log`, `security-summary.json` y
`security-audit.cjs`. Son temporales; no se añaden a Git. Antes de una entrega
formal, el responsable puede conservar una copia saneada en el repositorio de
evidencias autorizado. No compartir logs sin revisión.

SHA-256 de salidas registrado por el runner:

| Check | SHA-256 |
| --- | --- |
| BACKEND_UNIT | `a3b247849b3ec59d7821da8fc880da2149de3f83a79cdf498c3e5801f9fa4146` |
| GLOBAL_TOOLS | `bd25afac28beca5b5690f68a98d4c76fb5302e0adf2e00fa357592d3820fcded` |
| FRONTEND_CONFIG | `a6ec3f5c155b8c6718adb125d898f7f19f2e46b3651de0ba12afcd3f94157e75` |
| DTE_PROTOTYPE | `d42bf648279c74d3b3bb2bbefa8a26d2516f2f0ebe0a3bbe94c2971f573e5d2b` |

## 2. Evidencia previa reutilizada

| Fuente | Garantía específica | Relación con P0-07 |
| --- | --- | --- |
| [P0-02](../i4-p0-02-tickets-autoridad-g3.md) | Ticket+auditoría atómicos; autoridad de OT G3; HTTP 410 tras autorización | Pruebas incluidas en backend actual, sin modificar los contratos |
| [P0-03](../i4-p0-03-cobranza-compartida-g2.md) | Empresa contractual, cliente compartido, saldos/replay y protección global | Pruebas repetidas; concurrencia financiera PostgreSQL no acreditada por P0-05 |
| [P0-04](../i4-p0-04-reactivacion-g3.md) | Reactivación exige evidencia G3 correlacionada | Regresión actual PASS; no reactivar clientes históricos |
| [P0-05 recuperación](../i4-p0-05-recuperacion-post-cierre-g3.md) | Intención durable, reintentos, auditorías, fencing de intentos | Regresión actual PASS; continúa bajo demanda |
| [P0-05 PostgreSQL QA](../i4-p0-05-postgresql-qa.md) / [JSON](../i4-p0-05-postgresql-qa.evidence.json) | 8 escenarios reales locales: rollback, proceso nuevo, auditorías, concurrencia, G1 confirmado, respuesta tardía, multiempresa y ACK perdido | **Evidencia existente**, no ejecución nueva P0-07. QA_PASS, cleanup=true, base 552f4280; implementación sin cambios posteriores en P0-06/P0-07 |
| [P0-06](../i4-p0-06-release-candidate.md) | Corrección de fechas/CU-86/OpenSSL, builds y lint | Builds/lint no repetidos en esta etapa documental; los resultados se atribuyen a P0-06 |

No se copiaron informes ni se sobrescribieron JSON históricos. Los 13 BLOCKED del
runner I3 son su frontera de ejecución, no trece defectos nuevos. Su reconciliación
detallada con evidencia posterior está en P0-06, sección 5.

## 3. Capturas y pantallas

**Capturas nuevas verificadas: 0. Pantallas ejecutadas en navegador en P0-07: 0.**
No se afirma que una pantalla funciona solo porque tiene tests de componentes.
No se reutilizaron imágenes de `output/` como si fueran evidencia sintética actual:
su origen y posible contenido personal requieren revisión separada.

| Tomas propuestas | Paso del guion | Estado actual |
| --- | --- | --- |
| CAP-01 / CAP-02 | Login, roles y empresas | PENDIENTE, sin archivo |
| CAP-03 / CAP-04 / CAP-05 | Prospecto, cotización y contrato | PENDIENTE, sin archivo |
| CAP-06 / CAP-07 / CAP-08 | Solicitud/cierre G3 simulado, servicio y G1 | PENDIENTE, sin archivo |
| CAP-09 / CAP-10 / CAP-11 | Compartido, pagos y reactivación | PENDIENTE, sin archivo |
| CAP-12 / CAP-13 / CAP-14 | Tickets, inventario simulado, reportes y auditoría | PENDIENTE, sin archivo |
| CAP-15 | Recuperación tras fallo | PENDIENTE de presentación visual; evidencia de servicios disponible en P0-05 |

Para verificar una toma: ejecutar el paso, inspeccionar el archivo, comprobar
fecha/SHA/empresa/rol y resultado, revisar redacción de datos sensibles y calcular
hash del archivo final. Solo entonces registrar PASS y enlace. Capturas de errores
también son evidencia válida de un FAIL; no reemplazarlas por resultados esperados.

## 4. Correspondencia para el informe académico

| Requisito/CU | Resultado defendible | Prueba | Toma futura | Sección de entrega |
| --- | --- | --- | --- | --- |
| CU43/44/45 | Guards/roles y aislamiento local PASS; UI pendiente | roles, users, company-response HTTP | CAP-01/02 | 01 matriz; 03 D01–02 |
| CU01/02/03/04/74 | Reglas/PDF locales; recorrido integral pendiente | prospects, contracts, contracts-pdf | CAP-03–05 | 03 D03–05 |
| CU07/17/20/59 | G8 QA PASS; intergrupo real parcial | G3 + PostgreSQL P0-05 | CAP-06–08 | 05 G3/G1 |
| CU64/65 y cobranza | Relaciones/finanzas locales PASS | customers, services, billing, G2 compartido | CAP-09–11 | 01 matriz; 03 D09–11 |
| CU21/23–26, CU75/76 | Seguimiento local PASS; reparación bloqueada | tickets-authority HTTP | CAP-12 | 05 contrato pendiente |
| CU53/62 y G1 | Contrato local/simulador; físico real pendiente | G1 adapter/activation/inventory | CAP-13 | 05 G1 |
| CU33/46/68 | Reportes y auditoría locales PASS | reports, commercial-control-book, recovery | CAP-14 | 03 D14 |
| P0-05 | Recuperación PostgreSQL local PASS | 8 escenarios y JSON existentes | CAP-15 | 04 evidencia previa; 06 límites |

Esta correspondencia no adjudica cumplimiento a CU no evaluados ni reemplaza la
Definición de Terminado del documento académico. La aceptación final corresponde
al evaluador y debe registrar expresamente las excepciones externas.
