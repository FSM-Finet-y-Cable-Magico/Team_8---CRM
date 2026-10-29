# P0-07A — Resultado integrado y límites de la demostración

> Consolidación 29-10-2026: este documento conserva resultados y sesiones históricas. El estado de publicación vigente está en [19](19-consolidacion-publicacion-p0-07.md). Las sesiones con TTL vencido no deben reutilizarse. Las referencias a `evidencias-qa/` corresponden a archivos locales preservados, excluidos de este PR; el resumen automatizado publicable está en [validación](p0-07-validacion-publicacion.json). La distribución académica y la certificación productiva siguen separadas de esta PR.

**DEMO_PARTIAL / ACADEMIC_CONDITIONAL / PRODUCCIÓN NO-GO.**

Ensayo final: 26-10-2026 23:55 America/Santiago (2026-10-27T02:55Z).
Rama `docs/i4-p0-07-cierre-entrega`, SHA `a8d2598151c988ef8f4f4a09977fe36167d79f62`.
No se modificó código productivo, esquema, migraciones, `.env`, acuerdos intergrupo ni respaldos.

## Qué se ejecutó realmente

Se ejecutó NestJS completo contra PostgreSQL 18.6 recién creado, con autenticación,
servicios, transacciones y persistencia reales. Se compiló y sirvió el frontend React
en el mismo origen mediante proxy local `/api`. La respuesta HTML fue 200 y contenía
el bundle compilado. **No se ejecutó ni validó el renderizado React en navegador**:
el control de Opera terminó con `Computer Use app approval timed out` antes de
obtener acceso a la aplicación. No hay capturas ni DevTools verificados.

Las 14 comprobaciones siguientes usan HTTP local contra los controladores reales;
no son solo mocks de servicios, pero tampoco certifican las pantallas.
El servidor de G1/G3 es un simulador local con contrato acotado y datos sintéticos.

Evidencia primaria:
- [Resultados HTTP finales](evidencias-qa/http-9386bb82-1d2e-4e52-b796-8a0b8e5febed.json).
- [Instancia, solicitudes, filas, estados y limpieza](evidencias-qa/run-9386bb82-1d2e-4e52-b796-8a0b8e5febed.json).
- [Bitácora visual pendiente](09-bitacora-demo.csv).

| Escenario | Resultado HTTP observado | Estado visual |
|---|---|---|
| D01 | Cuatro roles autenticados; credencial incorrecta 401 | BLOCKED |
| D02 | Comercial recibe solo contratos de su empresa | BLOCKED |
| D03 | Prospecto en cobertura aceptado; punto exterior no permite contrato | BLOCKED |
| D04 | Cotización y PDF generados; correo `not_configured`; contrato pendiente de firma | BLOCKED |
| D05 | Firma por operación dedicada y contrato PDF generado/descargado | BLOCKED |
| D06 | Creación 201, retry upstream 200, una OT; empresa ajena 403 | BLOCKED |
| D07 | Cierre válido, repetición idéntica, una activación; hash distinto 409 | BLOCKED |
| D08 | Equipo y asignación del servicio recuperados de G1 simulado | BLOCKED |
| D09 | Cliente compartido: 1 contrato por comercial y 2 para Admin; datos técnicos globales ocultos | BLOCKED |
| D10 | Pagos 5.000 + 14.990; saldos 14.990 y 0; replay 409 sin duplicado; deuda Cable 7.000 intacta en este paso | BLOCKED |
| D11 | Pago reactiva servicio 3 con cierre G3; sin cierre no reactiva. Pago Cable de este paso es una acción QA adicional explícita | BLOCKED |
| D12 | Ticket, prioridad, nota y diagnóstico; reparación local 410 `G3_INTEGRATION_REQUIRED`; cliente compartido sigue Moroso | BLOCKED |
| D13 | Catálogo, unidad y equipos de G1 simulados, empresa y asignación comprobadas | BLOCKED |
| D14 | Exportación CSV Admin 200 / Comercial 403 | BLOCKED |
| D15 | No se repitió caída/reinicio en este ensayo; evidencia PostgreSQL P0-05 previa referenciada | NOT_EXECUTED |

Balance visual: **0 PASS, 0 FAIL, 14 BLOCKED, 1 NOT_EXECUTED**. Esto no significa que
las 14 pantallas fallen; significa que no hay evidencia visual para aprobarlas.
En paralelo, **14 comprobaciones HTTP PASS**: algunas agrupan D02/D09 y D08/D13,
D03 se divide en dos, y una verifica health/ready/servidor frontend.

Estado persistido final: 2 clientes, 3 servicios, 1 evento terminal G3, 4 pagos QA.
G3 tracking 1 `COMPLETADA`; G1 tracking 1 `COMPLETADA`; 1 efecto G1.
Hubo dos POST de solicitud G3 por retry, un POST de activación G1 y tres cierres
locales G3→G8 (original, repetido y conflicto intencional). Cero POST a proveedores reales.

## Hallazgos, sin correcciones productivas

1. **Pool reducido y generación PDF:** el primer ensayo heredó `connection_limit=1`
   del worker P0-05. `ContractsService.generateDigitalContract()` abre una transacción
   y `renderDigitalContract()` → `resolvePlanPrice()` consulta mediante el Prisma raíz;
   necesita otra conexión. Se reprodujo HTTP 500 / P2024. Con pool QA de 5, el PDF
   aprobó. No se ocultó la evidencia inicial. Propuesta separada: pasar el cliente
   transaccional a la lectura de precio o resolver el snapshot antes del lock,
   manteniendo consistencia/versionamiento; probar con pool de una conexión y
   solicitudes concurrentes. No es una corrección implementada en P0-07A.
2. **Contrato del simulador:** el primer cierre incluía campos técnicos opcionales
   que el DTO estricto de webhook no admite. Se retiraron del simulador; se usa
   únicamente el payload approval-only vigente. No se amplió el contrato productivo.
   La consulta histórica de campos técnicos adicionales no quedó certificada aquí.
3. **Pago duplicado:** la ruta CRM normal rechaza la misma referencia con 409.
   No crea un pago adicional. La respuesta idempotente S2S G2 tiene semántica propia;
   no fue modificada ni certificada como integración G2 real en esta demo.
4. **Orden del ensayo:** el segundo intento pagó la deuda Cable en D11 antes de
   medir D10 y contó pagos globales. Se corrigió el orden del runner QA y se repitió
   desde una base nueva. No se repararon registros para forzar un resultado.
5. **Etiquetas de proveedor:** el servicio G1 presenta `G1_REAL_SMOKE_PASS` en su
   respuesta aun usando un simulador. En esta evidencia todo G1 es **simulado**;
   esa etiqueta no acredita un nuevo smoke real. No se cambió presentación productiva.

Los registros de los dos ensayos de preparación se conservan con sus fallos y
`cleanup=true` en `evidencias-qa/`. Ningún fallo de prerrequisito del runner se presenta
como defecto productivo. Ninguno de los PDF/CSV se ha validado visualmente.

## Validaciones actuales

| Comando | Resultado |
|---|---|
| `npm.cmd --prefix backend run build` | PASS |
| `$env:VITE_API_URL='/api'; npm.cmd --prefix frontend run build` | PASS; aviso bundle >500 kB |
| `node --test scripts/p0-07-demo-qa.test.cjs scripts/p0-05-qa-isolation.test.mjs` | 6 PASS |
| `npm.cmd --prefix backend test -- --runInBand g3-integration g1-integration contracts.service.spec.ts tickets-authority.http.spec.ts` | 392 PASS, 17 suites |
| `npm.cmd --prefix frontend test` | 44 PASS |
| `npm.cmd --prefix backend run lint` | PASS |
| `npm.cmd --prefix frontend run lint` | 0 errores, 78 advertencias existentes |
| Runner HTTP P0-07A | 14 PASS en ensayo final |
| `git diff --check` | PASS; revisar también archivos nuevos que Git no incluye en el diff normal |

No se volvió a ejecutar toda la regresión backend ni los ocho escenarios PostgreSQL
P0-05. Su evidencia anterior permanece en [P0-05 QA](../i4-p0-05-postgresql-qa.md)
y su JSON original, sin modificaciones. No convertir estas referencias en resultados
nuevos ni en un PASS visual de D15.

## Reproducción local segura

Requiere dependencias ya instaladas, Node, PostgreSQL 18 en
`C:/Program Files/PostgreSQL/18/bin` y capacidad de iniciar procesos loopback.
No emplear `docker compose` general ni `.env` de backend para esta demo.

```powershell
npm.cmd --prefix backend run build
$env:VITE_API_URL='/api'
npm.cmd --prefix frontend run build
node --test scripts/p0-07-demo-qa.test.cjs scripts/p0-05-qa-isolation.test.mjs
node scripts/p0-07-demo-qa.cjs
```

El último comando permanece activo. Imprime `QA_READY`, origen local, ruta privada
temporal y ruta de evidencia, **nunca contraseñas**. Si la atestación falla, no carga
esquema/fixtures. La instancia recibe nombre/puertos/credenciales nuevos en cada ensayo.
Las fixtures incluyen relaciones compartidas y facturas; son preparación QA explícita,
no prueba de que esas relaciones se hayan creado a través de la UI.

Para el recorrido visual: abrir exclusivamente el origen indicado, usar las cuatro
cuentas del archivo temporal privado con un operador autorizado y seguir D01–D15.
No publicar ese archivo ni capturarlo. Hace falta aprobar el acceso del controlador
de navegador; no se requiere ampliar permisos de la aplicación CRM.
El mapa base externo no cargará por CSP: comprobar polígonos/ubicación local, sin
habilitar salida a tiles externos ni Nominatim para hacer pasar la captura.

Alternativa complementaria automatizada, desde otra consola:

```powershell
# Sustituir por privatePath emitido por ESTA instancia; no usar una URL de DB.
$qaPrivateFile = '<privatePath de QA_READY>'
node scripts/p0-07-qa-http-check.cjs $qaPrivateFile
# Tras la demo, detener únicamente esta instancia y comprobar cleanup=true:
node scripts/p0-07-qa-http-check.cjs $qaPrivateFile --stop
```

El runner autentica mediante `/auth/login`, utiliza las operaciones CRM existentes
y no imprime tokens. Verifica el runId por lectura antes incluso del login.
Para repetir un ensayo completo, crear una nueva instancia: no mezclar el runner
automático con el guion manual en la misma base y luego atribuir esas escrituras a la UI.
El archivo privado, los documentos generados en cwd y las credenciales desaparecen
con la limpieza exclusiva; los artefactos saneados permanecen en este paquete.

## Archivos y pendientes de cierre

Seis archivos nuevos de soporte QA en `scripts/p0-07-*.cjs`; no se cambiaron servicios,
controladores ni tests productivos. Se conservan los seis documentos P0-07 previos;
se corrige D14 en 03, se incorporan 07–11 desde el material comparado del usuario,
y se agrega este informe con JSON/PDF/CSV sintéticos. 10 y 11 siguen siendo borradores
internos de P0-07B, **sin autorización de publicación**.

| Pendiente | Responsable / condición |
|---|---|
| Renderizar y recorrer D01–D14, abrir PDF/CSV y capturar CAP-01…14 | Operador QA + acceso al navegador; nueva base efímera |
| D15 caída/reinicio, ACK perdido y captura del seguimiento | QA; usar evidencia P0-05 como previa o ejecutar ensayo dedicado nuevo |
| Revisar dependencia extra del pool en PDF | Equipo G8; propuesta separada autorizada antes de modificar código |
| Aceptación comercial y ratificaciones reales G1/G2/G3 | Representantes de los grupos; esta demo no los certifica |
| Distribución académica y riesgos históricos | Propietario; checklist P0-07B, sin publicar Git/dumps/secretos |
| VPS y producción | Fuera de esta ejecución; mantener NO-GO hasta criterios respectivos |

No commit, push, merge, despliegue, acceso a Railway, restauración de dumps ni
escrituras externas. Stage vacío. `-f`, `output/`, respaldos e históricos preservados.

## Estado Git al cierre

`git status --short`:

```text
?? -f
?? docs/entrega-final/
?? output/backups/pre-i3-schema-20261007-022439.dump.sha256.txt
?? output/i3-final-schema/
?? output/i3-post-migration/
?? output/i3-preflight/
?? scripts/p0-07-demo-qa.cjs
?? scripts/p0-07-demo-qa.test.cjs
?? scripts/p0-07-qa-fixtures.cjs
?? scripts/p0-07-qa-http-check.cjs
?? scripts/p0-07-qa-network.cjs
?? scripts/p0-07-qa-providers.cjs
```

`git diff --stat` y `git diff --cached --stat`: sin salida. Los documentos P0-07
ya estaban sin seguimiento y los scripts QA nuevos también; un diff vacío **no**
significa que no se hayan generado archivos. No se añadió ninguno al stage.
`SHA256SUMS.txt` enumera los 14 artefactos de evidencia realmente existentes;
los PDF/CSV son artefactos sintéticos, no capturas de pantalla.

## Actualización 27-10-2026 — PDF corregido y demo manual preparada

Esta sección es una ejecución posterior. Los apartados anteriores describen el
ensayo histórico del 26-10; sus resultados, estado Git y afirmación de ausencia
de cambios productivos no describen el working tree actualizado de esta sección.
Se conservaron los 14 artefactos anteriores y se verificaron sus hashes contra
`SHA256SUMS.txt`: los 14 coinciden. No se reemplazaron capturas ni informes.

Estado actual: **DEMO_PARTIAL / ACADEMIC_CONDITIONAL / PRODUCCIÓN NO-GO**.
Rama y HEAD se conservan. No se volvió a intentar control automatizado de Opera.

El defecto PDF se reprodujo antes de corregirlo: con pool 1, P2024 en 10.056 ms;
con pool 5, generación correcta. Se corrigieron las consultas que salían de la
transacción, se incorporó la auditoría a la misma transacción y se protegieron
los archivos de intentos fallidos. Detalle, compatibilidad y límites en
[13-correccion-pdf-transaccion-qa.md](13-correccion-pdf-transaccion-qa.md).
No se resolvió aumentando el pool.

| Validación nueva | Resultado real |
|---|---|
| PostgreSQL 18.6 exclusivo: PDF, versiones, concurrencia, fallos, rollback y permisos | 9/9 PASS; ambas ejecuciones baseline/regresión limpiadas |
| Unit tests contracts-pdf, contracts.service, plan-changes | 26/26 PASS, 3 suites |
| Aislamiento y simuladores P0-07/P0-05 | 6/6 PASS |
| Backend build / lint | PASS / PASS |
| Sintaxis de scripts PDF, demo y HTTP helper | PASS |
| git diff --check | PASS |
| Manual QA, solo preflight local nuevo | Health 200, DB UP, global_schema READY |
| Nuevas capturas / escenarios visuales aprobados | 0 / 0 |

No se repitieron ni se sumaron artificialmente los 392/44 resultados históricos.
El frontend permanece sin cambios; no se atribuye un nuevo build frontend.
La aceptación visual de los PDF nuevos permanece pendiente del operador.

### Sesión manual y responsabilidades

URL verificada: **http://127.0.0.1:59557**. Run:
`3dc0ff81-26f5-4c57-a9ea-bb9c063d324a`, expiración automática prevista el
27-10-2026 a las **12:30:38 America/Santiago**. Tras expirar, no asumir que esa URL
sigue disponible. Iniciar sesión nueva según
[14-demostracion-manual-operador.md](14-demostracion-manual-operador.md).

[Snapshot de preflight](evidencias-qa/manual-readiness-3dc0ff81-26f5-4c57-a9ea-bb9c063d324a.json)
conserva el resultado leído; [acta mutable de sesión](evidencias-qa/run-3dc0ff81-26f5-4c57-a9ea-bb9c063d324a.json)
registra avance y cleanup. La sesión se deja activa para el operador, con TTL de
dos horas y `cleanup=false` hasta su parada. No confundirla con los clusters PDF
ya limpiados. No hubo acceso a sistemas reales.

Se agregaron 15 filas MANUAL_PREPARADA a 09-bitacora-demo.csv, sin reemplazar las
15 anteriores. D01–D15 de esta ronda figuran NOT_EXECUTED, sin archivo de captura
ni hash inventado. D01–D14 requieren acción y captura del operador. D14 conserva
ADMIN_ONLY y separa el complemento HTTP 200/403 de la demostración visual.
D15 conserva como referencia P0-05; no se volvió a ejecutar caída/reinicio ni
ACK perdido en esta sesión. No hay proceso periódico de recuperación.

Los controles locales del helper permiten consultar estado, aprobar/repetir un
cierre simulado, probar conflicto, preparar la factura sintética de D11 y verificar
permisos de exportación sin mostrar keys. Ninguno de esos controles de escritura
se ejecutó sobre esta nueva sesión al prepararla; solo se comprobó el preflight.
El guion indica los botones realmente existentes y deja pendientes los subcasos
sin acción visible, en vez de inventar botones o cambiar estados en PostgreSQL.

### Archivos de esta intervención y separación de revisión

- Diff productivo: `backend/src/contracts/contracts.service.ts` y
  `backend/src/contracts/contracts-pdf.spec.ts`.
- Harness PDF nuevo: `scripts/p0-07-pdf-qa.cjs`.
- Soporte manual ajustado sobre los scripts QA existentes sin seguimiento:
  `scripts/p0-07-demo-qa.cjs` (hashes/TTL) y
  `scripts/p0-07-qa-http-check.cjs` (controles manuales explícitos).
- Documentación: append de este informe y CSV 09; nuevos informes 13 y 14.
- Evidencia nueva: dos JSON de PDF, acta de la nueva sesión, snapshot de preflight
  y `evidencias-qa/SHA256SUMS-pdf-manual-20261027.txt`. El acta viva no se incluye
  en ese manifiesto porque su contenido cambia hasta cerrar la sesión.

`git diff --stat` del código versionado: 2 archivos, 148 inserciones y 66 borrados
(spec: 86 líneas modificadas; servicio: 128). Los documentos, harness y evidencias
sin seguimiento no están incluidos en ese conteo. Stage vacío.

```text
 M backend/src/contracts/contracts-pdf.spec.ts
 M backend/src/contracts/contracts.service.ts
?? -f
?? docs/entrega-final/
?? output/backups/pre-i3-schema-20261007-022439.dump.sha256.txt
?? output/i3-final-schema/
?? output/i3-post-migration/
?? output/i3-preflight/
?? scripts/p0-07-demo-qa.cjs
?? scripts/p0-07-demo-qa.test.cjs
?? scripts/p0-07-pdf-qa.cjs
?? scripts/p0-07-qa-fixtures.cjs
?? scripts/p0-07-qa-http-check.cjs
?? scripts/p0-07-qa-network.cjs
?? scripts/p0-07-qa-providers.cjs
```

Riesgo residual explícito: una caída abrupta o un estado de commit incierto puede
dejar un archivo para inspección. No se garantiza atomicidad filesystem/DB ni
limpieza tras caída de host; sí rollback y limpieza de fallos controlados probados.
No se agregó un recolector ni se eliminaron documentos históricos.
Pendientes: capturas y aceptación visual (operador/G8), ratificación comercial e
intergrupal (propietarios) y autorización de publicación P0-07B. Sin commit, push,
merge, despliegue, cambio de rama, esquema, migraciones, `.env` o respaldos.

## Actualización 28-10-2026 — Datos completos y Railway público autorizado

Referencia operativa vigente: [15-datos-qa-y-guion-definitivo-20261028.md](15-datos-qa-y-guion-definitivo-20261028.md).
El guion 14 corresponde a una sesión anterior ya cerrada por TTL; se conserva.

Nuevo run `931e5690-fd81-470c-b093-f9ac2a478166`, URL local verificada
**http://127.0.0.1:50066**, expira el 28-10 a las **11:55:45 America/Santiago**.
Backend y DB UP, esquema READY; cuatro logins HTTP reales 201.
El prospecto principal 99000001-8 está AUSENTE para alta manual. El caso secundario
Cable (contrato/servicio/factura 3) recorrió cotización, firma, solicitud y cierre
G3 simulado, activación G8/G1, factura QA y suspensión comercial. Quedó suspendido
con saldo 1.000 y evidencia técnica válida para la reactivación manual posterior.
No se pagó ninguna factura: 0 pagos al entregar; compartido=1 conserva Moroso y
contratos empresariales legítimos. No se creó un tracking completado por SQL.

Primer intento de preparación: el harness omitió cotización y recibió 400 al
confirmar contrato. Ese intento quedó limpio (`cleanup=true`, run c07d9867…)
y conservado como evidencia de preparación fallida. Se añadió la cotización al
preparador; no se modificaron validaciones ni lógica del CRM para eludir el rechazo.
La nueva sesión sí completó la preparación y queda activa hasta TTL/parada.

Se añadieron `scripts/p0-07-qa-prepare.cjs`, opción `--operator-ready` en el launcher
existente y una prueba de rechazo de orígenes externos en el test QA. Los únicos
cambios productivos siguen siendo los dos archivos PDF de la ronda anterior,
con hashes fuente y compilado idénticos. No se volvió a compilar ni a ejecutar los
9 casos PDF, que permanecen como evidencia previa válida de ese mismo artefacto.

Validaciones nuevas: **7/7 tests** de aislamiento/simuladores/origen seguro PASS;
sintaxis Node PASS; preparación HTTP local PASS; `git diff --check` PASS.
Sin nueva captura ni PASS visual. Se agregaron 15 filas NOT_EXECUTED a 09,
preservando las 30 anteriores. Los 17 artefactos de los dos manifiestos anteriores
conservan su SHA-256. Nuevo snapshot inmutable:
[operator-ready](evidencias-qa/operator-ready-931e5690-fd81-470c-b093-f9ac2a478166.json).
El acta viva run-931e… no se incluye en el nuevo manifiesto hasta su cierre.

Railway se accedió únicamente después de autorización específica del usuario:
GET `/api/health`, `/api/ready` y raíz del frontend indicado. Los tres respondieron
200. Ready declara DB UP, esquema READY, cero diferencias de columnas y G1/G3
configurados; mensajería y emisión tributaria deshabilitadas. La raíz frontend
entrega HTML smartCRM; no se ejecutó login ni renderizado. SHA de deployments,
staging, catálogo físico completo, historial Prisma y configuración G2 siguen
sin verificar. No se usaron credenciales ni acceso directo DB.

Diagnóstico, fuentes y matriz NO ejecutada con responsables/autorizaciones:
[16-railway-readonly-y-plan-e2e-20261028.md](16-railway-readonly-y-plan-e2e-20261028.md).

```text
DEMO_PARTIAL
ACADEMIC_CONDITIONAL
RAILWAY_READONLY_VERIFIED (solo tres GET públicos autorizados)
REAL_INTERGROUP_E2E_PENDING
REAL_EXTERNAL_POSTS=0
DDL_DML_RAILWAY=0
RAILWAY_VARIABLES_MODIFIED=false
COMMIT=false
PUSH=false
MERGE=false
DEPLOY=false
```

Pendientes mínimos: operador realiza/captura la demo; G8 autoriza PR independiente
PDF; propietario identifica releases/staging y autoriza catálogo READ ONLY si
procede; grupos asignan IDs QA y aprueban matriz antes de cualquier E2E con escrituras.
No declarar versión Railway igual a HEAD ni integración activa solo por ready.

## Actualización 28-10-2026 — Correcciones cobertura/cotización/contratación

Informe y procedimiento vigente para retomar D04b/D05:
[17-cobertura-cotizacion-contratacion-20261028.md](17-cobertura-cotizacion-contratacion-20261028.md).
Los informes 14–16 y sus ejecuciones se preservan como históricos; no se sustituye
su evidencia ni se eleva el estado académico por estos nuevos tests.

BUG 1: CSP QA bloqueaba tiles de OpenStreetMap y el selector solo mostraba polígonos
del punto factible. Ahora permite únicamente el origen HTTPS de tiles en img-src,
mantiene connect-src self, muestra aviso de cartografía y zonas activas/vigentes
de la empresa incluso en NO_FACTIBLE. Centrar zonas no mueve ni guarda el domicilio.
No se descargaron tiles externos ni se verificó visualmente el navegador.

BUG 2: deshabilitar edición limpiaba el resultado comercial y dejaba cero planes.
Se separó lectura de cobertura de edición y se expusieron referencias mínimas de
cotizaciones persistidas en la lista existente. Contratación exige empresa, plan
activo, disponibilidad actual y cotización válida. Backend vuelve a comprobar
cobertura; un lock por prospecto impide duplicar contratos entre dos confirmaciones
simultáneas y conserva reutilización del contrato pendiente.

Resultados: **49/49 frontend**, **79/79 backend pertinentes**, builds backend/frontend
PASS, lint backend PASS, lint frontend 0 errores/78 advertencias anteriores,
7/7 aislamiento/simuladores, **7/7 HTTP/PostgreSQL real QA**, diff-check PASS.
Las bases de regresión se limpiaron. La primera ejecución tenía un metadato de
hash PDF calculado sobre JSON del Buffer; se conserva y se distingue de la segunda,
cuyo hash binario fue comprobado contra el archivo y es la evidencia final.

Run de regresión final: c65d3a78-f46f-4303-b8f8-bb2c79ede149.
Nueva sesión manual: **http://127.0.0.1:50492**, run
71c013a4-2f40-4cbf-8267-51e6897b5f88, expira el 28-10 a las **16:55:34 Chile**.
Preparación secundaria y cuatro logins comprobados; principal reservado para alta
manual. La sesión del documento 15 había expirado; no se restauró ninguna DB.
Snapshot: [coverage-manual-ready](evidencias-qa/coverage-manual-ready-71c013a4-2f40-4cbf-8267-51e6897b5f88.json).

Se agregaron tres filas NOT_EXECUTED (D03-MAP, D04b, D05) a 09 sin reemplazar filas
anteriores. Los 21 artefactos de los tres manifiestos previos siguen coincidiendo.
Nuevo manifiesto: evidencias-qa/SHA256SUMS-coverage-quote-20261028.txt.
La corrección PDF anterior conserva hashes fuente/compilado y su evidencia 9/9;
no se modificó en esta ronda. Stage vacío, sin commit/push/merge/deploy, schema,
migraciones, `.env`, Railway, proveedores de integración reales ni respaldos.

Estado general: **DEMO_PARTIAL / ACADEMIC_CONDITIONAL**. La revisión Railway del
informe 16 pertenece a la ronda anterior; no se repitió ni autoriza el despliegue
de estos cambios. E2E intergrupal real y aceptación visual siguen pendientes.

## Continuidad 28-10-2026 — comuna y consulta de cierre G3

Se completó la corrección descrita en
[18-instalacion-comuna-conflicto-g3-qa.md](18-instalacion-comuna-conflicto-g3-qa.md).
La OT original 9700002 estaba pendiente; el 409 procedía del GET de cierre todavía
no disponible, y el 500 del POST reconcile G8 que relanzaba una excepción ordinaria.
No se demostró colisión de POST/request_id en esa incidencia.

Regresión final: 10/10 PostgreSQL, run `b63247d9-cbd3-4ab2-8fc4-0ffd6e06763d`,
con cleanup confirmado. Backend dirigido: 429/429 en 18 suites; frontend: 54/54;
guardas/simulador: 3/3. Builds PASS, lint sin errores (78 advertencias frontend
preexistentes), diff check PASS. Stage vacío. Los 24 artefactos anteriores conservan
sus hashes y el PDF previo no se alteró. No se ejecutó suite backend completa ni
aceptación visual en esta ronda.

La sesión manual anterior expiró automáticamente a las 16:55 Chile. Nueva sesión
aislada: **http://127.0.0.1:59525**, run `44810c0b-7d6c-4b3d-90b1-63d44ebecbdb`,
hasta las **22:29 Chile**. Contratos sintéticos 3 (comuna faltante) y 4 (comuna
informada), firmados mediante flujos G8; cero tracking/OT al prepararla. Los IDs
son locales a esta nueva base, no restauraciones de los casos anteriores.
La preparación intermedia del puerto 61119 conserva su TTL, pero no debe usarse
para estas capturas: la sesión final incluye también IDs de unidad G1 distintos.

D06–D08 quedan **NOT_EXECUTED visualmente** en esta sesión. El informe 18 contiene
el procedimiento y el control de cierre simulado. No hubo Railway, proveedores
reales, commit, push, merge o deploy; se preservaron respaldos y archivos ajenos.
