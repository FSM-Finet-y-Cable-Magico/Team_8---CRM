# Integración Facturacion.cl — estado y arquitectura segura

## Estado

**ARCHITECTURE_READY / PENDIENTE_CONTRATO_FACTURACION_CL**.

CU-86 ya está implementado como `DocumentoTributarioExterno`: registro, consulta, corrección y anulación lógica de metadata emitida fuera del CRM. `Factura` y `Pago` siguen perteneciendo al dominio Billing. Esta etapa no duplica CU-86 ni convierte metadata externa en una emisión tributaria.

No se implementó una llamada real a Facturacion.cl, una ruta de emisión, botones UI, credenciales, payload TXT/XML ni reintentos. La razón es técnica: el manual público describe la plataforma general, pero no determina el contrato contratado y certificado para Finet/Cable Mágico ni una estrategia segura de idempotencia/reconciliación.

## Evidencia oficial revisada

- Manual general de integración: <https://www.facturacion.cl/manualintegracion/>
- API REST de integración: <https://www.facturacion.cl/manualintegracion/apirestintegracion.php>
- Ficha técnica del servicio: <https://www.facturacion.cl/manualintegracion/fichatecnicaserviciointegracion.php>
- Formato de archivo factura electrónica: <https://www.facturacion.cl/manualintegracion/archivofacturaelectronica.php>

El material oficial observado documenta:

- base pública `https://rest.facturacion.cl`;
- autenticación mediante `POST /login` con `usuario`, `rut` y `clave`, que entrega un token temporal;
- envío general mediante `/wsds/procesar` usando un archivo de integración codificado y selección de formato TXT/XML;
- operaciones para obtener link/PDF, versión y ticket;
- onboarding, credenciales, certificación y habilitación de módulos/ambientes con el proveedor.

Estos datos son evidencia del producto, no autorización para usar una cuenta ni confirmación del contrato de este proyecto.

## Información que falta

1. Modalidad y módulos contratados para Finet y Cable Mágico.
2. Ambiente sandbox/certificación y ambiente productivo por empresa.
3. RUT emisor, usuario y secreto entregados por canal seguro para cada empresa.
4. Tipos DTE autorizados y formato elegido: TXT o XML.
5. Mapeo de datos CRM → campos obligatorios del archivo: emisor, receptor, dirección, giro, ítems, impuestos, referencias y totales.
6. Respuestas exactas de éxito/error y forma estable de recuperar un resultado después de timeout.
7. Garantía de idempotencia del proveedor o clave externa admitida; el manual revisado no basta para asumirla.
8. Rate limits, SLA, expiración/renovación de token y política de reintentos.
9. Reglas de folio, anulaciones/notas de crédito, PDF/XML y conciliación con SII.
10. Confirmación de si el envío documentado por query string es el mecanismo exigido para esta cuenta y cómo evita exposición en logs/proxies.

## Arquitectura incorporada

El módulo `tax-document-issuance` define una frontera `TaxDocumentIssuer` independiente de Billing y CU-86. Su implementación actual `PendingFacturacionClIssuer` solo entrega estado técnico por `idEmpresa`.

Estados posibles:

- `DISABLED`
- `CONFIGURATION_INVALID`
- `COMPANY_NOT_CONFIGURED`
- `COMPANY_DISABLED`
- `PENDIENTE_CONTRATO_FACTURACION_CL`

En todos los casos actuales `canIssue=false` y `canRetry=false`. No existe método de emisión, por lo que otro módulo no puede saltarse el bloqueo accidentalmente.

Variables:

```dotenv
FACTURACION_CL_INTEGRATION_ENABLED=false
FACTURACION_CL_COMPANIES=[]
```

Formato no secreto previsto:

```json
[
  { "idEmpresa": 1, "alias": "FINET", "environment": "sandbox", "enabled": false },
  { "idEmpresa": 2, "alias": "CABLE_MAGICO", "environment": "sandbox", "enabled": false }
]
```

El parser exige exactamente esos cuatro campos, IDs y alias únicos. Rechaza campos como `clave`, `password`, `token` o cualquier extra. Las credenciales futuras deberán ser variables secretas por empresa, con nombres definidos recién cuando exista el contrato real.

El runtime aborta si la configuración es inválida o si se intenta poner el flag en `true`. El validador de producción aplica el mismo bloqueo. Para habilitar la integración será necesaria una nueva modificación revisada, no solo un cambio de variable.

## Contrato futuro mínimo

Cuando la información faltante esté disponible, ampliar la frontera con operaciones explícitas:

- `issue(intent)` con identidad estable local y fingerprint del contenido;
- `getStatus(providerReference | ticket)` para reconciliar;
- `getArtifacts(reference)` solo si el proveedor permite PDF/XML de forma segura;
- `cancel` o documentos correctivos únicamente bajo reglas contractuales y tributarias confirmadas.

La persistencia futura debe separar, como mínimo:

- intento local único por empresa y documento Billing;
- fingerprint inmutable del payload;
- ambiente y proveedor;
- estado local y referencia/ticket remoto;
- timestamps, número de intentos y último error saneado;
- resultado tributario y artefactos sin guardar credenciales.

## Idempotencia y timeouts

Reglas no negociables para la implementación futura:

1. Una misma intención lógica no puede crear dos emisiones.
2. Antes del envío se persiste una identidad/fingerprint único en una transacción local.
3. Si el proveedor confirma recepción, se conserva su referencia antes de permitir otra acción.
4. Ante timeout después de enviar, el estado debe pasar a `RESULTADO_INDETERMINADO`.
5. `RESULTADO_INDETERMINADO` no se reintenta ciegamente. Primero se consulta/reconcilia por una referencia estable acordada con Facturacion.cl.
6. Solo errores demostrablemente previos al envío o explícitamente reintentables pueden usar retry con backoff y límite.
7. Un operador no puede forzar retry sin ver la conciliación y el riesgo de duplicado.
8. Logs y auditoría guardan IDs, estados y códigos saneados; nunca token, clave o archivo tributario completo.

Si Facturacion.cl no ofrece una búsqueda estable por identidad del cliente/ticket, el equipo debe obtener una garantía contractual de idempotencia o diseñar un proceso operativo de conciliación antes de habilitar emisión.

## UI

No se modificó la UI. Agregar acciones “Emitir”, “Reintentar” o “Enviar al SII” antes del contrato sería engañoso y permitiría expectativas que el backend no puede garantizar. CU-86 continúa mostrando solo registro/corrección/anulación de metadata externa.

Cuando el contrato esté listo, la UI deberá mostrar estado, ambiente, referencia externa, resultado indeterminado y acción de conciliación; nunca secretos ni payloads tributarios completos.

## Pruebas incorporadas

- flag ausente/deshabilitado;
- configuración multiempresa y ambientes separados;
- empresa deshabilitada o no configurada;
- JSON/flag/duplicados inválidos fallan cerrado;
- campos extra, incluidos nombres de credenciales, se rechazan;
- arquitectura sin `fetch`, Axios, URL, header Authorization o emisión;
- validador productivo bloquea `FACTURACION_CL_INTEGRATION_ENABLED=true`.

Todas son pruebas locales con configuración ficticia. No se usaron cuentas, sandbox ni producción del proveedor.

## Próximo hito

Reunión técnica con Facturacion.cl y responsables Finet/Cable Mágico para responder los diez puntos pendientes. Con una ficha contractual versionada se podrá implementar primero un adapter sandbox, persistencia idempotente y conciliación; después pruebas fake, pruebas sandbox autorizadas y revisión de seguridad. Producción permanece fuera de alcance hasta completar esa secuencia.
