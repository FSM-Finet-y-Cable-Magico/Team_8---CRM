# F3 — Propuesta de imputación, pendiente de autorización

> Actualización 04-11-2026: informe histórico conservado. El propietario autorizó
> la imputación manual explícita; ver [implementación y QA](i4-f3-imputaciones-validacion.md).
> No autoriza imputación automática, reparaciones masivas ni migración compartida.

03-11-2026. **NO IMPLEMENTADA**. Se conserva la decisión del propietario del
29-10: sin imputación automática ni reparación histórica. Complementa
[la decisión comercial previa](i4-convenios-decision-comercial.md), no la sustituye.

## Diagnóstico vigente

- `ConvenioPago` identifica empresa, cliente, contrato/factura y opcional servicio.
  `CuotaConvenioPago` identifica `idCuota`, convenio y número único dentro de él,
  monto, vencimiento, estado y fechaPago. No contiene monto imputado ni vínculo Pago.
- `CommercialControlBookService.createAgreement` valida deuda, suma/números/fechas
  de cuotas y relaciones. `approveAgreement` exige administrador y deuda vigente.
  Rutas `POST /commercial/agreements` y `POST /commercial/agreements/:id/approve`.
  No existe operación contractual de imputación o reversa de cuotas.
- `BillingService.registerPayment` registra el pago y auditoría en transacción
  Serializable y aplica el monto a la factura. Rechaza sobrepago y montos inválidos.
  Reactivación permanece condicionada a evidencia técnica y ámbito empresarial.
- G2 traduce su DTO al mismo servicio; `codigo_transaccion` identifica el replay.
  Mismo identificador y datos originales devuelve duplicado; conflicto conserva
  rechazo. El replay no fabrica otra auditoría/pago. No identifica una cuota.
- Hay pagos internos y pagos S2S G2. El medio de pago no demuestra qué cuota se
  pretendía saldar. Un saldo de factura cero no prueba distribución entre convenios.

## Regla propuesta para aprobación expresa

1. Operador autorizado selecciona un pago **ya registrado**, la factura contractual
   y un convenio aprobado. La pantalla muestra saldo de factura, saldo del pago
   disponible para aplicación y saldo de cada cuota por separado.
2. Selección explícita de cuotas e importes; sin inferir prioridad entre varios
   convenios. Misma empresa, factura, cliente y contrato; si hay servicio, validar
   también su pertenencia. Cliente compartido no autoriza cruces de contratos.
3. Importe aplicado positivo con dos decimales, nunca mayor al disponible del pago
   ni al saldo de la cuota. Vencidas/anticipadas pueden proponerse por vencimiento,
   pero la selección exige confirmación del operador. No aceptar sobrepagos.
4. Persistir aplicación pago→cuota, monto, operador, fecha, evidencia y clave
   idempotente. Un pago puede cubrir varias cuotas y una cuota recibir varios pagos.
   Auditoría y aplicaciones atómicas; bloqueo/Serializable con revalidación de
   saldos para evitar doble imputación entre conexiones independientes.
5. Cuota parcial conserva saldo explícito; pagada solo cuando su saldo llega a
   cero. Separar fecha del pago de fecha de conciliación. No modificar Pago ni crear
   facturas adicionales por la aplicación. No alterar reactivación o estados globales.
6. Reversa compensatoria autorizada y auditada, nunca borrado. Repetir la misma
   operación no duplica; misma clave con otra distribución devuelve conflicto.
7. Los pagos/cuotas históricos se mantienen intactos. Cualquier regularización
   futura requiere previsualización, aprobación individual y evidencia verificable.

Esta propuesta requiere **modelo persistido y migración coordinada**, además de
decidir permisos, convenios simultáneos, selección de pagos anteriores y reversas.
No se sustituirá por JSON, cambio manual de estado o heurística automática.
Alternativas: distribución automática por vencimiento solo con convenio único
ratificado; o saldo informativo separado sin conciliación (mitiga confusión pero
no cierra la funcionalidad). El propietario debe aprobar una política y su alcance
de esquema antes de desarrollar. G2 conserva su payload actual; no añadir idCuota
sin ratificación intergrupal.

## Evidencia real de esta fase

Reejecutado `node scripts/i4-tax-postgresql-qa.cjs` sobre dos clusters nuevos
PostgreSQL 18.6, escenarios upgrade y canonical. **17 casos PASS**, cero tráfico
externo/escrituras productivas, ambos clusters eliminados. Transporte tributario
y entrega de documentos simulados; no certificación de proveedores reales.

En ambos escenarios: factura $7.000, dos cuotas vencidas $3.500. Primer pago
deja $3.500, replay G2 no duplica, segundo pago deja factura Pagada; cuotas siguen
PENDIENTE y sin fechaPago. Dos pagos y dos auditorías; empresa ajena y estado global
Moroso conservados. Evidencia local no versionada:
`.codex-review/tax-qa-d2a3707b-2b90-436c-8606-fb69b0d925ee.json`.

**Antes/después funcional: FAIL conocido / decisión comercial pendiente**.
El PASS del harness demuestra reproducción e integridad, no solución de cuotas.
Esta fase modifica únicamente este documento. No cambia Libro Control, billing,
G2, esquema ni datos históricos. Responsable de decisión: propietario/encargado
comercial G8; coordinación DBA y G2 solo después de aprobación.
