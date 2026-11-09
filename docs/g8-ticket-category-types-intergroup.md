# Compatibilidad conjunta de categorías — entrega G8

Base: `cccd6a07762b115b2356bba8e115e5c58a865d4b`.
Rama local: `fix/g8-ticket-attention-catalog`.

## Alcance y fuente del contrato

El propietario confirma `public.categoria_falla.tipo VARCHAR(20) NOT NULL
DEFAULT 'INTERNA'`, con `TECNICA`, `ATENCION` e `INTERNA` en
`finet_global_validacion`. Esta entrega no consultó ni modificó esa base.
Los rangos de IDs comunicados describen su catálogo actual: **no** se utilizan
como reglas de autorización ni como constantes de categorías en G8.

Se modifica exclusivamente `Team_8---CRM`. No se modifican ni se generan
parches para repositorios G2/G3; sus acciones se detallan para sus responsables.
No se declara completado ni certificado un flujo de otro grupo.

## G8: comportamiento implementado

- El catálogo completo devuelve IDs/nombres/SLA originales, más `tipo`,
  `tipoDisponible` y `nombreAtencion` como proyección de lectura.
- Alta comercial: nombre oficial sin distinguir mayúsculas **y** `ATENCION`
  cuando existe la clasificación. La lista de siete no cambia.
- Bases locales sin columna `tipo`: conservan el filtro anterior por nombre.
  Se usa `to_jsonb(c) ? 'tipo'` y `to_jsonb(c)->>'tipo'`, que no referencian una
  columna inexistente. No hay fallback por errores SQL, permisos o conectividad.
- Tipo presente nulo, desconocido o con vocabulario distinto: no habilita altas
  ni reclasificación manual. Tampoco se acepta un nombre no oficial solo porque
  su tipo sea `ATENCION` para crear una atención comercial.
- Reclasificación manual de tickets autorizados: admite `TECNICA` y `ATENCION`,
  rechaza internas y tipos inválidos. En bases sin clasificación conserva las
  categorías históricas salvo los nombres reservados WiFi/chatbot.
- Los selectores generales no ofrecen `CAMBIO_CREDENCIALES_WIFI` ni
  `Asistente virtual`. Si una de ellas ya es la categoría actual, se muestra
  como antecedente deshabilitado; no se reemplaza al abrir/guardar otros campos.
- Los tickets técnicos o de estado desconocido conservan su bloqueo de
  escritura. La clasificación no demuestra propiedad ni autoriza un cierre.
- Listado histórico sin filtro de tipo; no se alteran IDs, FK, SLA ni nombres.
- No se agregan rutas ni se cambia `id_categoria` numérico de G3.
- El código productivo de S2S G2/WiFi, deuda, pagos y Webpay permanece intacto.
  Solo se amplían sus regresiones dentro de G8. El callback WiFi conserva su
  validación exacta de nombre, empresa/cliente/servicio, saneamiento e idempotencia.

El modelo Prisma y SQL canónico de G8 quedan intactos para no exigir a las bases
locales una columna ausente. La extensión global se lee explícitamente. Mapearla
en el modelo G3 es responsabilidad de G3; una futura unificación del modelo
G8/canónico requiere coordinar primero todas las bases locales. Esta entrega no
declara cerrado ese trabajo de gobierno del esquema compartido.

## Pruebas ejecutadas

| Prueba | Resultado final |
|---|---|
| Tickets compatibilidad + autoridad HTTP; S2S G2 servicio + HTTP | 160 PASS |
| Frontend tickets, gestión y OT | 25 PASS |
| PostgreSQL 18.6 local desechable | 13 escenarios PASS |
| Builds backend/frontend y TypeScript frontend | PASS |
| ESLint de archivos afectados | PASS, sin errores/advertencias |
| Prisma validate y sintaxis del harness | PASS |
| Diff checks | PASS |

Vite conserva la advertencia de tamaño de bundle. No se ejecutó una suite global
ajena al alcance ni se realizó aceptación visual o certificación de proveedores.

PostgreSQL QA comprueba catálogo sin/con columna, siete categorías con IDs
generados fuera de los rangos comunicados, SLA intactos, empresa contractual de
cliente compartido, rechazo de internas/técnicas en altas, reclasificación
manual, nombres ambiguos, históricos, WiFi idempotente, conflicto y empresa
ajena. Final: 11 categorías sintéticas, 3 tickets, 1 resultado WiFi, 0 facturas,
0 pagos, 0 OT. Cliente/contratos/servicios y sus estados se comparan antes/después
y permanecen iguales. La escritura de fixtures y resultados ocurrió solamente
en el clúster nuevo, atestiguado por UUID, directorio, puerto y usuario propios.
El clúster se detuvo y se limpió verificando su propietario; llamadas externas: 0.

Se conservaron intentos intermedios: el arranque bajo sandbox no completó la
inicialización; el primer ensayo completo detectó que el harness comparaba el
orden de IDs asignados por inserciones paralelas, que no está garantizado. Se
corrigió la comparación del conjunto de IDs, sin cambiar la lógica productiva.
La última ejecución contiene los 13 escenarios aprobados. No se suman repeticiones
de pruebas como escenarios distintos.

Comandos de reproducción, desde la raíz de G8 y con entorno exclusivamente
sintético, sin cargar archivos privados:

```powershell
npm.cmd --prefix backend test -- --runInBand --runTestsByPath src/tickets/tickets-compatibility.spec.ts src/tickets/tickets-authority.http.spec.ts src/g2-integration/g2-integration.service.spec.ts src/g2-integration/g2-integration.http.spec.ts
node --test frontend/tests/tickets-authority.test.mjs
npm.cmd --prefix backend run build
npm.cmd --prefix frontend run build
node scripts/i4-ticket-categories-qa.cjs
git diff --check
```

El harness usa los binarios locales `C:/Program Files/PostgreSQL/18/bin`, crea
su propio clúster temporal y no acepta URL de conexión externa. Conserva su
evidencia sin secretos en `.codex-review/ticket-categories-qa-<UUID>.json`.
La ejecución de esta entrega utilizó además un runner que limpia el entorno,
bloquea `.env` privados y conexiones no loopback. Logs y diff revisable fuera
del repositorio: `Entregables/G8-categorias-tipo-20261108/`.

## Acciones por repositorio y validaciones pendientes

| Repositorio / responsable | Estado y acción concreta |
|---|---|
| G8 / Grupo 8 | Código y QA local aprobados; commit revisable. Pendiente revisión y prueba coordinada antes de actualizar imágenes. |
| G3 / Grupo 3 | Pendiente implementar/mapear `tipo` en su Prisma; filtrar `listarCategoriasFalla(OT)` por `TECNICA`, `TICKET` por `ATENCION/TECNICA`, preservar comportamiento sin parámetro y lecturas históricas. |
| G3 / Grupo 3 | Pendiente probar rechazo backend de `ATENCION/INTERNA` en cierre presencial y remoto, no solo filtrar su pantalla. Mantener IDs numéricos y correlación existente. |
| G2 / Grupo 2 | Pendiente demostrar selección manual de siete categorías reales y derivación automática con nombre exacto `Asistente virtual`; esta no es una opción manual ni un alta genérica G8. |
| G2 / Grupo 2 | CU-32: pendiente `crearTicketWifi()`: buscar nombre exacto `CAMBIO_CREDENCIALES_WIFI`, obtener ID real y asociar empresa, cliente y servicio legítimos. No se implementa código del portal desde G8. |
| G2/G3/G8 | Prueba integrada pendiente de creación WiFi, ejecución autorizada y recepción de resultado saneado. No activar `TICKET_WIFI_DEFINIDO` hasta completarla. No introducir contraseñas en tickets/auditorías/respuestas. |

Las pruebas locales de `registerWifiResult` **no** sustituyen la implementación
del portal, ejecución de router ni aprobación integrada. No se enviaron webhooks,
pagos ni solicitudes a G2/G3 reales. Ninguna validación de cierres de OT G3 se
presenta como ejecutada desde este repositorio.

## Revisión y rollback

Publicar backend/frontend del mismo candidato únicamente tras autorización.
No hay migración que ejecutar en G8. El usuario de la aplicación requiere lectura
del catálogo (incluida `tipo` cuando existe); no necesita permisos nuevos de DDL.

Rollback: volver al par de imágenes del commit anterior `cccd6a07`, sin cambiar
datos ni eliminar categorías. Esa versión no filtra por `tipo`; este límite debe
tenerse presente si se revierte. El rollback no autoriza reescribir históricos.

GO_REVIEW_G8=true. GO_INTEGRATED_G2_G3=false: faltan implementación/evidencia de
sus responsables. Sin push, despliegues, migraciones, seeds o cambios globales.
