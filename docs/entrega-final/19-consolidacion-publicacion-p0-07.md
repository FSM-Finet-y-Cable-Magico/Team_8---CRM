# P0-07 — Consolidación para PR Draft

Revisión final: 29-10-2026. Rama `docs/i4-p0-07-cierre-entrega`, base `a8d2598151c988ef8f4f4a09977fe36167d79f62` (P0-06). La rama de Facturación.cl/SMTP se integra por separado y no se modificó en esta intervención.

**QA local aprobado; ACADEMIC_CONDITIONAL; RELEASE_READY=false.** Este informe reúne código y documentación P0-07 para revisión. No autoriza merge, despliegue ni uso productivo.

## Correcciones preservadas

- **PDF de contrato:** lectura del contrato, precio, versión y auditoría dentro de la misma transacción. Evita esperar una conexión adicional mientras la transacción ocupa el pool. Archivo exclusivo con UUID, limpieza solo del archivo propio tras rollback confirmado y conservación si el commit pudo haberse persistido. Las descargas históricas mantienen sus bytes.
- **Cobertura y cotización:** zonas activas de la empresa visibles en el mapa, mensajes cuando faltan tiles, centrar zonas sin mover el domicilio, consulta comercial aun con edición bloqueada y cotizaciones persistidas para recuperar planes al reabrir el flujo. Nominatim no acredita cobertura ni infiere comuna.
- **Contratación:** exige cotización factible y plan activo de la empresa disponible en la ubicación; serializa confirmaciones y reutiliza el contrato pendiente. Rechaza duplicar contratos confirmados. La actualización genérica de ubicación se bloquea cuando ya existe contrato.
- **Comuna faltante:** preflight autenticado antes de G3 y complemento explícito por Comercial/Administración, confirmado como la misma dirección. Solo cambia la comuna faltante del prospecto y registra auditoría transaccional; no modifica contrato, dirección, coordenadas, firma ni PDF. Rechaza otra empresa, Soporte, comuna ya existente, otros contratos y tracking previo.
- **G3:** diferencia conflicto de POST idempotente de conflicto de consulta GET. Un cierre aún no disponible solo se reconoce como pendiente después de comprobar estado y correlación independientes; no activa nada. Errores de consulta conservan status y mensaje sanitizado, sin exponer el body externo.
- **QA G1/G3:** solicitudes y snapshots estables, cierre simulado explícito, replay sin efecto duplicado y equipos separados por servicio/serie. Los contratos productivos de los proveedores no se modifican.

## Validación nueva de esta consolidación

Entorno Windows, Node 22.19.0, PostgreSQL 18 local para los recorridos integrados. Las pruebas generales recibieron variables sintéticas y guardas contra lectura de dotenv privado y sockets externos. No se reutilizaron credenciales ni sesiones anteriores. Dependencias existentes; los manifiestos/locks no se cambiaron.

| Validación | Resultado |
| --- | --- |
| Backend completo | **1.277 PASS, 0 FAIL, 8 omitidas**, 81 suites aprobadas |
| Dirigidas G1/G3, contratos/PDF, prospectos, cobertura, clientes y empresas | **586 PASS, 0 FAIL, 1 omitida**, 32 suites |
| Frontend completo | **54/54 PASS** |
| Herramientas globales, runtime, higiene y guardas/simuladores P0-05/P0-07 | **36/36 PASS** |
| Build backend; TypeScript frontend; Vite | PASS; Vite avisa de bundle mayor de 500 kB |
| Lint backend/frontend | Sin errores; 78 advertencias frontend existentes |
| Prisma validate / generate | PASS / PASS; sin conexión a base compartida |
| PostgreSQL QA: instalación | **10/10 PASS**, cleanup confirmado |
| PostgreSQL QA: cobertura/cotización/contratación | **7/7 PASS**, cleanup confirmado |
| PostgreSQL QA: PDF | **9/9 PASS**, cleanup confirmado |
| `git diff --check` / `git diff --cached --check` | PASS |

No sumar suites dirigidas y completas como casos únicos. Las ocho omitidas requieren una base optativa ajena a la suite unitaria; no se habilitaron contra ninguna base compartida. Los 26 escenarios integrados de esta revisión sí usaron PostgreSQL QA nuevo y exclusivo.

Prisma generate tuvo un primer fallo Windows EPERM al reemplazar la DLL mientras había pruebas en ejecución. Se repitió después de que finalizaran, con éxito; no se detuvieron procesos ajenos. El proceso de sandbox no podía iniciarse por permisos: la ejecución autorizada con el usuario propietario mantuvo variables sintéticas y las restricciones de red.

El resumen de resultados, casos y run IDs se versiona en [p0-07-validacion-publicacion.json](p0-07-validacion-publicacion.json). Los logs completos quedan en `.codex-review/p007-publication/`, fuera de Git.

## Garantías comprobadas y límites

- Rechazo HTTP de empresa ajena y Soporte para completar comuna; confirmación explícita obligatoria. El contrato firmado y las cotizaciones conservan sus hashes durante el complemento.
- Sin comuna no se crea tracking. Sin cierre G3 aprobado no se crean cliente/servicio por ese flujo. Consultar un cierre pendiente no produce el antiguo 500 ni un falso conflicto de request_id.
- Dos solicitudes tienen distintas referencias; retry idéntico conserva snapshot y hash; payload incompatible mantiene HTTP 409. Repetir cierre o conciliación conserva filas y efectos G1.
- Cada servicio activado obtiene su unidad simulada propia, empresa, cliente y contrato correlacionados. Esto no certifica disponibilidad, inventario ni idempotencia de G1 real.
- PDF: pools 1/5, versiones consecutivas, dos procesos concurrentes, fallo de disco, fallo de documento/auditoría, rollback, hashes y descarga histórica. No se modificaron registros o PDFs productivos.
- Cobertura: planes por empresa, rechazo de plan ajeno/inactivo/sin cotización, dos confirmaciones concurrentes producen un único contrato pendiente y no se alteran zonas/precios.
- Se conserva la evidencia visual comunicada por el operador durante 28–29 de octubre como antecedente; **esta consolidación no ejecutó navegador ni añadió capturas visualmente verificadas**. No se convierte HTTP PASS en validación visual ni ACADEMIC_GO.

## Seguridad y selección de archivos

Se revisaron los 17 archivos versionados modificados, las tres pruebas nuevas, los diez scripts QA y los 18 documentos/bitácora del paquete histórico. No se agregó ningún directorio indiscriminadamente. La lista final incluye además este informe y el resumen JSON sanitizado.

Se retiraron de la documentación publicable rutas absolutas a archivos privados temporales, conservando los originales en `.codex-review/p007-publication/docs-originals/`. Los valores de credenciales no se copiaron. Los informes históricos siguen identificados como tales y remiten a este cierre; sus sesiones con TTL vencido no deben reutilizarse.

El escaneo dirigido de secretos del candidato no encontró tokens operativos ni claves privadas. Sus coincidencias quedaron limitadas a fixtures sintéticas y ejemplos preexistentes de tests. La revisión no certifica ausencia universal de secretos ni saneamiento del historial: los incidentes históricos documentados requieren tratamiento del propietario.

Excluidos y preservados localmente:

- `-f`, `output/**`, dumps y respaldos, dotenv privados, certificados, logs y dependencias.
- `.codex-review/**`, incluidos runners, copias documentales originales y logs de esta revisión.
- `docs/entrega-final/evidencias-qa/**`: PDFs, CSV exportados, manifiestos y JSON crudos de sesiones históricas/nuevas. Se revisaron como artefactos de ejecución separados; no se publican ni se borran. Sus enlaces en documentos históricos son referencias locales, no anexos distribuidos en esta PR.
- No se incluyeron archivos de Facturación.cl/SMTP ni cambios del otro worktree.

## Reproducción y pendientes

Los tres harness QA versionados crean una instancia exclusiva, validan su identidad antes de cargar el SQL canónico y comprueban cleanup. Ejecutarlos solo con los binarios PostgreSQL 18 y builds correspondientes a esta rama, desde un proceso sin credenciales operativas heredadas:

```powershell
node --test scripts/p0-07-demo-qa.test.cjs scripts/p0-05-qa-isolation.test.mjs
node scripts/p0-07-demo-qa.cjs --coverage-flow
node scripts/p0-07-demo-qa.cjs --installation-flow
node scripts/p0-07-pdf-qa.cjs
```

No apuntan a una URL de DB proporcionada por el operador. No reutilizar el modo `--baseline` para validar la corrección; ese modo existe para reproducir la condición antigua esperada.

Pendientes para merge/entrega:

1. Después de fusionar la PR separada de Facturación.cl/SMTP, actualizar P0-07 respecto del nuevo develop **con autorización** y repetir las regresiones afectadas, especialmente cotizaciones/correo, dependencias y acceptance. No se realizó esa actualización aquí.
2. Revisión humana de endpoints suplementarios, documentos y de la política de complemento sin cambio contractual.
3. Evidencias visuales finales del operador, publicación académica revisada y aceptación de los límites intergrupos.
4. Proveedores reales, infraestructura y producción permanecen pendientes. Los cambios de esquema, reparaciones G3 y políticas tributarias de la otra rama no se resuelven en este paquete.

## Archivos incluidos

- backend/src/contracts/contracts-pdf.spec.ts
- backend/src/contracts/contracts.service.ts
- backend/src/g3-integration/g3-integration.controller.ts
- backend/src/g3-integration/g3-integration.dto.ts
- backend/src/g3-integration/http-g3-integration.client.spec.ts
- backend/src/g3-integration/http-g3-integration.client.ts
- backend/src/g3-integration/installation-integration.service.spec.ts
- backend/src/g3-integration/installation-integration.service.ts
- backend/src/prospects/prospects-quote-flow.spec.ts
- backend/src/prospects/prospects.service.spec.ts
- backend/src/prospects/prospects.service.ts
- docs/entrega-final/01-estado-final.md
- docs/entrega-final/02-manual-instalacion.md
- docs/entrega-final/03-guion-demostracion.md
- docs/entrega-final/04-evidencias-validacion.md
- docs/entrega-final/05-dependencias-intergrupos.md
- docs/entrega-final/06-riesgos-y-criterios-go-no-go.md
- docs/entrega-final/07-acta-aislamiento-demo-qa.md
- docs/entrega-final/08-protocolo-ejecucion-y-evidencias.md
- docs/entrega-final/09-bitacora-demo.csv
- docs/entrega-final/10-checklist-publicacion.md
- docs/entrega-final/11-resumen-publicable-borrador.md
- docs/entrega-final/12-resultados-demo-qa.md
- docs/entrega-final/13-correccion-pdf-transaccion-qa.md
- docs/entrega-final/14-demostracion-manual-operador.md
- docs/entrega-final/15-datos-qa-y-guion-definitivo-20261028.md
- docs/entrega-final/16-railway-readonly-y-plan-e2e-20261028.md
- docs/entrega-final/17-cobertura-cotizacion-contratacion-20261028.md
- docs/entrega-final/18-instalacion-comuna-conflicto-g3-qa.md
- docs/entrega-final/19-consolidacion-publicacion-p0-07.md
- docs/entrega-final/p0-07-validacion-publicacion.json
- frontend/src/api.ts
- frontend/src/features/coverage/CommercialCoveragePicker.tsx
- frontend/src/features/coverage/CoverageZonesPanel.tsx
- frontend/src/features/coverage/coverage.css
- frontend/src/features/installations/G3InstallationStatus.tsx
- frontend/src/features/prospects/ProspectWorkflowPanel.tsx
- frontend/tests/coverage-geocoding.test.mjs
- frontend/tests/coverage-quote-workflow.test.mjs
- frontend/tests/g3-installation-data.test.mjs
- scripts/p0-07-coverage-flow-qa.cjs
- scripts/p0-07-demo-qa.cjs
- scripts/p0-07-demo-qa.test.cjs
- scripts/p0-07-installation-flow-qa.cjs
- scripts/p0-07-pdf-qa.cjs
- scripts/p0-07-qa-fixtures.cjs
- scripts/p0-07-qa-http-check.cjs
- scripts/p0-07-qa-network.cjs
- scripts/p0-07-qa-prepare.cjs
- scripts/p0-07-qa-providers.cjs
