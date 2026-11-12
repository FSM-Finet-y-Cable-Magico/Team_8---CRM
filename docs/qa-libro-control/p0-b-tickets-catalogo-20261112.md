# P0-B Tickets: catálogo de las siete categorías oficiales (QA Libro de control)

Fecha: 12/11/2026 · Base: `848c136` · Entorno: QA aislada `finet-libro-control-qa` (`fsm_db`, backend 3011, frontend 5184).
Alcance: diagnóstico y datos requeridos. **No se ejecutó ningún SQL de propuesta, no se creó ninguna categoría y no se tocó ninguna categoría técnica de G3.**

## 1. Estado verificado en la QA

| # | Categoría oficial | Fila en `categoria_falla` | ID | SLA | Habilitada para alta | Motivo |
|---|---|---|---|---|---|---|
| 1 | Falla de Internet | `Falla de internet` | 1 | 24 | Sí | Equivalencia de formato (mayúsculas) |
| 2 | Falla de TV | `Falla de TV` | 2 | 24 | Sí | |
| 3 | Cambio de plan | `Cambio de plan` | 4 | 72 | Sí | |
| 4 | Mudanza | `Mudanza` | 5 | 120 | Sí | |
| 5 | Facturación y cobro | no existe | — | — | No | Falta en el catálogo |
| 6 | Consulta general | `Consulta` | 3 | 72 | Sí | Alias ratificado `Consulta` → `Consulta general`; ID, nombre y SLA se conservan |
| 7 | Baja de servicio | no existe | — | — | No | Falta en el catálogo |

Además existe `CAMBIO_CREDENCIALES_WIFI` (ID 6, SLA NULL): flujo especializado G2/WiFi, nunca se ofrece en el selector general.
Resultado: **5 de 7**. El aviso de la pantalla («Disponibles: 5 de 7. Pendientes: Facturación y cobro, Baja de servicio») es correcto y solo desaparecerá cuando las siete sean oficialmente elegibles.

Datos de la tabla (solo lectura): columnas `id_categoria`, `nombre`, `sla_horas` (SMALLINT, admite NULL); **no existe la columna `tipo`**; única restricción: clave primaria; única FK entrante: `ticket.id_categoria`; secuencia sincronizada (último valor 6 = máximo ID); sin triggers; sin nombres equivalentes duplicados; PostgreSQL 15. Uso histórico: 1 ticket (categoría 1).
Ningún código del backend escribe en `categoria_falla`.

## 2. Por qué hubo tres números distintos (1/7, 4/7 y 5/7)

| Captura | Respuesta observada | Explicación |
|---|---|---|
| 1 de 7 (primera captura) | Disponible solo 1; pendientes: Falla de TV, Cambio de plan, Mudanza, Facturación, Consulta general, Baja | Otra base/entorno que no he consultado. **Sin datos no se puede afirmar** si faltan, están duplicadas o tipadas `TECNICA`/`INTERNA`. |
| 4 de 7 | `Consulta` (ID 3) «No habilitada por el catálogo del servidor» | Backend de la QA **desactualizado** (compilado antes de `848c136`, sin el alias). La respuesta de la API no traía `nombreAtencion` para esa fila. |
| 5 de 7 | Consulta general habilitada | Backend actualizado (tras aplicar las migraciones `cotizacion_codigo` y `usuario_eliminacion` y reiniciar). |

El código ya cubre estos casos con pruebas (con y sin `tipo`, duplicados, IDs no secuenciales, `TECNICA`/`INTERNA`, alias, manipulación de `idCategoria`, histórico legible). No se requirió cambiar código de Tickets.

## 3. Evaluación de las dos propuestas SQL (no ejecutadas)

Ambas insertan solo «Facturación y cobro» y «Baja de servicio», sin alterar IDs, nombres, SLA, tipos ni FK existentes.

| Aspecto | `db/proposals/c2-tk-01-attention-categories-qa.sql` (repo) | `…qa.local.sql` (copia local del operador, **no versionada**) |
|---|---|---|
| Compuerta de revisión | `finet.qa_catalog_reviewed = 'on'` | `finet.qa_catalog_reviewed = 'true'` |
| Transacción explícita | No (solo bloque `DO`) | `BEGIN … COMMIT` |
| Valida el catálogo completo antes de insertar | No: solo las dos categorías a crear | **Sí**: las siete; aborta si falta otra o hay ambigüedad/tipo incompatible |
| Comprobaciones de precondición | Existencia de la tabla | PostgreSQL ≥ 13, `sla_horas` nullable, secuencia presente |
| Bloqueo de tabla | `SHARE ROW EXCLUSIVE` | `SHARE ROW EXCLUSIVE` |

Contra los hechos de la QA (SLA nullable, secuencia sincronizada, sin `tipo`, PG 15) **ambas serían aplicables**. Recomendación: usar como base la versión **local**, porque aborta si el catálogo no coincide con la evidencia esperada (protege frente a aplicarla en la base equivocada). Debe confirmarse con el propietario cuál prevalece y alinear el valor de la compuerta.

Puntos abiertos antes de cualquier aplicación:
1. **SLA de las dos categorías nuevas**: ambas scripts usan NULL. El SLA solo se proyecta, no se usa en cálculos, y ya existe una fila con SLA NULL en QA, así que NULL es tolerado; el valor formal lo debe definir el propietario del catálogo.
2. **Base global**: si existe `tipo NOT NULL DEFAULT 'INTERNA'`, un INSERT sin tipo crearía categorías `INTERNA`, que no son elegibles. Los scripts ya fijan `ATENCION` cuando `tipo` existe, pero **no deben aplicarse en la base global** sin ratificación y respaldo.
3. Las altas necesitan autorización explícita y respaldo previo, como en la migración anterior.

## 4. Datos que necesitamos del catálogo real compartido (para el caso 1/7 y la base global)

Consultas de solo lectura, por cada entorno cuya pantalla muestre menos de 5 categorías:

1. Respuesta JSON de `GET /api/tickets/categories`, con el commit del backend que la sirve.
2. `SELECT id_categoria, nombre, sla_horas, tipo FROM public.categoria_falla ORDER BY 1;` y si la columna `tipo` existe.
3. Duplicados o equivalentes por nombre (mayúsculas, acentos, espacios).
4. Conteo de tickets por categoría y rango de IDs usados por G3 (`TICKET` y `OT`).
5. Propietario que ratifica `tipo` y `sla_horas`, y confirmación de que `Facturación y cobro` y `Baja de servicio` pertenecen al contrato de atención G8/G2.

Para G2/G3 (sin tocar su código): contrato S2S de `Asistente virtual` y `CAMBIO_CREDENCIALES_WIFI`; filtro de categorías `TICKET` vs `OT` y autoridad de cierre; contrato ratificado del ticket de retiro por morosidad. Estado: **NO VERIFICADO**.

## 5. Garantías que se mantienen

- Categorías `TECNICA`/`INTERNA` no se convierten en `ATENCION` por nombre ni por conveniencia.
- `POST /api/tickets` con `idCategoria` 6 (WiFi) o 99 (inexistente) responde 400; no se creó ningún ticket.
- `POST /api/tickets/:id/work-order` sigue bloqueado (410, `G3_INTEGRATION_REQUIRED`).
- Históricos de G3 permanecen legibles y de solo lectura.
