# Incremento 3 - Etapa 2: área comercial y Libro Control

## Objetivo y decisión de arquitectura

La Etapa 2 reemplaza el seguimiento manual del Libro Control por una proyección operacional del CRM. No existe una tabla plana `libro_control`: cada fila se calcula desde `Cliente -> Contrato -> ServicioContratado -> Factura`, complementada por `Pago`, `Plan`, `ZonaPago`, eventos y entidades comerciales estructuradas.

La planilla sigue siendo una referencia de experiencia y vocabulario. Las reglas de negocio y el saldo exigible provienen del modelo normalizado del CRM.

| Requerimiento | Entidad reutilizada | Decisión |
| --- | --- | --- |
| Identidad y contacto | `Cliente`, `Prospecto` | Reutilizar; el interesado no contratante permanece como `Prospecto` |
| Servicio, plan y zona | `ServicioContratado`, `Contrato`, `Plan`, `ZonaPago` | Reutilizar sin duplicar datos técnicos |
| Documento, deuda y pago | `Factura`, `Pago` | Reutilizar; se agregan metadatos opcionales de documento |
| Observaciones | `ObservacionOperativa` | Reutilizar como contexto, no como reemplazo de entidades estructuradas |
| Auditoría | `LogAuditoria` | Reutilizar para acciones y exportaciones |
| Avisos y contactos | — | Crear `EventoGestionComercial` |
| Convenios y cuotas | — | Crear `ConvenioPago` y `CuotaConvenioPago` |
| Prórrogas | — | Crear `ProrrogaPago` y conservar la fecha original |
| Cambio de condición | — | Crear `CambioCondicionPago` como historial |
| Cargos | — | Crear `CargoAdicional`, separado de `Pago` |

## Casos de uso cubiertos

- **CU-05:** alta de interesado no contratante, con RUT y teléfono normalizados, correo validado, fuera del pipeline activo y recuperable para remarketing.
- **CU-09:** alertas de vencimiento aisladas por empresa; el umbral se obtiene de `COMMERCIAL_PLAN_EXPIRY_ALERT_DAYS` (1 a 90, valor por defecto 7) y el dashboard muestra ese valor.
- **CU-29:** registro de último aviso previo al corte sobre una factura con deuda vencida. WhatsApp representa un canal informado manualmente.
- **CU-33:** exportación CSV y XLSX del Libro Control con los filtros, orden y columnas seleccionados.
- **CU-77:** consulta paginada y filtrable del Libro Control proyectado.
- **CU-78:** motor central de estado comercial calculado.
- **CU-79:** aviso previo a retiro asociado a cliente y servicio, sin crear OT externa.
- **CU-80:** convenio estructurado con cuotas verificables y aprobación administrativa.
- **CU-81:** prórroga estructurada que conserva el vencimiento original.
- **CU-82:** cambio de día o fecha comprometida con valor anterior, valor nuevo, justificación y responsable.
- **CU-83:** cargo adicional separado de pagos y del saldo exigible hasta facturación.

## Modelo comercial

### EventoGestionComercial

Registra `AVISO_PREVENTIVO`, `ULTIMO_AVISO_CORTE`, `AVISO_PREVIO_RETIRO`, `CONTACTO_CLIENTE` y `OTRO_EVENTO_COMERCIAL`. Se vincula de forma obligatoria a empresa, cliente y responsable; servicio, contrato y factura son opcionales y se validan contra el mismo cliente y empresa.

Canales admitidos: `TELEFONO`, `EMAIL`, `WHATSAPP`, `PRESENCIAL` y `OTRO`. `WHATSAPP` no implica envío mediante API.

### ConvenioPago y CuotaConvenioPago

El convenio registra deuda/factura, cliente, contrato y servicio cuando corresponde, monto, cantidad de cuotas, condiciones, fecha de inicio, responsable y aprobación. Estados documentados: `PENDIENTE`, `APROBADO`, `ACTIVO`, `CUMPLIDO`, `INCUMPLIDO` y `CANCELADO`.

Cada cuota tiene número correlativo único por convenio, monto, vencimiento, estado y fecha de pago opcional. La creación valida deuda vigente, empresa, pertenencia de las relaciones, monto positivo, cantidad, fechas, numeración y suma exacta de cuotas. Solo un administrador puede aprobar un convenio pendiente.

### ProrrogaPago

Conserva `fechaOriginal` y registra `nuevaFecha`, motivo, estado, responsable y fecha de registro. La nueva fecha debe ser posterior a la fecha efectiva vigente. Estados documentados: `PENDIENTE`, `APROBADA`, `CUMPLIDA`, `VENCIDA` y `CANCELADA`; la acción implementada crea una prórroga aprobada por un usuario autorizado del área comercial.

### CambioCondicionPago

Registra `DIA_PAGO` o `FECHA_COMPROMETIDA`, junto con valor anterior, valor nuevo, justificación y responsable. El día válido es 1 a 28. El cambio del contrato y el historial se guardan en una transacción. Una fecha comprometida válida crea también la prórroga que utiliza el motor comercial.

### CargoAdicional

Conceptos: `REPOSICION`, `RECONEXION`, `RETIRO` y `OTRO`. Se crea como `PENDIENTE_FACTURACION` y `afectaSaldo=false`. Se muestra aparte en el Libro Control y no se registra como `Pago`; solo una facturación posterior podrá convertirlo en monto exigible.

## Proyección Libro Control

`CommercialControlBookService` entrega una fila inequívoca por factura y contrato, con el servicio directo cuando existe uno solo y la lista `serviciosRelacionados` cuando el contrato tiene varios. La clave operacional es `idCliente-idContrato-idFactura`.

La respuesta incluye:

- identidad: empresa, cliente, RUT, nombre, dirección, teléfono y correo;
- servicio: identificadores, estado, plan, zona e instalación;
- facturación: documento, folio, emisión, vencimiento original y efectivo, monto y estado;
- cobranza: pagos, saldo, saldo a favor, atraso, estado y acción sugerida;
- gestión: última gestión/responsable, convenio, prórroga, último aviso, aviso de retiro y observación;
- operación comercial: día de pago, suspensión/corte, transacción, forma de pago y cargos pendientes.

Filtros soportados: empresa, texto, estado comercial, estado de servicio, plan, zona, deuda, vencimiento, rango de atraso, convenio, prórroga, último aviso, retiro y rango de vencimiento. La búsqueda cubre RUT, nombre, teléfono, contrato y folio. El ordenamiento usa una lista cerrada: nombre, saldo, atraso, vencimiento o última gestión. La API pagina con tamaño máximo 100 y calcula el resumen dentro del alcance filtrado.

Rutas:

- `GET /commercial/control-book`
- `GET /commercial/control-book/export`
- `POST /commercial/events`
- `POST /commercial/withdrawal-notices`
- `POST /commercial/agreements`
- `POST /commercial/agreements/:id/approve`
- `POST /commercial/extensions`
- `POST /commercial/payment-condition-changes`
- `POST /commercial/additional-charges`
- `POST /commercial/non-contracting-leads`
- `GET /commercial/expiring-plans`

## Motor de estado comercial

`CommercialStatusService` usa monto de la factura, pagos válidos, vencimiento original, prórroga aprobada, convenio activo y últimos eventos. No persiste un estado mensual.

Saldo pendiente y saldo a favor se calculan desde `Factura.monto` y la suma de `Pago.monto`. Los cargos pendientes no entran en el saldo. La fecha efectiva es el vencimiento original, salvo una prórroga posterior aprobada. Los días de atraso se calculan en días calendario desde esa fecha efectiva.

Catálogo derivado de compatibilidad, porque el sistema previo no tenía uno comercial completo:

| Estado | Regla principal | Acción sugerida |
| --- | --- | --- |
| `SIN_DATOS_FINANCIEROS` | factura sin monto calculable | completar datos financieros |
| `AL_DIA` | saldo pendiente igual a cero | sin gestión pendiente |
| `SALDO_PENDIENTE` | deuda aún no vencida | controlar próximo vencimiento |
| `DEUDA_VENCIDA` | saldo positivo después del vencimiento efectivo | cobranza o último aviso según umbral de corte |
| `CON_PRORROGA` | prórroga aprobada aún vigente | revisar en fecha comprometida |
| `CON_CONVENIO` | convenio aprobado/activo | seguir convenio |
| `ULTIMO_AVISO_REGISTRADO` | último aviso asociado a la deuda | revisar respuesta y decisión |
| `RETIRO_PENDIENTE` | aviso previo a retiro registrado | dar seguimiento al retiro |

La precedencia protege el significado operacional: pago total, retiro, último aviso, convenio, prórroga, deuda vencida y deuda no vencida.

## Frontend

El tab **Libro Control** incorpora una tabla de alta densidad con encabezado y primeras cinco columnas fijas, scroll horizontal/vertical, truncado con `title`, búsqueda, filtros, orden, paginación, resumen y selector de columnas. Ofrece vista esencial y vista operativa Finet sobre la misma API.

Las celdas calculadas son de solo lectura. Las acciones abren formularios controlados para gestión, último aviso, convenio, prórroga, día de pago, cargo y aviso de retiro. El detalle enlaza con las áreas de cliente/servicio y cobranza/factura. El selector global de empresa se reutiliza para el alcance.

El módulo de importación conserva la carga histórica existente y agrega un panel separado para la vista previa de Libro Control.

## Exportación

CSV incluye BOM UTF-8, escapado de campos y los encabezados documentados. XLSX entrega montos numéricos, RUT/teléfono/transacción como texto, encabezado fijo, primeras columnas congeladas y autofiltro. Ambos formatos usan exactamente el alcance, filtros, orden y columnas solicitadas, y registran `EXPORTAR_LIBRO_CONTROL`.

La infraestructura existente de reportes se conserva para exportaciones comerciales generales y morosidad mediante GET /reports/export?type=cobranza, en CSV o XLSX y con alcance empresarial.

## Planilla legacy e import preview

El mapping exhaustivo está en `docs/i3-libro-control-mapping.md`. La vista previa usa la versión explícita `FINET_LIBRO_CONTROL_V1`, detecta la columna RUT sin encabezado en `AGOSTO`, conserva el primer mapping canónico cuando hay encabezados duplicados y clasifica la hoja histórica sin crear clientes activos.

La validación reconoce RUT con y sin puntos, seriales Excel solo en columnas de fecha, montos textuales, teléfonos inequívocos, teléfonos ambiguos, fórmulas `#REF!`, duplicados, registros existentes y planes desconocidos. El endpoint devuelve resumen y hasta 200 incidencias con `persisted=false` y registra `IMPORT_PREVIEW_LIBRO_CONTROL`.

La confirmación de importación permanece deshabilitada en esta etapa: no existe endpoint que persista filas del Libro Control ni se importaron datos reales. Una confirmación futura deberá añadir `batchId` o hash, transacción e idempotencia antes de habilitar `IMPORT_CONFIRM_LIBRO_CONTROL`.

## Seguridad y multiempresa

Se reutiliza el RBAC existente:

- ver Libro Control: Administrador, Comercial y Soporte;
- exportar: Administrador y Comercial;
- ejecutar acciones comerciales: Administrador y Comercial;
- aprobar convenio e importar preview: Administrador.

El controlador y el servicio comprueban permisos. Las consultas, relaciones, acciones, exportaciones, alertas e import preview aplican el alcance de empresa; un usuario no administrador no puede elegir otra empresa.

Acciones auditadas: creación/aprobación de convenio, prórroga, cambio de condición, cargo, último aviso, aviso de retiro, gestión comercial, interesado, exportación y vista previa de importación.

## Migración

`backend/prisma/migrations/20260925180000_i3_commercial_control_book/migration.sql` es una migración aditiva única. Crea seis tablas normalizadas, checks, claves foráneas e índices; agrega clasificación/remarketing a `prospecto` y tipo/folio a `factura`. No elimina tablas o columnas ni recalcula datos históricos.

El bootstrap local aplica la migración sobre PostgreSQL descartable y `scripts/verify-local-db.mjs` comprueba 21 tablas, columnas críticas, 18 claves foráneas, 16 índices y consultas Prisma.

## Pruebas

La cobertura nueva incluye:

- estados, pagos parciales, saldo a favor, atraso, prórroga, convenio, avisos y acción sugerida;
- proyección, filtros, búsqueda, paginación, ordenamiento y multiempresa;
- convenios, cuotas, aprobación, prórroga, cambio de pago, cargos, interesados, avisos y auditoría;
- CSV/XLSX con tipos correctos;
- umbral de alertas y aislamiento por empresa;
- DTO y validaciones de entrada;
- preview sintético de `AGOSTO` e histórico, encabezado RUT ausente, RUT con/sin puntos, serial, teléfono ambiguo, `#REF!`, plan desconocido y duplicado;
- prueba PostgreSQL opcional con rollback de todas las entidades y la proyección.

## Limitaciones deliberadas

- WhatsApp es un canal manual; no se llama Meta Cloud API.
- No se integra Facturación.cl, SmartOLT, G1 ni G3.
- La fecha de reactivación histórica no tiene una fuente normalizada confiable y se mantiene sin inferir.
- NAP/POS, IPTV y garantías físicas no son editables desde Libro Control.
- El preview no confirma ni persiste una migración legacy.
- El límite defensivo interno de consulta es 5.000 facturas; la respuesta al cliente continúa paginada.
- No se modificó `service-activation.policy.ts`, cobertura geográfica ni Railway.