# Receptor G8 del fan-out G3 — candidato QA

Fecha: 2026-11-08. Rama `Fix/integracionTerreno`. Base `fd24aeb169d6d227fd653032a7185db6097b62c7`. Sin commit, push, despliegue ni conexión PostgreSQL/VPS.

## 1. Evidencia y decisión

El propietario confirmó en el contenedor G3 el momento `CIERRE_FAN_OUT_MOMENTO=APROBACION`, destinos y claves configurados, OT #1 REPARACION aprobada/COMPLETADA, respuesta G1 PROCESADO_CON_DISCREPANCIAS y HTTP 400 de G8. También ratificó la forma construida por `construirPayloadCierre()`: campos técnicos y referencias de instalación null para OT sin solicitud G8. Son comprobaciones aportadas por el propietario, no una inspección de VPS realizada durante esta tarea.

Se contrastó la referencia pública fijada a `f834d63f06bc3799d65d881c33f47a1b601e6730`: [constructor](https://github.com/FSM-Finet-y-Cable-Magico/Team-3-FSM/blob/f834d63f06bc3799d65d881c33f47a1b601e6730/fsm/backend/src/ordenes/fan-out/payload-cierre.ts), [tipos](https://github.com/FSM-Finet-y-Cable-Magico/Team-3-FSM/blob/f834d63f06bc3799d65d881c33f47a1b601e6730/fsm/backend/src/ordenes/fan-out/fan-out-cierre.ts) y [emisor HTTP](https://github.com/FSM-Finet-y-Cable-Magico/Team-3-FSM/blob/f834d63f06bc3799d65d881c33f47a1b601e6730/fsm/backend/src/ordenes/fan-out/webhook-fan-out.ts). No se modificó ni generó un parche para G3/G1.

Causa del 400 compatible con esta evidencia: el DTO de G8 admitía solo el subconjunto de instalación, exigía referencias no nulas y rechazaba los campos técnicos adicionales. La OT reportada era una reparación independiente. No correspondía intentar una activación ni crear otro ticket.

La corrección local distingue ambos casos. No demuestra que la imagen desplegada haya cambiado ni que el nuevo receptor haya recibido tráfico real. El resultado de discrepancias G1 queda fuera de esta corrección; no se presenta como inventario conciliado.

## 2. Decisión por evento

| Entrada | Respuesta / efecto |
|---|---|
| INSTALACION válida y correlacionada | HTTP 201, respuesta comercial existente; una transacción y un evento terminal por tracking |
| Subconjunto legacy sin tipo_ot | Conservado solo con todas las referencias de instalación y tracking válido; nunca inferir reparación por campos vacíos |
| REPARACION explícita, empresa autorizada, referencias de instalación null/omitidas | HTTP 200 con acuse FUERA DE ALCANCE; cero consultas/escrituras comerciales, tracking, evento, auditoría o envío G1 |
| REPARACION con cualquier referencia de instalación no nula | HTTP 400; no adoptar relaciones ambiguas ni procesar como instalación |
| Instalación incompleta, OT/ruta distinta, tipos inválidos, clave contradictoria, campos desconocidos | HTTP 400, sin activación |
| Key ausente/inválida o scope empresarial ajeno | HTTP 401/403 antes de procesamiento |
| Instalación completa con request_id desconocido | HTTP 404, sin alta automática |
| Instalación con correlación distinta al tracking | Rechazo, sin activación; todas las correlaciones se revalidan bajo el lock existente |
| Repetición idéntica de instalación | Respuesta duplicate existente, sin activar de nuevo |
| Mismo evento terminal con payload diferente | HTTP 409 conservado, sin sobrescribir la evidencia original |
| estado en webhook, incluso COMPLETADA o EN_CURSO | HTTP 400: no es campo del constructor ni evidencia de aprobación |
| GET detalle EN_CURSO/COMPLETADA | Solo seguimiento; no activa ni crea evento terminal |

Las rutas permanecen iguales: `/api/integraciones/fsm/ordenes/:idOt/cierre` y `/api/integrations/g3/events/work-order-closed`. Ambas conservan el guard S2S de G3 y scope de empresa. No se agregaron endpoints públicos ni equivalencias de roles.

Acuse de reparación, ejemplo sintético:

```json
{
  "received": true,
  "processed": false,
  "activated": false,
  "code": "G3_REPAIR_OUT_OF_INSTALLATION_SCOPE",
  "tipo_ot": "REPARACION",
  "id_ot": 901,
  "id_empresa": 1
}
```

Esto confirma recepción/validación del mensaje, **no un procesamiento comercial ni un registro durable de recepción**. No existe duplicate persistido para reparaciones: la repetición es segura porque el handler es sin estado y sin efectos, no por una caché o una tabla nueva. Los mensajes se descartan tras responder; la evidencia técnica permanece bajo autoridad de G3. No se registra un éxito comercial ficticio ni se crea una bandeja.

Solo se habilita este acuse para REPARACION independiente. Otros tipos técnicos y la derivación/cierre de reparaciones comerciales siguen sin contrato implementado. La respuesta HTTP 2xx que vea el fan-out no equivale a activación G8; conservar el code y processed=false en evidencia operativa.

## 3. Campos y validación

Se admite únicamente el conjunto de 22 campos definido por el constructor, conservando el subconjunto legacy. `forbidNonWhitelisted` permanece global y también se aplica a objetos anidados.

| Grupo | Validación |
|---|---|
| id_ot, id_empresa | Enteros positivos hasta 2.147.483.647; empresa obligatoria incluso en reparación |
| request_id, trace_id | Instalación: strings obligatorios, límites vigentes 100/60, exactos frente al tracking. Reparación independiente: null/omitidos; no se aceptan referencias no nulas |
| id_prospecto, id_contrato, id_plan | Instalación: enteros positivos y relación exacta. Reparación independiente: null/omitidos |
| tipo_ot | INSTALACION o REPARACION; ausencia solo por compatibilidad legacy completa. Null, otros literales o estados no habilitan rutas |
| clave_idempotencia | String máximo 100; si viene, debe ser exactamente id_ot:fecha_completada. No sustituye la identidad terminal persistida de G8 |
| fecha_completada | ISO con fecha válida, hora y zona; máximo 40; sin inventar, normalizar o escribir fechas históricas |
| id_tecnico / usuario_tecnico | ID entero positivo o null; username string no vacío hasta 100 o null. Son del espacio G3, sin consultas/altas de usuarios G8/G1 |
| potencia_optica_dbm | Número finito; no convertir string en medición |
| resultado_llamada | String hasta 200; admite vacío, tal como emite el constructor; rechaza solo espacios |
| resuelto_remotamente | Booleano real |
| materiales | Hasta 1.000 objetos con id_tipo_equipo entero positivo, nombre string hasta 200 y cantidad numérica finita entre 0 y 1.000.000.000; ningún campo extra |
| equipos_instalados / equipos_retirados | Arrays obligatorios hasta 1.000; numero_serie string no vacío hasta 100. Solo campos definidos: accion, estado_g1, motivo, observacion_estado_fisico y diagnostico, con límites. Se conserva equipo legacy con solo serie |
| cliente | Null u objeto rut string/null hasta 16 y nombre string hasta 120; sin estado, IDs ni datos arbitrarios |
| direccion | Null u objeto direccion_completa hasta 200 y comuna hasta 80 |
| categoria_falla / categoria_falla_otro | Objeto id_categoria positivo/nombre hasta 200 o null; texto hasta 2.000 o null |

Los metadatos de cliente/dirección/categoría y usuario_tecnico se validan y participan en la huella, pero no se usan para reemplazar identidad, dirección firmada, técnico de G8, permisos ni estado financiero. `InstallationActivationService` sigue recibiendo solo el resultado técnico existente, ligado al snapshot comercial persistido. `estado_g1`, IDs de materiales y técnicos no son instrucciones de inventario ni prueba de asociación G1.

La fecha recibida se conserva como la entrega G3. Su constructor público tiene un fallback a fecha_creacion cuando falta fecha_completada: esta corrección no ratifica ese fallback como fecha técnica efectiva para CU47 ni modifica históricos; verificar aparte la calidad de fecha del fixture real.

## 4. Idempotencia y reconciliación

`g3-closure-contract.ts` valida la envolvente y separa reparación de instalación. Webhook y reconciliación usan la misma forma validada; GET de cierre conserva todos los campos contractuales definidos, incluidos null, y excluye aliases de presentación tipo/fecha y el estado legacy previamente verificado. El hash sigue usando la función canónica existente; no se cambia la clave única por tracking/evento ni se recalcula evidencia almacenada.

Un campo estado presente en una respuesta legacy de reconciliación solo permite continuar si es string COMPLETADA; EN_CURSO, PENDIENTE_APROBACION, vacío, null o un número no activan. El contrato real de cierre no necesita estado: la aprobación la garantiza el canal G3 configurado APROBACION y autenticado. G8 no inventa un booleano aprobado ni prueba independientemente la decisión del jefe técnico por el contenido.

Se prueba reconciliación enriquecida seguida del mismo webhook: una activación y misma huella. También alias/retry, conflicto por cambio de equipos/usuario_tecnico y preservación del evento anterior. El procesador comercial rechaza REPARACION y estado intermedio incluso si se intenta invocar internamente sin HTTP.

Un cierre legacy ya procesado que luego sea reenviado enriquecido sigue siendo payload distinto y genera conflicto: no se enriquece ni reescribe silenciosamente. La recuperación de un tracking ya completado mantiene su ruta P0-05 sin reactivar ni consultar el cierre para alterarlo. No se eliminaron locks, validaciones o rollback; G1 continúa después del commit comercial y con su recuperación persistida original.

## 5. Cambios y preservación

Producción: `g3-integration.dto.ts`, nuevo `g3-closure-contract.ts`, `g3-integration.controller.ts`, `g3-integration.types.ts`, `g3-closure.processor.ts` e `installation-integration.service.ts`, todos dentro de backend/src/g3-integration.

Pruebas: `g3-integration.dto.spec.ts`, `g3-closure.http.spec.ts`, `g3-closure.processor.spec.ts`, `installation-integration.service.spec.ts`. Las pruebas previas se conservan; dos fixtures de materiales se completaron con id/cantidad conforme al contrato real.

Documentación: este archivo y el informe de preparación actualizado. No se modificaron frontend, G2, Webpay, pagos, facturación, SMTP, G1, schema, migraciones, .env privados, Compose financiero ni otros worktrees.

La bandera y Compose QA de la intervención anterior se mantienen byte por byte. PLAN_CHANGE_PROCESSOR_ENABLED=false no ejecuta tick inicial, timer ni applyDuePlanChanges. La prueba de AppModule con almacenamiento simulado verifica cero escrituras, fetch/SMTP y tareas periódicas, conservando solo la lectura de catálogo tributario. No equivale a ejecutar contra PostgreSQL real.

## 6. Validación local y artefactos

Runner aislado: `.codex-review/integracionTerreno-fanout-20261108/run-safe.mjs`; elimina credenciales heredadas, bloquea dotenv privados y red no loopback, y mantiene DB opt-in deshabilitadas. Los avisos QA_PRIVATE_ENV_NOT_LOADED corresponden al bloqueo, no a una conexión a producción.

| Control | Resultado |
|---|---|
| Dirigidas: receptor HTTP, DTO, controlador, instalación, cierre, recuperación, worker y arranque | 263 PASS, 0 FAIL en 8 suites |
| Backend completo | 1.560 PASS, 0 FAIL; 9 omitidas en 5 suites PostgreSQL opt-in; 88 suites aprobadas |
| Frontend completo | 120 PASS |
| Herramientas / configuración QA | 33 + 6 PASS |
| Builds backend/frontend, TypeScript, lint, Prisma validate | PASS; 77 advertencias frontend preexistentes y aviso de bundle grande |
| Compose config --quiet | PASS con variables sintéticas, sin daemon, imágenes ni contenedores |

El build frontend necesitó la repetición con permisos de proceso ampliados por el ACL de esbuild, manteniendo las guardas. No se cambió configuración para ocultar el error.

La comprobación selectiva del candidato y `git diff --cached --check` pasan; el índice real está vacío e intacto. `git diff --check` de todo el worktree sigue señalando únicamente el espacio final preexistente en `frontend/src/features/plans/PlanZonesModal.tsx:23`, archivo ajeno y excluido. No se corrige para respetar el alcance. La prueba de aislamiento aplica el parche acumulado contra la base en un índice temporal y compila virtualmente 232 archivos backend y 100 frontend sin errores. De los 102 pendientes iniciales, solo cambian las cinco rutas ya existentes autorizadas por esta intervención; los otros 97 permanecen intactos. Se incorporan siete rutas nuevas del alcance: total 109 pendientes individuales. El escaneo local de las 38 rutas no detectó claves privadas, tokens de proveedor ni URIs de DB literales fuera de fixtures; no constituye certificación de todo el historial ni de archivos privados.

Evidencias finales: `final-evidence.json` con hashes/validación de aislamiento; `g8-g3-fanout-incremental.patch` para esta intervención y `g8-g3-publication-final.patch` para el candidato completo desde la base; índices temporales exclusivos para --cached --check. No se prepara el índice real ni se crean objetos/commits/ramas.

## 7. Publicación, QA y bloqueantes remanentes

Propuesta de commit adicional: `fix(i4): separate G3 repair acknowledgements from installation activation`. No hay SHA de commit ni digest nuevo: debe autorizarse su creación/publicación. Usar el candidato selectivo, conservar los comentarios ajenos y aplicar los controles de hooks/firmas descritos en [preparación QA](i4-g8-g3-preparacion-release-qa.md).

Se conserva `compose.g8-g3-qa.yaml`, proyecto finet-g8-g3-qa, puertos propuestos loopback 18808/18809, red y volumen propios, credencial G8 QA exclusivamente para finet_global_validacion, G3 QA habilitado y G1/tributación/correo/WhatsApp apagados. No hay servicio DB, migraciones ni seeds. El backend financiero y su DATABASE_URL no se modifican.

**Código listo para revisión del candidato. Despliegue aún no autorizado.** Antes de arrancar: catálogo/rol/permisos efectivos y backup aprobados por DBA, imagen nueva por digest, puertos/proxy/volumen QA aprobados y callbacks G3 dirigidos a esta instancia con claves/scopes exclusivos. Que los webhooks actuales estén configurados/alcanzables no demuestra ese aislamiento nuevo.

Aceptación real futura, solo con autorización y fixtures nuevos: reparación independiente obtiene 200/FUERA DE ALCANCE sin efectos; instalación por empresa con contrato firmado y referencias completas obtiene un tracking/OT; EN_CURSO no activa; aprobación G3 lleva a un único cliente/servicio objetivo; retry idéntico y reconciliación no duplican; G1 permanece sin envío hasta habilitación separada. Registrar status, code, IDs/hashes y cantidades sin PII/secretos. No repetir OT #1 ni históricos automáticamente ni forzar estados mediante SQL.

El nuevo receptor todavía no fue probado contra el contenedor G3 real ni PostgreSQL global. G1 PROCESADO_CON_DISCREPANCIAS requiere revisión del responsable G1; no se certificó inventario real. La ausencia de cambios de código pendientes no convierte estos controles en PASS.

Rollback: detener únicamente el proyecto QA nuevo, coordinar sus callbacks y conservar eventos/PDFs/auditoría; no restaurar la base global, borrar tracking, regenerar identificadores o modificar contratos/finanzas. Una activación confirmada requiere su procedimiento comercial para cualquier compensación.
