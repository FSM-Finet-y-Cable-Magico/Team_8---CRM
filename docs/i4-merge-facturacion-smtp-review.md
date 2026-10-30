# Revisión del merge Facturación.cl + SMTP

Fecha de revisión: 2026-10-29. Estado: conflictos resueltos y validación local aprobada; merge sin commit. No autoriza producción.

## Candidato y alcance

- Checkout exclusivo: `Team_8---CRM-integracion-facturacion`.
- Rama: `integrate/i4-facturacion-smtp`.
- HEAD: `a8d2598151c988ef8f4f4a09977fe36167d79f62`.
- MERGE_HEAD: `132e80b3192f062c7b2e09ec4b3ba6f83827cb0a`.
- No se abortó ni reinició la fusión. No se modificó el otro worktree `Team_8---CRM`.
- No hubo conexiones a bases, migraciones, seeds, Railway, emisiones tributarias, correo externo, llamadas G1/G2/G3, commit, push o despliegue.
- Las descargas de herramientas/dependencias npm/Prisma no son pruebas contra proveedores del CRM.

## Resolución de los cuatro conflictos

| Archivo | Causa | Resolución |
| --- | --- | --- |
| `backend/src/billing/billing.service.spec.ts` | Coincidencia del bloque de pruebas modernas de aislamiento con una preparación global de fecha fija de la rama entrante. | Se conserva el contenido de HEAD, incluidas pruebas P0-04, reactivación condicionada a G3, empresa, idempotencia y fechas dinámicas. Las pruebas tributarias/postcommit útiles de la rama entrante ya estaban presentes; no se duplicaron. Por ello este archivo no aparece como cambio respecto de HEAD después de resolverlo. |
| `backend/src/prospects/prospects.service.spec.ts` | La versión antigua colisionaba con pruebas del modelo de transiciones protegidas. | Se conservan las reglas y pruebas modernas. Se incorpora una prueba de cotización que comprueba el envío por la empresa del prospecto aunque el administrador pertenezca a otra empresa. No se permite activación manual genérica. |
| `package-lock.json` | Árboles de dependencias distintos y override ExcelJS/UUID. | Regeneración con npm 10.9.3 desde los manifiestos integrados, también de los locks independientes backend/frontend. No se eligió masivamente ours/theirs. Se comprobó instalación reproducible y ejecución de ExcelJS con UUID 11.1.1. |
| `scripts/i3-release-acceptance.mjs` | Divergencia del harness, aislamiento de entorno y CLI/evidencias. | Se mantienen los grupos modernos, entorno sintético por lista permitida, proveedores y pruebas DB deshabilitados, `--run-local` y `--output-dir`. Un directorio de evidencia debe ser nuevo y estar dentro del checkout; no se sobrescriben históricos. Sin directorio explícito, salida solamente por stdout. |

El harness rechaza archivos dotenv privados antes de ejecutar suites. Los procesos de pruebas reciben exclusivamente un preload local de restricción TCP/listeners a loopback; no heredan `NODE_OPTIONS`. Se añadieron `scripts/qa-loopback-only.cjs` y tres pruebas en `scripts/i3-release-acceptance.test.mjs`.

Durante la validación, la primera implementación del guard hacía asíncrono `listen(0)` y fallaron 35 casos Supertest de G2 por `address() === null`. Se corrigió el guard preservando el bind síncrono y limitándolo a loopback mediante `_listen2`; se añadió la comprobación de regresión. No fue necesario modificar servicios ni tests G2. Este hook interno de Node exige volver a probarse al actualizar Node.

## Validación ejecutada

Entorno Windows, Node 22.19.0 y npm 10.9.3. Variables sintéticas, URL DB loopback puerto 1 sin servicio, pruebas de base opt-in deshabilitadas. SMTP ejecutó servidores locales y certificados efímeros; no se envió correo real.

| Comprobación | Resultado final |
| --- | --- |
| `npm ci --ignore-scripts --no-audit --no-fund` raíz | PASS, 897 paquetes; caché dentro de `.codex-review/` |
| `npm ci --workspaces=false --ignore-scripts --no-audit --no-fund` backend | PASS, 857 paquetes |
| Mismo comando independiente frontend | PASS, 107 paquetes |
| Manifiestos vs tres locks y entradas workspace | PASS |
| Prisma generate / validate | PASS / PASS; sin conexión DB |
| Build backend | PASS |
| Build frontend TypeScript + Vite | PASS; aviso de bundle mayor de 500 kB |
| Lint backend | PASS, sin errores |
| Lint frontend | PASS, 0 errores, 78 advertencias existentes |
| Dirigidas backend | 849 PASS, 0 FAIL, 1 omitida; 39 suites |
| Backend completo | 1.312 PASS, 0 FAIL, 9 omitidas; 80 suites aprobadas y 5 suites omitidas |
| Frontend `tests/*.test.mjs` | 44/44 PASS |
| Herramientas (global, higiene, runtime, DTE, harness) | 75/75 PASS |
| Pruebas del harness después del ajuste Supertest | 3/3 PASS |
| ExcelJS/UUID y CSV, instalaciones raíz y backend | PASS; XLSX en memoria conserva texto con acentos/comas y números; CSV entrecomillado correcto |
| `git diff --check` / `git diff --cached --check` | PASS |
| Conflictos de índice y marcadores | Ninguno |

Las cifras son ejecuciones superpuestas, no sumarlas como pruebas únicas. Entre las suites completas: BillingService 54, ProspectsService 44, MailService 43, FacturacionClIssuer 42, InstallationIntegrationService 71, G3ClosureProcessor 45 y recuperación postcierre 34, todas aprobadas.

Las nueve omitidas requieren base real: comercial (1), CRM (1), cobertura (1), documentos externos PostgreSQL (4), bootstrap local (1) y store tributario PostgreSQL (1). No constituyen validación PostgreSQL ni certificación E2E.

Aceptación: `QA_LOCAL_READY=true`, `RELEASE_READY=false`, 6 casos PASS_LOCAL, 13 PASS_CONTRACT, 0 FAIL; quedan 14 casos externos/bloqueados pendientes. SMTP/OpenSSL sí pudo ejecutarse en esta revisión.

Los fallos iniciales de descarga Prisma, propiedad Git y lectura esbuild se resolvieron con permisos de ejecución locales adecuados. La instalación con scripts deshabilitados requirió generar Prisma explícitamente; para coexistir instalaciones raíz y backend se replicó únicamente el artefacto generado `.prisma` al `node_modules` raíz, con la misma versión 5.22.0 y esquema. No se cambió el esquema para lograrlo.

Evidencia local preservada y excluida de Git:

- `.codex-review/integration-validation/`: logs, resúmenes, resultados dirigidos y auditoría de dependencias.
- `.codex-review/integration-acceptance-final/local-acceptance.json`: aceptación completa.
- `.codex-review/validate-integration.mjs` y `dependency-smoke.mjs`: comandos de esta revisión, con entorno sintético.
- Fingerprint de archivos versionados en el momento de ejecutar aceptación: `9aecbebc383783dd16aae24353ad127e53a931ebf6b3d734115a7e0847c13d32`. Este informe se añadió después; no se presenta ese hash como fingerprint del árbol incluyendo el informe.

Comando versionado para repetir aceptación, una vez instaladas dependencias y generado Prisma, sin dotenv privado:

```powershell
node scripts/i3-release-acceptance.mjs --run-local --output-dir .codex-review/aceptacion-nueva
```

Usar un nombre nuevo por ejecución. El informe distingue pruebas locales de pendientes externos.

## Revisión de archivos fusionados automáticamente

- Configuración tributaria: producción exige opt-in, credenciales por empresa/ambiente, perfil e identidad fiscal; la clase legacy de sandbox sigue rechazando producción.
- Intenciones tributarias: ambiente y fingerprint forman parte de claims/confirmaciones; se conserva el marcador durable de envío y la prohibición de reenviar automáticamente resultados inciertos.
- Trabajos: ambiente original persistido, folio reservado por empresa/ambiente/tipo y bloqueo transaccional. Cambio de perfil/ambiente impide continuar con otra configuración.
- SMTP: cotización y DTE envían `idEmpresa`; resolución explícita sin fallback hacia otra empresa. Validación TLS y estados de envío conservados. Nuevos aliases requieren configurar `SMTP_COMPANIES` y `SMTP_<ALIAS>_*`: la configuración global antigua por sí sola ya no habilita estos envíos empresariales.
- Frontend tributario: conserva propiedades consumidas y distingue configuración productiva de certificación; añade etiquetas para producción.
- Los archivos productivos G1/G2/G3, esquema Prisma y lógica Billing no tienen cambios respecto de HEAD en esta fusión. Las pruebas actuales de clientes compartidos, pago, G3 y recuperación pasan; esto no elimina el hallazgo tributario específico siguiente.
- Se revisaron herramientas de preflight/higiene, configuración Compose y documentación entrante. Sus evidencias históricas y afirmaciones sobre proveedores no se revalidaron externamente.
- Los dos SVG de logos provienen de la rama entrante; se conservaron como parte del merge, sin modificación ni uso como evidencia funcional. Deben ser visibles en la revisión de alcance del commit.

## Riesgos y bloqueos pendientes

1. **Contrato SQL canónico desalineado con la migración propuesta.** `db/global/init-global.sql` todavía define `ambiente = 'sandbox'` en `tax_payment_job` y el índice de folio con tres columnas. La migración nueva permite sandbox/production y añade ambiente al índice. Su futura aplicación requiere ratificar/actualizar contrato y expectativas derivadas; no se alteró el contrato canónico ni se aplicó DDL durante esta tarea.
2. **Clientes compartidos en autorización tributaria.** `FacturacionClIssuer.assertPaymentAccess()` compara `contract.cliente.idEmpresa` con `contract.idEmpresa` y puede rechazar una relación contractual legítima de la segunda empresa, incluso para administrador. Se verificó que esa condición ya existe idéntica en HEAD; no es regresión del merge ni está resuelta por los tests de cobranza compartida. Requiere corrección específica y pruebas por relación factura/contrato antes de certificar ese flujo tributario.
3. **Migración de configuración SMTP.** Preparar aliases y cuentas de ambas empresas; no copiar una cuenta al ámbito de otra ni restaurar fallback global para evitar el cambio de configuración.
4. **Validación externa pendiente.** PostgreSQL QA, concurrencia de folios/claims con conexiones reales, recepción real SMTP, identidad y emisión autorizada del proveedor, UI y despliegue siguen sin ejecutarse. Producción permanece no autorizada.
5. **Dependencias.** npm ci y smoke demuestran reproducibilidad/compatibilidad local, no ausencia de vulnerabilidades. No se ejecutó npm audit; persisten avisos de dependencias obsoletas. El override UUID cruza la versión que ExcelJS declara y debe conservar sus regresiones al actualizar.

### Revisión de la migración, sin aplicación

Archivo: `20261022010000_i3_tax_production_preparation/migration.sql`.

- Operaciones: BEGIN, DROP del CHECK antiguo, ADD CHECK de dos ambientes, DROP y CREATE UNIQUE INDEX con `(id_empresa, ambiente, tipo_dte, folio_esperado)` y predicado `folio_esperado <> '0'`, COMMIT.
- No contiene DELETE, TRUNCATE, DROP TABLE ni cambios de datos. **No es puramente aditiva**: reemplaza un constraint y un índice.
- Los registros sandbox válidos siguen siendo válidos; no cambia la unicidad de `id_pago` ni las relaciones financieras. No se inspeccionaron datos históricos reales.
- ALTER TABLE puede tomar ACCESS EXCLUSIVE; recrear el índice sin CONCURRENTLY puede bloquear escrituras hasta COMMIT. Revisar volumen/ventana y backup con el propietario.
- Es transaccional; un error revierte el DDL. No es reejecutable libremente, pues presupone nombres/estado inicial exactos. Comparar catálogo fresco e historial antes de autorizarla.
- Mantener producción desactivada; el backend tiene readiness específico que rechaza habilitarla con el esquema antiguo. No ejecutar `migrate deploy` automáticamente como parte del cierre de este merge.

## Cierre

Los cuatro conflictos están resueltos. El merge queda preparado en el índice, sin commit. Recomendada revisión humana del diff y de los bloqueos anteriores antes del commit y de cualquier decisión de despliegue. No se eliminaron respaldos ni se tocaron artefactos del otro worktree.

## Archivos preparados en el índice

- .env.example
- .env.railway.example
- backend/.env.example
- backend/package-lock.json
- backend/package.json
- backend/prisma/migrations/20261022010000_i3_tax_production_preparation/migration.sql
- backend/scripts/check-smtp.cjs
- backend/src/mail/mail.service.spec.ts
- backend/src/mail/mail.service.ts
- backend/src/mail/smtp.config.ts
- backend/src/mail/tax-document-delivery.port.ts
- backend/src/prospects/prospects.service.spec.ts
- backend/src/prospects/prospects.service.ts
- backend/src/tax-document-issuance/facturacion-cl-config.service.ts
- backend/src/tax-document-issuance/facturacion-cl-payment.config.spec.ts
- backend/src/tax-document-issuance/facturacion-cl-payment.config.ts
- backend/src/tax-document-issuance/facturacion-cl-read-client.spec.ts
- backend/src/tax-document-issuance/facturacion-cl-read-client.ts
- backend/src/tax-document-issuance/facturacion-cl-sandbox-dispatcher.spec.ts
- backend/src/tax-document-issuance/facturacion-cl-sandbox-dispatcher.ts
- backend/src/tax-document-issuance/facturacion-cl.issuer.spec.ts
- backend/src/tax-document-issuance/facturacion-cl.issuer.ts
- backend/src/tax-document-issuance/prisma-tax-intent.store.spec.ts
- backend/src/tax-document-issuance/prisma-tax-intent.store.ts
- backend/src/tax-document-issuance/tax-document-issuer.types.ts
- backend/src/tax-document-issuance/tax-emission-intent.service.spec.ts
- backend/src/tax-document-issuance/tax-emission-intent.service.ts
- backend/src/tax-document-issuance/tax-recovery.spec.ts
- docker-compose.facturacion-local.yml
- docker-compose.yml
- docs/i3-facturacion-cl-checkpoint.md
- docs/i3-facturacion-cl-integration.md
- docs/i3-production-deployment-readiness.md
- docs/i3-railway-production-env-manifest.md
- docs/i3-security-redacted.json
- docs/i3-security-review.md
- docs/i3-smtp-automatic-email.md
- docs/i4-merge-facturacion-smtp-review.md
- docs/logo-propuesto-cable-magico.svg
- docs/logo-propuesto-finet.svg
- frontend/package-lock.json
- frontend/src/features/billing/PaymentTaxDocument.tsx
- package-lock.json
- package.json
- scripts/audit-secrets-redacted.mjs
- scripts/i3-release-acceptance.mjs
- scripts/i3-release-acceptance.test.mjs
- scripts/qa-loopback-only.cjs
- scripts/repository-hygiene.test.mjs
- scripts/validate-production-env.mjs
- scripts/validate-production-env.test.mjs
- tools/facturacion-cl-sandbox/verify-test-api.mjs
- tools/facturacion-cl-sandbox/verify-test-api.test.mjs
