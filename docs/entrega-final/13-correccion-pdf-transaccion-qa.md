# P0-07A — Corrección PDF: evidencia y revisión separada

> Consolidación 29-10-2026: este documento conserva resultados y sesiones históricas. El estado de publicación vigente está en [19](19-consolidacion-publicacion-p0-07.md). Las sesiones con TTL vencido no deben reutilizarse. Las referencias a `evidencias-qa/` corresponden a archivos locales preservados, excluidos de este PR; el resumen automatizado publicable está en [validación](p0-07-validacion-publicacion.json). La distribución académica y la certificación productiva siguen separadas de esta PR.

Fecha: 27-10-2026. Rama conservada: `docs/i4-p0-07-cierre-entrega`.
HEAD: `a8d2598151c988ef8f4f4a09977fe36167d79f62`; los cambios descritos son locales, sin commit.
Resultado del defecto: **QA_PASS**. Estado académico: **DEMO_PARTIAL / ACADEMIC_CONDITIONAL**.

## Causa confirmada antes de modificar el servicio

`generateDigitalContract()` retenía una conexión y el bloqueo `FOR UPDATE` dentro
de una transacción interactiva. `renderDigitalContract()` llamaba a
`resolvePlanPrice()` usando Prisma principal, por lo que solicitaba otra conexión.
Con `connection_limit=1` no podía obtenerla hasta finalizar la transacción que
estaba esperando ese mismo render. Además, la auditoría se llamaba sin `tx`:
utilizaba otra conexión y podía ocultar un error de persistencia.

Se reprodujo con el código anterior compilado y PostgreSQL 18.6 nuevo y exclusivo:

| Configuración anterior | Resultado real | Persistencia |
|---|---|---|
| Pool 1 | P2024 después de 10.056 ms | 0 documentos, 0 auditorías, 0 archivos |
| Pool 5 | Generación en 140 ms | 1 documento, 1 auditoría, 1 archivo |

[Baseline JSON](evidencias-qa/pdf-baseline-3c9a8345-c4da-4110-94ea-72ea8816bc9d.json).
El PASS del caso baseline significa que se reprodujo el defecto esperado, no que
el servicio anterior funcionara con pool 1. No existe un mínimo oficial de cinco
conexiones definido en el repositorio; aumentar el pool no corrige la dependencia.

## Diff productivo revisable: solo dos archivos

- `backend/src/contracts/contracts.service.ts`: lectura del contrato bajo el lock,
  resolución de precio y auditoría usan el mismo `tx`. Se preservan el bloqueo,
  el timeout de 20 segundos, las validaciones de empresa, el contenido PDF y el
  cálculo de versión. La autorización también se comprueba antes de bloquear.
- `backend/src/contracts/contracts-pdf.spec.ts`: regresiones de cliente transaccional,
  auditoría, versiones, escritura parcial, rollback, colisión de archivo,
  confirmación persistida con ACK perdido, descarga histórica y empresa no autorizada.

Documento digital y auditoría se confirman o revierten juntos. Cada intento crea
un nombre de archivo exclusivo con UUID y apertura `wx`: una limpieza posterior
a rollback no puede borrar el PDF de otro intento que reutilice la versión.
Ante error, una consulta fuera de la transacción terminada verifica si ese archivo
está referenciado. Solo se elimina el archivo propio sin registro persistido.
Si el commit se confirmó pero se perdió su respuesta, se conserva el archivo.
Si no puede determinarse el estado de DB o falla la eliminación, se conserva y se
registra `CONTRACT_PDF_CLEANUP_PENDING` sin payloads ni secretos.

No se cambian endpoints, DTO, permisos, schema, migraciones ni contratos intergrupo.
El valor `urlDocumento` de los documentos nuevos contiene un nombre opaco con UUID.
El consumidor real `ContractDocuments.tsx` descarga por ID de contrato y versión;
no construye la ruta física. El nombre de descarga visible sigue siendo
`contrato-ID-vN.pdf`. Los documentos anteriores no se regeneran ni renombran.

Para una publicación posterior, revisar únicamente esos dos archivos como corrección
productiva y el harness como soporte de pruebas. Los documentos se revisan por separado.
No se creó otra rama ni se movió el working tree; no se realizó stage ni publicación.

## Regresión en PostgreSQL real y desechable

[Resultados completos](evidencias-qa/pdf-regression-e7714d25-a208-4df3-aa07-21492b198397.json).
Cada ejecución crea su cluster propio con marcador de propiedad, puerto loopback,
rol y base QA; comprueba cero tablas antes de cargar el contrato canónico y fixtures
sintéticas. No acepta una URL de base externa ni hereda credenciales productivas.
Baseline y regresión terminaron con `cleanup=true`.

| Caso | Resultado / evidencia |
|---|---|
| Pool 1 | PASS; versión 1 en 108 ms |
| Pool 5 | PASS; versión 2 en 78 ms |
| Versiones consecutivas | PASS; versiones 3 y 4 |
| Dos procesos y conexiones independientes | PASS; versiones 5 y 6 sin duplicación |
| Escritura parcial del PDF seguida de error | PASS; archivo parcial eliminado, filas sin cambios |
| Fallo de INSERT de documento mediante trigger QA | PASS; rollback y limpieza, sin versión consumida |
| Fallo de INSERT de auditoría mediante trigger QA | PASS; documento y auditoría revierten, sin huérfano |
| Auditoría, hashes y descarga de versiones 1 y 6 | PASS; 6 documentos, 6 auditorías, 6 archivos; hashes DB/archivo iguales |
| Usuario de otra empresa | PASS; rechazo existente 400 antes de escrituras, conteos intactos |

La concurrencia se probó con procesos independientes y pool 1 en cada proceso,
no solo mediante mocks. No equivale a prueba de carga o de múltiples hosts.
El caso de ACK de commit perdido está cubierto por unit test; no se inyectó una
interrupción física de red durante COMMIT PostgreSQL.

Identidad de artefactos posteriores al cambio:

- Fuente del servicio: `3f75950294ddd656565d6bb54497d6be674f62a2e44f4fe02f7270b76746b123`.
- Compilado: `bf51a35a30d609bf39848dab6ef8686e10f64bf966d06d98787efde6fb738c38`.
- Canónico, sin modificaciones: `f42140bff257d8bcaf46d2f74d5c44fa6d304bd8f84e20085ba3bbf07bfeb2aa`.

## Comandos y resultados de esta intervención

Ejecutar desde la raíz del checkout, con dependencias ya instaladas y PostgreSQL
local en `C:/Program Files/PostgreSQL/18/bin`. No cargar `.env` productivos.

```powershell
npm.cmd --prefix backend test -- --runInBand contracts-pdf.spec.ts contracts.service.spec.ts plan-changes.spec.ts
npm.cmd --prefix backend run build
npm.cmd --prefix backend run lint
node scripts/p0-07-pdf-qa.cjs
node --test scripts/p0-07-demo-qa.test.cjs scripts/p0-05-qa-isolation.test.mjs
git diff --check
```

Resultados: 26 pruebas dirigidas / 3 suites PASS; build PASS; lint PASS;
9 casos PostgreSQL PASS; 6 pruebas de aislamiento/simuladores PASS;
`git diff --check` PASS. Sintaxis Node de los tres scripts nuevos/modificados PASS.
La regresión completa histórica de P0-07 no se vuelve a atribuir a esta ejecución.
No se modificó frontend y no se repitió su build.

El harness `scripts/p0-07-pdf-qa.cjs` conserva un modo `--baseline`, usado antes del
cambio. No ejecutarlo esperando P2024 con el servicio corregido: la reproducción
histórica quedó registrada; no revertir código para repetirla.

## Límites y riesgo restante

PostgreSQL y el filesystem no comparten una transacción atómica. Un kill abrupto
después de escribir el archivo y antes de terminar el commit puede dejar un
huérfano. No se implementó un recolector automático ni se eliminaron archivos
históricos. La limpieza ante error controlado sí está probada. Si la confirmación
del commit es incierta o DB no responde, se prefiere conservar el archivo para
inspección posterior. No se garantiza limpieza frente a caída del host.

El render y el I/O siguen dentro del timeout de 20 segundos. La prueba valida el
flujo PDF con pool 1, no todos los módulos bajo esa configuración. La unicidad de
versiones depende del bloqueo existente en esta ruta; no se añadió una constraint.
Múltiples instancias deben compartir el almacenamiento de documentos, como antes.
La revisión visual del PDF nuevo por el operador sigue pendiente; los tests de
contenido y las descargas binarias no se presentan como captura o aceptación visual.

No hubo Railway, producción, proveedores reales, escrituras externas, commit o push.
