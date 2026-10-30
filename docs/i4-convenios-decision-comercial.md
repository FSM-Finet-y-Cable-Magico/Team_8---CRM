# I4 — Convenios: inconsistencia confirmada, decisión pendiente

29-10-2026. El propietario confirmó **mantener la política documentada**, sin imputación automática ni reparación histórica. Este punto no está funcionalmente cerrado para la entrega del 04-11-2026.

## Diagnóstico y reproducción

`BillingService.registerPayment()` imputa al saldo de la **factura**; no escribe `CuotaConvenioPago`. `CommercialControlBookService.createAgreement()/approveAgreement()` validan y registran convenio/cuotas, pero no relacionan cada pago con una cuota ni implementan una distribución de pagos. `CuotaConvenioPago` tiene monto, vencimiento, estado y fecha de pago; no dispone de monto parcialmente imputado, referencia a Pago ni reversas de aplicación.

La limitación ya consta en `i3-billing-continuation-report.md`: no conciliación automática y posibilidad de varios convenios sobre una deuda. La frase histórica “gestión manual” no constituye una especificación suficiente de un endpoint, una prioridad de imputación o una operación de conciliación autorizada.

En PostgreSQL QA nuevo se creó una factura de **$7.000**, un convenio aprobado de **dos cuotas de $3.500 vencidas**, y se registraron dos pagos mediante el servicio real de billing. El primer pago deja saldo $3.500; su replay idéntico G2 no crea otro pago. El segundo deja factura **Pagada**, pero las dos cuotas siguen **PENDIENTE**, sin fecha de pago. Hay dos pagos y dos auditorías. La otra empresa y el estado global Moroso del cliente compartido permanecen intactos. Ver `i4-tax-postgresql-qa.evidence.json`.

El PASS del caso QA significa que **la inconsistencia fue reproducida y delimitada**, no que el convenio esté solucionado. Clasificación funcional: **FAIL / P0 comercial**. No se generaron facturas ficticias en una base real ni se cambiaron registros históricos. Todos los datos de la reproducción son sintéticos y desechables.

## Alternativas a ratificar

| Alternativa | Regla y ventajas | Implicancias / límites |
| --- | --- | --- |
| Imputación explícita por operador | Seleccionar pago válido, convenio/cuotas y montos; revisar y confirmar con auditoría | Requiere permiso comercial, controles de empresa/cliente/contrato/factura y vínculo persistido pago→cuota; evita elegir arbitrariamente entre convenios |
| Automática a un convenio activo único | Distribuir por vencimiento y número, con regla acordada para pagos anteriores y excedentes | Antes exige exclusividad o prioridad de convenios, monto parcial por cuota y política de reversas; no está autorizada actualmente |
| Saldo informativo sin modificar cuotas | Mostrar por separado factura pagada y convenio pendiente de conciliación; conservar cuotas | Reduce confusión, pero no demuestra cumplimiento de cuotas ni reemplaza trazabilidad. Requiere autorización de presentación y no cierra el requisito |

Propuesta para la siguiente decisión: imputación explícita y auditable, sin cambiar el registro financiero del Pago ni crear nuevas facturas. Evaluar tabla de aplicaciones con claves a Pago/Cuota, monto positivo, clave idempotente, responsable, fecha y reversa vinculada (no borrado). Una cuota puede recibir varios pagos y un pago cubrir varias cuotas; el saldo aplicable no puede exceder el pago ni la deuda elegible. Esto probablemente requiere una migración coordinada de esquema; **no se implementó ni propuso como workaround JSON**.

## Decisiones comerciales necesarias

Responsable sugerido: encargado comercial G8 con aceptación del profesor; DBA y G2 revisan el impacto técnico sin cambiar sus payloads automáticamente.

1. ¿Solo un convenio vigente por factura, o prioridad explícita entre varios?
2. ¿Pagos posteriores a aprobación, todos los pagos de la factura o selección manual? ¿Qué ocurre con pagos históricos previos al convenio?
3. ¿Cómo representar una cuota parcialmente pagada y la fecha de cumplimiento? ¿Prima vencimiento, número o selección del operador?
4. ¿Cómo distribuir excedentes, anticipos, cuotas vencidas y convenios cuyo monto es menor que la deuda?
5. ¿Qué ocurre con cancelaciones, renegociaciones, pagos reversados/anulados o saldo a favor?
6. ¿Quién confirma/revierte aplicaciones? ¿Qué evidencia permite regularizar históricos, con preview, autorización e idempotencia?

## Pruebas futuras mínimas

- $7.000 / 2×$3.500: pago parcial, saldo parcial por cuota, pago total y fechas verificables.
- Cuotas vencidas y anticipadas, múltiples convenios y montos comprometidos menores a la deuda.
- Cliente compartido: no aplicar pagos a cuotas de otro contrato o empresa.
- Dos aplicaciones concurrentes con conexiones PostgreSQL independientes, sin sobreimputación.
- Replay idéntico no duplica; misma clave con datos distintos rechaza; auditoría fallida revierte toda la aplicación.
- Reversas explícitas, conservación de pagos originales e historial; ningún saneamiento retroactivo automático.

Hasta ratificar la política y su alcance, preservar los datos y no etiquetar esta funcionalidad como PASS ni bloquear indebidamente pagos legítimos de facturas.
