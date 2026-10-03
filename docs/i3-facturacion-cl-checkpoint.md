# Facturación.cl: preparación técnica y pendientes de activación

Fecha: 2026-10-03. Rama: `feat/i3-facturacion-cl`.
Base remota verificada: `63404be3c12882c38cb73af2aa17d1ece1c9a1e2` de
`origin/feature/incremento3`. No se publicó commit, push ni PR.

## Resultado y alcance real

**PREPARACION_TECNICA_IMPLEMENTADA / EMISION_BLOQUEADA_POR_CONTRATO_Y_REGLA_G8**.
Este checkpoint no satisface todavía la Definition of Done de emisión del handoff.
El responsable debe confirmar la regla de emisión: fue expresamente dejada
pendiente. No está definido el tipo de la primera prueba.

El runtime mantiene `PendingFacturacionClIssuer`, `canIssue=false`, `canRetry=false`
y el bloqueo de habilitación de `FACTURACION_CL_INTEGRATION_ENABLED=true`.
Los componentes nuevos no están registrados en Nest, no se exportan desde la
frontera activa y no se conectan a Billing ni a una ruta HTTP.

Se implementó código de preparación dentro del backend, sin dependencias nuevas:

- `FacturacionClReadClient`: login y consulta de versión reales, solo para
  compañías declaradas de pruebas; secretos mediante proveedor server-side,
  tokens por empresa, renovación previa a las 24 horas y errores saneados.
  Sus métodos públicos solo autentican y consultan versión; no siguen redirects
  ni hacen retry automático. El transporte protegido se usa por el dispatcher separado.
- Constructores offline de factura XML (33/34) y boleta TXT (39/41), con datos
  explícitos. Cubren un subconjunto mínimo de detalle sin descuentos, mezcla de
  tratamientos, impuestos adicionales, envío de correo ni autoasignación de folio.
- `TaxEmissionIntentService`: fingerprint del contenido/contexto, preparación
  local, una toma atómica del trabajo antes de despachar y estados independientes
  del pago. Se verifica con un dispatcher ficticio y con transporte HTTP simulado.
- `FacturacionClSandboxDispatcher`: envío GET documentado, deshabilitado por defecto,
  contrato de pruebas explícito por empresa y prueba de identidad persistida antes
  del envío. Ninguna empresa real tiene ese contrato aprobado en el código/runtime.
  Respuestas discordantes, errores HTTP y timeouts quedan indeterminados, sin retry.
- `PrismaTaxIntentStore`: persistencia propuesta separada de CU-86; comprobación
  de empresa/cliente/factura/pago, preparación Serializable, replay inmutable,
  actualización condicionada por propietario y cuarentena de trabajos antiguos.
- Esquema y migración nueva `20261003010000_i3_tax_emission_intents`, **no aplicada**.

El cliente generado de Prisma y los paquetes locales son archivos de desarrollo
ignorados por Git. No se cambiaron versiones, package.json ni package-lock.json.

## Evidencia externa del checkpoint anterior

El 2026-10-02 se verificó acceso web de Cable Mágico y las secciones separadas de
credenciales. Con las de Ambiente Prueba se obtuvo HTTP 200 y token en `/login`.
`/wsds/version` respondió HTTP 200 con `version` de tipo array, mientras el manual
publica una cadena. Se conserva esa diferencia; no se declara una versión válida
sin conocer la estructura de sus elementos.

El acceso web de pruebas aceptó login pero mostró clave caducada; no se modificó
la contraseña. El detalle saneado está en `tools/facturacion-cl-sandbox/AUDIT.md`.
Este checkpoint del 2026-10-03 no hizo llamadas al proveedor.

## Datos y límites de los constructores

Los importes aprobados se reciben como cadenas, sin cálculos en coma flotante.
Se comprueba consistencia de líneas/totales y se rechazan resultados que requieran
redondeo de pesos no definido. No se infiere IVA, exención, tipo DTE, identidad
del emisor/receptor ni política de pago. El RUT solo tiene validación estructural;
el flujo futuro debe validar identidad/dígito y pertenencia autoritativa.

Factura: XML con raíz DTE/Documento y bytes ISO-8859-1; máximo 60 detalles, sin
conversión silenciosa de caracteres fuera de Latin1. El emisor usa el RUT explícito
y los datos que el proveedor mantiene según el manual. No se afirma que el
subconjunto cubra todavía las reglas de servicios periódicos de Cable Mágico.

Boleta: TXT con posiciones y separadores completos, máximo 1000 detalles,
descripción sin separadores/saltos que puedan inyectar registros, montos brutos o
exentos y fechas explícitas para servicios periódicos. El charset debe ser elegido
por contrato, no se deduce del manual XML. El correo queda vacío, porque el manual
describe envío automático si se informa ese campo; SMTP debe ser otra etapa.

Ambos requieren folio positivo explícito. Aunque el manual de boleta describe
folio cero para autoasignación, no se habilita esa modalidad antes de definir
cómo conciliar una emisión incierta sin conocer su folio.

## Identidad e idempotencia: garantía y límite

La unicidad propuesta es `(idEmpresa, ambiente, businessKey)`. `businessKey` debe
ser una identidad estable de G8 definida por la futura regla aprobada; no puede
tomarse del body de G2 ni cambiar al renovar política, folio o tipo. `policyVersion`
documenta esa regla y forma parte del fingerprint, no crea otra emisión.

Mientras no exista la regla, no hay generador de businessKey ni intención automática
tras Pago. La comprobación de pertenencia no demuestra por sí sola que un pago
sea el evento tributario correcto. Los ejemplos `FAKE_*` solo son fixtures.

Solo `PENDIENTE` con cero intentos puede reclamarse. Además, una actualización
atómica de `fechaEnvio` antes de autenticar/despachar impide reenviar directamente
el mismo trabajo reclamado, también al reconstruir el dispatcher tras reinicio.
La marca describe autorización local de despacho, no prueba recepción remota.
Una vez iniciado, un fallo
incierto, resultado remoto discordante o caída antes de guardar éxito bloquea
otro envío. El trabajo antiguo puede pasar a `RESULTADO_INDETERMINADO`; no se
devuelve automáticamente a pendiente. Esto prioriza evitar duplicados y puede
dejar un trabajo sin emisión si el proceso cae antes de despachar: necesita revisión.

El store no persiste payload, receptor, clave ni token. Al ejecutar se debe
reconstruir el mismo snapshot aprobado; cualquier cambio de datos genera conflicto
de fingerprint. No hay todavía política de cifrado/retención de snapshots fiscales
ni reconstrucción histórica completa de conceptos del CRM.

**No existe reconciliación automática con Facturación.cl ni una garantía de
idempotencia remota validada.** La cuarentena no equivale a conciliación. No se
usa `getticket` como seguimiento: el manual lo describe para impresión térmica.
No hay acción pública de reintento, autorización manual ni resolución de
indeterminados implementada en este checkpoint.

## Base de datos e integración futura

La migración es aditiva: crea una tabla de intenciones con foreign keys, unicidad y
restricciones; no modifica datos de Factura/Pago/CU-86. Prisma validate y el diff
offline del esquema verifican la estructura, sin ejecutarla en PostgreSQL.
Las restricciones SQL y la concurrencia del motor aún requieren prueba en una
base aislada, autorizada. Las pruebas actuales del store usan mocks.

No se editaron migraciones existentes, init-global.sql, dumps, Railway, G1, G3,
endpoints G2, JWT ni frontend. La migración G2 mencionada por el handoff sigue sin
aparecer en la base remota verificada. El carril principal deberá revisar e incorporar
el nuevo modelo/DDL a su estrategia de esquema antes de activar el store.

La integración posterior no debe emitir dentro de la transacción financiera. Una
vez ratificada la regla, acordar cómo conservar durablemente el trabajo asociado al
pago sin una ventana de pérdida tras commit (p. ej. outbox local). La emisión y
SMTP ocurren después del commit; un fallo tributario no revierte el pago. Este
checkpoint no implementa ese hook/outbox ni modifica el comportamiento de pagos.

## Validación local

Ejecutado sobre el código de este checkpoint:

- Prisma validate y generación local del cliente, sin conexión a base.
- Diff offline base → esquema nuevo: solo tabla, índices y foreign keys nuevos.
- TypeScript `tsc --noEmit`, sin errores.
- ESLint del módulo tax-document-issuance, sin errores.
- Jest del módulo nuevo y regresión de Billing/CU-86: 8 suites, 96 pruebas PASS.

Comandos desde backend:

```powershell
node ../node_modules/jest/bin/jest.js --runInBand src/tax-document-issuance src/external-tax-documents/external-tax-documents.boundaries.spec.ts src/billing/billing.service.spec.ts
node ../node_modules/typescript/bin/tsc --noEmit --incremental false -p tsconfig.build.json
node ../node_modules/eslint/bin/eslint.js src/tax-document-issuance
```

Estas pruebas no certifican emisión, recepción SII, artefactos, correo ni concurrencia
real de PostgreSQL. La cuenta FiNet no fue probada; no se reutilizan sus credenciales
ni se presupone que la configuración de Cable Mágico sirve para ambas empresas.

## Pendientes para completar la integración

1. Regla G8 ratificada para pagos parciales, documentos existentes y monto a emitir;
   tipo de primera prueba y tipos habilitados por empresa.
2. Datos fiscales y conceptos históricos autoritativos, indicadores de servicio,
   charset TXT, tratamiento/validación de impuestos y política de redondeos.
3. Folios de pruebas y procedimiento del proveedor para identificar/reconciliar
   un envío incierto; respuestas y artefactos verificables. No basta un login exitoso.
4. Certificar el dispatcher preparado y sus formatos con el contrato confirmado;
   implementar recuperación segura de artefactos y conciliación. La emisión HTTP
   actual solo fue probada con transporte simulado; ninguna emisión productiva.
5. Validar migración/concurrencia en PostgreSQL aislado y coordinar la base G2.
6. Integrar hook/outbox después de ratificar la identidad, sin enviar dentro de la
   transacción de Pago; conectar el issuer y efectuar una emisión sandbox autorizada.

## Reporte de entrega

```text
BASE_SHA=63404be3c12882c38cb73af2aa17d1ece1c9a1e2
NEW_DEPENDENCIES=[]
NEW_ENV_VARS=[]
DB_CHANGE_REQUIRED=YES_FOR_FUTURE_STORE
MIGRATION_PROPOSED=20261003010000_i3_tax_emission_intents
MIGRATION_APPLIED=false
READ_CLIENT_IMPLEMENTED=true
DOCUMENT_BUILDERS_OFFLINE=true
DISPATCHER_HTTP_IMPLEMENTED=true_UNREGISTERED_UNCERTIFIED
DEFAULT_DISABLED=true
PAYMENT_HOOK_IMPLEMENTED=false
TIMEOUT_QUARANTINE_TESTS=PASS
PROVIDER_RECONCILIATION_IMPLEMENTED=false
SANDBOX_EMISSION_VERIFIED=false
READY_FOR_CHERRY_PICK=false
REAL_PROVIDER_CALLS_THIS_CHECKPOINT=0
REAL_EMISSION_CALLS_TOTAL=0
PRODUCTION_EMISSION_CALLS_TOTAL=0
```

Fuentes oficiales revisadas el 2026-10-03:
[REST](https://www.facturacion.cl/manualintegracion/apirestintegracion.php),
[factura XML](https://www.facturacion.cl/manualintegracion/archivofacturaelectronica.php),
[boleta TXT](https://www.facturacion.cl/manualintegracion/archivoboletaelectronica.php),
[credenciales](https://www.facturacion.cl/manualintegracion/credencialesacceso.php).
