# Evidencias SMTP - 2026-10-04

- `01-correo-recuperado-mailpit.jpg`: correo observado en Mailpit local después de la recuperación. El nombre del cliente y el PDF indican DOCUMENTO SIMULADO. El folio 998340911 es una fixture de QA; no fue emitido por Facturación.cl.
- `postgres-mailpit.json`: PostgreSQL y SMTP locales reales; fallo temporal inyectado, recuperación/reinicio/concurrencia PASS, un mensaje con un adjunto. Cero llamadas a Facturación.cl. Los registros sintéticos fueron limpiados y los anteriores conservaron su estado.
- `tests-smtp.json`: 191 pruebas / 15 suites PASS, nombres y estados saneados, hash de la salida original. TLS/STARTTLS/AUTH utilizan sockets de loopback y una CA explícita solo de test. Los proveedores fiscales de esos tests son simulados.

Regresión adicional: G2/G3/CU-86/autenticación, 201 pruebas / 14 suites PASS; 4 pruebas de otra configuración PostgreSQL no se ejecutaron. Estas pruebas no acreditan recepción externa de G3.

La recepción local no acredita entrega a una casilla externa. La emisión sandbox real anterior (folio 9234371045) está documentada separadamente en las evidencias del 2026-10-03.

[Informe SMTP y configuración](../../../i3-smtp-automatic-email.md).
