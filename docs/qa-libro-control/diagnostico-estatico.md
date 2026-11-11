# Clientes y Libro de Control — revisión local 2026-11-11

Base verificada: `feat/ux-ui-libro-control`, `123b4ede52b71167f31fe77dc04ad68abadadd62`.
Inspección inicial: ningún cambio tracked ni staged. Seed local preexistente sin seguimiento,
no leída ni ejecutada: SHA-256 `55160310072a08858820c762531d879c017da7259156e05c94b7c188e5aa7f3c`.

## Diagnóstico previo a implementación

| ID | Evidencia comprobada | Comportamiento inicial y corrección prevista | Riesgo / autoridad | Prueba |
|---|---|---|---|---|
| LC-01 | `ServicesService.update/deactivate`, `CustomerServiceActions` | PATCH genérico permite Baja; baja dedicada reconcilia/audita después del commit. Proteger bypass y separar solicitud por deuda de baja administrativa. | No sustituir autoridad técnica G3 ni inventar motivos. | Baja indebida rechazada; otras bajas autorizadas conservadas. |
| LC-02 | `ServiceWithdrawalService.create/update` | Sin exclusión de solicitudes activas; auditoría posterior; permite contrato distinto del servicio. Serializar por servicio, relaciones exactas y auditoría transaccional. | Contrato de despacho G3 pendiente. | Reintento, concurrencia simulada, conflicto y rollback. |
| LC-03 | `G3ClosureDto`, `G3ClosureProcessor` | Solo INSTALACION/REPARACION; no cierre de retiro ratificado. | BLOQUEADO por acuerdo G3: no crear OT, cierre, inventario ni activación ficticios. | Rechazar cierre manual de solicitud como sustituto de evidencia. |
| LC-04 | `activeProspectWhere`, `CustomersService.list` | Prospectos excluye todo idCliente; Clientes sí lista estados diversos. No ampliar `activeCustomerWhere`: es métrica de servicios activos. | Vista de excliente necesita evidencia/alcance empresarial; no clonar identidad. | Casos multiservicio, empresa compartida e históricos. |
| LC-05 | `ContractsService.createCustomerContract/markContractSigned`, `ProspectsService.contractPlan` | No hay veto financiero. Validación por empresa dentro de cada transacción, también por RUT histórico solo para rechazo, nunca asociación. | Política ratificada: bloquear TODAS las firmas pendientes manuales/electrónicas con deuda; conservar replays firmados. | Parciales, anuladas, pagadas, prórrogas, alias, permisos y rollback. |
| LC-06 | `control-book-model`, eventos CONTACTO_CLIENTE | Registrar contacto es bitácora de cobranza, no edición de perfil. Cambiar etiqueta, no enum/API. | Preservar histórico. | Modelo de acciones. |
| LC-07 | `CommercialControlBookPanel` | Ya recupera factura exacta por ID si sale de filtros después de pago. Preservar esta implementación. | Navegación entre módulos requiere QA visual. | Tests existentes y revisión de contexto. |
| LC-08 | `CustomersService.updateProfile` | Campos nombre/email/teléfono; transacción, no-op y auditoría ya existentes. | Identidad compartida no habilita edición global por otra empresa. | Regresiones existentes con mocks. |

## Rutas y responsabilidades

- Contratación: `POST /api/contracts` (cliente) y `POST /api/prospects/:id/contracts` (prospecto).
- Firma manual: controlador Contracts → `confirmManualSignature` → `markContractSigned`.
- Firma electrónica: `ESignatureService.sign` → mismo `markContractSigned`, dentro de la transacción de firma.
- Baja administrativa: `PATCH /api/services/:id/deactivate`; actualización genérica `PATCH /api/services/:id` no debe eludirla.
- Solicitudes: `POST/PATCH /api/service-withdrawals`; no despachan OT ni confirman retiro técnico.
- Aviso: evento `AVISO_PREVIO_RETIRO` del Libro, no equivale a solicitud ni baja.
- Cierre instalación G3: procesador de instalación; no reutilizar para retiro.
- Clientes: ámbito contractual/empresa y relaciones anidadas filtradas; métricas activas separadas.

## Política financiera autorizada

Se usa `invoiceBalance` del Libro: pagos persistidos, facturas Pagada/Anulada no
exigibles, vencimiento efectivo de prórrogas aprobadas. Un convenio o prórroga no
perdona el principal. Saldo parcial mantiene veto; saldo totalmente regularizado
habilita continuar manualmente sin crear/firmar/instalar automáticamente. Datos
financieros incompletos requieren revisión explícita. No sumar deuda de otra empresa.
No modificar firma/PDF histórico ni contratos pendientes: se rechaza solo el avance.

## Límites de evidencia

Solo pruebas con mocks y compilación/análisis local. Sin Docker, PostgreSQL, seed,
Mailpit, proveedores ni producción. Concurrencia real PostgreSQL y aceptación visual
permanecen pendientes. El cierre técnico de retiro requiere ratificar evento,
referencias, autoridad, idempotencia, fecha y evidencia; un ticket cerrado no basta.
