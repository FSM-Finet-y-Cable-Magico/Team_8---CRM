# P0-04 — Reactivación comercial con cierre G3 persistido

Estado: **LISTO_PARA_REVISION**. Validación local del 25-10-2026.

Rama: `fix/i4-p0-04-reactivacion-g3`.
Base: `97e764f77d74fafeac741358c755db09bb21d8fa`, merge PR #57 (P0-03).
Al iniciar, develop, origin/develop local y la rama P0-04 existente apuntaban al mismo SHA.
Se utilizó esa rama en el mismo checkout, sin crear worktrees, clones ni carpetas alternativas.

## Problema y causa raíz verificada

`BillingService.registerPayment()` comprobaba instalación mediante una OT local
`Instalacion / Completada` o una excepción histórica admitida por la política.
Una instalación nueva completada por G3 puede no generar una OT local. Su servicio
previamente instalado podía quedar suspendido después de un pago completo porque
Billing no consultaba la evidencia del cierre G3.

Se inspeccionaron Billing y sus pruebas, `service-activation.policy.ts`,
`g3-closure.processor.ts`, `installation-activation.service.ts` y el modelo Prisma.
`InstallationActivationService.activate()` devuelve el servicio creado o activado.
`G3ClosureProcessor.process()` guarda ese `idServicio` en el tracking junto con
`estadoIntegracion = COMPLETADA`, `estadoOtG3 = COMPLETADA` y `fechaCierreProcesado`,
dentro de la misma transacción de activación. El modelo existente contiene los campos
necesarios. No hace falta cambiar el cierre G3 ni el esquema.

## Comportamiento posterior y elegibilidad

Solo después del pago completo y de comprobar que no quedan otras facturas vencidas
con saldo del cliente en la misma empresa:

1. Billing obtiene los servicios del contrato pagado, suspendidos, de la misma empresa
   y sin OT local completada. Los que tienen OT local conservan su evidencia anterior.
2. Si hay candidatos, hace **una única consulta** a
   `tx.integracionInstalacionG3.findMany()` dentro de la transacción Serializable financiera.
3. Exige conjuntamente empresa y contrato objetivo, servicio entre los candidatos,
   ambos estados exactamente `COMPLETADA` y `fechaCierreProcesado IS NOT NULL`.
   Selecciona únicamente `idServicio`; no descarga payloads ni información técnica.
4. Un Set temporal permite combinar `OT local completada OR cierre G3 válido`.
   No se persiste una copia de la evidencia ni se crea otra fuente de verdad.
5. `canActivateService(COMMERCIAL_PAYMENT_REACTIVATION)` conserva la decisión final:
   servicio existente y suspendido, contrato suspendido y evidencia de instalación
   o excepción histórica válida. Un pago no activa inicialmente un servicio.

La metadata `datosTecnicos.fuenteInstalacion = G3` o `idOtG3` no autoriza la transición.
Se mantienen la excepción histórica existente, pagos parciales sin reactivación,
rechazo de estados incompatibles y escrituras limitadas por servicio, contrato y empresa.
No se modifican las protecciones de P0-03 sobre el estado global del cliente compartido.

El nuevo acceso usa `tx`, no el cliente Prisma global. Si falla la lectura, la transacción
financiera falla y revierte sus cambios; no se continúa con una reactivación sin evidencia.
La idempotencia G2, auditoría, outbox tributario y procesamiento posterior al commit
mantienen su diseño anterior.

## Archivos modificados

- `backend/src/billing/billing.service.ts`: consulta agregada de cierres y combinación de evidencia.
- `backend/src/billing/billing.service.spec.ts`: mock transaccional y 24 casos nuevos.
- `docs/i4-p0-04-reactivacion-g3.md`: este informe.

No se modifica `service-activation.policy.ts`, producción G3, frontend, esquema,
migraciones, credenciales ni contratos S2S.

## Pruebas nuevas

Los 24 casos nuevos prueban:

- Cierre válido sin OT local; solo reactiva el servicio correlacionado entre varios candidatos.
- Una sola consulta a `tx`, con los seis criterios y sin acceso Prisma global.
- Metadata G3 sin tracking: no reactiva.
- Tracking de otra empresa, contrato o servicio, y tracking sin servicio: no reactiva.
- Integración incompleta, OT incompleta o falta de fecha procesada: no reactiva.
- Servicio Pendiente Instalacion, Pendiente, Baja o Activo: no reactiva por pago.
- Contrato Firmado, Activo o Baja: la política impide reactivar aun con cierre válido.
- Cliente compartido con empresa principal 1 o 2: no mezcla servicios ni cambia estado global.
- Pago parcial u otra factura vencida: no consulta cierres ni reactiva.
- Excepciones históricas existentes por importación, fecha u origen: se conservan.
- Fallo de lectura G3: rollback financiero simulado y ausencia de despacho posterior.

Se conserva el caso previo de OT local completada. El mock de tracking aplica los filtros
de la consulta a filas simuladas, por lo que las pruebas negativas no se limitan a devolver
una lista vacía incondicionalmente.

## Validación ejecutada

El ejecutable `backend/node_modules/.bin/jest.cmd` indicado no existe en este checkout;
se usó el script npm de backend que resuelve el Jest instalado en el workspace.

| Validación | Resultado real |
| --- | --- |
| `npm --prefix backend test -- --runTestsByPath src/billing/billing.service.spec.ts --runInBand` | 50 aprobadas, 2 fallos históricos; las 24 nuevas pasan. |
| `installation-activation.service.spec.ts`, `g3-closure.processor.spec.ts` y `g2-shared-finance.http.spec.ts` | 110/110 aprobadas, 3 suites. |
| `npm --prefix backend run build` | Aprobado. Primer intento no inició por fallo del helper del sandbox; reintento completado correctamente. |
| `npm --prefix backend run lint` | Aprobado, sin errores. |
| Regresión backend completa `npm --prefix backend test -- --runInBand --silent` | 1.177 aprobadas, 3 fallos históricos, 8 omitidas. Suites: 76 aprobadas, 3 fallidas, 5 omitidas; 84 descubiertas. |
| `npm --prefix frontend test` | 44/44 aprobadas. |
| Build frontend | No ejecutado en P0-04: no hay cambios frontend. |
| `git diff --check` | Aprobado. |

Para la regresión completa se deshabilitaron **solo en el proceso de pruebas**
`CRM_INTEGRATION_TESTS`, `RUN_DB_INTEGRATION` y `RUN_POSTGRES_INTEGRATION_TESTS`.
Las cinco suites que requieren base de datos quedaron omitidas; no se cambiaron `.env`
ni archivos de configuración.

Fallos históricos identificados, sin corregir dentro de P0-04:

1. Billing: «impide último aviso antes del vencimiento efectivo de una prórroga».
2. Billing: «no suspende mientras una prórroga aprobada mantiene la factura vigente».
   Ambos conservan en develop el fixture al 10-10-2026, ya vencido al ejecutar las pruebas;
   el recorrido posterior no está cubierto por sus mocks y produce TypeError.
3. `external-tax-documents.boundaries.spec.ts`: espera «Registrar metadata», mientras
   la interfaz usa «Registrar documento externo», discrepancia ya documentada en P0-03.

Además, la suite SMTP no puede iniciar por el fallo de generación del certificado TLS
con OpenSSL del entorno. Esta limitación no equivale a una cuarta prueba ejecutada fallida.
No se declara toda la regresión verde.

## Limitaciones y cierre operacional

Las pruebas usan mocks, HTTP local y persistencia simulada: no certifican concurrencia
real ni rendimiento en PostgreSQL. La consulta es única por pago elegible y usa el contrato
como filtro; no se agregan índices. La evidencia histórica ausente o incompleta continúa
requiriendo revisión separada; no se reparan registros ni se reproducen cierres.

Los pagos ya registrados no se reprocesan para activar servicios: el retry idempotente
continúa devolviendo el pago existente sin repetir efectos. No se debe cobrar de nuevo
para intentar reparar un servicio histórico suspendido.

Confirmaciones: **sin Railway, sin producción, sin migraciones, sin pagos reales,
sin cambios en P0-05 y sin cambios en el contrato S2S G2**. No hubo reconciliaciones,
tráfico externo G1/G2/G3, semillas, despliegues, stage, commit, push ni merge.
Se preservan fuera del stage `-f`, `output/`, backups y artefactos locales no relacionados.
