# P0-05 — Certificación PostgreSQL QA local

Fecha: 26-10-2026. Resultado: **QA_PASS** para los ocho escenarios solicitados.
No constituye certificación E2E con G1/G3 reales ni autorización de despliegue.

## Código y alcance

- Rama: `test/i4-p0-05-postgresql-qa`.
- HEAD/base: `552f4280f99b9f8ce2c96c8f1572c4655ee0fea0`, merge PR #59 / P0-05.
- Se creó desde la referencia local disponible `origin/develop`, que contiene
  P0-03 (PR #57), P0-04 (PR #58) y P0-05 (PR #59). No se hizo fetch ni merge.
- Se revisaron el informe P0-05, G3ClosureProcessor, InstallationActivationService,
  InstallationIntegrationService, G1ActivationService, HttpG1InventoryClient,
  AuditService, pruebas G1/G3, contrato global y configuración Docker/PostgreSQL.
- No se detectó un defecto productivo en los escenarios ejecutados. No se modificó
  código backend, contratos intergrupo, Prisma, migraciones, SQL canónico ni `.env`.
- Solo se incorporan archivos de harness, pruebas de aislamiento, este informe y
  [evidencia JSON](i4-p0-05-postgresql-qa.evidence.json).

## Entorno y aislamiento demostrado

PostgreSQL **18.6**, x86_64 Windows, Prisma Client **5.22.0**. Docker CLI estaba
disponible, pero no un daemon accesible; no se usó ningún compose del repositorio.
Se utilizó la instalación de binarios `C:\Program Files\PostgreSQL\18\bin` para
crear un clúster nuevo, independiente de cualquier servicio PostgreSQL existente.

Cada ejecución crea con `initdb` un directorio exclusivo
`%TEMP%\finet-p005-qa-<aleatorio>`, usuario `p005_qa`, contraseña aleatoria efímera
y base `p005_qa_<UUID>`. El listener solo acepta loopback `127.0.0.1` en puerto
efímero, con autenticación SCRAM. No se acepta una URL de DB como argumento.

Antes de crear la base se comprueban el marcador exclusivo y `data_directory`.
Antes de ejecutar DDL/fixtures, el padre verifica también nombre de DB, usuario,
host, puerto y directorio; exige cero tablas public. Cada worker vuelve a verificar
esa identidad mediante SELECT antes de operar. Los cuatro tests de aislamiento
rechazan hosts externos, DB existentes, usuarios/puertos distintos, parámetros de
conexión adicionales, marcadores/directorios incorrectos y variables heredadas de
credenciales. El cliente Prisma recibe explícitamente la URL efímera.

Se materializa **solo en esa base vacía** `db/global/init-global.sql`, SHA-256:
`f42140bff257d8bcaf46d2f74d5c44fa6d304bd8f84e20085ba3bbf07bfeb2aa`.
No se ejecutan Prisma migrate, db push ni seeds del repositorio. El harness inserta
exclusivamente fixtures sintéticos y agrega una tabla, dos funciones, dos triggers
y dos secuencias de inyección de fallos, también exclusivos de QA. Las secuencias
son testigos no transaccionales de que el fallo se alcanzó incluso tras rollback.

G1 se simula con un servidor HTTP en otro puerto efímero de `127.0.0.1`, clave
aleatoria y endpoint de activación existente. Se usa el adaptador HTTP G1 real;
fetch se limita al origen del simulador y prohíbe redirects. El cliente G3 del
harness lanza error ante cualquier invocación. No se carga AppModule ni se inicia
el backend general. No se usan credenciales productivas.

Al finalizar, se detienen los workers, se desconecta Prisma y se cierra el servidor
HTTP. `pg_ctl` detiene únicamente el clúster creado; la eliminación exige marcador,
ruta temporal exclusiva y ausencia de `postmaster.pid`. La ejecución registrada
confirmó `cleanup=true` y posteriormente se comprobó que su directorio no existía.

Ejecución final: **14:20:56–14:21:34 UTC** del 26-10-2026
(11:20:56–11:21:34 America/Santiago). El JSON registra los puertos, directorio,
UUID, PID PostgreSQL y PID de cada proceso usados realmente; no contiene claves,
URLs con contraseña, RUT, nombres, teléfonos ni payloads completos.

## Resultados por escenario

Los contadores siguientes son por tracking/contrato, excepto donde se indique.
Los IDs son exclusivamente de esta base sintética; no representan OT históricas.

| # | Prueba y evidencia observada | Resultado |
| --- | --- | --- |
| 1 | Trigger falla al insertar el evento: **1 fallo inyectado confirmado**. Activación invocada una vez, pero quedan 0 clientes nuevos, 0 servicios, 0 eventos, 0 G1, 0 auditorías y 0 POST. Contrato Firmado, prospecto y relaciones sin cambios, tracking ENVIADA. | PASS |
| 2 | `process.exit(73)` después del commit comercial, antes de crear G1. Ya existen tracking COMPLETADA, servicio y evento; G1 todavía tiene 0 filas. Un proceso nuevo, sin recibir el cierre original, recupera por tracking con 0 llamadas a activate: 1 G1, 1 POST, 2 auditorías G3 y 2 G1. | PASS |
| 3 | Trigger falla en la **segunda** auditoría G3, confirmado por secuencia. La primera también revierte: 0 auditorías G3, marcador PENDIENTE; activación comercial y G1 siguen confirmados. Recuperación deja exactamente 2 auditorías G3, sin segundo POST. | PASS |
| 4 | Dos procesos y conexiones PostgreSQL independientes, con `pg_backend_pid()` distintos, recuperan simultáneamente. Quedan 1 evento, 1 G1, 1 intento, 1 POST y 1 servicio; ambos workers llaman activate 0 veces. Auditorías G3/G1: 2/2. | PASS |
| 5 | G1 confirma; falla persistencia de su auditoría (1 fallo inyectado) y el proceso termina con código 74 antes de actualizar el marcador G3. G1 permanece COMPLETADA con 0 auditorías. Proceso nuevo recupera 2 auditorías, sin reactivar ni reenviar: 1 POST total. | PASS |
| 6 | Se retiene la respuesta HTTP del primer intento; únicamente en QA se vence su lease adelantando `ultimoIntento` seis minutos hacia atrás. El segundo intento confirma y después llega el 503 antiguo. Estado final COMPLETADA, 2 intentos/2 POST, 1 efecto; auditorías atribuidas al intento 2 sin incorporar el 503 antiguo. | PASS |
| 7 | Un cliente Moroso, con empresa principal 1, activa contratos legítimos de empresas 1 y 2. Mantiene identidad, empresa principal y estado Moroso; servicios separados. Usuario Comercial de empresa 1 recibe 403 al recuperar empresa 2, sin cambios. Relación servicio/cliente inconsistente produce ERROR_REQUIERE_REVISION y 0 POST; al restaurar solo el fixture QA, la recuperación autorizada de empresa 2 confirma su propio contrato/servicio. | PASS |
| 8 | Simulador acepta el primer evento y corta la conexión antes del ACK. G8 conserva PENDIENTE_SINCRONIZACION_G1. Retry desde otro proceso conserva event_id y hash del payload: 2 POST, 1 efecto, `duplicado=true`, 1 fila G1 y 1 servicio. Auditorías G1: 3 (resultado pendiente del intento 1 y dos del intento 2). | PASS |

Resultado final global antes de destruir la base:

| Objeto | Filas/conteo |
| --- | ---: |
| Empresas | 2 |
| Clientes | 8 |
| Contratos | 9 |
| Servicios | 8 |
| Trackings G3 | 9 |
| Eventos de cierre | 8 |
| Trackings G1 | 8 |
| Auditorías | 33 |
| POST al simulador local | 10 |
| Efectos únicos del simulador | 8 |

El contrato/tracking del caso 1 permanece como fixture previo, sin activación.
El caso 7 incluye un cliente auxiliar para demostrar el rechazo de una relación
inconsistente. Los saltos de secuencia tras rollback son esperados y no implican
filas comerciales parcialmente confirmadas.

## Garantías y límites

**Demostrado con PostgreSQL real:** rollback comercial, persistencia durable de la
intención y del evento, recuperación desde procesos nuevos, atomicidad de ambas
auditorías G3, recuperación de auditoría G1 sin degradar su confirmación, reserva
concurrente de envío, protección frente a resultados tardíos y aislamiento de
empresa/contrato/servicio con una identidad compartida. Los servicios productivos
se ejecutan compilados, usando Prisma y AuditService reales; no se mockea la DB.

**Demostrado con simulador HTTP:** preservación de event_id/payload al perder ACK,
interpretación del duplicado y un solo efecto simulado ante dos entregas. El
simulador conserva su registro de eventos durante la ejecución; no certifica
durabilidad ni retención de idempotencia después de un reinicio del proveedor G1.
La garantía física de exactamente un efecto en G1 real sigue dependiendo de su
contrato, implementación y pruebas coordinadas. No existe transacción distribuida.

Los procesos G8 sí terminan y se recrean realmente; no se simula corte eléctrico,
pérdida de disco, caída del motor ni failover. La prueba de lease usa inyección
temporal local, no una espera de cinco minutos ni una alteración productiva.
Una ejecución concurrente comprueba los entrelazados observados, no todas las
planificaciones posibles. La deduplicación de auditorías continúa dependiendo de
escritores que respetan los bloqueos P0-05; no existe UNIQUE para su clave lógica.

La recuperación sigue siendo **bajo demanda**. No se agrega cron ni worker
periódico. Se prueban servicios y adaptador HTTP G1; no se certifica el despliegue
completo, autenticación HTTP entrante real, G3 real, inventario físico ni VPS.
No se ejecutó ni modificó OT #53 ni ningún registro histórico.

## Comandos reproducibles

Requisitos: dependencias del repo ya instaladas, cliente Prisma generado acorde
al schema actual, binarios PostgreSQL 18 disponibles y permisos para ejecutar
procesos locales. No iniciar Docker Compose ni proporcionar DATABASE_URL real.

Desde el checkout, en PowerShell:

```powershell
npm.cmd --prefix backend run build
node --test scripts/p0-05-qa-isolation.test.mjs
node scripts/p0-05-postgresql-qa.cjs 'C:\Program Files\PostgreSQL\18\bin'
$env:CRM_INTEGRATION_TESTS = '0'
$env:RUN_DB_INTEGRATION = '0'
$env:RUN_POSTGRES_INTEGRATION_TESTS = 'false'
npm.cmd --prefix backend test -- g3-integration g1-integration --runInBand --silent
npm.cmd --prefix backend run lint
node --check scripts/p0-05-postgresql-qa.cjs
node --check scripts/p0-05-qa-isolation.cjs
node --check scripts/p0-05-qa-worker.cjs
git diff --check
```

El harness reemplaza solamente su archivo de evidencia JSON, crea un clúster nuevo
por ejecución y lo elimina al finalizar. Un fallo de aislamiento/arranque produce
QA_BLOCKED; un escenario que no satisface sus aserciones produce QA_FAIL. No cambiar
las guardas para apuntarlo a una DB preexistente. Si la limpieza no se confirma,
conservar el directorio para revisión y no eliminar carpetas ajenas.

En esta máquina el sandbox inicial bloqueó el token restringido de `pg_ctl`.
Se autorizó ejecutar el harness aislado fuera del sandbox. También se corrigió
en el harness la herencia de pipes de procesos daemon en Windows y se reconoció
la representación exacta loopback `127.0.0.1/32` de PostgreSQL 18. Estos fueron
problemas de preparación de QA, no defectos productivos de P0-05.

## Validaciones de esta intervención

| Validación | Resultado |
| --- | --- |
| Ocho escenarios PostgreSQL reales | 8 PASS, 0 FAIL; limpieza confirmada |
| Tests del aislamiento | 4 PASS, 0 FAIL |
| Tests dirigidos G1/G3 | 351 PASS, 15 suites, 0 FAIL |
| Build backend | PASS |
| Lint backend | PASS |
| Sintaxis Node del harness | PASS |
| git diff --check | PASS |

No se repitió la regresión backend completa ni frontend porque no se cambió lógica
productiva. Los fallos históricos registrados en el informe P0-05 no se declaran
corregidos por esta certificación. El lint backend cubre TypeScript de `src`; los
scripts CJS/MJS se verifican con Node y sus pruebas propias.

## Archivos y recomendaciones

- `scripts/p0-05-postgresql-qa.cjs`: orquestación, G1 HTTP local, fixtures, fallos y aserciones.
- `scripts/p0-05-qa-isolation.cjs`: clúster exclusivo, credenciales efímeras, atestación y limpieza.
- `scripts/p0-05-qa-worker.cjs`: servicios reales en procesos independientes y puntos de caída.
- `scripts/p0-05-qa-isolation.test.mjs`: regresiones de las barreras de aislamiento.
- `docs/i4-p0-05-postgresql-qa.evidence.json`: evidencia de la última ejecución.
- Este documento.

El informe P0-05 original conserva su condición histórica de PostgreSQL pendiente
en aquella fecha de revisión; esta certificación complementa ese informe con
evidencia local real. No reemplaza la ratificación E2E de los grupos.

Recomendación: revisar el harness y esta evidencia antes de publicar el cambio;
preparar por separado el smoke autorizado con G1 real, incluyendo ACK perdido,
retención del event_id y resultado físico. Operar la recuperación bajo demanda
mediante las rutas existentes y revisar sus estados; no introducir reenvíos
automáticos ni reparaciones históricas como parte de esta certificación.

Sin commit, push, merge, despliegue, migraciones compartidas, db push, accesos a
Railway o proveedores reales. Stage vacío. Se preservaron `-f`, `output/`, respaldos
y archivos locales ajenos. Todas las escrituras de DB correspondieron al clúster
QA nuevo y desechable; ningún esquema o dato existente fue modificado.
