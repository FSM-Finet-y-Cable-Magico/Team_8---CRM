# P0-B Tickets: informe de cierre y mensajes a G2 y G3

Fecha: 12/11/2026 · Rama `feat/ux-ui-libro-control` sobre `a8e757ee` · **Sin commit, push, PR ni despliegue.**
Alcance: módulo Tickets de G8. No se escribió en `finet_global_validacion`, no se ejecutó SQL de datos y no se tocaron Prospectos, finanzas, contratos ni repositorios de G2/G3.

## 1. Base de la evidencia

| Dato | Fuente | Estado |
|---|---|---|
| Catálogo global: IDs 8–14 `ATENCION` (las siete oficiales, SLA 24/48/48/48/24/24/48), IDs 1–7 `TECNICA`, IDs 15–16 `INTERNA` | Diagnóstico del propietario sobre `finet_global_validacion` | Informado por el propietario; **no consultado por Claude** (sin acceso a la VPS) |
| 15 OT globales: 14 sin ticket, 1 vinculada; OT de instalación/reparación sin categoría; históricas con categorías de atención o internas | Mismo diagnóstico | Informado |
| Código G2 `b751a2fa`, G3 `d3726cc` | Clones de solo lectura | Verificado por lectura de código |
| QA local G8 (`fsm_db`): 5 de 7 categorías, sin columna `tipo` | Consulta de solo lectura | Verificado |

Los IDs 8–14 **no están en el código de G8**: el backend usa el catálogo de la base a la que se conecta (probado con IDs desplazados +0 y +700).

## 2. Matriz de cierre (Fase D)

| # | Requisito | Comportamiento actual | Defecto encontrado | Fix aplicado | Archivo | Prueba | Resultado | Dependencia G2/G3 |
|---|---|---|---|---|---|---|---|---|
| 1 | Ver bien categorías y tickets existentes | `GET /tickets/categories` devuelve el catálogo completo con `nombreAtencion` solo en filas `ATENCION` inequívocas; la lista resuelve nombre aunque la categoría sea `TECNICA`/`INTERNA` | **La lista ordenaba por texto de la prioridad**: `Alta, Baja, Media` y `CRITICA` (G3) quedaba entre Baja y Media | Orden por urgencia: Crítica, Alta, Media, Baja, sin importar mayúsculas o vocabulario; lo desconocido al final; a igual urgencia el más reciente | `backend/src/tickets/ticket-priority.ts` (nuevo), `tickets.service.ts` | HTTP: orden con 8 prioridades mezcladas; catálogo global real (1–16) | OK | G3 escribe `CRITICA/ALTA/MEDIA/BAJA`; G2 `MEDIA` |
| 2 | Alta solo con categorías comerciales autorizadas | Servidor valida: ID real, oficial, único, `ATENCION` o sin columna `tipo`; rechaza técnicas, internas, WiFi y asistente | Ninguno | — (cubierto y ampliado con pruebas) | — | HTTP con catálogo global real: 7 altas por su ID y 9 rechazos (7 técnicas + 2 internas), con IDs +0 y +700; catálogo sin cambios | OK | Comparar JSON de G2 (pendiente, §4) |
| 3 | Empresa, cliente, contrato y servicio | Cliente atribuible a la empresa; servicio del cliente y de la empresa; contrato vinculado; empresa derivada del servicio o del usuario | Ninguno | — | — | HTTP con dos empresas: servicio ajeno rechazado sin escribir; ticket de servicio y general quedan en empresa 2; empresa 1 no los ve | OK | — |
| 4 | Campos obligatorios en el servidor | UI exigía descripción ≥ 10; **el servidor solo pedía texto** | `descripcion` vacía, de espacios o corta se aceptaba por API; `origen` libre permitía atribuirse `PORTAL`/`ASISTENTE`/`BOT` | `descripcion` recortada y mínimo 10 (mismo umbral de la UI), mensajes en español; `origen` solo `CRM` (la UI nunca lo enviaba) | `dto/create-ticket.dto.ts` | HTTP: 5 descripciones inválidas, recorte, 6 orígenes inválidos, origen implícito y explícito `CRM`; **en vivo en QA**: 6 rechazos 400 sin crear filas | OK | G3 acepta `CRM` en su lista de orígenes |
| 5 | Aislamiento FiNet / Cable Mágico | Todas las rutas filtran por empresa del usuario; administrador ve consolidado o por vista | Ninguno | — | — | Existentes + HTTP con ambas empresas | OK | — |
| 6 | Estados, prioridades, diagnóstico, reclasificación y notas con permisos | Permisos por rol; transiciones hacia adelante; cierre bloqueado con OT pendiente; reclasificación a `ATENCION` o `TECNICA` | Ninguno de lógica | — | — | Suites existentes (autoridad, compatibilidad) | OK | Reclasificar a `TECNICA` es regla vigente de G8; confirmar con G3 (§5) |
| 7 | Tickets creados desde G2 | `ABIERTO`/`MEDIA` en mayúsculas se leen como `Abierto`/`Media`, origen `PORTAL`/`ASISTENTE`; G8 los deja **solo consulta** (409) | Ninguno de lectura; la edición es decisión conjunta | — (se mantiene solo lectura a propósito) | — | HTTP: lectura legible y 4 mutaciones rechazadas sin escribir, con ambos orígenes | OK | **Decisión G2/G3/G8 sobre el vocabulario de estados** |
| 8 | Lectura histórica compatible con G3 | Estados `ABIERTO/EN_PROGRESO/DERIVADO_OT/RESUELTO` mapeados; lo desconocido se muestra tal cual y solo consulta | Ninguno | — | — | HTTP: ticket sin cliente, sin categoría, sin descripción, sin código, con estado ajeno y con prioridad vacía: 200, sin escrituras; sin empresa solo lo ve el administrador | OK | — |
| 9 | Auditoría y sin escrituras parciales | Solo el diagnóstico era atómico. En el resto **la auditoría se escribía fuera de la transacción y sus fallos se tragaban** | Si la auditoría fallaba, el ticket (o su cambio) quedaba guardado, sin registro y con respuesta de éxito | Alta, categoría, prioridad, estado y nota confirman cambio + auditoría en una misma transacción; si la auditoría falla se revierte y responde error | `tickets.service.ts` (`writeAudited`) | HTTP con auditoría que falla: 5 operaciones devuelven 500 y el estado queda idéntico; éxito escribe exactamente cambio + una auditoría | OK | — |
| 10 | Errores visibles | Los 400 muestran el mensaje; los 500 muestran «No se pudo actualizar el ticket» | Ninguno (los mensajes nuevos van en español) | — | — | En vivo: mensajes de los 6 rechazos | OK | — |
| — | Quitar bloque de aviso del catálogo (pedido del usuario) | El formulario mostraba «Hay categorías oficiales no disponibles…» con detalle de pendientes | — | Bloque eliminado; el selector sigue ofreciendo solo lo que el servidor habilita; se retiró la prop `showCatalogDetails` que ya no se usaba | `TicketsPanel.tsx`, `App.tsx` (una línea) | 5 pruebas reescritas para verificar opciones ofrecidas y ausencia del aviso; captura en QA | OK | — |

**No se tocó CSS ni estructura visual.** En la QA (5184) el formulario, el selector, la tabla, las insignias y el menú quedan como estaban; solo desaparece el bloque verde.

## 3. Pruebas ejecutadas

| Suite | Resultado |
|---|---|
| Backend completo (`jest`) | **1943 aprobadas**, 52 omitidas (las mismas de antes), 0 fallos. Antes: 1902 |
| Tickets + G2 | 241 aprobadas (antes 212; +29 en la suite HTTP de Tickets) |
| Frontend completo | 217 aprobadas, 0 fallos (5 pruebas del aviso reescritas) |
| `tsc` backend y frontend | sin errores |
| ESLint en archivos tocados | sin errores ni avisos nuevos |
| En vivo, QA local con backend reiniciado | login 201; catálogo 5 de 7 (la QA no tiene `tipo` ni las dos faltantes); 6 rechazos de alta con 400 y mensaje; **tickets antes 1, después 1** |

Se actualizaron fixtures de pruebas existentes por dos cambios intencionales: la descripción mínima (7 altas en `company-response.http.spec.ts`) y la auditoría dentro de la transacción (2 aserciones y un `$transaction` en dos arneses).

## 4. Lo que NO se pudo comprobar con pruebas reales

- **JSON de `GET /api/portal/tickets/categorias` de G2 (FiNet y Cable Mágico) contra `GET /api/tickets/categories` de G8.** Sin esa comparación no se certifica que ofrezcan los mismos IDs. Procedimiento de solo lectura: guardar cada respuesta y comparar `[idCategoria, nombre]` de las siete oficiales, p. ej. `jq -S '[.[] | select(.nombreAtencion) | [.idCategoria,.nombreAtencion]] | sort'` para G8 y su equivalente para G2, y `diff`.
- **G8 contra la base global real**: el catálogo se verificó solo por pruebas con su forma informada y en la QA local. Falta una prueba de lectura con el backend apuntando a una réplica o a la global en solo lectura.
- **Integración G2→G3 (`contrasena-wifi`) y G2→G8 (`wifi-result`)**: compatibles por lectura de código; sin prueba integrada.
- **Permisos por rol en vivo**: solo se usó el administrador (las otras cuentas de QA no tenían credenciales vigentes). Hay cobertura de pruebas.
- **Alta y edición exitosas en la QA**: no se ejecutaron en vivo para no escribir datos; están cubiertas por pruebas HTTP con persistencia simulada.

## 5. Observaciones sin cambiar (requieren decisión)

| # | Observación | Por qué no se cambió |
|---|---|---|
| O1 | La lista corta en 150 tickets sin paginación; si se supera, el recorte sigue el orden alfabético de la prioridad | Hoy hay pocos tickets; requiere decidir paginación o filtros |
| O2 | Dos notas simultáneas sobre el mismo ticket pueden pisarse (la guarda solo compara el estado) | Poco probable hoy; la guarda por contenido cambia el comportamiento ante conflicto |
| O3 | Pasar a un estado igual al actual se acepta y deja una auditoría redundante | Comportamiento previo; la UI no lo envía |
| O4 | `descripcionProblema` y `accionesRealizadas` del diagnóstico pueden ir vacías; el formulario tampoco las exige | Exigirlas en el servidor rompería el flujo actual de la UI; decidir si son obligatorias |
| O5 | Administrador en vista consolidada: un ticket general de un cliente con contratos en ambas empresas queda en la empresa registrada del cliente | La UI no envía empresa; resolverlo requiere un campo nuevo y cambio de pantalla |
| O6 | Un ticket de otra empresa responde 400 «no pertenece a tu empresa» (confirma que el ID existe) en vez de 404 | Cambiaría el contrato de varias pruebas; riesgo bajo, los IDs son internos |
| O7 | Reclasificar permite elegir cualquier categoría `TECNICA` (p. ej. «Cliente ausente») | Regla vigente de C2-TK-01; confirmar con G3 |

## 6. Mensaje técnico para G2

> **Para G2 (finet-clientes) — categorías, estados y creación de categorías en la base global**
> Contexto: el catálogo de `finet_global_validacion` tiene siete categorías `ATENCION` (IDs 8–14: Falla de Internet, Falla de TV, Cambio de plan, Mudanza, Facturación y cobro, Consulta general, Baja de servicio), siete `TECNICA` (1–7) y dos `INTERNA` (15–16). G8 no fija IDs: usa el catálogo de la base conectada.
> 1. **Comparar respuestas.** Pedimos el JSON de `GET /api/portal/tickets/categorias` en FiNet y Cable Mágico para contrastarlo con `GET /api/tickets/categories` de G8. Deben coincidir los siete `[idCategoria, nombre]`. Hasta entonces no declaramos la integración certificada.
> 2. **Filtrar por tipo además del nombre.** Hoy `categorias-ticket.ts` acepta una fila si su nombre iguala uno de siete literales, sin mirar `tipo`. Pedimos añadir `tipo = 'ATENCION'` (lectura de la columna existente) como condición adicional. El alias `Consulta` ya no se necesita contra la global, porque allí existe «Consulta general».
> 3. **No crear categorías en la base compartida.** `Asistente virtual` se crea por find-or-create sin `tipo`. En la global hay dos filas `INTERNA` (15–16); confirmar si corresponden a `Asistente virtual` y `CAMBIO_CREDENCIALES_WIFI`. Pedimos que G2 solo busque esas filas y que falle con un error claro si no existen, sin insertar.
> 4. **Vocabulario de estado y prioridad.** G2 crea `ABIERTO` y `MEDIA` y su comentario en `ticket.ts` afirma que el CRM usa `ABIERTO`/`EN_PROGRESO`. G8 escribe `Abierto`, `En progreso`, `Escalado`, `Resuelto`, `Cerrado` y prioridades `Alta/Media/Baja`. Hoy G8 muestra los tickets de G2 correctamente pero **solo en consulta**. Pedimos confirmar cómo el portal muestra estados escritos por G8 (comparación sin distinguir mayúsculas) y participar en la decisión conjunta de quién gestiona tickets de portal/asistente.
> 5. **Acceso directo a tablas de G8.** G2 lee y escribe `servicio_contratado`, `ticket`, `log_auditoria` y `categoria_falla` directamente. Pedimos documentar qué columnas escribe y por qué no usa el contrato S2S.
> 6. **WiFi.** `crearTicketWifi()` y `informarResultadoWifiG8()` coinciden por lectura de código con `POST /api/integrations/g2/tickets/{id}/wifi-result` (cabecera `x-api-key`; `APLICADO`, `REQUIERE_ATENCION_MANUAL`, `ERROR_TECNICO`). Falta una prueba integrada con evidencia (ticket creado, resultado recibido, idempotencia por `request_id`).
> 7. **Origen `ASISTENTE`.** G3 lista como orígenes válidos `TELEFONO, PRESENCIAL, CORREO, PORTAL, BOT, WHATSAPP, CRM`. Confirmar con G3 el valor correcto para el asistente.

## 7. Mensaje técnico para G3

> **Para G3 (Team-3-FSM) — tipo de categoría, filtros y contrato de derivación**
> Contexto: la base global ya clasifica `categoria_falla.tipo`: siete `TECNICA` (IDs 1–7, las sembradas por G3), siete `ATENCION` (8–14) y dos `INTERNA` (15–16). El Prisma de G3 no modela `tipo`.
> 1. **Mapear `tipo` y filtrar.** Hoy los selectores de OT y de reclasificación, y `GET /integraciones/categorias-falla`, listan todo el catálogo. Pedimos: OT solo con `TECNICA`; tickets con `ATENCION` o `TECNICA`; nunca `INTERNA`.
> 2. **Rechazar en el backend.** `POST /integraciones/tickets`, `reclasificar` y la creación de OT solo comprueban que la categoría exista. Pedimos validar `tipo` también en el servidor para escrituras nuevas, **sin imponer reglas retroactivas**: hay OT históricas sin categoría o con categorías de atención/internas que deben seguir consultables.
> 3. **OT sin ticket.** Del diagnóstico: 15 OT, 14 sin ticket. No proponemos exigir `id_ticket` globalmente; pedimos que G3 documente qué tipos de OT requieren ticket y cuáles no.
> 4. **Derivación G8 → G3.** G8 mantiene `POST /api/tickets/:id/work-order` en 410 y no crea OT. Pedimos el contrato S2S ratificado para derivar un ticket a OT (endpoint, autenticación, idempotencia, campos obligatorios por tipo de operación y retorno del cierre).
> 5. **Estados y prioridades.** `estadoCanonicoTicket` ya normaliza `Escalado`/`Cerrado`. G8 trata `ABIERTO/EN_PROGRESO/DERIVADO_OT/RESUELTO` como vocabulario de G3 y los deja solo consulta. G8 ahora ordena y muestra `CRITICA/ALTA/MEDIA/BAJA` junto a `Alta/Media/Baja`. Pedimos que G3 haga lo mismo al leer prioridades escritas por G8 y acordar quién escribe cada estado.
> 6. **Reclasificación a categorías técnicas.** G8 permite reclasificar a `TECNICA`. Confirmar si G3 lo acepta o si debe restringirse a `ATENCION`.
> 7. Ninguna integración G2/G3 se considera certificada: falta prueba integrada documentada.

## 8. Decisiones que necesito de ti

1. ¿Autorizas una prueba de **solo lectura** del backend G8 contra la base global (o una réplica) para cerrar el punto 1 de §4?
2. ¿Envío §6 y §7 tal cual a G2 y G3, o prefieres ajustarlos?
3. ¿Resolvemos alguna observación de §5 ahora (O1 paginación, O4 campos del diagnóstico)?
4. ¿Hago commit de estos cambios? Quedan **sin commit** (archivos modificados y nuevos listados en el resumen de la conversación). Los artefactos de QA ya en staging (`db/`, `tmp/`) no se tocaron.
