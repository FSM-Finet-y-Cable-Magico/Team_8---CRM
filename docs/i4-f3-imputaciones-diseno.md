# F3 — Imputación manual autorizada (04-11-2026)

Sustituye el bloqueo de implementación del informe F3 anterior por la autorización
expresa del propietario. Solo desarrollo/QA aislado; no autoriza DDL compartido.

## Modelo y límites

Dos tablas nuevas G8: `operacion_imputacion_cuota` (pago, factura, convenio,
empresa, operador, auditoría obligatoria, tipo, clave idempotente, hash, motivo y
fecha) e `imputacion_cuota` (cuota, operación, monto y referencia a aplicación
original cuando es una reversa). Relaciones SQL reales, importes Decimal(12,2).
La auditoría usa el modelo compartido existente sin alterar su estructura.
Propiedad revisada contra `ownerOf` y las migraciones de Libro Control: convenios
y cuotas son G8. No se modifica ningún objeto propiedad de G1/G2/G3.

Operaciones inmutables; compensaciones positivas vinculadas al original. Saldo
imputable = monto del pago menos aplicaciones más compensaciones, considerando
todos los convenios. Saldo de cuota = monto menos imputación neta. No nuevo Pago,
Factura, emisión fiscal, envío ni cambio de estado de cliente/contrato/servicio.

Serializable con reintento acotado de conflictos; lock del pago y cuotas en orden
estable. Revalidación de toda la cadena empresarial dentro de la transacción.
Auditoría, operación, detalles y actualización de cuotas en la misma transacción.
Clave idempotente por empresa; hash canónico del tipo, referencias, distribución
ordenada e importes exactos y motivo. Replay retorna la operación original.

Solo Administrador confirma/revierte, con autorización backend. Consulta según
VIEW_CONTROL_BOOK y empresa; identidad compartida no habilita cruces financieros.
El detalle devuelve `puedeImputar` derivado del rol, no de datos del navegador.

PARCIAL es una proyección de monto/saldo; se conserva PENDIENTE en el estado físico
compatible de cuota parcial, PAGADA al completar, fechaPago del último pago
efectivamente aplicado (no se altera la fecha de Pago). Reversa parcial/total
recalcula la cuota afectada; no revierte el pago bancario. Históricos pagados sin
ledger o cancelados no se reinterpretan: quedan bloqueados para revisión.
No hay backfill ni regularización automática; solo cuotas seleccionadas por operador.

Frontend mínimo separado dentro de Libro Control: pagos existentes, cuotas,
importes exactos, sugerencia de vencimiento sin selección automática, revisión
explícita, historial y reversa con motivo. G2 mantiene sus DTO y código intactos.

## Orden de integración futuro

Backup y catálogo fresh autorizados; reconciliar historial de migraciones; aplicar
solo la migración aditiva revisada por operador; verificar contrato/hash/FK/check;
desplegar backend y frontend compatibles. Backend anterior tolera tablas nuevas;
backend nuevo necesita esas tablas para este módulo. No ejecutar migrate deploy
ciego sobre historial compartido. Rollback lógico: deshabilitar nuevas operaciones
y volver al backend anterior preservando el ledger, nunca borrar aplicaciones.

Pruebas previstas: matriz de 20 escenarios del propietario, rollback de auditoría,
concurrencia con conexiones PostgreSQL independientes, nueva base y upgrade sin
modificar históricos. No GO_DEPLOY hasta migración y aceptación autorizadas.
