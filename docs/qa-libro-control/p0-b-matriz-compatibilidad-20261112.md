# P0-B Tickets: matriz de compatibilidad G8 / G2 / G3

Fecha: 12/11/2026 · G8 base `a8e757ee` · **Estado: diagnóstico por código. La base global NO se ha consultado.**
Completa y corrige `p0-b-tickets-catalogo-20261112.md`.

> **Actualización posterior (12/11/2026):** el propietario informó el catálogo global real (siete `ATENCION` con IDs 8–14, siete `TECNICA` 1–7, dos `INTERNA` 15–16). Con ese dato H1, H2 y H6 quedan resueltos para esa base (existe «Consulta general» y las dos categorías faltantes), y la sección 5 ya no aplica a la global. Las correcciones en G8, la matriz de cierre y los mensajes a G2 y G3 están en `p0-b-cierre-tickets-20261112.md`. El aviso de catálogo de la pantalla que se menciona en `p0-b-tickets-catalogo-20261112.md` fue retirado de la UI.

## 1. Fuentes y límites de la evidencia

| Grupo | Fuente | Referencia | Cómo se obtuvo |
|---|---|---|---|
| G8 | `Team_8---CRM` (este repo) | `a8e757ee` | local |
| G2 | `finet-clientes` rama `main` | `b751a2fa4eca149c3fa00283530ba4d7531333a3` (11/11/2026) | clon de solo lectura, sin instalar ni ejecutar |
| G3 | `Team-3-FSM` rama `main` | `d3726cc` (9/11/2026) | clon de solo lectura, sin instalar ni ejecutar |
| Base global | `finet_global_validacion` (VPS) | — | **no consultada** (sin acceso). Comando listo en el apéndice A |

Todo lo de la base global (catálogo real, `tipo`, duplicados, uso) está **PENDIENTE**. El Prisma de G2 y G3 no modela `tipo`, y el inventario global dentro de G8 es anterior a esa extensión: nada de eso prueba que `tipo` exista o no en la base real.

## 2. Matriz de comportamiento por código

| Aspecto | G8 | G2 | G3 |
|---|---|---|---|
| Qué categorías ofrece para altas | Solo filas inequívocas aptas: `tipo = ATENCION`, o sin columna `tipo` y nombre oficial. Alias `Consulta` → `Consulta general` | Nombre ∈ siete literales, **ignorando solo mayúsculas**. **Sin alias `Consulta`**. No mira `tipo` | Lista **todo** el catálogo, sin filtro (UI de terreno, admin de tickets y `GET /integraciones/categorias-falla`) |
| Validación al crear | Servidor: ID real, oficial, único, apto, empresa/cliente/servicio | Portal y asistente: ID debe pasar el mismo filtro de nombre (un ID válido con nombre `Consulta` **se rechaza**) | `POST /integraciones/tickets` y `reclasificar`: **solo que la categoría exista** |
| Categorías propias | — | `CAMBIO_CREDENCIALES_WIFI` (busca nombre exacto; si falta, **falla**); `Asistente virtual` (**la crea ella** en el catálogo compartido si no existe, sin `tipo`) | Siembra 7 técnicas: Sintonización de TV, Internet lento, Colector defectuoso, Falla de planta externa, IPTV pirata, Cliente ausente, Otro. Sin `tipo` en su modelo |
| Misma tabla para tickets y OT | Solo tickets | Solo tickets | **Sí**: `ticket.id_categoria` y `orden_trabajo.id_categoria_falla` |
| Estado/prioridad al crear | Vocabulario G8 (`Abierto`, `Media`) | `ABIERTO` y `MEDIA` en mayúsculas, origen `PORTAL` / `ASISTENTE` | Vocabulario FSM en mayúsculas |
| Endpoint OT local | `POST /tickets/:id/work-order` → 410 (se mantiene) | — | G3 es dueño de OT y cierres |

## 3. Tramos de integración verificados por código

| Tramo | Resultado |
|---|---|
| **G2 `crearTicketWifi()`** | Implementado: busca `CAMBIO_CREDENCIALES_WIFI` por nombre exacto, usa el ID real, exige un servicio de Internet del cliente/contrato, crea ticket con auditoría en la misma transacción. **No hay que pedir que lo desarrollen.** |
| **G2 → G3** `POST /integraciones/contrasena-wifi` | Compatibles: cuerpo `ciphertext` (RSA-OAEP), `id_ticket` (string), `id_contrato`, `id_empresa`, `request_id` y `trace_id` UUID v4, cabecera `X-API-KEY`. G3 resuelve el ticket por ID numérico o por código y **no valida el nombre de la categoría** |
| **G2 → G8** `POST /api/integrations/g2/tickets/{id}/wifi-result` | Compatibles: ruta, `x-api-key`, campos (`request_id`, `trace_id`, `id_empresa`, `resultado`, `detalle_saneado`) y los tres valores `APLICADO` / `REQUIERE_ATENCION_MANUAL` / `ERROR_TECNICO`. G8 exige categoría exacta, empresa, cliente y servicio, estado abierto, idempotencia y rechaza material secreto |

**Ninguno de estos tramos está certificado**: es lectura de código de las dos puntas. Falta desplegar y probar con la base compartida, las claves y llaves reales.

## 4. Hallazgos y propietario

| # | Hallazgo | Propietario | Acción |
|---|---|---|---|
| H1 | El filtro de G2 no acepta `Consulta`: el portal/asistente no ofrecen esa categoría y **rechazan su ID al crear**. El propio comentario de G2 dice que si los nombres de G8 son otros, su lista se corrige | **G2** | Pedir alias `Consulta` → `Consulta general` en `categorias-ticket.ts` (nombre literal, sin tocar IDs). Alternativa: que el propietario de la base renombre la fila conservando ID y SLA |
| H2 | **Insertar `Consulta general` junto a `Consulta` rompe a G8**: ambas filas quedan ambiguas y ninguna se habilita (prueba en G8) | Propietario de la base | No resolver H1 con una inserción; usar alias en G2 o renombre |
| H3 | G3 lista y acepta todo el catálogo y no mapea `tipo`. Agregar categorías `ATENCION` las hace elegibles en sus pantallas de cierre y reclasificación | **G3** | Pedir: mapear `tipo`, filtrar OT por `TECNICA` y tickets por `ATENCION/TECNICA`, y **rechazar en backend** el resto. Hasta entonces, cargar las dos faltantes tiene ese efecto lateral |
| H4 | Si la base global tiene `tipo NOT NULL DEFAULT 'INTERNA'`, las siete técnicas de G3 y `Asistente virtual` quedaron `INTERNA`, no `TECNICA` | Propietario + G3 | Se confirma con la consulta C. G8 es seguro (no las ofrece) |
| H5 | G2 crea `Asistente virtual` en el catálogo compartido sin `tipo` ni autoridad de G8 | **G2** / propietario | El índice único por nombre cubre la carrera si existe en global (consulta F). Debe quedar `INTERNA` |
| H6 | Las dos categorías `Facturación y cobro` y `Baja de servicio` no las crea ningún grupo. G2 las espera por nombre exacto | Propietario de la base | Ver sección 5 |
| H7 | Estados: G2 crea tickets `ABIERTO`/`MEDIA` en mayúsculas; G8 los lee como vocabulario de G3 y los deja **de solo lectura**. G2 comenta que esa es la "convención del CRM" | **G2, G3 y G8 (decisión conjunta)** | No se cambia en G8. Decidir quién gestiona tickets nacidos en portal/asistente |
| H8 | G2 lee y escribe tablas de G8 directamente en la base compartida (`servicio_contratado`, `ticket`, `log_auditoria`, `categoria_falla`) | Gobierno de la base | Fuera del alcance de P0-B; registrar |

## 5. Solución para las siete categorías (sin ejecutar nada)

Orden recomendado, después de tener la salida del apéndice A:

1. **Contrastar** C con los siete nombres: presentes, ausentes, duplicadas, tipo incompatible.
2. **`Consulta`**: resolver por alias en G2 (H1) o renombre del propietario. No insertar.
3. **Faltantes** (`Facturación y cobro`, `Baja de servicio`): carga **aditiva e idempotente**, solo filas ausentes, con respaldo, ejecutada por el propietario de la base, nunca por G8.
   - Base el script en `…qa.local.sql`: valida las siete y aborta si el catálogo no coincide, tiene transacción explícita, comprueba `sla_horas` nullable y la secuencia, y fija `tipo = ATENCION` solo si la columna existe.
   - Ambos scripts toman `LOCK TABLE … SHARE ROW EXCLUSIVE`: en global bloquea unos segundos las escrituras de G2/G3 sobre `categoria_falla`. Hacerlo en ventana.
   - SLA: NULL hasta que lo ratifique el propietario (G8 y G2 lo toleran; ya hay filas con NULL).
   - **Antes** de aplicarlo en global, coordinar con G3 (H3) o aceptar que sus pantallas las listarán.
4. **Verificar** con G8 (`GET /api/tickets/categories`: 7 de 7, aviso desaparece) y con G2 (portal y asistente ofrecen las siete).
5. **Rollback**: las filas nuevas no tienen tickets ni OT; si hubo uso, no borrar, desactivar por proceso del propietario. No hay reasignación de IDs.

## 6. Pruebas

- Nueva: `backend/src/tickets/ticket-category-intergroup.spec.ts`, 12 casos, sin base ni red. Fija con el código real de G2 y G3: diferencia de alias, ambigüedad por inserción, renombre alineado, técnicas de G3 y automáticas de G2 nunca elegibles (sin `tipo`, `INTERNA`, `TECNICA`), catálogo global esperado que da los mismos siete IDs a G8 y G2, G2 sin filtro por `tipo`, y el estado `ABIERTO`.
- Existentes: 160+ casos de tickets/S2S de G8 (compatibilidad, autoridad HTTP, WiFi, G2).
- **No se hizo** ninguna prueba integrada G2/G3, ni lectura de la base global.

## Apéndice A: consulta de solo lectura (base global)

Archivo: `p0-b-consulta-global-solo-lectura.sql` (esta carpeta). Probado en solo lectura contra la QA local; la consulta E se omite sola si faltan columnas. En la VPS, como root:

```bash
docker exec -i finet-postgres-global sh -lc \
  'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d finet_global_validacion' \
  < p0-b-consulta-global-solo-lectura.sql
```

Solo devuelve metadatos y agregados: sin RUT, nombres, correos ni credenciales.
