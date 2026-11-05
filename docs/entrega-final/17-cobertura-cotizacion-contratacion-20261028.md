# P0-07A — Cobertura → cotización → contratación

> Consolidación 29-10-2026: este documento conserva resultados y sesiones históricas. El estado de publicación vigente está en [19](19-consolidacion-publicacion-p0-07.md). Las sesiones con TTL vencido no deben reutilizarse. Las referencias a `evidencias-qa/` corresponden a archivos locales preservados, excluidos de este PR; el resumen automatizado publicable está en [validación](p0-07-validacion-publicacion.json). La distribución académica y la certificación productiva siguen separadas de esta PR.

Fecha: 28-10-2026. Rama conservada `docs/i4-p0-07-cierre-entrega`, HEAD
`a8d2598151c988ef8f4f4a09977fe36167d79f62` más cambios locales sin commit.
Estado: **DEMO_PARTIAL / ACADEMIC_CONDITIONAL**; correcciones verificadas en tests
React reales y HTTP/PostgreSQL QA. No hay nueva aprobación visual del operador.

## BUG 1: cartografía y zonas disponibles

**Causa comprobada en código y cabecera QA:** la CSP servida anteriormente solo
permitía imágenes self/data/blob, mientras Leaflet pedía tiles a
`https://tile.openstreetmap.org`. El navegador debía bloquear esas imágenes.
No se atribuye el problema a un fallo del proveedor o del navegador: no se hicieron
solicitudes a tiles reales ni se inspeccionó Opera en esta intervención.

La CSP QA ahora añade exclusivamente `https://tile.openstreetmap.org` a `img-src`.
`connect-src 'self'`, scripts y demás restricciones permanecen. Backend conserva
el guard de red loopback y los proveedores simulados. Esta excepción permite que
el operador cargue imágenes cartográficas normales, no APIs de geocodificación ni
tráfico libre. No se modificaron Railway, nginx productivo o `.env`.

Se agregaron avisos visibles por `tileerror` y espera inicial de ocho segundos en
el mapa comercial y el administrador. El error menciona conectividad, bloqueo de
navegador o CSP sin afirmar una causa que el evento no distingue. Las coordenadas
manuales y polígonos siguen funcionando; editar el domicilio continúa sujeto a las
reglas de la etapa comercial. Un tile cargado confirma recuperación de la base.

El selector comercial antes dibujaba solo zona/microzona del resultado; fuera de
cobertura ambas eran null. Ahora consulta `/coverage/zones?idEmpresa=…`, conserva
solo polígonos activos/vigentes de la empresa seleccionada y los dibuja aunque el
resultado del punto sea NO_FACTIBLE. «Ver zonas disponibles» ajusta el encuadre,
sin llamar a onChange, mover el pin o persistir una ubicación. La selección manual
recalcula factibilidad; un punto exterior sigue siendo NO_FACTIBLE.

Se mantiene atribución visible, HTTPS, Referer de origen y caché normal del navegador.
No hay proxy de tiles, precarga, scraping ni descarga de áreas. La política de
OSMF se consultó como documentación, no como proveedor de datos de la prueba:
[Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/).
La disponibilidad externa es best effort; su representación visual está pendiente.

## BUG 2: plan cotizado desaparecía al bloquear la edición

**Hipótesis confirmada:** el efecto de cobertura dependía de `disabled`, ejecutaba
`setResult(null)` / `onResult(null)` y retornaba cuando la ubicación no era editable.
Al pasar a Cotizacion Enviada, el padre deshabilitaba ese editor y convertía null
en `availablePlanIds=[]`. Desaparecían las opciones pese a existir cotización.
Además, la respuesta de `/prospects` no incluía referencias de cotizaciones
persistidas para recuperar las opciones al reabrir o iniciar otra sesión.

Corrección:

1. Consultar disponibilidad comercial es independiente de editar el pin. El cambio
   de disabled ya no invalida el resultado ni impide la consulta READ ONLY del punto.
2. Se añade `cotizaciones` a la respuesta existente de lista de prospectos, con
   únicamente idCotizacion, idPlan y fechaEnvio. Se seleccionan cotizaciones factibles
   con fecha de envío; se excluyen planes ajenos/inactivos. No hay endpoint nuevo.
3. El selector de cotización cruza empresa, plan activo y disponibilidad actual.
   El selector de contratación además exige la referencia persistida de una
   cotización válida de ese plan. Mientras se carga/falla cobertura, no se abren
   todos los planes como fallback. Un estado histórico por sí solo no autoriza.
4. Backend vuelve a comprobar disponibilidad del plan en la ubicación al confirmar,
   usando la misma autoridad comercial existente. Conserva rechazos por ausencia
   de cotización, NO_FACTIBLE, Perdido, plan inactivo o ajeno.
5. Se serializan confirmaciones mediante `SELECT id_prospecto … FOR UPDATE` dentro
   de la transacción. Un contrato pendiente se reutiliza; un contrato ya confirmado
   produce conflicto y no se crea otro. El SELECT devuelve un entero, no `void`.

No cambian schema, migraciones, polígonos, precios, reglas geométricas, estados
históricos, credenciales ni contratos G1/G2/G3. La extensión de `/prospects` es
aditiva; el frontend nuevo requiere el backend nuevo para confirmar usando esas
referencias. No desplegar únicamente el frontend contra un backend sin el campo.
Registros antiguos sin coordenadas válidas requieren revisión: no se inventan
coordenadas ni se reparan automáticamente para habilitar su contrato.

## Pruebas y resultados reales

| Validación ejecutada | Resultado |
|---|---|
| Frontend completo, incluidos 5 casos React nuevos | **49/49 PASS** |
| Backend prospects.service, prospects-quote-flow, coverage-domain, coverage.dto | **79/79 PASS**, 4 suites; 9 tests nuevos |
| Backend build | PASS |
| Frontend build | PASS; aviso habitual de chunk principal >500 kB |
| Backend lint | PASS |
| Frontend lint | 0 errores; **78 advertencias preexistentes**, sin aumento |
| Tests de guard QA, aislamiento y simuladores | **7/7 PASS** |
| Sintaxis Node y git diff --check | PASS |
| HTTP + PostgreSQL 18.6 nuevo y exclusivo | **7/7 escenarios PASS**, cleanup=true |

Los tests React montan los TSX reales con react-test-renderer, efectos y timers;
solo se sustituyen HTTP, Leaflet y paneles ajenos. Cubren Factible → generación de
PDF (invocación de apertura) → cambio a Cotizacion Enviada con editor bloqueado →
plan todavía seleccionable → desmontaje/remontaje con datos persistidos → POST
de contratación. Cubren además ausencia de cotización, perdido, NO_FACTIBLE,
planes inactivos/ajenos, fallo de tiles, centrado sin mover pin y cambio de empresa.
No son comprobaciones estáticas de texto ni una captura real del PDF abierto.

Evidencia principal HTTP/PG:
[run-c65d3a78](evidencias-qa/run-c65d3a78-f46f-4303-b8f8-bb2c79ede149.json).

| Escenario HTTP/PG | Evidencia observada |
|---|---|
| Coordenadas FiNet y Cable, scope | FACTIBLE con planes 1 y 2 respectivamente; consulta de zonas ajenas 403 |
| Sin cotización / plan inactivo / plan ajeno | Tres rechazos 400; cero contratos |
| Cotización y sesión nueva | PDF descargado; estado Cotizacion Enviada; lista tras otro login devuelve cotización del plan 1 |
| Dos confirmaciones concurrentes | Dos respuestas con contrato 3; una sola fila, estado Pendiente firma contrato |
| Punto exterior y cambio normal de ubicación | NO_FACTIBLE, rechazos quote/contract; al actualizar por API a punto interior, FACTIBLE; sin contrato creado |
| Prospecto perdido | Rechazo tras cotización válida y pérdida registrada por API; cero contratos |
| Datos y seguridad | Hash de zonas/precios sin cambios; principal manual 99000001-8 ausente; CSP exacta; ningún tile externo solicitado |

[PDF sintético descargado](evidencias-qa/coverage-quote-c65d3a78-f46f-4303-b8f8-bb2c79ede149.pdf),
SHA-256 `9b2c7f88ee4c2e71f45151a9761910af24b180dccb38f83d8f393729782a61e9`.
No se abrió visualmente por herramientas ni se marca esa revisión PASS.

Se conserva también el primer run 2dcb8b11, que aprobó los siete escenarios, pero
su campo pdfSha256 calculaba la serialización JSON del Buffer. Se corrigió el
harness y se repitió en otra base nueva; c65d3a78 es la evidencia final y su hash
se contrastó con los bytes del archivo. No se borró la ejecución anterior ni se
sumaron ambos runs para inflar el conteo. Ambos terminaron con cleanup confirmado.

Los fixtures negativos son registros sintéticos dedicados, no cambios a registros
de la demostración para forzar PASS. La cobertura exterior se corrigió mediante
la operación normal de ubicación, para probar esa transición solicitada. No se
modificó SQL productivo ni se conectó con Railway en esta intervención.

Comandos reproducibles desde la raíz:

```powershell
npm.cmd --prefix frontend test -- --run
npm.cmd --prefix backend test -- --runInBand prospects.service.spec.ts prospects-quote-flow.spec.ts coverage-domain.service.spec.ts coverage.dto.spec.ts
npm.cmd --prefix backend run build
npm.cmd --prefix frontend run build
npm.cmd --prefix backend run lint
npm.cmd --prefix frontend run lint
node --test scripts/p0-07-demo-qa.test.cjs scripts/p0-05-qa-isolation.test.mjs
node scripts/p0-07-demo-qa.cjs --coverage-flow
git diff --check
```

El modo --coverage-flow exige cluster nuevo propio, usa cuentas sintéticas, registra
resultados y limpia al terminar. No se combina con --operator-ready. No acepta
URLs de base de datos ni hereda `.env` productivo. El modo manual se deja separado.

## Retomar D04b/D05 manualmente

Nueva instancia verificada: **http://127.0.0.1:50492**.
Run `71c013a4-2f40-4cbf-8267-51e6897b5f88`.
Expira automáticamente el **28-10-2026 a las 16:55:34 America/Santiago**
(`19:55:34Z`). La anterior del documento 15 expiró a las 11:55; no se restauró.
La nueva conserva la preparación completa secundaria, pero no precarga el principal.

```powershell
$qaPrivateFile = '<archivo-privado-del-run-QA-actual>'
node scripts/p0-07-qa-http-check.cjs $qaPrivateFile --status
$qaSession = Get-Content -LiteralPath $qaPrivateFile -Raw | ConvertFrom-Json
($qaSession.accounts | Where-Object alias -eq 'finet').password | Set-Clipboard
```

1. Entrar como `qa-finet@example.invalid` con esa contraseña QA privada. No mostrar
   archivo/contraseña; borrar portapapeles después. Crear manualmente el principal
   del documento 15 (99000001-8, Prospecto Manual QA FiNet, coordenadas
   -33.475/-70.675). No reutilizar la OT histórica ni asumir IDs del run anterior.
2. En punto exterior -35/-72, comprobar que NO_FACTIBLE muestra las zonas propias.
   «Ver zonas disponibles» solo centra. Verificar cartografía; si no carga, conservar
   el diagnóstico y las coordenadas manuales. No desactivar CSP desde el navegador.
3. En el principal FACTIBLE, generar cotización con Internet QA 1 y abrir PDF.
   Comprobar Cotizacion Enviada; cerrar/reabrir el modal y también recargar página.
4. **D04b:** Plan aceptado → Internet QA 1 → fecha real y observación QA → Confirmar
   contratación. Debe quedar pendiente de firma. Anotar ID y capturar selección,
   cotización y estado. No modificar pipeline para forzar el resultado.
5. **D05:** cerrar sesión y entrar como admin (mismo mecanismo, alias `admin`), ámbito
   FiNet; Clientes → Gestionar contratación → confirmar firma → generar/descargar
   PDF y nueva versión. Capturar PDF abierto e historial. La corrección previa del
   PDF y sus 9/9 pruebas PG están conservadas; no se regeneraron documentos históricos.

El resto del recorrido sigue el documento 15, usando esta URL/archivo privado y
los IDs de esta sesión. Los cuatro logins y el secundario de reactivación se
comprobaron en el arranque nuevo. No ejecutar el runner HTTP sin opción sobre esta
sesión manual. Para terminar: `node scripts/p0-07-qa-http-check.cjs $qaPrivateFile --stop`.
Guardar capturas antes del TTL; no se considera ninguna captura creada hasta que
el operador la entregue y se registre su hash.

## Archivos de esta corrección y preservación

- Backend: prospects.service.ts (referencias persistidas, cobertura al confirmar y
  serialización); prospects.service.spec.ts (fixture coherente);
  nuevo prospects-quote-flow.spec.ts (9 regresiones).
- Frontend: api.ts (campo aditivo); ProspectWorkflowPanel.tsx (intersecciones de planes);
  CommercialCoveragePicker.tsx (consulta independiente, zonas y diagnóstico);
  CoverageZonesPanel.tsx y coverage.css (diagnóstico de cartografía).
- Tests: coverage-geocoding.test.mjs (mocks de nueva lectura/eventos);
  nuevo coverage-quote-workflow.test.mjs (5 casos React).
- QA: p0-07-demo-qa.cjs (CSP limitada, hashes y modo de regresión);
  nuevo p0-07-coverage-flow-qa.cjs.
- Documentación: este informe, append en 12 y bitácora 09; evidencias nuevas separadas.

Los dos archivos de contracts ya modificados NO se tocaron en esta ronda. SHA fuente
`3f75950294ddd656565d6bb54497d6be674f62a2e44f4fe02f7270b76746b123` y compilado
`bf51a35a30d609bf39848dab6ef8686e10f64bf966d06d98787efde6fb738c38` coinciden con la
evidencia previa. Canónico y migraciones sin modificación. `-f`, output, respaldos,
docs y evidencias anteriores preservados. Stage vacío; sin commit/push/merge/deploy.

## Git y límites finales

`git diff --stat` del material versionado: **10 archivos, 239 inserciones, 85 borrados**.
Incluye los 2 archivos PDF previos (148/66); los 8 archivos versionados de esta ronda
aportan 91 inserciones y 19 borrados. Los archivos nuevos sin seguimiento no figuran
en ese stat; la lista anterior los identifica.

```text
 M backend/src/contracts/contracts-pdf.spec.ts
 M backend/src/contracts/contracts.service.ts
 M backend/src/prospects/prospects.service.spec.ts
 M backend/src/prospects/prospects.service.ts
 M frontend/src/api.ts
 M frontend/src/features/coverage/CommercialCoveragePicker.tsx
 M frontend/src/features/coverage/CoverageZonesPanel.tsx
 M frontend/src/features/coverage/coverage.css
 M frontend/src/features/prospects/ProspectWorkflowPanel.tsx
 M frontend/tests/coverage-geocoding.test.mjs
?? -f
?? backend/src/prospects/prospects-quote-flow.spec.ts
?? docs/entrega-final/
?? frontend/tests/coverage-quote-workflow.test.mjs
?? output/backups/pre-i3-schema-20261007-022439.dump.sha256.txt
?? output/i3-final-schema/
?? output/i3-post-migration/
?? output/i3-preflight/
?? scripts/p0-07-coverage-flow-qa.cjs
?? scripts/p0-07-demo-qa.cjs
?? scripts/p0-07-demo-qa.test.cjs
?? scripts/p0-07-pdf-qa.cjs
?? scripts/p0-07-qa-fixtures.cjs
?? scripts/p0-07-qa-http-check.cjs
?? scripts/p0-07-qa-network.cjs
?? scripts/p0-07-qa-prepare.cjs
?? scripts/p0-07-qa-providers.cjs
```

Quedan pendientes el render real de tiles, las capturas D04b/D05 y aceptación del
operador. El proveedor puede ser bloqueado o inaccesible; la interfaz conserva
el diagnóstico y entrada manual. Las pruebas no certifican despliegue, S2S real,
serialización frente a toda modificación administrativa concurrente ni carga masiva.
La reutilización de contrato pendiente preserva el comportamiento anterior; dos
confirmaciones concurrentes de este flujo sí se probaron con PostgreSQL real.
