# G8: revisión de solicitudes G2 y gestión de cobertura

Base: `bd3c87dfb930eea5cc677bc74ee99870be3d6d08`.
Rama: `fix/g8-ticket-attention-catalog`.

## Problemas y corrección

G2 creó solicitudes con `estado_pipeline=NUEVO`, sin `origen_contacto` ni un request ID propio. G8 conserva ese valor como registro pendiente de revisión: una etiqueta no demuestra su procedencia. Además, el modal utilizaba siempre `presentation="summary"`, que no permite seleccionar una ubicación.

El listado incorpora `revisionOrigenG2Disponible` cuando acredita ambas auditorías originales del mismo prospecto:

- `CREAR_PROSPECTO_PORTAL`, entidad `prospecto`, `valor_nuevo.origen=PORTAL`.
- `ACEPTAR_POLITICA_PRIVACIDAD`, entidad `prospecto`, `valor_nuevo.formulario=CONTRATACION`.

La consulta no modifica registros ni devuelve los eventos completos. Las referencias originales opcionales de empresa, prospecto o etapa deben ser coherentes. Si falta evidencia, hay contradicciones o se supera el límite de lectura, no se habilita la recuperación. La confianza depende de la integridad y los permisos del registro de auditoría; no se inventó una identidad S2S ni una firma criptográfica inexistente.

`POST /api/prospects/:id/g2-review`, con `{ "confirmarOrigenG2": true }`, requiere sesión autenticada, Administrador o Comercial y empresa autorizada. Dentro de una transacción Serializable, con bloqueo de fila, vuelve a comprobar:

- Clasificación `PROSPECTO`, etapa exacta `NUEVO`, empresa válida.
- Ausencia de conversión, pérdida, cliente relacionado, contratos, cotizaciones, OT y tracking de instalación G3.
- Ambas evidencias originales; una coincidencia de identidad comercial existente en la misma empresa obliga a revisión especializada, sin fusión ni reasignación.

La aprobación cambia únicamente la etapa a `Prospecto Nuevo`. Registra `REVISAR_SOLICITUD_G2`, operador, empresa, estado anterior y referencias a las dos auditorías dentro de la misma transacción. No asigna origen, ubicación, factibilidad, plan o cliente. Repetir la aprobación devuelve conflicto sin crear una segunda auditoría. Los conflictos de serialización/bloqueo y las modificaciones concurrentes devuelven HTTP 409; otros errores SQL se propagan.

El prospecto global ID 2, ya normalizado manualmente, no se consultó ni modificó. Los valores actuales de `PORTAL`/`Prospecto Nuevo` y el evento de normalización posterior no se utilizan como prueba original.

## Editor y operaciones existentes

El mapa usa `editor` para usuarios con permisos de creación/gestión comercial, sin cliente convertido ni contratos, en `Prospecto Nuevo`, `Contactado`, `En Factibilidad`, `Factible` o `No Factible`. Los demás casos conservan `summary`. Una cotización enviada o un contrato bloquean el editor de este modal; se conservan los flujos contractuales autorizados existentes.

Se puede seleccionar el punto en el mapa, ingresar coordenadas o solicitar geocodificación si el proveedor del entorno está habilitado. El error del geocodificador conserva la alternativa manual. Comuna y región se editan explícitamente: no se deducen de coordenadas, no se inventa ciudad y Nominatim no acredita cobertura.

Secuencia:

1. `PATCH /api/prospects/:id/location`: persiste ubicación y, cuando se proporcionan, dirección, comuna y región. No cambia el pipeline ni asigna factibilidad. Exige `ubicacion` válida y conserva el control contractual y la auditoría.
2. `POST /api/prospects/:id/feasibility/tomodat`: reutiliza el motor comercial existente, por empresa y punto. Solo su resultado determina `Factible`/`No Factible`; no existe un segundo sistema de cobertura.
3. Cotización: exige ubicación, cobertura comercial válida y plan vigente de esa empresa disponible en la cobertura. La contratación conserva las precondiciones existentes de cotización enviada y firma; no activa automáticamente clientes ni servicios.

La consulta de cobertura ocurre fuera del bloqueo. Antes de persistir, se compara el snapshot anterior a la consulta con la fila bloqueada y se comprueba nuevamente que no exista contrato. Así, un cambio de empresa, cliente, etapa, dirección, comuna, región o coordenadas durante la consulta no aplica un resultado obsoleto. Ubicación/factibilidad y sus auditorías se confirman o revierten juntas. Esto no sustituye un sistema general de versionamiento de formularios: una edición iniciada después de otra operación debe consultar el estado actual.

No se cambian los contratos de los endpoints existentes ni S2S G1/G2/G3, categorías, pagos, Webpay, Prisma o SQL canónico. No se requieren variables de entorno nuevas ni migraciones.

## Validación reproducible

Ejecutar con dependencias instaladas, entorno sintético, proveedores deshabilitados y sin cargar `.env` operativos:

```powershell
npm.cmd --prefix backend test -- --runInBand --runTestsByPath src/prospects/prospects-g2-review.spec.ts src/prospects/prospects.service.spec.ts src/prospects/prospects-coverage.spec.ts src/prospects/prospects-quote-flow.spec.ts
node --test frontend/tests/coverage-quote-workflow.test.mjs frontend/tests/prospects-lifecycle.test.mjs frontend/tests/coverage-geocoding.test.mjs
npm.cmd --prefix backend run build
npm.cmd --prefix frontend run build
npm.cmd --prefix backend exec -- prisma validate
git diff --check
```

`scripts/i4-g2-prospect-review-qa.cjs` requiere PostgreSQL 18 instalado en `C:/Program Files/PostgreSQL/18/bin`, Prisma generado y backend compilado. Crea un clúster temporal nuevo mediante `p0-05-qa-isolation.cjs`, verifica su identidad y catálogo vacío antes de aplicar el SQL canónico **solo allí**, usa puertos loopback y datos sintéticos, y detiene su clúster al terminar. No recibe una DATABASE_URL compartida ni reutiliza bases existentes. Requiere permiso local para iniciar PostgreSQL. Ejecutar con `node scripts/i4-g2-prospect-review-qa.cjs` desde el checkout; el entorno de esta revisión añadió también las barreras `qa-loopback-only` y de no lectura de archivos privados.

La prueba simula la transacción de creación de G2, no su backend real. Usa servicios G8 reales y cobertura por polígonos/planes sintéticos. Incluye recuperación, geografía, consulta comercial, cotización/PDF, contrato pendiente de firma, recarga desde otra instancia de servicio, permisos, evidencias incompletas, rollback por FK de auditoría, conexiones PostgreSQL independientes y carreras con cambios geográficos/contratos. SMTP está deshabilitado; no se certifican entregas de correo ni proveedores reales.

Resultados y hashes del código se conservan en el informe local de revisión, fuera del commit. No se afirma aceptación visual real ni una prueba E2E ejecutando G2/G3: las pruebas frontend renderizan React con transporte simulado, y PostgreSQL verifica persistencia y servicios G8.

| Validación ejecutada | Resultado |
| --- | --- |
| Backend dirigido: revisión G2, prospectos, cobertura y cotización | 127 PASS, 0 FAIL |
| Frontend: workflow, ciclo comercial y geocodificación | 35 PASS, 0 FAIL |
| PostgreSQL 18.6 temporal | 14 escenarios PASS; clúster detenido |
| Builds backend/frontend y TypeScript frontend | PASS |
| Lint de archivos afectados y Prisma validate | PASS |
| Diff check | PASS |

La prueba PostgreSQL inicial detectó un conflicto de serialización SQLSTATE `40001` presentado por Prisma como `P2010`. Se corrigió su traducción a 409, se agregaron regresiones para `40001`, `40P01` y un error SQL no concurrente, y se repitió la prueba real con éxito. La revisión también conservó el snapshot previo a consultar cobertura para rechazar cambios ocurridos durante esa consulta. El build frontend mantiene el aviso de tamaño de chunks. No se ejecutó ni se declara aprobada la suite completa del repositorio.

Al terminar el ensayo aislado había 13 prospectos sintéticos, 2 contratos pendientes y cero clientes, servicios, OT, pagos o tickets. Dos conexiones independientes aprobaron una sola vez y generaron una única auditoría. No hubo llamadas externas.

## Validación operativa posterior y rollback

Con un prospecto QA autorizado, distinto de registros históricos: abrir Gestionar; si sigue en `NUEVO`, comprobar empresa y aprobar revisión solo si aparece evidencia original. Si ya está recuperado, no volver a normalizarlo. Editar comuna/región, seleccionar domicilio, guardar, verificar resultado comercial y plan de la empresa, cotizar y confirmar contratación. Cerrar y abrir nuevamente para comprobar persistencia. Repetir negativos con rol sin permisos, otra empresa, cobertura negativa, sin plan y contrato existente. No usar esta guía para reparar automáticamente datos globales.

La firma e instalación continúan por sus operaciones existentes; este cambio no crea OT ni activa servicios. La aceptación en navegador y entre grupos queda pendiente de un entorno autorizado.

Rollback de código: revertir selectivamente el commit de esta corrección mediante una revisión normal. No revertir el fix previo de categorías. No deshacer etapas o auditorías persistidas ni eliminar relaciones creadas legítimamente: cualquier revisión de datos posterior requiere autorización y trazabilidad propias.
