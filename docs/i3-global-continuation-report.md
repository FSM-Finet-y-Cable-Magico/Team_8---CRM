# Continuación global del Incremento 3 — 29-09-2026

La preparación local solicitada quedó implementada y revisada en una rama separada. **Railway continúa con drift y G1 no tiene una prueba real aprobada**. No desplegar esta rama antes de reconciliar la base y resolver la propuesta JSONB. Los cambios permanecen en el working tree para revisión; no se hicieron commits, push ni merge durante esta tarea.

## 1. Branch base

`develop`, con `origin/develop` apuntando al mismo commit al inicio. Se conservó `feature/incremento3`, rama separada indicada por el usuario y equivalente a la alternativa sugerida por las instrucciones.

## 2. Commit base

`a3d90c4b25645a6a65a0432e4df005ac8f212201`, mensaje «fix pequeño». La verificación remota de develop al inicio coincidió. HEAD y referencias locales base se conservaron; no se presume que un remoto externo permanezca inmutable después de esa lectura.

## 3. Rama de trabajo

`feature/incremento3`. No se trabajó directamente sobre develop ni se disparó un deployment. Al reanudar se respetaron los cambios previos; no se reinició la implementación.

## 4. Estado inicial

Working tree limpio al comenzar la tarea global, sin staged ni untracked. Pruebas iniciales: 50 suites backend aprobadas y 5 omitidas; 411 tests aprobados y 8 omitidos. Build aprobado. Lint: cero errores y 79 advertencias preexistentes (1 backend, 78 frontend).

Durante la reanudación ya estaban implementados auditores, alineación Prisma, fixes G1, health y tests. Faltaba cerrar documentación, plan de baseline y validación final. Este informe describe el resultado consolidado.

## 5. Develop y snapshots

El código G8 inicial coincidía con develop indicado. No se importó ni fusionó código de un ZIP G8 antiguo. Se recibió como contrato físico `init-global.sql` con hash `af5892827b2e41ce15aec0d620cb10a2336d3236596f487af61cc6b41c2b87da`, conservado sin cambios en `db/global/`.

El snapshot G1 revisado fue `Team_1-Inventario-y-Bodega-main (1).zip`, hash `845db003ce625856fc8ba2057c76a2c559c814f48a8f086872d063b3fd0d9f0c`. Se contrastó comportamiento, sin modificarlo ni afirmar que ese código sea idéntico al despliegue remoto.

`db/final/init.sql` de G8 sigue siendo histórico. No se usó como objetivo global ni se generaron seeds.

## 6. Prisma frente al contrato global

[Comparación detallada](i3-prisma-vs-global-schema.md), JSON antes/después y [contrato](i3-global-database-contract.md). 58 modelos como proyección de las 90 tablas; 69 diferencias de tipo/precisión, 5 de nulabilidad y 43 de acciones FK corregidas. Todas las PK modeladas coinciden.

Las 66 FK y 49 índices reportados como no modelados se mantienen físicamente; sus filas tienen Prisma null. No quedan conflictos en los tipos/nulabilidad/relaciones/índices que sí modela G8. La única columna PRISMA_ONLY es `payload_snapshot`, extensión explícita pendiente. No se utilizó db push para eliminar objetos externos. Se conservan separadas las tablas receptoras G1 y tracking saliente G8.

## 7. Railway frente al contrato global

[Reporte objeto por objeto](i3-railway-vs-init-global.md), [JSON](i3-railway-vs-init-global.json) y [catálogo saneado](i3-railway-catalog.json). Lectura real `2026-09-29T14:31:10.439Z` mediante transacción READ ONLY.

|Objeto|Contrato|Observación Railway|
|---|---:|---|
|Tablas de negocio|90|57 presentes; faltan 33|
|Columnas de negocio|876|447 presentes; faltan 429|
|Metadatos Prisma|No forman parte del init|Una tabla adicional con 8 columnas|
|FK|210|Faltan 98|
|Índices explícitos|107|Faltan 69|
|Tipos de columnas|Según contrato|23 diferencias|
|Nulabilidad|Según contrato|3 diferencias|
|Defaults|Según contrato|15 diferencias|
|Historial de migraciones|No incluido en init|20 registros finalizados|

Railway tiene 58 tablas/455 columnas contando metadatos. Las 429 ausentes incluyen 362 en tablas nuevas y 67 en tablas existentes. Los conteos de tipos/nulabilidad/defaults se solapan; no sumarlos como número de columnas diferentes.

Faltan `historial_cambio_plan`, `servicio_contratado`, `zona_pago`, `plan_zona_precio`, tablas de integración G8/G1 y `documento_tributario_externo`, entre otras. Estado: **DEGRADED_SCHEMA / PENDIENTE_RECONCILIACION_GLOBAL**. La ausencia de historial_cambio_plan confirma la dependencia P2021. El reporte enumera PK/checks/secuencias faltantes como REQUIRES_REVIEW; no oculta esos objetos al contar solo columnas.

## 8. Reconciliación

[SQL preparado](../db/global/reconcile-railway-to-init-global.sql): **PREPARADO_NO_EJECUTADO**. Generado desde catálogo fechado y contrato con hash verificado. Crea tablas faltantes, añade columnas, amplía tipos cuando es seguro, ajusta defaults/nulabilidad y prepara FK/checks/índices.

Transacción, timeouts y guarda `crm.reconcile_reviewed`; las conversiones históricas DATE/TIMESTAMP a TIMESTAMPTZ exigen `crm.legacy_timezone` acordado, sin suponer el huso. Guardas para NULL/backfills y conversión INET a texto. Las restricciones se validan; datos incompatibles abortan. No contiene eliminación de tablas/columnas, truncado, borrado de datos ni seeds. No se aplicó a Railway ni a una BD local.

El generador no tiene pendientes residuales para el catálogo capturado; eso no demuestra que los datos satisfagan todas las restricciones o que el estado remoto siga igual. Requiere revisión humana, respaldo y lectura fresca. No ejecutar directamente el init sobre la base existente.

## 9. Cambios de código

- Prisma: tipos/nulabilidad/acciones referenciales alineados y snapshot propuesto.
- Auth, guard y usuarios: leer versión de sesión NULL como cero y normalizarla transaccionalmente antes de incrementar; pruebas de invalidación.
- Facturación/libro comercial: fechas nullable sin errores de runtime.
- G1: URL validada, key literal, redirects bloqueados, entero OT real, snapshot inmutable y multiunidad.
- Health/readiness: estado de proceso, consulta segura de catálogo y dependencias visibles.
- PlanChangeProcessor: P2021 explícito con reducción de spam, sin fingir éxito.
- Herramientas: auditor Prisma, verificador global READ ONLY, generador SQL, smoke G1 separados, revisión de secretos saneada y tests puros.
- Documentación: contrato, evidencia comparativa, plan de baseline, G1, health, seguridad y este informe. Sin cambios de ownership ni funcionalidades frontend inventadas.

## 10. Bugs y discrepancias encontrados

Prisma incompatible con tipos/NULL globales; incremento SQL de NULL no invalidaba como se esperaba; fecha nullable podía romper serialización. OT textual/fallback no cumple G1. Retry reconstruía RUT desde cliente mutable. URL concatenada podía duplicar /api. Falta real de historial_cambio_plan.

La premisa «cambiar solo el RUT causa 409 G1» no coincide con el snapshot: su comparador revisa empresa, OT, servicio, contrato y series, no RUT/cliente/trace. También queda revisión G1 de su carrera 23505 que retorna duplicado sin repetir la comparación semántica. Ningún hallazgo autoriza modificar su código.

## 11. Correcciones y alcance

IMPLEMENTADO_LOCAL para los fixes descritos; tests puros aprobados. El retry conserva RUT A después de modificar Cliente a RUT B y mantiene todos los identificadores/series. IDs inválidos y snapshots ausentes/inconsistentes impiden el envío. La carencia de esquema remoto está identificada y preparada para reconciliar, **no corregida en producción**.

## 12. Integración G1

Detalle: [G1 readiness](i3-g1-global-readiness.md).

|Aspecto|Resultado|
|---|---|
|URL|Origen local configurado: https://backend-production-6ada.up.railway.app; sin prueba de disponibilidad|
|Auth|X-API-KEY opaca literal; G1 compara contra su lista y aplica trim al header; sin bcrypt|
|Rutas|GET tipos-equipo, unidades, equipos, stock; POST activaciones y cierre presentes en snapshot|
|OT|Solo entero positivo real G3; cadena decimal canónica normalizada; no codigo textual ni tracking fallback|
|Multiunidad|Trim/dedupe/orden estable; una cabecera/event_id; primera serie y lista completa|
|Retry|Payload JSONB original + hash; no reconstrucción desde Cliente; requiere extensión aprobada|
|Idempotencia|Unicidades G1 contrastadas; tracking COMPLETADA G8 indica aceptación del evento, no cierre físico|
|Smoke GET|Tipos, unidad y equipos por servicio `PASS_REAL`; asignación activa confirmada tras cierre simulado por G1|
|Smoke POST|Ejecutado manualmente con autorización G1; HTTP PASS, repetición idéntica `duplicado=true`, asociación esperando cierre G3|
|CU-61|PARCIAL_BLOQUEADO_G1_P2; stock actual no demuestra consumo mensual|

G1_INTEGRATION_ENABLED local permanece false. No se inspeccionaron ni cambiaron flags del servicio Railway. No se usó la posible key encontrada en documentación.

## 13. Estado G2

PENDIENTE_G2 donde corresponda coordinación contractual. Portal conserva ownership G2. No se inventaron endpoints, enviaron POST ni modificaron su configuración. Compartir tablas no atribuye a G8 funciones del Portal.

## 14. Estado G3

PENDIENTE_G3 / BLOQUEADO_CONTRATO según función. CU-18: PARCIAL_BLOQUEADO_G3 para poste/NAP sin contrato ratificado. CU-84: BLOQUEADO_CONTRATO_G3 para retiro técnico. WiFi/SmartOLT no se declara completo. Activación G1 exige el ID real y series procedentes del cierre G3, no datos fabricados.

## 15. Estado Railway

Se mantuvo sin DDL/DML, cambios de variables ni deploy. PROBADO_RAILWAY se limita a introspección y lectura del controlador local con conexión real. No se certificó disponibilidad HTTP de la versión desplegada durante esta tarea.

La lectura de readiness a `2026-09-29T14:59:36.185Z` informó BD UP y esquema DEGRADED, 429 columnas ausentes y 26 distintas por tipo/nulabilidad. El controlador compilado se invocó sin AppModule ni schedulers. Ver [evidencia](i3-readiness-railway-read-test.json) y [alcance](i3-health-smoke-readiness.md).

## 16. Validaciones ejecutadas

|Categoría|Comando/evidencia|Resultado|
|---|---|---|
|UNIT_TEST|npm.cmd test|439 tests backend aprobados; 52 suites aprobadas; 5 suites/8 tests omitidos. Además 10 tests Node aprobados|
|BUILD|npm.cmd run build|Backend y frontend aprobados; advertencia Vite de bundle superior a 500 kB|
|LINT|npm.cmd run lint|Aprobado: cero errores, 79 advertencias preexistentes|
|PRISMA|Formato/generación y auditoría|Completados; proyección alineada con excepción propuesta|
|RAILWAY_READ_TEST|verify-global-db y probe-readiness-readonly|Lectura exitosa; verificador FAIL por drift real, readiness DEGRADED|
|G1_REAL_GET_TEST|smoke manual autorizado|Tipos, unidad, equipos por servicio y asignación activa `PASS_REAL`; cierre simulado por G1, E2E G3 real pendiente|
|G1_REAL_WRITE_TEST|No ejecutado|Requiere aprobación y datos reales coordinados|
|Revisión estática|git diff --check; hash canónico|Sin errores de whitespace; hash preservado|

Los tests del verificador usan catálogos sintéticos y no son evidencia de una base local. No se habilitaron las pruebas omitidas que requieren configuración/entornos adicionales. No se usó seed local.

## 17. Pruebas no ejecutadas

Aplicación de SQL, baseline, migrate resolve/deploy y DDL/DML remoto permanecen excluidos. Los GET G1 principales y el POST autorizado fueron ejecutados manualmente por el operador; Codex no hizo llamadas externas. La asociación sigue esperando cierre G3. No se hizo validación funcional completa entre los cuatro grupos ni prueba de datos/backfills reales de la reconciliación. No se auditó todo el historial Git ni se comprobó vigencia de posibles secretos.

## 18. Riesgos y dependencias

La rama no es desplegable sobre el esquema Railway observado. La propuesta snapshot es otra dependencia, aunque el campo sea nullable. FK/únicos nuevos pueden rechazar datos históricos; timezone requiere acuerdo. Los catálogos son evidencia fechada y pueden quedar obsoletos.

La comparación de expresiones SQL es conservadora; no elimina casts/paréntesis para forzar PASS. Una equivalencia debe justificarse, no ocultarse con migrate resolve. El verificador no certifica permisos, triggers, vistas ni contenido de negocio.

Eventos históricos sin snapshot o originalmente incompletos necesitan revisión antes de retry; no se inventa su RUT original. La respuesta aceptada de G1 puede quedar PENDIENTE_CIERRE dentro de G1.

Seguridad: [hallazgos saneados](i3-security-review.md). Posible secreto en snapshot G1, documento de endpoints, línea 358; verificar y rotar por el owner si vigente. Sin reproducción ni uso. Coincidencias heurísticas no equivalen a filtraciones confirmadas.

## 19. Cambios globales propuestos

Solo `integracion_activacion_g1.payload_snapshot JSONB NULL`: GLOBAL_SCHEMA_CHANGE_PROPOSED, [SQL separado](../db/global/proposals/001-g1-payload-snapshot.sql). No se alteró el init recibido. Aprobar/versionar con grupos y actualizar el hash/verificadores cuando exista un nuevo contrato; el verificador del contrato actual detectará esa columna como extra una vez aplicada.

Plan de baseline: [documento detallado](i3-prisma-global-baseline-plan.md). Las nueve migraciones G8 no deben reproducirse automáticamente sobre el esquema conjunto; Railway tiene otra historia de 20 registros. No se borró ni marcó nada como aplicado.

## 20. Acciones para la siguiente sesión operativa

1. Revisar este working tree y el SQL con responsables de la base compartida. Mantener develop y producción estables.
2. Obtener respaldo y catálogo fresco; revisar datos, restricciones, huso horario histórico y ventana de bloqueos. Regenerar reconciliación si cambió el catálogo.
3. Operador autorizado aplica la reconciliación revisada; luego verificador READ ONLY debe demostrar igualdad o reportar diferencias pendientes. No saltar errores.
4. Acordar baseline conjunto e historias futuras; registrar solo después de demostrar la igualdad, conservando trazabilidad.
5. Decidir la extensión snapshot, versionar contrato y aplicar cambio aprobado antes del backend que lo requiere. Resolver casos históricos sin inventar información.
6. Completar el cierre G3 coordinado y verificar después la asociación G1. No ejecutar más POST reales en esta etapa ni cambiar el payload del evento ya aceptado.
7. Coordinar con G1/G3 una prueba de activación real solo con autorización explícita; comprobar recepción, duplicado idéntico y cierre/asignación, sin declarar completos los CU bloqueados.
8. Despliegue/flags solo después de las dependencias y aprobación operativa. Verificar entonces health HTTP y flujos autorizados. No hay push/merge pendiente ejecutado automáticamente por este informe.

## Cobertura de las fases solicitadas

|Fases|Entregable/estado|
|---|---|
|0–2|Base verificada, contrato conservado, proyección comparada/corregida|
|3–6|Lectura Railway, reconciliación preparada, P2021 explícito, tracking separado|
|7–12|Snapshot G1 contrastado, auth/URL/OT/snapshot/multiunidad revisados|
|13–17|Smoke preparados, lectura segura, baseline documentado, verificador y health implementados|
|18–20|Correcciones independientes G8; límites G1/G2/G3 preservados|
|21–23|Tests/build/lint, seguridad saneada e informe final|

La preparación autorizada está terminada; la reconciliación productiva, aprobación de extensión y validación real G1 permanecen pendientes explícitos.

## 21. Continuación Billing y lectura Railway del 2026-09-29

Se completó el workstream de facturación/cobranza sobre la misma rama y sin reescribir la trazabilidad anterior. El detalle funcional, técnico y de riesgos está en [i3-billing-continuation-report.md](i3-billing-continuation-report.md).

Estado Billing: **IMPLEMENTADO_LOCAL / UNIT_TESTED / READY_FOR_GLOBAL_SCHEMA / PROBADO_RAILWAY_READ / PENDIENTE_RAILWAY_WRITE_TEST / PENDIENTE_RECONCILIACION_GLOBAL**. Se agregaron listado y detalle consolidado de facturas, saldo Decimal, pagos parciales/completos protegidos contra sobrepago y concurrencia, vencimiento efectivo con prórrogas, mora reversible, suspensión y reactivación segura frente a múltiples deudas, avisos funcionales/auditoría atómica y UI para pagos, convenios, cuotas, prórrogas, cargos, condiciones y eventos. La implementación existente de documentos tributarios externos fue reutilizada sin duplicarla.

La proyección Prisma incorporó `plantilla_notificacion.id_empresa` y su relación, ya presentes en el contrato canónico, para evitar reutilizar plantillas de otra empresa. `init-global.sql` y el reconciliador no se modificaron.

Una nueva introspección Railway `READ ONLY` capturada el `2026-09-29T21:49:15.786Z` demuestra avance de la reconciliación humana: las 90 tablas, 876 columnas y 210 FK esperadas están presentes. El verificador continúa en `FAIL`: falta `prospecto_id_cliente_key`, existen 3 defaults y 2 nulabilidades distintos, y 31 `CHECK` requieren revisión de equivalencia. Se conservan como extras `_prisma_migrations` y la propuesta `integracion_activacion_g1.payload_snapshot`. No se ejecutó ninguna escritura, migración, reconciliación ni deploy.

Validación acumulada posterior a Billing: `npm.cmd test` aprobó 450 tests backend y 10 tests Node; 5 suites/8 tests permanecen omitidos. Build backend/frontend aprobado. Lint aprobado con cero errores y las mismas 79 advertencias preexistentes. Prisma válido. La validación visual quedó pendiente porque el navegador integrado no estaba disponible.

Los bloqueos externos se mantienen: CU-61 **PENDIENTE_G1 / BLOQUEADO_CONTRATO**; proveedor de notificaciones o portal acordado **PENDIENTE_G2**; corte/reactivación técnica, CU-18 y CU-84 **PENDIENTE_G3 / BLOQUEADO_CONTRATO**; WiFi/SmartOLT **BLOQUEADO_CONTRATO**. `G1_INTEGRATION_ENABLED` no se activó. El POST autorizado confirmó transporte e idempotencia; no ejecutar más POST en esta etapa.

## 22. POST-RECONCILIATION STATE

Los apartados anteriores que indican `PENDIENTE_RECONCILIACION_GLOBAL` describen lecturas históricas. Posteriormente, el operador humano aplicó la reconciliación con respaldo, dry-run con rollback y verificación, además de `integracion_activacion_g1.payload_snapshot JSONB NULL`. Codex no repitió ese proceso ni escribió en Railway.

El contrato canónico se versionó lógicamente con trazabilidad explícita: se incorporó `payload_snapshot` nullable y se eliminó la expectativa inválida `prospecto_id_cliente_key`. Nuevo SHA-256: `e3f43ed3e58fba9a73e8a3dd566e2ab245061bcdb6bfb60ac69c6be21692834c`; 90 tablas, 877 columnas, 90 PK, 210 FK, 33 checks y 106 índices.

La nueva lectura Railway `READ ONLY` del `2026-09-29T22:48:09.805Z` obtuvo **PASS**: 1.495 coincidencias, cero objetos contractuales ausentes o diferentes y `_prisma_migrations` como único extra permitido. Las 3 diferencias de defaults eran casts textuales equivalentes; las 2 nulabilidades eran un error del parser ante PK compuesta; los 31 checks conservaban el mismo árbol semántico. La clasificación objeto por objeto está en [i3-global-verification-final.md](i3-global-verification-final.md).

Se preparó autenticación S2S entrante G8 independiente de JWT, con SHA-256, `timingSafeEqual`, rotación, grupo y scope de empresa. No se creó endpoint de negocio porque G1 confirmó que no requiere operaciones G1 → G8 bajo el contrato actual: **NOT_REQUIRED_CURRENT_CONTRACT**. El código G1 observado confirma solo `X-API-KEY` para G8 → G1; no hay evidencia de una segunda credencial HTTP. Ver [i3-s2s-auth-g1-g8.md](i3-s2s-auth-g1-g8.md).

También quedaron listos el [validador de entorno y checklist de despliegue](i3-production-deployment-readiness.md) y el smoke Billing reversible con gate. Ninguno fue usado para desplegar, cambiar Railway ni ejecutar escrituras.

La validación histórica de esa fase aprobó 55 suites/455 tests backend y 19 tests Node. Después, el operador confirmó dos GET G1 reales (tipos y unidad); no se ejecutó el GET por servicio ni ningún POST externo. Las validaciones vigentes del cierre G1 se registran en [i3-g1-real-integration-closure.md](i3-g1-real-integration-closure.md).

## 23. RELEASE CANDIDATE, RAILWAY Y FACTURACION.CL

Se preparó el manifiesto exhaustivo de variables productivas, el checklist operativo Railway y el plan de PR/merge. Railway no fue modificado. `G1_INTEGRATION_ENABLED`, `G3_INTEGRATION_ENABLED` y `FACTURACION_CL_INTEGRATION_ENABLED` permanecen en `false`; Billing debe desplegarse con notificaciones `disabled` mientras no exista proveedor.

La autenticación real G8 → G1 usa exclusivamente la key literal en `X-API-KEY`; G1 confirmó que no existe una segunda credencial por request. G1 puede consultar el health G8, pero no requiere operaciones inbound bajo el contrato actual: no hay endpoint de negocio y `G8_INTEGRATION_API_KEYS=[]`.

La documentación pública oficial de Facturacion.cl fue auditada. Aunque describe login, token, procesamiento de archivo TXT/XML y recuperación de artefactos, faltan onboarding, ambientes/credenciales por empresa, módulos/tipos DTE, mapeo CRM, errores e idempotencia/reconciliación específicos. Se incorporó solo una frontera `TaxDocumentIssuer` multiempresa que falla cerrada, sin HTTP, rutas o UI de emisión: **ARCHITECTURE_READY / PENDIENTE_CONTRATO_FACTURACION_CL**. El runtime y el validador rechazan activar el flag hasta una futura implementación revisada; CU-86 permanece como metadata externa manual y `Factura`/`Pago` permanecen en Billing.

La auditoría RC corrigió dos exposiciones potenciales de mensajes de error crudos, hizo obligatorio un JWT seguro y un `FRONTEND_URL` HTTPS válido en producción, y completó los ejemplos SMTP. El backend Docker conserva build multi-stage, escucha `0.0.0.0:$PORT`, shutdown hooks y readiness READ ONLY; no ejecuta migraciones ni seed al arrancar. El frontend aún requiere confirmar su estrategia de serving productivo porque su Dockerfile termina en el stage de build.

Entregables: [manifiesto Railway](i3-railway-production-env-manifest.md), [checklist de despliegue](i3-railway-deployment-checklist.md), [auditoría RC](i3-release-candidate-audit.md), [plan PR/merge](i3-pr-merge-plan.md) e [integración Facturacion.cl](i3-facturacion-cl-integration.md).

Validación de esta etapa: 56 suites y 459 tests backend aprobados, 5 suites/8 tests optativos omitidos; 20 tests Node aprobados; build backend/frontend aprobado; lint con cero errores y 78 advertencias frontend preexistentes; Prisma generate/validate aprobado; auditor Prisma/global estático y scan redacted ejecutados; validador productivo sintético en PASS; `git diff --check` aprobado. El intento de refrescar Railway mediante el verificador transaccional READ ONLY terminó `GLOBAL_DB_READ_FAILED` tanto dentro como fuera del sandbox, sin revelar el error original ni escribir datos. Por ello el PASS Railway del apartado 22 sigue siendo la última evidencia exitosa, pero debe renovarse antes del deploy.

## 24. FRONTEND PRODUCTIVO Y READINESS RAILWAY FINAL

Este apartado reemplaza los pendientes tecnicos de frontend y conectividad descritos al final del apartado 23.

El frontend ya dispone de un stage productivo real: Node 22 compila con `VITE_API_URL` como argumento público de build y Nginx 1.30 Alpine sirve únicamente `dist`. La configuración escucha el `PORT` inyectado por Railway, expone `/health`, aplica fallback `index.html` para rutas SPA y responde 404 para assets inexistentes. La imagen no copia código fuente, `.env`, `node_modules` ni devDependencies. Se documentó el servicio Railway separado con root `/frontend`, Dockerfile relativo `Dockerfile` y build variable `VITE_API_URL=https://team8-crm-production-3be0.up.railway.app/api`. El dominio frontend real todavía no existe; cuando Railway lo genere, su origen HTTPS exacto debe configurarse como `FRONTEND_URL` del backend.

El build con la URL pública de API fue exitoso y confirmó el valor en un único asset compilado. Los 3 tests del runtime aprobaron. Docker CLI 29.4.1 estaba instalado, pero el daemon no estaba activo; estado **DOCKER_RUNTIME_TEST_NOT_EXECUTED**. La imagen debe arrancarse en CI o en un equipo con Docker antes del deploy para comprobar `/health`, `/`, assets y fallback SPA.

La causa de `GLOBAL_DB_READ_FAILED` de la etapa anterior fue identificada: se había cargado `backend/.env`, que apunta a loopback. El wrapper `scripts/verify-global-db-readonly.ps1` ahora carga exclusivamente `DATABASE_URL` desde `.env.railway` sin imprimirla. Usando el TCP Proxy público y acceso fuera del sandbox, Railway respondió en transacción READ ONLY.

El resultado actual es **RAILWAY_READ_CONNECTED / GLOBAL_SCHEMA_EXTRA_OBJECTS / FAIL**: 1.495 coincidencias, cero faltantes, una diferencia permitida (`_prisma_migrations`) y cinco diferencias inesperadas. Las 90 tablas funcionales, 877 columnas, 90 PK, 210 FK, 33 checks y 106 índices contractuales están presentes. `integracion_activacion_g1.payload_snapshot` está en `MATCH` y `prospecto_id_cliente_key` no forma parte de la expectativa. El catálogo contiene 92 tablas públicas: además de las 90 contractuales y `_prisma_migrations`, aparece `solicitud_instalacion_integracion`. También son extras `lista_negra.nivel`, `log_notificacion.id_ot`, su FK y un índice de notificaciones. No se modificó ni eliminó ningún objeto; los responsables globales deben clasificarlos y actualizar el contrato o definir una corrección coordinada antes del deploy.

Validación RC acumulada: 56 suites/459 tests backend aprobados, 5 suites/8 tests optativos omitidos; 21/21 tests Node globales y 3/3 tests de runtime frontend aprobados; build backend/frontend aprobado; lint con cero errores y 78 advertencias preexistentes; Prisma generate/validate aprobado; auditor Prisma/global ejecutado. G1, G3 y Facturacion.cl continúan deshabilitados. No hubo commit, push, merge, deploy, DDL/DML ni modificaciones de Railway.

Entregables nuevos: [despliegue frontend Railway](i3-railway-frontend-deployment.md), [verificación Railway READ ONLY](i3-railway-readonly-verification.md) y [readiness frontend](i3-frontend-production-readiness.md).

## 25. RESOLUCIÓN DE EXTRAS DEL ESQUEMA GLOBAL

La definición física completa de `solicitud_instalacion_integracion`, owner G3, fue confirmada e incorporada al canónico sin ejecutarla sobre Railway. El contrato queda en 91 tablas, 897 columnas, 91 PK, 211 FK, 33 checks y 109 índices, con hash `bdbff3f99e81446d75312dede4571ab6154bea309ce8f90dceaa44e98105cce1`. No se reutilizó la forma de `integracion_instalacion_g3`, que es otra tabla.

La búsqueda en todas las ramas disponibles encontró los cinco nombres inicialmente investigados por primera vez en `e46bb972`, únicamente como documentación de la lectura READ ONLY. No existe DDL, migración o código que atribuya su creación física. `lista_negra.nivel`, `log_notificacion.id_ot`, su FK y el índice compuesto no tienen referencia funcional actual y permanecen `UNOWNED_EXTRA`. Aunque las tablas tienen cero registros, solo son candidatos de revisión coordinada; no se autorizó su eliminación.

Una repetición READ ONLY durante esta etapa observó 93 tablas y reveló un quinto `UNOWNED_EXTRA`: `solicitud_clave_wifi`. Ese nombre no existe en ninguna rama o commit disponible y su estructura no coincide con la tabla canónica `solicitud_contrasena_wifi`; no se atribuyó owner ni se consultaron datos de negocio.

La verificación Railway posterior obtuvo 1.522 coincidencias, cero faltantes y confirmó toda la tabla G3 en `MATCH`. Permanecen cinco `UNOWNED_EXTRA`; únicamente `_prisma_migrations` es no bloqueante. El detalle y las próximas acciones están en [i3-global-extra-object-resolution.md](i3-global-extra-object-resolution.md).

## 26. CIERRE REAL G8 → G1 Y CONCILIACIÓN SIMULADA

G1 aceptó el evento de smoke autorizado y su repetición exacta con el mismo `event_id` y payload. La primera respuesta informó `duplicado=false`; la segunda, `duplicado=true`; ambas devolvieron `equipos_asociados=0`. Ese resultado fue correcto para el estado intermedio `PENDIENTE_CIERRE`, por lo que permanecen aprobadas la semántica de espera y la idempotencia.

G1 simuló después el cierre técnico de la misma OT mediante su webhook. El GET posterior por servicio devolvió `QA-ONT-F-0001` como `Instalado en cliente`, con OT 900001 y fecha de instalación; el GET posterior por serie devolvió la asignación activa a cliente 1, servicio 900001, contrato 900001 y OT 900001.

Estados finales: `G8_TO_G1_REAL_RAILWAY=PASS`, `G1_RECONCILIATION_LOGIC=PASS`, `G1_ACTIVATION_CLOSURE_RECONCILIATION=PASS` y `G1_ACTIVE_ASSIGNMENT=PASS`. El cierre fue simulado por G1, por lo que `FULL_REAL_G3_TO_G1_CROSS_GROUP_E2E=PENDING`. No se atribuye el segundo evento a G3 real.

El tracking G8 conserva la regla segura: un 2xx con `equipos_asociados=0` queda `PENDIENTE_SINCRONIZACION_G1`, no `ERROR_G1` ni `COMPLETADA`. La asociación final del smoke se acreditó mediante lecturas posteriores. No se debe reutilizar el evento con otro payload ni ejecutar más POST reales en esta etapa.

Validación local vigente: 3 suites/64 tests G1 y 56 suites/476 tests backend aprobados; 5 suites/8 tests opcionales omitidos; 22/22 tests de herramientas globales y 3/3 tests de runtime frontend aprobados; build backend/frontend y Prisma generate/validate aprobados; lint con cero errores y 78 advertencias frontend preexistentes; `git diff --check` aprobado.
