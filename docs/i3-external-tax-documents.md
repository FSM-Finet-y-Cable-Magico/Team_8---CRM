# Incremento 3 — Documentos tributarios externos

## RF-86 / CU-86 y alcance

CU-86 registra metadata de boletas o facturas emitidas fuera del CRM. G8 conserva la referencia, sus relaciones y su trazabilidad; no emite documentos, no asigna folios tributarios, no firma DTE, no consulta el SII y no sustituye al sistema emisor.

El modelo vigente `Factura` representa una cuenta por cobrar y, junto con `Pago`, sigue siendo la fuente de saldo, deuda y cobranza. Sus campos opcionales `tipoDocumento` y `folioExterno` sirven para proyectar la referencia de una factura propia, pero no alcanzan para documentos externos que pueden vincularse opcionalmente a Cliente, Contrato, Factura o CargoAdicional. Por eso RF-86 usa la entidad normalizada separada `DocumentoTributarioExterno`.

## Modelo y relaciones

`DocumentoTributarioExterno` persiste:

- empresa, tipo, folio/número y sus valores normalizados;
- emisor/proveedor y su valor normalizado;
- fecha comercial de emisión (`DATE`);
- neto, exento e IVA opcionales y total obligatorio (`DECIMAL(14,2)`);
- URL y referencia externa opcionales;
- estado y fuente;
- vínculos opcionales a Cliente, Contrato, Factura y CargoAdicional;
- usuario de registro y timestamps.

Las relaciones usan claves foráneas explícitas. No existe una relación polimórfica. Registrar o corregir metadata no crea Factura/Pago, no cambia saldo, deuda, convenio, prórroga o `afectaSaldo`, no activa servicios y no crea órdenes de trabajo.

## Catálogos, duplicados y montos

Los únicos tipos ratificados son `BOLETA` y `FACTURA`. Los estados son `REGISTRADO` y `ANULADO`: describen únicamente lo que conoce el CRM y no afirman aceptación tributaria. La fuente actual es fija: `EXTERNO_MANUAL`.

La identidad única es `(id_empresa, tipo_documento, emisor_normalizado, folio_normalizado)`. El servicio recorta y colapsa espacios y convierte a mayúsculas para comparar, conservando el texto visible limpio. Un mismo folio puede existir en empresas distintas. El control se aplica en servicio y con índice único PostgreSQL.

Todos los montos aceptan hasta dos decimales y deben ser no negativos. Si se entregan componentes parciales, su suma no puede superar el total; si se entregan neto, exento e IVA, la suma debe coincidir exactamente en centavos con el total. Esta regla verifica coherencia documental y no calcula tasas ni impuestos.

## URL y archivos

La URL solo admite `http` o `https`, exige host y rechaza credenciales embebidas. Se almacena como metadata y nunca es consultada por el backend. No se descargan PDF/XML y no se guardan blobs. Esto evita convertir el campo en un vector SSRF. La auditoría omite query string y fragmento de la URL para no persistir tokens accidentales.

## Multiempresa y RBAC

Crear, consultar, editar y anular exige rol `Administrador`. Además, el administrador debe tener empresa asociada y solo puede operar documentos y relaciones de esa empresa. Cliente, Contrato, Factura y CargoAdicional se validan en backend contra `idEmpresa`; también se comprueba coherencia entre cliente, contrato, factura y cargo cuando se combinan.

## API, auditoría y frontend

La API ofrece:

- `POST /api/external-tax-documents`;
- `GET /api/external-tax-documents` paginado y filtrable;
- `GET /api/external-tax-documents/:id`;
- `PATCH /api/external-tax-documents/:id`;
- `PATCH /api/external-tax-documents/:id/deactivate`.

No existe borrado físico. Las altas, consultas de detalle, correcciones, anulaciones, vínculos a factura e intentos duplicados se registran en `LogAuditoria` con valores saneados.

La sección **Documentos tributarios** está dentro de Cobranza y muestra tipo, folio, emisor, Cliente/Contrato, fecha, monto, estado, referencia y fuente. Incluye formulario de alta/corrección, anulación, filtros por empresa, tipo, folio, emisor, Cliente, Contrato, Factura, estado y fechas, búsqueda por folio/emisor/nombre/RUT, y paginación. La ficha se mantiene separada de Facturas pendientes, Pagos, ContratoDigital y Libro Control.

## Migración y pruebas

La migración aditiva `20260927120000_i3_external_tax_documents` crea la tabla, checks, claves foráneas, índice único e índices de consulta. No elimina, renombra ni transforma tablas previas. El bootstrap local aplica la migración con Prisma.

Las pruebas cubren tipos y campos obligatorios, fechas, Decimal, coherencia de montos, duplicados y normalización, empresas distintas, relaciones inexistentes/cruzadas/incoherentes, URL segura, RBAC, paginación y filtros, auditoría, anulación lógica, invariantes financieras, ausencia de red/proveedor/emisión y estructura de la migración. La suite PostgreSQL local optativa valida migración, FK, índice único, Decimal y rollback usando datos sintéticos.

## Estado de integración Facturación.cl

| Pregunta | Estado comprobado |
| --- | --- |
| ¿Documentación oficial disponible? | Sí; se revisó el manual público general de Facturacion.cl. |
| ¿Contrato específico del proyecto disponible? | No: faltan módulos contratados, ambientes, formato, mapeo, errores e idempotencia. `PENDIENTE_CONTRATO_FACTURACION_CL`. |
| ¿Credenciales técnicas disponibles? | No; no se solicitaron ni agregaron. |
| ¿Sandbox validado? | No. |
| ¿Emisión implementada? | NO. |
| ¿CU-86 depende de ella? | NO. |

Estado: `ARCHITECTURE_READY / PENDIENTE_CONTRATO_FACTURACION_CL`. Existe una frontera técnica cerrada y configuración multiempresa no secreta, pero no se creó payload, endpoint, autenticación ni cliente HTTP. El registro manual de CU-86 funciona de forma independiente. Ver [i3-facturacion-cl-integration.md](i3-facturacion-cl-integration.md).

## Fuera de alcance

No se implementan emisión, timbraje, firma, folios SII, consulta al SII, Facturación.cl, Google Drive, descarga de archivos, importación real de la planilla, confirmación de import, conciliación bancaria, WhatsApp, escrituras SmartOLT, G1, G3, WiFi, TV IP ni cambios de lifecycle. Railway no recibe cambios ni migraciones.
