# P0-07 — Integración de develop y validación de PR #64

29-10-2026, America/Santiago. **QA_LOCAL_READY=true; RELEASE_READY=false.**

Se integró `origin/develop` **6185c22d8a81897dc9e8878ee89301c2089a91c6**, posterior a PR #63, sobre `docs/i4-p0-07-cierre-entrega`, cuyo commit anterior era **e02bbfa4bd19602632470973ba9bbc6ef2dbbd9d**. La publicación corresponde a la [PR #64 existente](https://github.com/FSM-Finet-y-Cable-Magico/Team_8---CRM/pull/64), sin fusionarla a develop ni desplegar.

Este informe actualiza la validación del candidato integrado; no reemplaza ni altera las evidencias históricas de los documentos 01–19. Resultados estructurados y hashes de evidencia: [p0-07-validacion-integracion-pr64.json](p0-07-validacion-integracion-pr64.json).

## Resolución y cambios efectivos

- **Cero conflictos textuales.** Git fusionó automáticamente `prospects.service.ts` y `prospects.service.spec.ts`. Se revisaron contra ambos padres: permanecen cobertura y planes autorizados, cotización persistida, confirmación bajo bloqueo, reutilización del contrato pendiente y protección del contrato firmado.
- Se conserva el cambio SMTP de #63: la cotización utiliza `prospect.idEmpresa`, incluso para un administrador cuya empresa principal es diferente. Se conserva su prueba de regresión y el resultado `not_configured` cuando falta atribución empresarial.
- Los 64 archivos entrantes pertenecen a develop/#63. Se revisaron también los archivos fusionados automáticamente, manifiestos, locks, migración tributaria, contrato canónico, verificadores y herramientas de release.
- **Único ajuste adicional al código del harness:** `scripts/p0-07-demo-qa.cjs` y `scripts/p0-07-pdf-qa.cjs` sustituyen el hash canónico antiguo fijado en línea por `parseGlobalSchema(schema)`. Se mantiene el control SHA-256 central vigente; no se omiten verificaciones ni se introducen excepciones al catálogo físico.
- Esta integración no añadió cambios de lógica productiva a los ya revisados en ambos padres. El diff respecto del P0-07 anterior en los módulos G1, G2 y G3 es vacío: permanecen sus endpoints, payloads, idempotencia y validaciones acordadas.

## Resultados ejecutados

| Validación | Resultado real |
| --- | --- |
| Backend completo | **1.358 PASS, 0 FAIL, 9 omitidas**, 81 suites aprobadas |
| Backend dirigido: tributación, SMTP, pagos, G2, Libro Control, importación, G3/G1, prospectos, contratos, cobertura y clientes compartidos | **1.016 PASS, 0 FAIL, 2 omitidas**, 52 suites aprobadas; subconjunto de la suite completa |
| Frontend | **54/54 PASS** |
| Herramientas: esquema, entorno, seguridad del harness, aceptación, DTE, runtime e aislamiento QA | **82/82 PASS** |
| Builds backend, TypeScript frontend y Vite | **PASS**; Vite conserva aviso de bundle mayor de 500 kB |
| Prisma generate / validate | **PASS**, sin consultar una base de datos |
| Lint | **0 errores** backend/frontend; 78 advertencias frontend preexistentes |
| Dependencias | `npm ci --ignore-scripts` aprobado en raíz, backend y frontend; árbol final restaurado mediante el lock del workspace |
| CSV / Excel | Lectura CSV y roundtrip XLSX **PASS**; ExcelJS 4.4.0 resuelve UUID 11.1.1 |
| Diff / índice / seguridad | Sin conflictos; diff checks aprobados; exclusión de artefactos y revisión de coincidencias del escaneo |

Los nueve casos omitidos requieren habilitación explícita de suites PostgreSQL heredadas: bootstrap, CRM, comercial, cobertura, cuatro de documentos tributarios externos y uno de preparación tributaria. **No se presentan como ejecutados.** Los ensayos aislados siguientes son evidencia adicional independiente.

La caché npm inicial estaba incompleta; las instalaciones se completaron desde el registro público con configuraciones npm privadas excluidas. Se descargó el motor oficial de Prisma separadamente. Una primera pasada de herramientas, iniciada antes de terminar la generación de Prisma, falló por cliente no generado; después de generar se repitió y aprobó 82/82. No fue necesaria una corrección de producto. No se ocultan estos intentos preparatorios.

## PostgreSQL 18 aislado: 51 casos aprobados

| Recorrido | Casos | Evidencia y garantía |
| --- | ---: | --- |
| Tributación, esquema y SMTP simulado | **17** | Instalación nueva y upgrade sobre definición anterior; preservación de historial, rollback DDL, verificador físico, empresa/ambiente, folios, unicidad por pago, cliente compartido, concurrencia e idempotencia. Pipeline fiscal y correo con transportes simulados |
| Instalación G3 → activación G8 → G1 | **10** | Comuna obligatoria, corrección autorizada sin cambiar contrato firmado, dos contratos aislados, snapshot inmutable, 409 conservado, consulta pendiente sin 500, cierre simulado y equipos distintos por servicio |
| Cobertura → cotización → contratación | **7** | Aislamiento empresarial, planes autorizados, PDF, persistencia tras nuevo login, confirmaciones concurrentes sin duplicar contrato y ubicación controlada |
| Contrato PDF | **9** | Pools de 1/5 conexiones, versiones sucesivas y concurrentes, fallos de archivo/documento/auditoría con rollback, descarga histórica y denegación empresarial |
| Recuperación P0-05 | **8** | Rollback del evento y auditorías, caída/reinicio antes de G1, conexiones independientes, ACK perdido, respuesta tardía y cliente compartido |

Cada harness creó clústeres nuevos y propios, verificó su identidad y usó datos sintéticos. Se confirmó la detención de todos esos clústeres. La prueba de recuperación terminó con **8 eventos, 8 trackings G1, 10 solicitudes HTTP locales y 8 efectos simulados**: los reintentos no equivalen a efectos duplicados.

Los 17 casos tributarios incluyen dos reproducciones del desfase factura pagada/cuotas pendientes. Su PASS demuestra la reproducción controlada, **no la solución del convenio**. Su estado funcional sigue **FAIL / bloqueado por decisión comercial**, de acuerdo con [la política ratificada](../i4-convenios-decision-comercial.md).

Los resultados demuestran garantías locales de PostgreSQL y simuladores. No certifican entregas de correo, emisión fiscal ni idempotencia real de G1/G2/G3. Tampoco equivalen a una nueva aceptación visual de pantallas; aquí se ejecutaron HTTP, servicios, pruebas y generación/validación de PDF.

## Reproducción y aislamiento

Se utilizaron Node 22.19.0 y PostgreSQL 18.6 instalado localmente; Docker no fue necesario. Todos los procesos de validación recibieron variables sintéticas desde una lista permitida. Se bloqueó la lectura de dotenv privados y las conexiones Node externas. Los harness de base aceptan únicamente capacidades de clúster nuevo, nunca una URL operativa del llamador.

Secuencia para un checkout de validación sin dotenv ni credenciales operativas:

```powershell
npm ci --ignore-scripts --no-audit --no-fund
$env:DATABASE_URL = 'postgresql://qa:synthetic@127.0.0.1:1/qa_unavailable'
$env:JWT_SECRET = 'synthetic-qa-only-never-use-in-production-2026'
$env:NODE_ENV = 'test'
$env:CHECKPOINT_DISABLE = '1'
# Generar Prisma; su motor puede descargarse, pero no se consulta DB.
npm --prefix backend run prisma:generate
$env:NODE_OPTIONS = '--require="' + (Resolve-Path scripts/qa-loopback-only.cjs).Path + '"'
node node_modules/prisma/build/index.js validate --schema backend/prisma/schema.prisma
npm --prefix backend run build
npm --prefix frontend run build
npm --prefix backend test -- --runInBand
npm --prefix frontend test
npm --prefix backend run lint
npm --prefix frontend run lint
node --test scripts/global-schema.test.mjs scripts/g1-smoke.test.mjs scripts/validate-production-env.test.mjs scripts/smoke-billing-write.test.mjs scripts/repository-hygiene.test.mjs scripts/i3-release-acceptance.test.mjs scripts/p0-07-demo-qa.test.cjs scripts/p0-05-qa-isolation.test.mjs frontend/runtime-config.test.mjs tools/facturacion-cl-sandbox/prototype.test.mjs tools/facturacion-cl-sandbox/verify-test-api.test.mjs
node scripts/i4-tax-postgresql-qa.cjs
node scripts/p0-07-demo-qa.cjs --installation-flow
node scripts/p0-07-demo-qa.cjs --coverage-flow
node scripts/p0-07-pdf-qa.cjs
git diff --check
git diff --cached --check
```

En este checkout con dotenv privados se utilizaron wrappers locales de aislamiento y logs nuevos bajo `.codex-review/pr64-integration/`; no se ejecutó el CLI global de aceptación `--run-local`, cuyo rechazo de dotenv privados permanece intacto y está probado. El caso P0-05 ejecutó el script original con una guarda que redirige únicamente su archivo de evidencia a `.codex-review/pr64-integration/recovery-evidence.json`; no cambió lógica de escenarios ni sobrescribió `docs/i4-p0-05-postgresql-qa.evidence.json`. Antes de repetirlo debe elegirse nuevamente un destino libre.

## Preservación, seguridad y publicación

Se comprobó por SHA-256 la preservación de **62 archivos preexistentes**: untracked, `-f`, evidencias anteriores, informes `output/`, dotenv privados y respaldos ignorados. No se modificó el worktree de facturación. Nuevas evidencias crudas, PDFs, dependencias y wrappers permanecen fuera del commit. Se incluyen únicamente cambios heredados de develop, los dos ajustes del harness y este informe con su resumen sanitizado.

Escaneo dirigido sobre el candidato: sin tokens operativos o claves privadas detectados. Las coincidencias revisadas corresponden a fixtures, placeholders, metadatos de dependencias y un Message-ID histórico ya documentado; no se imprimieron secretos. Es una revisión contextual, no una garantía de ausencia universal ni una limpieza del historial. Los riesgos históricos requieren decisión del propietario conforme a [riesgos y go/no-go](06-riesgos-y-criterios-go-no-go.md).

## Pendientes y responsables

| Pendiente | Responsable sugerido | Acción |
| --- | --- | --- |
| Convenio con cuotas pendientes pese a factura pagada | Encargado comercial G8 / profesor | Ratificar imputación pago→cuota; no reparar históricos ni automatizar sin aprobación |
| Credenciales y perfiles privados SMTP/fiscal por empresa | Operador autorizado G8 | Configurar y autorizar pruebas acotadas; no activar emisión en esta PR |
| E2E real G1/G2/G3 | Responsables de los cuatro grupos | Coordinar datos QA y autorización; conservar contratos congelados |
| Migración en ambiente compartido / VPS / readiness | DBA y responsable de infraestructura | Seguir el [plan tributario](../i4-tax-schema-migration-plan.md), respaldar y aprobar aparte; no ejecutar desde esta revisión |
| Aceptación visual del candidato integrado y suites DB omitidas | QA G8 | Ejecutar guion autorizado y suites pertinentes en un entorno aislado, registrando evidencia nueva |
| Exposición histórica / publicación | Propietario del repositorio | Resolver incidentes históricos y criterios de publicación sin borrado o rotación automática |

WhatsApp conserva su implementación y queda deshabilitado, fuera de los criterios obligatorios acordados. **Sin acceso a Railway/VPS, escrituras compartidas, emisiones fiscales, correos reales o despliegue.** La PR queda para revisión humana; no se realizó merge a develop.
