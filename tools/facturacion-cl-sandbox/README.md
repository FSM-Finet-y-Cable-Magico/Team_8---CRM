# Facturación.cl: checkpoint local y simulación

Fecha: 2026-10-02. Rama de trabajo: `feat/i3-facturacion-cl`.
Base revisada: `feature/incremento3`, commit `63404be3c12882c38cb73af2aa17d1ece1c9a1e2`.

Preparación backend posterior (2026-10-03):
[checkpoint actual](../../docs/i3-facturacion-cl-checkpoint.md). Los límites de no
modificación del runtime de emisión siguen vigentes; existe ahora una migración
propuesta y código backend aislado que aún no se usa desde Billing.

Este directorio prepara la integración fuera del runtime del CRM. **No es una
integración habilitada ni una validación de emisión contra Facturación.cl.**
Contiene un prototipo exclusivamente offline y un probe independiente que solo
autentica y consulta versión con credenciales confirmadas de pruebas. El resultado
real de esa comprobación está en [AUDIT.md](AUDIT.md).

## Ejecutar

Desde la raíz del repositorio, con Node.js >= 20.11:

```powershell
node --test tools/facturacion-cl-sandbox/prototype.test.mjs
node --test tools/facturacion-cl-sandbox/verify-test-api.test.mjs
```

No requiere instalar paquetes, configurar una base de datos ni aportar secretos.
`prototype.mjs` solo acepta el transporte creado por `createFixtureTransport`,
que consume una cola de respuestas locales. No contiene un cliente HTTP. El
destino fijo es `https://facturacion.invalid`; no hay URL configurable ni lectura
de variables de entorno. Las credenciales internas son cadenas `SIMULATED_*`
que no constituyen datos fiscales. Los bytes de ejemplo no son un DTE válido.

## Qué ejercita

- Habilitación explícita, compañías independientes y rechazo de producción.
- Login simulado con los campos del contrato público y token privado por empresa.
- Caché de token con renovación local cinco minutos antes de las 24 horas
  documentadas; llamadas concurrentes comparten el login. Ese margen es una
  decisión del prototipo, no un requisito confirmado por el proveedor.
- Archivo ya construido como bytes, Base64 y selección de formato 1/2. No
  construye TXT/XML ni decide impuestos, folios o tipos habilitados.
- Verificación conjunta del resultado general y del documento, tipo esperado y
  folio. Acepta un único documento; un lote queda fuera de este checkpoint.
- Fallos de autenticación con códigos fijos; respuestas ambiguas, HTTP de error
  y fallos de transporte de procesamiento quedan indeterminados, sin reenvío.
- Solo una fixture explícita anterior al envío obtiene `NO_ENVIADO`, clasificación
  local del prototipo que no añade un estado al modelo del CRM.
- Diagnóstico limitado a empresa, método, ruta y formato; no conserva en el
  diagnóstico secreto, token, query, archivo, respuesta ni mensajes del proveedor.

Los resultados incluyen `simulated: true`. `GENERADO` solo significa que una
respuesta ficticia satisface las comprobaciones del parser. No demuestra emisión,
aceptación del SII, validez tributaria, entrega de correo ni disponibilidad del API.

## Contrato público consultado

Fuentes oficiales, revisadas el 2026-10-02:

- [API REST](https://www.facturacion.cl/manualintegracion/apirestintegracion.php).
- [Credenciales por ambiente](https://www.facturacion.cl/manualintegracion/credencialesacceso.php).
- [Archivo de factura electrónica](https://www.facturacion.cl/manualintegracion/archivofacturaelectronica.php).

El manual REST describe `POST /login`, `Authorization: <token>` y vigencia de 24
horas. Describe **GET /wsds/procesar** con archivo Base64 y formato TXT/XML. Aunque
sea GET, genera documentos: un cliente real no debe aplicar retry automático ni
registrar la query con el archivo. Esto difiere del POST de emisión mencionado
en el handoff y debe confirmarse para la cuenta contratada. `getticket` está
documentado para impresión térmica, no como consulta de seguimiento.

Una respuesta general exitosa puede contener un error individual, incluido
"documento ya existente". El prototipo conserva incertidumbre ante ese caso;
no afirma que no existe documento ni permite deducir un reintento seguro.

La documentación de credenciales distingue pruebas, producción y acceso web de
pruebas. Una cuenta web compartida no demuestra que sea la credencial API de
pruebas. El prototipo no utiliza la cuenta recibida en el chat; la revisión web
autorizada posterior confirmó sus secciones de credenciales, según AUDIT.md.

## Límites y siguiente checkpoint

No hay persistencia, identidad idempotente, conciliación, consulta/descarga de
PDF/XML, SMTP ni integración con `TaxDocumentIssuer`. El llamador puede invocar
el prototipo de nuevo; **no existe protección durable contra duplicados**. No se
debe adaptar a HTTP real sin resolver los pendientes de [AUDIT.md](AUDIT.md).

El probe `verify-test-api.mjs` utiliza únicamente `POST /login` y
`GET /wsds/version`, sin redirects ni retry automático. Acepta una entrada temporal
fuera del repositorio, con ambiente `test` y procedencia `provider-test-section`;
la elimina antes de conectar y nunca imprime secretos ni el cuerpo remoto. Esos
marcadores no pueden certificar credenciales arbitrarias: el operador debe verificar
su procedencia. No debe recibir credenciales de producción ni archivos de entorno.
Los valores no se incluyen en este repositorio. El parser de versión conserva la
diferencia observada (array en el servidor, cadena en el manual) como resultado
inesperado; no amplía el contrato automáticamente.

La configuración y el bloqueo actuales del CRM permanecen intactos. CU-86 sigue
registrando documentos externos manuales. Estas herramientas no cambian Billing,
G1/G2/G3, interfaz, despliegue ni configuración. El checkpoint backend posterior
propone cambios de esquema y una migración sin aplicarla, como describe su informe.

Antes de probar fuera del simulador: confirmar con el responsable las credenciales
API exclusivas de pruebas (por canal seguro), empresa/ambiente, tipos habilitados,
formato, reglas de folio y mecanismo para resolver un envío incierto. Primero se
puede validar autenticación y disponibilidad; una emisión de prueba necesita
además datos y procedimiento del proveedor confirmados. Producción requiere
otro checkpoint explícito.
