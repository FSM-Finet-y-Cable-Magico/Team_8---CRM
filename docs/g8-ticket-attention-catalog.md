# G8 — Catálogo de categorías de atención G8/G2

Referencia de código: `4c3c0693275b66e98b1e5f9d623ad9612ac49953`.

## Regla aplicada

La lista de atención es la Tabla 11.9 del Documento 0 indicada por el propietario:

1. Falla de Internet
2. Falla de TV
3. Cambio de plan
4. Mudanza
5. Facturación y cobro
6. Consulta general
7. Baja de servicio

`categoria_falla` sigue siendo la autoridad de IDs, nombres almacenados y SLA.
La coincidencia del nombre solo ignora mayúsculas/minúsculas; no convierte
sinónimos, no elimina acentos y no introduce IDs por posición. Las etiquetas
oficiales se muestran mediante una proyección, sin renombrar filas.

`GET /api/tickets/categories` conserva **todos** los registros y sus campos.
Agrega `nombreAtencion`: etiqueta oficial o `null` para categorías ajenas a la
lista o con nombre ambiguo. Si dos filas solo difieren por capitalización,
ninguna se selecciona arbitrariamente para una nueva atención comercial.

El formulario de alta usa únicamente filas con `nombreAtencion` y envía su
`idCategoria` numérico. `POST /api/tickets` vuelve a consultar el catálogo y
rechaza IDs inexistentes, categorías técnicas/no oficiales o ambiguas, incluso
si se manipula el formulario. No existe excepción por `origen`.

Si faltan categorías, se ofrecen las oficiales realmente disponibles y se
muestra una advertencia. No se insertan filas ni se inventan asociaciones.

## Históricos y contratos preservados

- `TicketsService.list()` sigue resolviendo la categoría histórica por ID,
  independientemente de su elegibilidad para altas comerciales.
- `TicketManagementModal.tsx` fue revisado y no necesita cambios: recibe el
  catálogo completo y conserva una opción con la categoría actual cuando esta
  falta del catálogo recibido. No se reclasifica un ticket al abrirlo.
- La reclasificación autorizada de tickets existentes conserva su política
  previa. Los estados técnicos/desconocidos siguen siendo de solo lectura.
- No se cambian tickets, FK, IDs, nombres técnicos, SLA ni esquemas.
- El contrato G3 continúa usando `id_categoria`. No se modifica ni invoca G3.
- La categoría técnica `CAMBIO_CREDENCIALES_WIFI` continúa disponible para
  consultas y para el resultado WiFi S2S G2 existente; queda fuera del alta
  comercial genérica. No se modifica la integración G2 ni sus operaciones
  financieras.

## Compatibilidad de publicación

La respuesta del catálogo incorpora un campo aditivo. El frontend nuevo
requiere esa clasificación para habilitar el alta; ante un backend antiguo
sin ella, conserva la lectura histórica y muestra el catálogo no disponible,
sin ofrecer IDs supuestos. Publicar backend y frontend del mismo candidato.

Un frontend antiguo contra el backend nuevo puede seguir mostrando categorías
técnicas, pero el backend rechazará su uso en una nueva atención comercial.
No actualizar las imágenes Docker como parte de esta corrección local.

## Validación ejecutada

Entorno sintético: mocks de persistencia y servidor HTTP Nest local; sin base
de datos, `.env` privados, VPS ni proveedores. El runner bloquea destinos
externos y evita cargar configuración privada.

| Validación | Resultado |
|---|---|
| Tickets compatibilidad, autoridad HTTP y servicio S2S G2 | 120 PASS, 0 FAIL |
| Frontend tickets/gestión/OT | 23 PASS, 0 FAIL |
| Build backend | PASS |
| TypeScript frontend y build Vite | PASS |
| ESLint de archivos afectados | PASS, 0 errores/advertencias |
| `git diff --check` | PASS |

Vite mantiene la advertencia de tamaño de bundle superior a 500 kB.

Las regresiones comprueban la lista de siete nombres indicada por el
propietario como contrato G8/G2, capitalización, IDs variables, SLA intactos,
catálogo ausente/ambiguo, rechazo sin escrituras, DTO numérico estricto,
históricos técnicos legibles y protección existente de tickets G3. Esto no
certifica el catálogo del G2 desplegado: no se consultó ese proveedor ni su DB.

En la primera ejecución se reprodujeron dos fallos preexistentes de la prueba
HTTP histórica de OT, también con el archivo original de `4c3c069`. El simulador
no implementaba `$queryRaw` para la lectura `cierre_equipos` y entregaba fechas
como strings en lugar de `Date`. Se ajustó únicamente ese simulador: respuesta
vacía de equipos y fechas Prisma en las lecturas. Se mantienen todas las
aserciones de aislamiento, conservación de registros y ausencia de escrituras.
La repetición final de las tres suites pasó íntegramente. No se modificó la
lógica productiva de órdenes de trabajo.

Evidencias locales fuera del repositorio:
`Entregables/G8-categorias-atencion-20261108/` (logs, JSON Jest, contraste con
baseline y diff revisable). No se ejecutó una regresión completa ajena al alcance.

## Verificación pendiente antes de actualizar imágenes

Un operador autorizado debe comprobar, de solo lectura, que el catálogo real
contiene exactamente una fila por nombre oficial, sin diferencias salvo
mayúsculas/minúsculas. Consulta propuesta, **no ejecutada**:

```sql
SELECT id_categoria, nombre, sla_horas
FROM public.categoria_falla
ORDER BY id_categoria;
```

Si falta una categoría o hay ambigüedad, resolver su gobierno con G2/G3 antes
de cualquier cambio de datos. Esta entrega no autoriza migraciones ni seeds.
Tras la revisión, comprobar en QA la lista de alta y la consulta de un ticket
técnico histórico. No se ha realizado aceptación visual ni certificación real
intergrupos en esta tarea.

Rollback de código: volver al par de imágenes previo al cambio, sin modificar
DB ni reclasificar tickets. Los datos nuevos siguen usando las mismas FK/IDs.
