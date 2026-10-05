# WhatsApp Cloud API — integración preparada, sin cuenta externa

Fecha: 2026-10-04. Estado: `IMPLEMENTED_LOCAL / BLOCKED_EXTERNAL`. El usuario confirmó que no dispone de cuentas de prueba. No se enviaron mensajes a Meta. No se instaló un SDK adicional: el adapter usa fetch del servidor.

## Activación y arquitectura

Billing valida cliente/factura/empresa, guarda notificación y evento comercial en una transacción y realiza el envío después del commit. `MessagingService` recupera pendientes cada 15 segundos. `OutboundMessagingPort` tiene providers disabled/mock/meta. El adapter traduce datos de dominio a un template configurado y aprobado fuera del CRM.

Dos selectores independientes preservan el comportamiento anterior:

- `BILLING_NOTIFICATION_MODE=mock` (default publicado): conserva el aviso simulado anterior, sin Meta.
- `BILLING_NOTIFICATION_MODE=disabled`: registra aviso desactivado.
- `BILLING_NOTIFICATION_MODE=provider`: utiliza el nuevo puerto; `WHATSAPP_PROVIDER=disabled|mock|meta` selecciona su comportamiento.
- `WHATSAPP_PROVIDER=disabled` es el default. `mock` persiste el flujo como `Simulado`; jamás como entregado.

La propuesta de migración `20261004020000_i3_whatsapp_notifications` amplía `log_notificacion`, sin crear otra tabla. Incluye empresa, proveedor, UUID de correlación único, hash, snapshot del mensaje, ID de proveedor, contador, fecha de claim y error saneado. Contiene datos de contacto necesarios para el envío: aplicar la política habitual de acceso/retención de datos del CRM. No contiene tokens ni secretos Meta.

Billing conserva selecciones explícitas de columnas antiguas para sus modos anteriores. Antes de usar `provider`, incluso con mock, aplicar la migración **solo en una base QA preparada**; el despliegue compartido requiere revisión de su dueño. Con Meta habilitado, el arranque comprueba las columnas utilizadas por su cola.

## Configuración por empresa

Usar nombres de templates y versión Graph confirmados en la cuenta; este ejemplo es únicamente estructural:

```json
[
  {
    "idEmpresa": 1,
    "alias": "FINET",
    "wabaId": "<ID_REAL_WABA>",
    "phoneNumberId": "<ID_REAL_NUMERO>",
    "templates": {
      "AVISO_PREVENTIVO": {
        "name": "<nombre_aprobado>",
        "locale": "es_CL",
        "parameters": ["customer_name", "invoice_id", "balance"]
      },
      "ULTIMO_AVISO_CORTE": {
        "name": "<otro_nombre_aprobado>",
        "locale": "es_CL",
        "parameters": ["customer_name", "invoice_id", "balance"]
      }
    }
  }
]
```

Guardar ese JSON público en `WHATSAPP_COMPANIES`. Los marcadores `<...>` no son valores válidos y deben reemplazarse por los de la cuenta. Los parámetros configurados son posicionales de texto del body y deben coincidir en orden con el template aprobado. No se implementan headers/media/buttons ni un inbox. El idioma también debe corresponder al template aprobado.

Variables privadas por alias, exclusivamente backend:

```text
WHATSAPP_PROVIDER=meta
WHATSAPP_API_VERSION=<version_confirmada_en_la_cuenta>
WHATSAPP_FINET_ACCESS_TOKEN=<canal_seguro>
WHATSAPP_FINET_APP_SECRET=<canal_seguro>
WHATSAPP_FINET_VERIFY_TOKEN=<canal_seguro>
```

Agregar una segunda entrada `idEmpresa=2, alias=CABLE_MAGICO` y sus tres secretos independientes cuando corresponda. No repetir número emisor entre empresas. Si ambas pertenecen a la misma app, el webhook admite mensajes de ambas según WABA/número y firma; si usan apps distintas, cada firma solo autoriza las empresas de esa app.

El teléfono almacenado del cliente debe ser E.164, por ejemplo `+569...`. No se normaliza un número ambiguo por suposición. Si falta empresa, template o un parámetro requerido, se rechaza antes del envío.

## Webhook

Callback público HTTPS: `/api/webhooks/whatsapp`.

- GET: valida `hub.mode=subscribe` y el verify token; devuelve `hub.challenge` como texto.
- POST: valida HMAC-SHA256 sobre los bytes originales con App Secret y `X-Hub-Signature-256`; el verify token no autoriza POST.
- Nest arranca con `rawBody:true`. No colocar antes un middleware que transforme el cuerpo firmado.
- Después de la firma se cotejan `entry.id` (WABA) y `metadata.phone_number_id` con la empresa configurada. No se confía en IDs de empresa enviados por el cliente.
- Se manejan statuses `sent`, `delivered`, `read`, `failed`; las actualizaciones condicionales hacen inocuas las repeticiones y evitan regresar de leído/entregado a estados anteriores.
- No se persisten ni registran cuerpos completos de webhook. De los errores se conserva un código numérico saneado.

Una notificación puede llegar antes de que se guarde el ID devuelto por el POST. Si existe envío en curso de esa empresa y falta la correlación, el webhook responde 503 para pedir una nueva entrega. Si el POST pierde su respuesta y nunca se conoce el ID, la intención queda incierta y requiere investigación; no se afirma conciliación automática ni se repite el envío.

## Idempotencia y recuperación

`POST /api/billing/notifications` admite `correlationId` UUID v4. Repetir la misma identidad reutiliza el registro; cambiar contenido/empresa con el mismo UUID produce conflicto. La UI conserva el UUID tras un error de transporte para el reintento dentro de esa pantalla. Tras recargar la página no se conserva esa correlación: consultar el historial antes de crear un nuevo aviso.

La cola reclama solo `PENDIENTE` con cero intentos. Dos procesos no pueden hacer el POST para la misma fila. HTTP 4xx queda `FALLIDO`; 5xx, timeout o éxito sin ID válido quedan `RESULTADO_INDETERMINADO`. Un claim abandonado también queda incierto. No hay reenvío automático en esos estados. Esto sacrifica reintentos automáticos para evitar notificaciones duplicadas cuando no puede probarse el resultado.

Una respuesta de Billing puede conservar `PENDIENTE` porque refleja el registro transaccional. El historial consultado posteriormente muestra el resultado actualizado. `ENVIADO_PROVEEDOR` no significa entregado: `ENTREGADO` y `LEIDO` dependen del webhook firmado.

## Validación y fuentes

Pruebas: `messaging.spec.ts`, `meta-webhook.http.spec.ts` y la prueba de commit/HTTP de `billing.service.spec.ts`. Cubren modos, empresas, template, teléfono, HTTP 400/401/429/5xx, timeout, firma, handshake HTTP real de loopback, repetición, orden de estados y concurrencia con persistencia simulada. No acreditan envío real ni concurrencia contra PostgreSQL.

Fuentes primarias consultadas: [templates](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/messages/template/) y [autenticidad de webhooks](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/webhooks/start/) publicados por WhatsApp/Meta. Estas páginas pertenecen a un SDK archivado y se usan como referencia del protocolo, no como dependencia. La consulta a la documentación nueva de Meta devolvió HTTP 429 y Postman mostró solo su índice. Por eso la versión Graph y la compatibilidad final deben verificarse con la cuenta antes de habilitarla; no se certifica aquí una versión vigente probada en Meta.
