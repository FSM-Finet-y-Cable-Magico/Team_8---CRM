# Integraciones pendientes

## WhatsApp Business

WhatsApp Business queda fuera de esta etapa hasta que FiNet/Cable Magico defina la cuenta oficial y el proveedor tecnico.

No se implemento modulo, pantalla, adapter ni envio mock en esta etapa. Las tablas SQL relacionadas se mantienen disponibles para una implementacion posterior.

Datos requeridos antes de implementar:

- Cuenta Meta Business validada.
- WhatsApp Business Account.
- Numero telefonico oficial.
- Proveedor o API a utilizar.
- WABA ID.
- Phone Number ID.
- Access Token.
- Webhook publico HTTPS.
- Verify Token.
- App Secret.
- Plantillas aprobadas por Meta.

Cuando esos datos existan, la integracion debe implementarse en un modulo propio, sin reutilizar notificaciones genericas ni exponer credenciales al frontend.

## Smart OLT / router / monitoreo en tiempo real

El monitoreo actual usa registros existentes en `monitoreo_ont` e `historial_conexion_ont`.

No se inventa latencia ni estado online. Si no hay medicion reciente, el sistema muestra `Sin dato reciente`.

La solicitud de cambio Wi-Fi desde portal crea una solicitud/ticket para revision tecnica. No modifica realmente el router porque aun no existe integracion con plataforma externa.
