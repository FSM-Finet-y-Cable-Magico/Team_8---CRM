# Incremento 3 — Etapa 4: integración G8 CRM ↔ G1 Inventario/Bodega

Fecha de cierre técnico local: 2026-09-26  
Rama: `feat/i3-g1-inventory-integration`  
Commit base de Etapa 3: `ed0a2203`

## Propósito y ownership

G1 es la fuente de verdad de inventario y bodega. G8 deja de administrar unidades físicas, tipos de equipo, bodegas, movimientos, stock, transferencias, estados físicos, bajas, mantenciones, consumos y garantías físicas. El CRM conserva el lifecycle comercial, Cliente, ServicioContratado, Contrato, Plan, garantías comerciales y las referencias externas necesarias para integrar los dominios.

| Dominio | Owner | Uso desde G8 en Etapa 4 |
|---|---|---|
| Unidad, tipo, bodega, stock y movimiento físico | G1 | Consulta mediante `G1InventoryClient`; sin writes locales nuevos |
| Cierre técnico, poste y NAP | G3 | Resultado técnico read-only cuando exista contrato ratificado |
| Cliente, servicio, contrato, plan y garantía comercial | G8 | Lectura y escritura con RBAC, empresa y auditoría |
| Garantía física de una unidad | G1 | Solo lectura; nunca se copia a `GarantiaComercial` |
| Inventario local heredado | LEGACY_LOCAL | Histórico separado, sin valor de disponibilidad actual ni acciones UI |

La Etapa 0 identificó 33 sitios de escritura física en 16 métodos y 13 endpoints. Tras esta etapa hay cero rutas activas de negocio G8 que puedan ejecutar esos writes: 23 sitios quedan detrás de respuestas controladas, 5 fueron reemplazados por el cierre G3 y la asociación comercial G8→G1, y 5 dejaron de ejecutarse al convertir la eliminación de usuarios en desactivación lógica.

## Contratos y evidencia de disponibilidad

Los acuerdos aportados describen contratos HTTP, pero el código G1 entregado solo demuestra la consulta básica de una unidad y el cierre G3→G1. La feature flag queda desactivada por defecto y no se hicieron llamadas a G1 real ni a Railway.

| Contrato G1 | ACORDADO | IMPLEMENTADO_G1 demostrado | DESPLEGADO_G1 demostrado | Estado usado por G8 |
|---|---:|---:|---:|---|
| `GET /api/integraciones/tipos-equipo` | Sí | No | No | `PENDIENTE_DESPLIEGUE_G1` |
| `GET /api/integraciones/unidades/{numeroSerie}` | Sí | Parcial: respuesta base | No se demostró el contrato ampliado | Adapter listo; ampliación `PENDIENTE_DESPLIEGUE_G1` |
| `POST /api/integraciones/activaciones` | Sí | No | No | Tracking y retry listos; `PENDIENTE_DESPLIEGUE_G1` |
| `GET /api/integraciones/equipos?id_empresa=&id_servicio=` | Sí, P1 | No | No | `PENDIENTE_DESPLIEGUE_G1`; sin fallback local |
| `POST /api/integraciones/ordenes/{idOt}/cierre` | Sí | Sí, en G1 aportado | No probado en esta etapa | No se llama desde G8; corresponde a G3→G1 |
| Lectura de consumo/stock suficiente para CU-61 | No | No | No | `PARCIAL_BLOQUEADO_G1_P2` |
| Semántica multiunidad de `event_id` | Incompleta | No | No | `PENDIENTE_RATIFICACION_G1_EVENT_ID` |

`CONTRATO_ACORDADO` no se interpreta como `DESPLEGADO_G1`. Los adaptadores, mocks y pantallas permiten integrar cuando G1 despliegue los contratos, sin declarar disponibilidad productiva anticipada.

## Adaptador G1

`HttpG1InventoryClient` es la única clase que usa `fetch` para G1. Expone:

- `getEquipmentTypes({ idEmpresa, categoria, buscar, activo })`;
- `getUnitBySerial(numeroSerie, idEmpresa)`;
- `sendActivation(payload)`;
- `getEquipmentByService(idServicio, idEmpresa)`.

Los servicios, controladores y frontend consumen las APIs G8; no llaman a G1 directamente. La autenticación `X-API-KEY` se agrega únicamente en backend. Configuración en `backend/.env.example`:

```dotenv
G1_API_URL=
G1_API_KEY=
G1_REQUEST_TIMEOUT_MS=8000
G1_INTEGRATION_ENABLED=false
```

El cliente aplica timeout con `AbortController` y normaliza `401`, `403`, `404`, `409`, `429`, `5xx`, timeout, respuesta inválida y falta de configuración. Los mensajes no incorporan el body remoto ni la API key. `429`, `5xx`, timeout e indisponibilidad son reintentables; `403`, `404` y `409` quedan controlados sin ocultar su semántica.

## API G8

| Método y ruta G8 | Función | Permiso |
|---|---|---|
| `GET /api/integrations/g1/equipment-types` | Consulta catálogo G1 | `VIEW_G1_EQUIPMENT` |
| `GET /api/integrations/g1/units/:serial` | Consulta unidad y garantía física | `VIEW_G1_EQUIPMENT` |
| `GET /api/integrations/g1/services/:id/equipment` | Consulta equipos de un servicio | `VIEW_G1_EQUIPMENT` |
| `GET /api/integrations/g1/activations/:id` | Consulta tracking | `VIEW_G1_EQUIPMENT` |
| `POST /api/integrations/g1/activations/:id/retry` | Reintento manual con el mismo `event_id` | `MANAGE_G1_ACTIVATION_RETRY` |
| `GET /api/commercial-warranties` | Lista garantías comerciales de la empresa | `VIEW_CORE_DATA` |
| `POST /api/commercial-warranties` | Crea garantía comercial | `MANAGE_COMMERCIAL_WARRANTIES` |
| `PATCH /api/commercial-warranties/:id` | Edita garantía comercial activa | `MANAGE_COMMERCIAL_WARRANTIES` |
| `PATCH /api/commercial-warranties/:id/deactivate` | Desactiva sin borrar | `MANAGE_COMMERCIAL_WARRANTIES` |

Comercial, Soporte y Administración pueden consultar equipos. Comercial y Administración gestionan garantías comerciales. Administración y Soporte gestionan retries. No existe un permiso G8 para mover, transferir, dar de baja o cambiar el estado físico.

## Equipos y estados físicos

La consulta por serie y por servicio valida `id_empresa` en backend y también revisa el `id_empresa` de la respuesta G1. Para usuarios no administradores, una empresa distinta se presenta como recurso no encontrado. La consulta P1 no recurre a `UnidadEquipo` si G1 está deshabilitado o no responde; devuelve `PENDIENTE_INTEGRACION_G1`.

Los únicos estados físicos oficiales son:

1. `En bodega`
2. `Asignado a técnico`
3. `Instalado en cliente`
4. `En revisión`
5. `En préstamo externo`
6. `Dado de baja`

`Bloqueado` no se acepta como estado físico. Un valor desconocido se muestra como no reconocido y jamás habilita una escritura.

## Activación comercial posterior a G3

El orden implementado es:

```text
G3 COMPLETADA
  → transacción G8 activa Cliente/Servicio/Contrato
  → commit G8 y auditoría
  → creación del tracking IntegracionActivacionG1
  → POST G1 cuando el contrato seguro tiene una serie
```

La llamada HTTP ocurre después de cerrar la transacción G8. Una excepción G1 se captura y no revierte el lifecycle comercial confirmado. No se activa G1 por firma, pago ni una OT pendiente.

El `event_id` es estable: `g8-g1-activation-{requestIdG3}`. Cada retry reutiliza el mismo valor. `trace_id` y las referencias de empresa, cliente, servicio, contrato y OT se guardan en tracking. La tabla no almacena una copia completa del inventario.

Estados principales del tracking:

- `PENDIENTE_ENVIO` y `ENVIANDO`;
- `COMPLETADA` para respuesta 2xx, incluida respuesta duplicada idempotente;
- `PENDIENTE_SINCRONIZACION_G1` para timeout o indisponibilidad reintentable;
- `ERROR_G1` para rechazo no reintentable;
- `PENDIENTE_DATOS_EQUIPO_G1` cuando G3 no entregó serie;
- `PENDIENTE_RATIFICACION_G1_EVENT_ID` si aparecen varias unidades.

No existe fallback a `UnidadEquipo`, `MovimientoInventario` ni stock local.

### Riesgo multiunidad

El acuerdo no ratifica si `event_id` identifica un encabezado, una unidad o la combinación evento/unidad. Por eso una activación con más de una serie no se envía: conserva tracking y queda `PENDIENTE_RATIFICACION_G1_EVENT_ID`. Así se evita inventar una cardinalidad o generar eventos nuevos que rompan idempotencia.

## Garantías

### Garantía física

Proviene de G1 con `fecha_adquisicion`, `garantia.fecha_vencimiento` y `garantia.vigente`. Se muestra como “Fuente: G1” y solo lectura. No hay endpoint G8 que edite garantía, adquisición o días físicos.

### Garantía comercial — CU-85

`GarantiaComercial` pertenece a G8 y vincula empresa, cliente, servicio y contrato. Guarda tipo, inicio, término, cobertura, monto opcional positivo, observaciones, estado, responsable y una serie externa opcional sin FK a G1.

Validaciones:

- cliente, servicio y contrato pertenecen a la misma empresa;
- el servicio y contrato están activos y relacionados;
- fecha de término no es anterior al inicio;
- tipo y cobertura son obligatorios;
- monto, si existe, es mayor que cero;
- no se duplica una garantía activa con el mismo servicio, tipo y período;
- la serie opcional se valida en G1 cuando está disponible; si G1 no está disponible se puede crear sin serie, pero no inventar la referencia;
- crear, actualizar y desactivar generan auditoría.

Estado: `CU-85 IMPLEMENTADO`.

## Migración de writes y legacy

Las rutas heredadas conservan compatibilidad de URL pero no ejecutan los servicios físicos:

- inventario físico responde `409 INVENTORY_OWNED_BY_G1` y audita `INTENTO_WRITE_INVENTARIO_DEPRECADO`;
- cierre técnico local, NAP y evidencia local responden `410 G3_INTEGRATION_REQUIRED`;
- asociación local servicio→equipo responde `409`;
- eliminación de usuario ahora desactiva la cuenta, revoca sesiones y preserva las referencias históricas.

Las tablas físicas legacy permanecen por compatibilidad, trazabilidad y datos anteriores. Las lecturas actuales G1 y el histórico local se rotulan por separado. El retiro futuro exige exportar/retener el histórico, migrar consumidores de monitoring/reportes y coordinar con G1/G3 antes de eliminar schema o servicios legacy.

La matriz exhaustiva está en `docs/i3-g1-inventory-write-migration.md`.

## CU-18 y CU-61

`CU-18` queda `PARCIAL_BLOQUEADO_G3`: poste y NAP son topología técnica G3. El contrato de cierre disponible no ratifica esos campos. G8 no los envía a G1, no crea `CajaNap` para instalaciones nuevas y conserva el histórico separado.

`CU-61` queda `PARCIAL_BLOQUEADO_G1_P2`: no existe un endpoint G1 ratificado que entregue consumo, empresa, tipo de trabajo, promedio, variación, costo y exportación. La UI declara la dependencia; los reportes locales se consideran históricos y no fuente actual.

El contrato mínimo P2 requerido debe aportar periodo, id_empresa, 	ipo_material, cantidad_consumida, unidad, 	ipo_trabajo, cantidad_ots y costo_total, o registros base equivalentes que permitan calcular promedio por instalación y variación mensual.

## Seguridad, multiempresa, logging y auditoría

- La API key vive solo en backend y nunca se registra ni se devuelve.
- Todas las consultas G1 incluyen la empresa efectiva del usuario y validan la respuesta.
- Los logs de activación incluyen `trace_id`, `event_id`, empresa, cliente, servicio, contrato, OT, estado HTTP, duración y resultado; excluyen secretos y payload completo.
- Se reutiliza `LogAuditoria` para consultas G1, envíos/reintentos, activaciones completadas o pendientes, garantías y writes deprecados.
- El frontend muestra mensajes saneados mediante `apiErrorMessage`, sin stack traces ni fallback silencioso.

## Migración de base de datos

La migración aditiva `backend/prisma/migrations/20260926180000_i3_g1_inventory_integration/migration.sql` crea:

- `integracion_activacion_g1`, con `event_id` único, correlaciones, estado, intentos, hash, respuesta y fechas;
- `garantia_comercial`, con relaciones G8, referencia de serie externa e índice único parcial para garantías activas equivalentes.

No elimina tablas legacy ni crea tablas físicas G1. El bootstrap se ejecuta únicamente sobre PostgreSQL local descartable.

## Pruebas cubiertas

Las suites verifican cliente G1, filtros y autenticación; todos los códigos de error y timeout; estados físicos oficiales; idempotencia y retry; respuesta duplicada; rechazo 403/409; fallo G1 posterior al commit; riesgo multiunidad; ausencia de fallback; bloqueo de rutas físicas; desactivación de usuarios; garantías comerciales; equipos por servicio; separación visual de fuentes; y estados explícitos de CU-18/CU-61.

## Pendientes externos

1. Despliegue G1 de tipos de equipo, activación y equipos por servicio.
2. Respuesta ampliada por serie desplegada y verificada.
3. Ratificación de cardinalidad multiunidad de `event_id`.
4. Contrato G1 P2 para consumos/materiales de CU-61.
5. Contrato G3 para poste/NAP de CU-18.
6. Decisión coordinada para retirar schema y servicios físicos legacy después de migrar todos los lectores históricos.

Railway permaneció intacto:

```text
RAILWAY_MODIFIED=false
MIGRATIONS_APPLIED_TO_RAILWAY=0
DB_PUSH_RAILWAY=false
MIGRATE_DEV_RAILWAY=false
```