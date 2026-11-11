# Ciclo 2 — Firma por correo y preparación tributaria sandbox

Fecha: 11-11-2026. Worktree: `Team_8---CRM-LibroControl`; rama `feat/ux-ui-libro-control`.

## Alcance y evidencia

Esta revisión utiliza código local y pruebas con dobles de Prisma, correo y transporte HTTP. No se inspeccionaron variables privadas, PostgreSQL, contenedores, Mailpit ni proveedores. El funcionamiento de la QA del operador y el contenido de su catálogo/configuración siguen sin comprobarse desde Codex.

El síntoma comunicado por el operador —PDF `Generado` y «Modo de firma pendiente de autorización»— corresponde en código a `resolveSignatureMode() === 'unknown'`. No demuestra un fallo SMTP: generar el PDF y autorizar el modo son pasos distintos. No se puede determinar qué configuración efectiva falta en el contenedor sin el preflight del operador.

### Mapa comprobado

| Componente | Responsabilidad |
|---|---|
| `signature-policy.ts` | Resuelve modalidad desde asignación auditada y allowlists explícitas; una modalidad desconocida nunca autoriza firma manual. |
| `e-signature.config.ts` | Flag estricto; origen público seguro; secreto OTP; empresas; aprobaciones adicionales de producción. Sin flag no habilita el flujo. |
| `signature-schema.ts` | Inspección de columnas, checks, índices y permisos del almacenamiento privado `g8_contratos.solicitud_firma`. Una consulta a `public.contrato_firma_solicitud` no lo representa. |
| `e-signature.service.ts` | Autorización de empresa, transacciones Serializable, solicitud/versión, snapshot, OTP y envío posterior al commit. `onModuleInit()` exige SMTP y esquema seguro al habilitar firma. |
| `ContractsService.markContractSigned()` | Punto común de formalización manual/electrónica y veto financiero del Ciclo 1; mantiene replay de contratos ya firmados. |
| `ContractDocuments` / `ContractSignatureActions` | Generar/descargar PDF y solicitar firma son acciones distintas. No ofrece una firma manual de reemplazo para modalidad automática. |
| `useSignatureStatus` | Consulta/poll de la misma ruta existente; descarta respuestas de otro contrato y muestra un fallo seguro cuando no puede verificar la política. |

## Correcciones de firma

1. El estado distingue modalidad sin asignar, flag apagado, empresa no habilitada, configuración pública insegura/incompleta, habilitación de almacenamiento pendiente, correo empresarial ausente, PDF faltante/no vigente, preparación de firma faltante, enlace expirado y correo del titular inválido. Los motivos no incluyen URLs configuradas, nombres del esquema, destinatarios, tokens, secretos ni OTP.
2. La consulta financiera solo traduce `ContractDebtException` a un motivo seguro. Un error de lectura de infraestructura sigue fallando; no se transforma en saldo cero. La consulta no genera auditoría financiera ni cambia facturas, contratos o solicitudes. Se conserva la asignación auditada automática preexistente de `status()` cuando la política la requiere; por ello la ruta histórica no debe describirse como universalmente libre de escrituras.
3. Se encontró una omisión real: el veto del Ciclo 1 protegía la firma final, pero `create()` podía preparar/enviar una invitación con deuda. Ahora el envío explícito verifica el mismo guard financiero por empresa dentro de su transacción Serializable. La negativa se audita en transacción separada después del rollback; si esa auditoría falla no se informa éxito.
4. El veto también deshabilita `manualAllowed` y `sendAllowed` informativamente. Las rutas backend conservan la autoridad; los botones no son el control de seguridad.
5. Las solicitudes pendientes se reutilizan sin sustituir token ni reenviar invitaciones. Las firmas confirmadas conservan su descarga y no se someten como nuevas contrataciones al veto. No se cambia ni firma automáticamente un contrato después de regularizar deuda.

Rutas preservadas: `GET/POST /contracts/:id/signature`, `PATCH .../cancel`, `POST .../retry-delivery`, `GET .../download`; rutas públicas existentes `POST /contract-signatures/{view,pdf,code,sign}`. Sin cambios S2S G1/G2/G3 ni cambios de política fiscal.

## Preflight de firma para el operador (no ejecutado)

Antes de habilitar o reconstruir cualquier servicio, contrastar versión del código del contenedor con el candidato local y revisar:

| Condición | Comprobación segura / condición de parada |
|---|---|
| Modalidad | El contrato debe estar autorizado como automático o manual por la política existente. No usar `unknown` como habilitación. No convertir automáticamente una modalidad en otra. |
| Estado / deuda | Contrato pendiente; facturas y pagos reales de su empresa; sin deuda exigible o revisión financiera pendiente. Conservar firmados e históricos. |
| Flag | `CONTRACT_SIGNATURE_ENABLED` continúa apagado hasta aprobación del operador. |
| Empresas | Coherencia entre `CONTRACT_SIGNATURE_AUTOMATIC_COMPANIES`, `CONTRACT_SIGNATURE_COMPANIES` y política manual por empresa+contrato. No habilitar ambas empresas indiscriminadamente. |
| URL pública | `CONTRACT_SIGNATURE_PUBLIC_URL` debe cumplir el validador: HTTPS, sin usuario/clave/query/hash/ruta adicional. HTTP solo está permitido en `NODE_ENV=test` para localhost/127.0.0.1; no cambiar `NODE_ENV` global ni debilitar el validador para solucionar la QA. Definir un origen HTTPS QA autorizado si corresponde. |
| Secreto | `CONTRACT_SIGNATURE_OTP_SECRET` provisionado de forma privada y aleatoria. Informar solo presencia/validación, nunca valor. |
| Almacenamiento | Verificar `g8_contratos.solicitud_firma` y todas las guardas de `inspectPrivateSignatureSchema`, con rol runtime restringido. No crear tabla pública sustitutiva ni omitir permisos/checks. |
| PDF | Última versión válida de la empresa correcta, sin firma previa y con snapshot consistente. Si se generó antes de preparar firma, revisión y nueva versión explícita; conservar la anterior. |
| Identidad / correo | Titular con correo válido, datos comerciales completos y SMTP por empresa configurado únicamente hacia Mailpit de la QA aislada. |
| Prueba posterior | Operador: una invitación, acceso al PDF, OTP, consentimiento y constancia en Mailpit; replay sin duplicado. Codex no ejecutó esos pasos. |

Consulta opcional de existencia, exclusivamente de lectura, para que el operador revise en su QA:

```sql
SELECT to_regclass('g8_contratos.solicitud_firma') IS NOT NULL
  AS existe_almacenamiento_privado;
```

La existencia por sí sola no valida las columnas, constraints, índices ni privilegios. Debe contrastarse con el preflight privado completo ya implementado. No habilitar firma si falta aprobación o esquema.

## Facturación.cl: readiness sin activación

No se modificó código tributario: la inspección no demostró un defecto que requiera cambiar su contrato. Se preservó `PER_PAYMENT_V1` y las guardas existentes.

Comprobado en fuentes locales:

- `FacturacionClConfigService` valida empresas, aliases, ambientes y flags. Producción requiere opt-in adicional.
- `FacturacionClPaymentConfig` exige perfiles aprobados y credenciales del ambiente/empresa correspondiente. No toma credenciales de producción como sustituto de sandbox ni viceversa.
- `FacturacionClReadClient` tiene origen/rutas fijados, redirecciones prohibidas, errores saneados y autenticación/versionado separados de procesamiento.
- `FacturacionClSandboxDispatcher` rechaza contratos production. El despacho requiere empresa/contrato/ambiente/política/documento/claim persistido compatibles y marcador durable de envío.
- `FacturacionClIssuer` calcula readiness no secreto. Con integración apagada no encola pagos nuevos ni programa el timer; su inicio sí inspecciona metadatos locales. Habilitarla programa un drenaje cada 15 segundos de trabajo persistido: no equivale a habilitar una única prueba aislada.
- `docker-compose.facturacion-local.yml` versionado usa por defecto flags de integración/producción/delivery apagados y perfiles/empresas vacíos; contiene referencias a variables privadas, sin que esta revisión haya leído sus valores. No demuestra que sea el override efectivo de la QA del operador. `compose.g8-g3-qa.yaml` también mantiene la integración apagada; no se propone usarlo para sustituir la QA existente.
- El registro externo de DTE y el panel `PaymentTaxDocument` tienen responsabilidades distintas. Registrar un documento externo no debe disparar el dispatcher.

### Matriz de configuración propuesta (no aplicada)

| Variable / condición | Estado requerido para preparación |
|---|---|
| `FACTURACION_CL_INTEGRATION_ENABLED` | `false` durante este ciclo; habilitación posterior exclusivamente manual y autorizada. |
| `FACTURACION_CL_PRODUCTION_ENABLED` | `false` en todo el ensayo. |
| `FACTURACION_CL_COMPANIES` | Solo empresas expresamente aprobadas, `environment=sandbox`; aliases únicos. Revisar la allowlist antes de habilitar. |
| `FACTURACION_CL_PROFILES` | Perfiles aprobados por responsable tributario; tipo DTE, identidad y política `PER_PAYMENT_V1` ratificados para el pago designado. |
| `FACTURACION_CL_<ALIAS>_SANDBOX_CREDENTIALS` | Solo credenciales acreditadas por el proveedor como pruebas. Provisionar privadamente; no imprimir ni copiar al informe. |
| `FACTURACION_CL_<ALIAS>_PRODUCTION_CREDENTIALS` | No utilizar ni trasladar a la QA. |
| `FACTURACION_CL_DELIVERY_ENABLED` | `false` inicialmente; habilitar correo después solo hacia Mailpit y previa revisión independiente. |
| `MAIL_PROVIDER` / SMTP empresa | SMTP de Mailpit aislado para la prueba posterior. Verificar las dos empresas sin publicar destinatarios/configuración sensible. |
| Pendientes | Inspección fresca del operador de `tax_payment_job` y `tax_emission_intent`, claims, resultados indeterminados y duplicados. Los conteos cero aportados son evidencia previa, no estado fresco verificado por Codex. |
| Esquema | Readiness de tablas/constraints/índices aprobado por operador. Ninguna migración se ejecuta en esta tarea. |

### Secuencia posterior, sujeta a autorización

1. Dry-run local de configuración sin red: flags/allowlist/perfiles/ambiente y readiness; no registrar pagos nuevos ni tocar estados históricos.
2. Comprobar pendientes con lecturas fresh y validar que activar el worker no drene operaciones ajenas a la prueba. Si existen trabajos no designados, detener y definir aislamiento; no cancelarlos/resetearlos a mano.
3. Tras autorización separada del propietario y credenciales realmente sandbox, una consulta de autenticación/versión usando el cliente de lectura. Es tráfico real del proveedor, aunque no emita DTE. La pantalla o `canIssue` local no sustituyen esa evidencia.
4. Designar un único pago sintético ya persistido, empresa, factura, hecho tributario e identidad idempotente. El responsable tributario debe confirmar que corresponde emitir y que no existe DTE previo para la misma venta/abono. No repetir el pago para probar DTE.
5. Solo con autorización específica, procesar una emisión sandbox controlada. En el código `/wsds/procesar` es procesamiento de DTE, no una prueba inocua de conectividad. No ejecutar sobre todas las facturas sembradas.
6. Verificar resultado, folio, PDF recuperado y correlación. Si el envío queda `RESULTADO_INDETERMINADO`, no reemitir: conciliar primero conforme a las rutas existentes y permisos Administrador.
7. Probar entrega a Mailpit de forma independiente, replay sin duplicación y apagado de integración/delivery al finalizar. Registrar evidencia saneada y hash del código, sin URLs de artefactos con token.

### Decisiones y bloqueos

- No se puede declarar firma correo/Mailpit ni emisión sandbox aprobadas: no se ejecutaron aquí.
- Un abono no demuestra por sí solo un nuevo hecho tributario. Si `PER_PAYMENT_V1` no representa la política autorizada de venta/abono, se requiere decisión contable antes de usar el proveedor; no se cambia esa regla unilateralmente.
- Ante error de firma, desactivar nuevos envíos mediante configuración autorizada no borra solicitudes/evidencias ni invalida firmas históricas. Ante error fiscal, apagar integración/delivery detiene trabajo nuevo, pero no demuestra que un despacho previo no haya sido recibido; conservar outbox y conciliar.
- Sin migraciones, seeds, Docker, PostgreSQL, Mailpit, correos ni proveedor real. Sin cambios `.env`, commits, push o PR.

## Pruebas locales de este bloque

| Comando | Resultado real |
|---|---|
| `npm.cmd --prefix backend test -- --runInBand e-signature.spec.ts e-signature-readiness.spec.ts e-signature.http.spec.ts` | 3 suites, 41 PASS; 0 FAIL. Incluye 18 regresiones nuevas de readiness/envío. |
| `node --test frontend/tests/signature-policy-workflow.test.mjs frontend/tests/contract-signature.test.mjs` | 15 PASS; 0 FAIL. Incluye 4 regresiones nuevas de motivos, consulta fallida, veto manual y descarga histórica. |
| `npm.cmd --prefix backend test -- --runInBand facturacion-cl-payment.config.spec.ts facturacion-cl-read-client.spec.ts facturacion-cl-sandbox-dispatcher.spec.ts` | 3 suites, 60 PASS; 0 FAIL. Configuración y transporte inyectado simulado; cero llamadas al proveedor. |

La primera ejecución de las nuevas pruebas de firma tuvo dos fallos de fixture: la allowlist automática heredaba la lista de empresas habilitadas y el escenario que pretendía `unknown/manual` seguía siendo automático. Se corrigió únicamente el fixture con `CONTRACT_SIGNATURE_AUTOMATIC_COMPANIES=[]`, explicitando que la asignación automática procede de la auditoría sintética en los demás escenarios. La segunda ejecución completa obtuvo 41/41 PASS. No fue un fallo de producción ocultado ni se relajó la política.

Estas ejecuciones no certifican firmas reales, Mailpit, permisos privados de PostgreSQL ni sandbox del proveedor. La regresión global, builds, lint y Prisma se registran en el informe consolidado del Ciclo 2. No se ejecutó la suite PostgreSQL de firmas.
