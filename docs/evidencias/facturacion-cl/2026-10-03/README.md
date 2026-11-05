# Evidencias de Facturación.cl y G3 — 2026-10-03

## Ensayo actual: boleta real en API PRUEBAS

- 04-boleta-sandbox-pago.jpg: captura del CRM localhost, pago 1 de 100 pesos, tipo 39, folio 9234371045, PDF Disponible, correo Enviado.
- 05-correo-boleta-mailpit.jpg: correo recibido en Mailpit local con un PDF adjunto. No acredita entrega a una casilla externa.
- 06-solicitud-instalacion-g3.jpg: seguimiento local de contrato 6, intento 1, sin OT externa; mensaje de G3 sin configurar. No acredita recepción por G3.
- 07-boleta-proveedor.png: render de la página del PDF real adjunto a ese correo. No es una captura del portal ni una boleta dibujada. Datos exclusivamente ficticios; confirma folio, referencia al pago/cobro y total 100.
- resultado-sandbox-g3.json: resultado real saneado; omite claves, tokens y parámetros del enlace de descarga.
- resultados-pipeline.json: salida Jest saneada, 24 suites / 264 tests PASS; hash del original y nombres/estados. El proveedor en esos tests es simulado. La emisión real se documenta aparte.

## Historial de preparación anterior

resultados-locales.json, index.html, protecciones.html y capturas 01/02 corresponden al código 9f5eb4e y 234 tests / 20 suites. Son reportes locales con transporte ficticio, previos a conectar Billing. 03-crm-docker-local.jpg acredita el arranque/login original; no emisión.

## Alcance

Una sola llamada de procesamiento al sandbox. Repetir la referencia de pago produjo HTTP 409; recuperar el comprobante no reemitió ni reenvió el correo. PostgreSQL y SMTP son locales, en el stack finet-facturacion-local. Producción fiscal, Railway y PR: cero. Consultar el checkpoint para diferencias de API, instalación G3 y límites de despliegue.

[Checkpoint](../../../i3-facturacion-cl-checkpoint.md) · [Configuración](../../../i3-facturacion-cl-integration.md).
