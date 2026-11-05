# P0-03 — Cobranza compartida y G2

Base: `develop`, `7a45b4f44d965bc086340ce749b02f021233cb1a` (PR #56).
Rama: `fix/i4-p0-03-cobranza-compartida-g2`. Validación local: 25-10-2026.

## Resultado y alcance

`LISTO_PARA_PR`, con los fallos históricos y límites de certificación descritos abajo.
No significa autorización de despliegue ni certificación E2E intergrupos.

La empresa financiera se resuelve desde el contrato y la factura. La empresa
principal de la identidad compartida no autoriza ni impide por sí sola una operación
sobre un contrato de otra empresa. No se reasigna `Cliente.idEmpresa`, no se fusionan
identidades y no se utiliza una coincidencia de RUT para crear relaciones.

## Causas y correcciones

| Área / rutas existentes | Antes | Después |
| --- | --- | --- |
| `/billing/invoices`, `/integrations/g2/invoices` y detalles | Filtro adicional sobre empresa principal del cliente excluía contratos legítimos compartidos. | Filtro por empresa contractual; identidad exacta del cliente relacionada con el contrato. Balance y nombres de campos conservados. |
| `/billing/payments`, `/integrations/g2/payments` | Comparación cliente-empresa impedía el pago de la segunda empresa. | Validación factura–contrato–cliente y empresa autorizada antes de insertar; deuda y reactivación limitadas al contrato/empresa objetivo. |
| Comprobante y documento tributario G2 | Rechazo por empresa principal incluso con pago contractual válido. | Empresa del contrato y correspondencia explícita pago–factura–contrato–cliente; 404 fuera de alcance. |
| `/billing/refresh-delinquency`, `/billing/contracts/:id/suspend` | Contratos compartidos omitidos o modificación del estado financiero global desde una sola empresa. | Actualización contractual autorizada; estado global compartido conservado. |
| `/billing/notifications`, `/billing/overview` | Avisos atribuidos/consultados por identidad principal, con posible mezcla de avisos de ambas empresas. | Factura determina empresa de plantilla, evento y log; lectura del log por `idEmpresa`. |
| `/commercial/control-book`, historial, exportación, alertas | Se excluía cliente cuya empresa principal era distinta; fila mostraba empresa principal. | Admite identidad con contrato en la empresa consultada; relaciones anidadas conservan filtros empresariales; fila usa empresa seleccionada. |
| Convenios, prórrogas, condiciones y cargos | Algunas operaciones elegían la empresa principal; podía usarse como fallback ante contrato incompleto. | Empresa de relación explícita; validación de identidad y factura. Aprobación de convenio comprueba su relación financiera antes de escribir. |
| Garantías comerciales G8 | Cliente compartido rechazado antes de comprobar servicio/contrato. | Conserva las comprobaciones de empresa, cliente, contrato y servicio activo; elimina únicamente el rechazo por empresa principal. |
| Documentos tributarios externos | Registro de metadata rechazado por empresa principal distinta. | Contrato/factura autorizados respaldan la relación; sin referencia explícita exige contrato propio si la empresa principal es distinta. Verifica coherencia cargo–factura. |
| Selector frontend de documentos externos | Ocultaba clientes compartidos y podía ofrecer contratos consolidados ajenos. | Admite clientes por relación contractual y proyecta solo contratos de la empresa seleccionada, sin mutar las props. |

## Decisión sobre el estado global

No hay una regla ratificada que resuma la deuda de dos empresas en `Cliente.estado`.
Se bloquea **la actualización global**, no el pago legítimo ni la operación sobre
el contrato autorizado. `canUpdateGlobalCustomer()` solo permite el comportamiento
anterior cuando la empresa principal coincide y no existe contrato de otra empresa
o sin empresa atribuible. La comprobación se hace dentro de la misma transacción
Serializable de cobranza.

Esta protección se aplica al pago completo, suspensión y refresco de morosidad,
también cuando quien solicita la operación es administrador. Los administradores
conservan consultas consolidadas. No se cambia el estado global para simplificar
el modelo ni se reparan estados históricos.

Pendiente de negocio: ratificar una política global considerando todas las relaciones,
deudas, suspensiones y bajas; definir tratamiento de contratos históricos cerrados
o sin empresa. Hasta entonces se conserva el valor global existente.

Las operaciones comerciales sin contrato/factura/servicio explícito conservan la
empresa del usuario restringido y exigen relación contractual si no es su empresa
principal. Para administradores sin referencia explícita se conserva la empresa
principal como contexto anterior; para otra empresa deben indicar la relación.

## Compatibilidad y confidencialidad

- No cambian endpoints, DTO, autenticación S2S, payloads, `request_id`, códigos de
  transacción, wrapper de pago ni respuestas pactadas de G2. Las pruebas de contrato
  G2 mantienen las mismas respuestas esperadas; los fixtures internos ahora incluyen
  los identificadores de sus relaciones reales.
- Transbank continúa en G2. G8 registra únicamente la notificación de pago confirmado
  con fecha, autorización y transacción exigidas por el contrato vigente. No se agrega
  SDK ni se confirma una transacción directamente con Transbank.
- En `/billing/overview`, `cliente.estado` es `null` para usuarios empresariales:
  el estado global no acredita deuda de una empresa. El tipo frontend admite `null`;
  ControlBookFinancePanel y DashboardHome usan saldo, factura y contrato, no ese estado
  para ejecutar operaciones. Administradores conservan el valor global.
- `cliente.empresa` no presenta el nombre de la empresa principal como si fuera la
  empresa contractual cuando ambas difieren; en ese caso es `null`.
- Avisos antiguos sin `log_notificacion.idEmpresa` quedan visibles únicamente en
  consulta consolidada administrativa. No se atribuyen por inferencia ni se reparan.
- Libro Control no usa direcciones globales sin atribución como fallback: usa dirección
  de servicio o contrato; puede devolver `null` si faltan ambas.
- No cambia G1 como autoridad de inventario ni su consulta por serie; la corrección
  dentro de `g1-integration` afecta solo la garantía comercial propiedad de G8.
- No se cambia G3 ni `canActivateService`. P0-04 conserva el trabajo pendiente sobre
  evidencia de instalación necesaria para reactivaciones comerciales.

## Idempotencia, fallos y concurrencia

Se conserva la transacción Serializable, tres intentos ante P2034 y relectura ante
P2002 en el pago G2. Un retry idéntico conserva el pago; reutilizar el código con otra
factura, cliente, monto, fecha, pasarela o autorización produce conflicto. El índice
existente de código de transacción permanece global, sin cambios de esquema.

Un fallo posterior al commit en Facturación.cl/SMTP no revierte el pago. La intención
tributaria se registra localmente en la transacción; su procesamiento sigue después.
Un fallo local al persistir esa intención sí revierte la transacción completa.

Si se pierde la respuesta o falla la lectura del detalle después del commit, G2 debe
reconciliar usando exactamente la misma transacción ya confirmada y el mismo payload;
no debe cobrar nuevamente ni generar un código distinto. El reintento devuelve el pago
existente. Esta pauta utiliza la idempotencia existente y no introduce un endpoint nuevo.

Las pruebas simulan serialización, rollback, P2034 y P2002. No certifican aislamiento,
bloqueos ni índices en PostgreSQL real. Antes del E2E se requiere prueba autorizada en
una base QA aislada con pagos simultáneos, misma transacción y transacciones distintas.

## Pruebas y validaciones

28 pruebas backend nuevas: 17 HTTP G2 con controlador/guard/servicios reales y
persistencia en memoria; 5 de Libro Control; 3 de documentos externos; 1 de garantías;
2 de avisos y visibilidad. También se actualizan expectativas/fixtures previos sin
eliminar escenarios válidos. Tres pruebas frontend nuevas ejecutan el componente.

Cobertura: clientes exclusivos 1 y 2; compartidos con empresa principal 1 o 2;
lectura/denegación por empresa; pago parcial y completo; recibo ajeno; identidad
inconsistente; retry exacto; colisión de código; concurrencia y sobrepago; rollback;
fallos post-commit; estados globales Moroso/Suspendido/Baja; convenio, prórroga,
condiciones, cargo, garantía, metadata y selector de contratos.

| Validación | Resultado |
| --- | --- |
| Dirigidas: billing.service, billing-read, g2-integration, commercial-control-book, commercial-warranties y external-tax-documents.service | **223 aprobadas, 2 fallidas históricas** en billing; 8 suites aprobadas y 1 fallida de 9. Sin omitir los dos escenarios heredados. |
| Regresión backend disponible, excluyendo archivos `integration.spec.ts` que requieren DB | **1.153 aprobadas, 3 fallidas históricas**; 76 suites aprobadas y 3 fallidas de 79. Incluye regresiones G1/G2/G3, clientes, ciclo comercial, PDF, aislamiento y tickets de PR #51–56. |
| Frontend `npm --prefix frontend test` | **44/44 aprobadas**. |
| Backend `npm --prefix backend run build` | Aprobado. |
| Frontend `npm --prefix frontend run build` | Aprobado; advertencia de chunk mayor a 500 kB. |
| Backend lint | Aprobado, sin errores. |
| Frontend lint | 0 errores, 78 advertencias preexistentes. |
| `git diff --check` | Aprobado. |

Fallos históricos conservados:

1. `billing.service.spec.ts`: «impide último aviso antes del vencimiento efectivo de
   una prórroga». Fixture con prórroga fija al 10-10-2026; a la fecha de ejecución ya
   venció y el mock no cubre el recorrido posterior.
2. Mismo archivo: «no suspende mientras una prórroga aprobada mantiene la factura
   vigente». Misma dependencia del reloj/fixture; sus assertions no se alteran.
3. `external-tax-documents.boundaries.spec.ts`: exige el texto `Registrar metadata`,
   pero la interfaz ya usa `Registrar documento externo`. No se cambia esta expectativa
   para esconder el fallo.

Además, `mail.service.spec.ts` no inicia porque OpenSSL no genera el certificado TLS
local en este entorno. Esta suite bloqueada no se cuenta como una cuarta prueba fallida
ejecutada. Las pruebas PostgreSQL se excluyeron expresamente y no se consultó ninguna DB.

## Archivos de este cambio

Producción:

- `backend/src/billing/billing-read.service.ts`
- `backend/src/billing/billing.service.ts`
- `backend/src/commercial/commercial-control-book.service.ts`
- `backend/src/external-tax-documents/external-tax-documents.service.ts`
- `backend/src/g1-integration/commercial-warranties.service.ts`
- `backend/src/g2-integration/g2-integration.service.ts`
- `frontend/src/api.ts`
- `frontend/src/features/billing/ExternalTaxDocumentsPanel.tsx`

Pruebas:

- `backend/src/billing/billing-read.service.spec.ts`
- `backend/src/billing/billing.service.spec.ts`
- `backend/src/commercial/commercial-control-book.service.spec.ts`
- `backend/src/external-tax-documents/external-tax-documents.service.spec.ts`
- `backend/src/g1-integration/commercial-warranties.service.spec.ts`
- `backend/src/g2-integration/g2-contract.spec.ts`
- `backend/src/g2-integration/g2-integration.service.spec.ts`
- `backend/src/g2-integration/g2-shared-finance.http.spec.ts` (nuevo)
- `frontend/tests/shared-finance.test.mjs` (nuevo)

Documentación: este archivo. No se modifican `.env`, dependencias, schema,
migraciones, índices, contratos S2S ni la política de activación P0-04.

## Cierre local

No se ejecutaron pagos reales, emisión tributaria, envíos, reconciliaciones, seeds,
migraciones ni consultas/escrituras a Railway o bases compartidas. No hubo commit,
push, PR, merge con commit ni despliegue. La preparación de rama fue un fast-forward
de develop a la base autorizada, seguido de una rama normal en el mismo checkout.
`-f`, `output/`, respaldos e históricos locales permanecen sin agregar a Git.
