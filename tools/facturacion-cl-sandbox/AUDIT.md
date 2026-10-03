# Auditoría de datos CRM para futura emisión

Fecha: 2026-10-02. Base: `63404be3c12882c38cb73af2aa17d1ece1c9a1e2`.
Inspección de código y esquema; no se consultó ni modificó una base de datos.
El handoff es referencia de intención, no evidencia de funcionalidades publicadas.

Este informe conserva la auditoría del 2026-10-02. La preparación backend posterior,
sus cambios propuestos y pruebas del 2026-10-03 están en el
[checkpoint actual](../../docs/i3-facturacion-cl-checkpoint.md).

## Estado encontrado

`backend/src/tax-document-issuance` define `TaxDocumentIssuer` y
`PendingFacturacionClIssuer`. Solo ofrecen readiness con `canIssue=false` y
`canRetry=false`; no hay operación de emisión. La configuración arranca
deshabilitada y rechaza habilitarla mientras falte el contrato. El diseño está
descrito en `docs/i3-facturacion-cl-integration.md`.

`backend/src/external-tax-documents` implementa metadata manual de CU-86. No es
el módulo que deba emitir automáticamente. `Factura` y `Pago` siguen siendo la
fuente financiera. `DocumentoTributarioExterno` no sustituye al comprobante ni
autoriza calcular impuestos de una emisión futura.

En las ramas descargadas no aparece la migración
`20261001120000_i3_g2_intergroup_contract` mencionada por el handoff. No se crea ni
se aplica. Antes de integrar el adapter se debe contrastar la nueva base publicada
por el compañero y sus cambios de G2.

## Mapeo disponible y faltantes

Referencias: `backend/prisma/schema.prisma` y
`backend/src/billing/billing.service.ts`. Los campos son candidatos; esta tabla
no establece un mapeo tributario aprobado.

| Información | Datos existentes | Pendiente antes de emitir |
| --- | --- | --- |
| Empresa | `Empresa.idEmpresa`, `nombre`, `rutEmpresa` opcional | Confirmar emisor real, razón social fiscal, giro, dirección y contrato por empresa. Los RUT del seed de demostración no son configuración productiva. |
| Pertenencia | `Factura.contrato.idEmpresa`, `Contrato.cliente.idEmpresa` | Exigir coincidencia y relaciones completas; `Factura` no tiene empresa propia. Los IDs 1/2 del seed no prueban IDs de una base desplegada. |
| Receptor | `Cliente.rut` opcional, `nombreCompleto`, `email` opcional | RUT/razón social/giro y reglas obligatorias según tipo de documento; faltan datos fiscales dedicados. No inventar valores ni reutilizar datos de otra empresa. |
| Dirección | `DireccionServicio` y dirección de instalación en `Contrato` | Confirmar domicilio fiscal y selección inequívoca. Dirección de servicio/instalación no garantiza domicilio tributario. |
| Obligación de cobro | `Factura.idFactura`, período, `monto` opcional, fechas y estado | Definir evento y monto documentado. Una factura de cobro interna no implica que ya exista o corresponda un DTE. |
| Pago | `Pago.idPago`, `idFactura` opcional, monto, fecha, pasarela, referencia opcional | Definir emisión por factura o por pago, y tratamiento de abonos. No enviar `tokenTransaccional` ni copiar el comprobante de pago como PDF tributario. |
| Detalle | `Plan.nombreComercial`, `precioMensual`, relación de contrato | No hay detalle fiscal completo en `Factura`; precio vigente del plan no demuestra precio histórico del período. Determinar descripción, cantidad y conceptos verificables. |
| Cargos | `CargoAdicional` con empresa/cliente/contrato, monto, estado y `afectaSaldo` | Determinar cuáles se facturan y cómo evitar omitirlos o contarlos dos veces; no agregarlos automáticamente. |
| Impuestos | `Factura.monto` sin desglose tributario | Afectación/exención, neto, impuestos, redondeos y totales según contrato aprobado. No deducirlos desde metadata manual de CU-86. |
| Documento emitido | `Factura.tipoDocumento`, `folioExterno` opcionales | Separar emisión automática de metadata manual; persistencia futura de intención, fingerprint, ambiente, resultado y artefactos. Folio/tipo actuales no demuestran emisión. |

## Evento de emisión y consistencia

`BillingService.registerPayment` permite abonos y calcula `paidInFull`. Su
transacción Serializable puede repetirse hasta tres veces por conflicto Prisma
P2034. **Una llamada externa dentro de ella podría repetirse y emitir duplicados.**
El flujo actual no contiene tal llamada y queda sin cambios.

Propuesta para revisión cuando estén definidos los datos y la regla de emisión:
registrar una intención local/outbox en la misma transacción que guarda el pago,
con unicidad basada en la identidad de negocio aprobada. Un worker separado
envía después del commit. Así se evita también perder la intención si el proceso
cae entre guardar el pago y crear el trabajo. Este checkpoint no implementa
outbox, esquema, worker ni hook.

Antes del envío deben existir identidad estable y fingerprint del contenido.
Estados futuros: `PENDIENTE`, `EN_PROCESO`, `GENERADO`, `FALLIDO` y
`RESULTADO_INDETERMINADO`, sujetos al contrato del equipo. Un envío incierto se
reconcilia antes de cualquier reintento. Un GET de procesamiento sigue teniendo
efectos y no admite retry por su método HTTP. La falla de emisión no debe revertir
un pago confirmado; SMTP debe ser una etapa separada.

No se ha elegido la clave única: emitir por `idPago` podría duplicar una factura
pagada por abonos; emitir solo al saldo cero también es una política que el equipo
debe confirmar. No se ha establecido que un DTE deba esperar a un pago.

## Información necesaria del responsable/proveedor

1. Entorno API exclusivo de pruebas y credenciales por empresa; acceso mediante
   configuración segura, sin pegarlas en documentos, repositorio ni chat.
2. Tipos DTE contratados/autorizados, TXT/XML y reglas de folio/codificación.
3. Cuándo se emite, por qué monto y cómo se tratan pagos parciales, correcciones
   y documentos ya emitidos fuera del CRM.
4. Datos reales disponibles de emisor/receptor y tratamiento fiscal de conceptos.
5. Identidad/idempotencia remota y consulta para resolver timeout sin conocer folio.
   El manual público no demuestra un mecanismo suficiente. `getticket` no es un
   ticket de seguimiento; un error de duplicado tampoco equivale a ausencia de DTE.
6. Política de PDF/XML, entrega de correo y conciliación, además de límites del API.
7. SHA/base actual del trabajo G2 antes de incorporar cambios al runtime.

La comprobación inicial de credenciales se detalla más abajo. La emisión, el
mapeo tributario y la conciliación siguen pendientes; no se emitió documento alguno.

## Evidencia y alcance

El prototipo aislado tiene pruebas de login, caché multiempresa, resultados
individuales, errores y ausencia de retry; todas usan fixtures. Su comando está
en [README.md](README.md). No prueban conectividad ni certificación del proveedor.

Fuentes: código en la base indicada,
[API oficial](https://www.facturacion.cl/manualintegracion/apirestintegracion.php),
[credenciales oficiales](https://www.facturacion.cl/manualintegracion/credencialesacceso.php)
y [archivo de factura](https://www.facturacion.cl/manualintegracion/archivofacturaelectronica.php),
consultados el 2026-10-02. Las propuestas anteriores están señaladas como futuras;
no constituyen cambios aplicados al CRM.

## Comprobación de acceso web: 2026-10-02

El usuario confirmó el sistema `cablemagicolitoral` y autorizó comprobar el acceso
sin modificaciones. El inicio de sesión web fue exitoso y permitió consultar
Integración / Configuración / Credenciales. Se encontraron secciones separadas
de Ambiente Producción, Ambiente Prueba y Ambiente Prueba Acceso Web.

Las credenciales web de pruebas indicadas por el proveedor permitieron entrar en
`https://www.facturacion.cl/plano/`. Después apareció "Su clave ha caducado" y
un formulario de cambio de clave. No se completó ni guardó ese formulario. Ese
aviso no prueba que la clave API haya caducado: son accesos distintos.

## Comprobación API de pruebas: 2026-10-02

Se usaron exclusivamente los campos de la sección Ambiente Prueba del proveedor.
La primera consulta desde el entorno restringido falló localmente con `EACCES`;
no fue una respuesta de autenticación. Desde el entorno autorizado:

| Operación | Resultado observado |
| --- | --- |
| `POST https://rest.facturacion.cl/login` | HTTP 200 y token presente: autenticación PASS. |
| `GET https://rest.facturacion.cl/wsds/version` | HTTP 200 y JSON con `version` de tipo array; el manual muestra una cadena. El probe estricto devuelve `UNEXPECTED_RESPONSE`. No se afirma una versión numérica validada. |
| Emisión | Cero solicitudes a endpoints de procesamiento/emisión. |

Una segunda consulta limitada a login/versión confirmó la estructura inesperada;
no hubo reintentos automáticos, llamadas con credenciales API de producción ni
descargas de documentos. No se deduce de la autenticación que estén habilitados
todos los tipos DTE o que exista una estrategia de conciliación.

Se utilizó una entrada temporal fuera del repositorio, eliminada antes de cada
consulta HTTP. Los tokens permanecieron en memoria durante la comprobación y no
se registraron. No se guardan aquí usuario API, RUT, claves, token ni respuestas
completas. `verify-test-api.mjs` solo contiene login/versión y diagnósticos saneados;
no está conectado al runtime del CRM.

El bloqueo de emisión del CRM permanece intacto. No se cambiaron datos fiscales,
folios, documentos, contraseñas, configuración, base de datos ni despliegue.
