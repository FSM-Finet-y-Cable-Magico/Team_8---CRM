# P0-07 — Railway: observación acotada y plan intergrupos

> Consolidación 29-10-2026: este documento conserva resultados y sesiones históricas. El estado de publicación vigente está en [19](19-consolidacion-publicacion-p0-07.md). Las sesiones con TTL vencido no deben reutilizarse. Las referencias a `evidencias-qa/` corresponden a archivos locales preservados, excluidos de este PR; el resumen automatizado publicable está en [validación](p0-07-validacion-publicacion.json). La distribución académica y la certificación productiva siguen separadas de esta PR.

Fecha: 28-10-2026. **RAILWAY_READONLY_VERIFIED**, limitado a tres GET públicos
autorizados. **REAL_INTERGROUP_E2E_PENDING**. No certifica versión desplegada,
catálogo físico completo, historial Prisma, login ni aceptación funcional.

## Autorización y operaciones efectivamente ejecutadas

Se revisaron primero contratos, HealthController, guard S2S, Dockerfile, migraciones
y documentación locales. El usuario autorizó específicamente GET de health/ready
en G8 y luego proporcionó el frontend con «prueba con esa url».
No se usaron credenciales, `.env`, acceso a consola Railway ni conexión directa DB.
No se siguieron redirecciones, no se inició sesión y no se enviaron POST reales.

| Consulta real | Fecha UTC / Chile | Resultado |
|---|---|---|
| GET https://team8-crm-production-3be0.up.railway.app/api/health | 28-10, 12:53Z / 09:53 -03:00 | 200; application UP |
| GET https://team8-crm-production-3be0.up.railway.app/api/ready | Misma ejecución | 200; application UP, database UP, global_schema READY; missing_columns=0, different_columns=0; g1_payload_snapshot READY |
| GET https://team8-crm-frontend-production.up.railway.app/ | 28-10, 12:53:51Z / 09:53:51 -03:00 | 200 text/html; título smartCRM, contenedor root y asset /assets/index-B0WLF6Hh.js |

Evidencias saneadas:

- [API](evidencias-qa/railway-public-readonly-2026-10-28T12-53-14-801Z.json).
- [Frontend](evidencias-qa/railway-frontend-readonly-2026-10-28T12-53-51-939Z.json).

El HTML tiene SHA-256 `cb2fd865556a692b104df1bb5ef7fee7526d0353373087c5c3def6b644e476db`:
es identidad de esos bytes, **no un SHA Git**. Las cabeceras de revisión examinadas
no aportaron commit. No se descargó ni ejecutó el asset JS; no se comprobó desde él
la API embebida, CORS, navegación o login. El usuario puede comprobar su login de
Railway manualmente; no se solicita ni utiliza su contraseña.

## Local frente a Railway: qué sabemos

| Aspecto | Checkout / QA local | Railway observado o pendiente |
|---|---|---|
| Revisión | HEAD a8d2598151c988ef8f4f4a09977fe36167d79f62 + cambios PDF sin commit | SHA backend/frontend UNKNOWN. Requiere metadata del deployment facilitada por propietario; no inferir desde readiness |
| Frontend/API | Mismo origen loopback, API /api | Ambos dominios públicos responden; enlace real entre frontend y API no verificado |
| PDF | Corrección local y 9/9 pruebas PostgreSQL previas; hashes conservados | Despliegue de corrección UNKNOWN; no generar PDF en Railway para comprobarlo |
| G1/G3 | Simuladores locales y confirmación secundaria HTTP real | ready declara g1_configured=true / g3_configured=true. Solo valida configuración según código; no credencial, permisos ni conectividad al proveedor |
| G2 | Controlador /api/integrations/g2, X-API-KEY, group G2 y empresa por query/body | Claves activas/scope UNKNOWN; ready no expone estado G2. No se llamó a sus endpoints |
| Mensajería | Deshabilitada | ready informa messagingProvider=disabled |
| Emisión tributaria | Deshabilitada | ready informa enabled=false, ready=true: preparada para estar deshabilitada, no emisor funcional certificado |
| Esquema | Canónico SHA f42140bff257d8bcaf46d2f74d5c44fa6d304bd8f84e20085ba3bbf07bfeb2aa cargado solo en cluster propio | Cero diferencias contra la proyección del backend DESPLEGADO. No demuestra identidad con el canónico local |
| Staging | PG local desechable, sintético | No se ha identificado un Railway staging separado. Los dominios recibidos dicen production; no usarlos como staging por suposición |

`HealthController.ready()` local consulta tablas/columnas/tipos/nullability en una
transacción READ ONLY. No comprueba todos los FK, checks, índices, defaults, datos,
ni `_prisma_migrations`. Tampoco expone SHA. Si el backend desplegado es anterior,
su proyección puede ser anterior: READY no demuestra paridad de releases.

G2 autoriza por `G8_INTEGRATION_API_KEYS` (hash, grupo, estado activo y companies),
con id_empresa obligatorio. No se leyó la configuración privada Railway. G1/G3 usan
sus flags/URL/key respectivos; su presencia no prueba autenticación externa. No se
imprimieron valores de keys ni se copió ningún `.env`.

## Historial y catálogo: pendientes de autorización independiente

Existen 15 carpetas locales de migración. La documentación antigua de baseline
describe historias de distintos grupos, backfills y drift de otra fecha; no es un
catálogo vigente. No se afirmó qué ejecutaría hoy `migrate deploy` ni se ejecutó
deploy/resolve/db push/migrate dev. El Dockerfile backend revisado inicia
`node dist/main.js`; no aplica migraciones por sí mismo. Configuración externa de
arranque Railway sigue desconocida.

Antes de un E2E con escrituras se necesita: versión de ambos deployments,
catálogo READ ONLY fresco, historial Prisma por nombre/estado/fecha/checksum,
comparación con carpetas locales y verificador físico completo. Para consultas
directas usar un rol READ ONLY y una autorización específica del propietario:
esta intervención no la tiene. No conectar usando DATABASE_URL de escritura.

El verificador local permite solo cinco extras preservados exactos:
tabla solicitud_clave_wifi; lista_negra.nivel; log_notificacion.id_ot;
log_notificacion_id_ot_fkey y log_notificacion_estado_envio_fecha_envio_idx.
`_prisma_migrations` es extra técnico. Esto es política local, no constatación de
su presencia actual en Railway. Un sexto extra desconocido sigue requiriendo revisión.
La consulta de ready no certifica esa política.

La aprobación de E2E debe incluir aislamiento de datos, un plan de recuperación
operado por propietario y comprobación de notificaciones/DTE/stock que podrían
dispararse indirectamente. No se propone eliminar filas como rollback improvisado.
Respaldos e históricos existentes se conservaron sin abrir ni distribuir dumps.

## Matriz para ratificación, NO EJECUTADA

Todos los IDs reales están **SIN ASIGNAR / SIN AUTORIZAR**. Los IDs de la demo local,
la OT histórica #53 y el event_id del smoke G1 antiguo no son candidatos reutilizables.
Elegir primero staging independiente. Si no existe, detener escrituras hasta un
acuerdo expreso de propietarios sobre entorno compartido y efectos permitidos.

| Operación futura | Responsables y precondiciones | IDs QA a aprobar | Efectos / resultado esperado | Evidencia y aprobación |
|---|---|---|---|---|
| G8 → G3 instalación POST /api/integraciones/instalaciones | G8 comercial + G3; prospecto factible, cotización, contrato firmado, empresa/plan correlacionados; versiones ratificadas | empresa, prospecto, contrato, plan, request_id, trace_id: SIN ASIGNAR | Crea solicitud y OT G3; tracking G8 único. Respuesta wrapper conserva id_ot y correlación | Autorización de escritura G8/G3; IDs antes/después y respuesta saneada; no ejecutar solo por disponer de key |
| Retry idéntico y GET detalle/cierre G3 | G8/G3; misma identidad y hash; GET con id_empresa | OT de la fila anterior, mismo request_id/trace_id | POST repetido no crea segunda OT; GET valida empresa. Cierre sin aprobación no activa | Coordinación G3, conteo OT y hash; aprobación del retry incluida explícitamente |
| G3 → G8 aprobación/cierre | G3 técnico + G8; evento approval-only válido y evidencia de trabajo técnico QA | OT/empresa/contrato/prospecto/plan correlacionados; series autorizadas | Commit cliente/contrato/servicio/tracking/evento. Puede desencadenar G1 posterior | Autorización también G1 antes del cierre; un evento/activación, estados y auditoría. Indicar si cierre real o simulado; no atribuir simulación a G3 real |
| G8 → G1 activación y asociación | G1 inventario + G8, coordinados con G3; unidad QA apta y cierre técnico | event_id nuevo estable, trace_id, empresa, cliente, servicio, contrato, OT, serie: SIN ASIGNAR | Evento aceptado; equipos_asociados=0 puede ser PENDIENTE_CIERRE. Asociación solo con conciliación técnica posterior | Aprobación de reserva/stock; GET equipos y unidad con asignación verificada. Un 2xx por sí solo no es asociación PASS |
| G1 retry/ACK perdido | G1/G8; descriptor persistido y mismo event_id/payload, prueba de fallo aprobada | Mismos IDs del caso autorizado | Un efecto funcional, posibilidad de más de un envío; COMPLETADA no retrocede por auditoría | G1 confirma idempotencia; conteos G8/G1, hashes y envíos. No inducir caída real sin ventana y operador |
| G2 → G8 consultas facturas | G2/G8; key con grupo/empresas ratificados | empresa y cliente/contrato/factura dedicados | GET /api/integrations/g2/invoices e invoices/:id; saldos/relaciones solo del ámbito | Autorización de lectura adicional; respuestas saneadas y conteos, sin RUT/personales en entregable |
| G2 → G8 pago confirmado | G2/G8 financiero; factura/saldo y sandbox autorizados, emisor/avisos controlados | factura, empresa, monto, fecha_pago, codigo_autorizacion, codigo_transaccion estables; request_id trazable | POST /api/integrations/g2/payments persiste pago, saldo y posible reactivación objetivo; puede iniciar efectos tributarios | Autorización explícita de pago QA y efectos posteriores. Misma transacción/payload no duplica; payload incompatible conserva conflicto. No confundir con pago de dinero real |
| Comprobante / estado tributario G2 | G2/G8; pago autorizado anterior | id_pago y empresa | GET payments/:id/comprobante y tax-document; distinguir pendiente/generado/fallido. No abrir URLs externas automáticamente | Captura saneada, disponibilidad real. No forzar GENERADO ni habilitar Facturación.cl para la prueba |
| Aislamiento empresarial | G8 + grupo consumidor; usuarios/keys QA dedicados | empresas A/B, cliente compartido con contratos legítimos, facturas/servicios distintos | Roles empresariales no leen/escriben relación ajena; admin conserva consolidado; estado global financiero protegido | Aprobación de casos positivos/negativos y de cada intento de escritura. No probar contra datos de clientes reales |
| Recuperación P0-05 | G8/G1, solo después de versión/esquema certificados | tracking/evento/snapshot originales | Recuperación bajo demanda, sin reactivar comercialmente; auditorías y confirmaciones persistidas | Separar prueba local previa de proveedor real; autorización específica de fault injection y reinicio |

Mantener endpoints/payloads congelados. G2: idempotencia financiera por
codigo_transaccion; request_id no reemplaza esa identidad. G3: request_id/trace_id,
empresa y referencias; conflicto ante hash incompatible. G1: event_id y snapshot
persistido; garantía del efecto externo depende de G1. Reparaciones/retiros no se
añaden a la matriz de instalación como si estuvieran ratificados.

Cada fila se cierra con: autorización/ambiente/SHA, mapa de IDs QA firmado,
preestado, request saneado y hash (sin keys), resultado, postestado, auditoría,
captura real y acta del grupo responsable. No hay aprobaciones por inferencia.

## PDF: propuesta mínima de PR independiente, NO creado

Se conservaron los únicos dos cambios productivos existentes:
`backend/src/contracts/contracts.service.ts` y `contracts-pdf.spec.ts`.
Hashes fuente/compilado coinciden con el informe 13 y los 9/9 casos PostgreSQL QA.
No se ha demostrado que Railway contenga esta corrección.

Propuesta para posterior autorización: PR dedicado «fix(contracts): keep PDF
generation and audit in the same transaction», incluir esos dos archivos y sus
pruebas, referenciar la evidencia PostgreSQL sin mezclar el paquete documental ni
datos privados. Revisar compatibilidad con develop vigente antes de publicar;
no se hizo fetch ni cambio de rama en esta intervención. Preservar todas las
versiones históricas, comprobar descargas y documentar riesgo filesystem/DB.
Commit, push, PR, merge y despliegue requieren autorización posterior; ninguno se hizo.

## Pendientes mínimos y responsables

1. Operador: recorrido visual local 15, PDFs abiertos y capturas/bitácora; no declarar DEMO_PASS antes.
2. G8: revisar y autorizar PR PDF independiente. El código adicional de esta ronda solo prepara QA.
3. Propietario Railway: aportar SHA backend/frontend, confirmar staging y autorizar catálogo/historial READ ONLY con rol restringido si procede.
4. Representantes G1/G2/G3/G8: asignar IDs y aprobar operaciones/efectos por fila; coordinar ventana y cierre.
5. Responsable académico: aceptación y evidencias de los CU pendientes; no confundir simulación con aceptación comercial.

Estado final de esta intervención: DEMO_PARTIAL, ACADEMIC_CONDITIONAL,
RAILWAY_READONLY_VERIFIED (solo HTTP público), REAL_INTERGROUP_E2E_PENDING.
POST reales externos=0; DDL/DML Railway=0; variables cambiadas=0; commit/push/merge/deploy=false.
