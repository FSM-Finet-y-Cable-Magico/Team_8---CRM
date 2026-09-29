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
|Smoke GET|LISTO_PARA_SMOKE_TEST; abortó antes de HTTP por G1_API_KEY_NOT_CONFIGURED|
|Smoke POST|Preparado con ALLOW_G1_ACTIVATION_WRITE=1; no ejecutado|
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
|G1_REAL_GET_TEST|smoke-g1-readonly|Pendiente: falta key; aborto antes de HTTP|
|G1_REAL_WRITE_TEST|No ejecutado|Requiere aprobación y datos reales coordinados|
|Revisión estática|git diff --check; hash canónico|Sin errores de whitespace; hash preservado|

Los tests del verificador usan catálogos sintéticos y no son evidencia de una base local. No se habilitaron las pruebas omitidas que requieren configuración/entornos adicionales. No se usó seed local.

## 17. Pruebas no ejecutadas

Aplicación de SQL, baseline, migrate resolve/deploy, DDL/DML remoto y POST externos excluidos por instrucciones. GET G1 pendiente por falta de credencial legítimamente configurada. Health HTTP de producción pendiente de despliegue autorizado. No se hizo validación funcional completa entre los cuatro grupos ni prueba de datos/backfills reales de la reconciliación. No se auditó todo el historial Git ni se comprobó vigencia de posibles secretos.

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
6. G1 entrega/configura la key por canal seguro y confirma empresa/series/servicio y versión de API. Ejecutar primero smoke GET; ante 401 detener y revisar configuración. No probar variaciones.
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
