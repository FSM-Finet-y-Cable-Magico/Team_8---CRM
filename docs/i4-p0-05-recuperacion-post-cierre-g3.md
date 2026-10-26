# P0-05 — Recuperación posterior al cierre G3

Fecha: 26-10-2026. Rama: `fix/i4-p0-05-recuperacion-post-cierre-g3`.
Base: `95062b042c6cdce2c48912226f894555d484231f`, merge PR #58 / P0-04.
Estado: **APROBADO en auditoría local / LISTO_PARA_REVISION**, con certificación PostgreSQL QA pendiente.
No equivale a aprobación E2E ni a autorización de despliegue.

## Causa raíz y ventanas de fallo

`G3ClosureProcessor.process()` confirma activación comercial, tracking y evento
`WORK_ORDER_COMPLETADA` en una transacción. Antes de este cambio, después del commit:

1. La auditoría sin cliente transaccional podía ocultar un error de persistencia.
2. La creación del tracking G1 podía fallar, dejando únicamente un mensaje en consola.
3. Un webhook idéntico devolvía `duplicate` sin recuperar los efectos pendientes.
4. El resultado del evento guardaba cliente/servicio, pero no el payload G1 original.
5. En G1, el bloque de envío incluía auditoría; una excepción posterior podía
   llevar al tratamiento de fallo incluso después de confirmar el resultado.
6. Dos despachos podían leer el mismo estado pendiente antes de enviar.

La identidad G1 ya era determinística: `g8-g1-activation-${requestId}`.
Se conserva ese contrato, incluidos los campos del payload, validación de respuesta
y significado de `equipos_asociados=0` como pendiente de conciliación.

## Persistencia elegida y ownership

Se utiliza `IntegracionEventoEntrante.result`, JSON ya existente y administrado por
G8. No se cambia el modelo Prisma, el contrato SQL global ni las migraciones.
El evento se inserta **en la misma transacción que la activación comercial**:

```text
result = {
  estado, estadoOriginalG3, activated, idCliente, idServicio,
  postClosure: {
    version: 1,
    descriptor: {
      idIntegracion, requestId, idProspecto, idPlan, closureHash, source,
      payload: { event_id, trace_id, id_empresa, id_ot,
                 id_cliente, rut_cliente, id_servicio, id_contrato, equipos }
    },
    descriptorHash,
    audit: PENDIENTE | COMPLETADA,
    g1: { state, idIntegracion?, auditPending? }
  }
}
```

El descriptor permanece inmutable; solo avanzan los marcadores independientes.
El RUT proviene del snapshot original validado de la solicitud G3: es necesario
para el contrato G1 y no se reconstruye leyendo una identidad mutable al recuperar.
Las series se extraen del cierre validado, sin inventar inventario ni datos físicos.
No se persisten credenciales ni el cierre completo en el descriptor.
El descriptor se excluye de las respuestas y de los valores registrados en auditoría.
El hash detecta alteración/incoherencia; no es una firma criptográfica contra un
administrador de base de datos capaz de reescribir simultáneamente datos y hashes.

## Estados independientes

| Evidencia | Interpretación |
| --- | --- |
| Tracking G3 COMPLETADA + evento de cierre | Activación comercial ya confirmada; no repetir |
| `audit=PENDIENTE` | Faltan las dos auditorías G3; recuperables sin activación |
| `g1.state=PENDIENTE_CREACION` | Falta confirmar creación/progreso G1; se busca por eventId antes de enviar |
| `g1.idIntegracion` | Tracking G1 identificado |
| G1 PENDIENTE_ENVIO | Payload persistido, todavía sin intento |
| G1 ENVIANDO | Intento reservado mediante compare-and-set |
| G1 PENDIENTE_SINCRONIZACION_G1 | Resultado no confirmado; retry explícito |
| G1 PENDIENTE_DATOS_EQUIPO_G1 | Cierre sin series; no inventar equipos ni enviar vacío |
| G1 ERROR_G1 | Error explícito que requiere diagnóstico antes del retry |
| `g1.state=ERROR_REQUIERE_REVISION` | Correlaciones/relaciones incompatibles; no enviar |
| G1 COMPLETADA y `auditPending=true` | G1 confirmado; recuperar solamente auditoría |
| G1 COMPLETADA y `auditPending=false` | Confirmación y auditoría registradas |
| REQUIERE_EVIDENCIA_HISTORICA | Evento antiguo sin descriptor suficiente; no reconstruir ni reactivar |

El marcador G3 puede quedar atrasado si falla su actualización después de guardar
el resultado G1. El registro G1 por eventId es la autoridad para recuperarlo;
`PENDIENTE_CREACION` no demuestra por sí solo la inexistencia del tracking G1.

## Recuperación, atomicidad y concurrencia

- Se mantienen validaciones de cierre, snapshot original, hashes, request/trace,
  empresa, prospecto, contrato, plan y OT; se comprueban además cliente y servicio.
- La transacción comercial conserva el bloqueo de fila G3, clave única de evento,
  `maxWait=10s` y `timeout=20s`. Ninguna llamada G1 ocurre dentro de ella.
- Las dos auditorías G3 y su marcador se confirman en otra transacción con bloqueo
  del tracking. Un fallo revierte esas auditorías y deja el trabajo pendiente.
- G1 utiliza el mismo upsert por eventId y snapshot/hash, verificando contrato y
  servicio contra empresa y cliente. La empresa principal del cliente compartido
  no se usa como sustituto de sus relaciones contractuales.
- El envío reserva ENVIANDO mediante `updateMany` condicionado por estado e intentos.
  La lease dura cinco minutos, superior al máximo de 60 segundos admitido por el
  adaptador HTTP G1. Un retry explícito puede recuperar una lease vencida.
- El resultado se guarda condicionado por ENVIANDO y el instante del intento;
  un trabajador tardío no puede degradar el resultado de un intento posterior.
- Las auditorías G1 se ejecutan después de guardar el resultado, con bloqueo de
  fila y búsqueda por acción, tracking e intento. No degradan COMPLETADA si fallan.
- Antes de reemplazar un resultado pendiente por un nuevo intento se recupera su
  auditoría; si falla otra vez, no se envía todavía el nuevo intento.
- Un duplicado de cierre recupera creación y primer envío pendiente. Un tracking
  G1 que ya tenga intentos no se reenvía automáticamente por duplicar el cierre.
  Esto se revalida en `dispatch`, además de comprobarlo después del upsert;
  el compare-and-set protege los avances posteriores a esa lectura.
- Un hash de cierre distinto sigue siendo conflicto. Evidencia durable alterada
  o referencias cruzadas se rechazan antes de enviar.
- Si un proceso muere después del POST pero antes de guardar la respuesta, el
  resultado remoto es incierto. El retry conserva exactamente evento y payload;
  depende de la idempotencia G1. No se afirma entrega física exactamente una vez.

## Auditoría final: defectos reproducidos y corregidos

Se revisaron los nueve archivos P0-05, AuditService, los modelos Prisma y las
rutas de webhook, reconciliación y retry. En esta auditoría solo se editaron
`g1-activation.service.ts`, `post-closure-recovery.spec.ts` y este documento.
No se reescribió el mecanismo de recuperación.

1. **Reenvío automático por carrera upsert/dispatch.** Un worker podía conservar
   el resultado `intentos=0` del upsert, mientras otro worker ya enviaba y dejaba
   el evento pendiente. `dispatch` releía ese estado nuevo y hacía otro envío,
   pese a que la operación no era un retry explícito. La regresión reprodujo
   un POST inesperado. Ahora `dispatch` rechaza ese reenvío automático cuando
   observa un intento previo; conserva la recuperación de auditoría y permite
   el retry explícito autorizado.
2. **HTTP de un intento antiguo atribuido a la auditoría de otro.** Una respuesta
   tardía 503 no degradaba el estado COMPLETADA del segundo intento, pero podía
   registrar ese 503 como evidencia del segundo intento si su auditoría estaba
   pendiente. La regresión reprodujo esa atribución incorrecta. Ahora se pasa el
   número del intento que produjo el resultado y se compara bajo el bloqueo de
   auditoría; si difiere, `statusHttp=null` expresa que no se conoce el HTTP de
   ese resultado. Tampoco se emite el mensaje de resultado del worker obsoleto.

Ambas regresiones fallaron antes de corregir el servicio y pasaron después.
Se agregaron otras cuatro verificaciones de ventanas de fallo: fallo del marcador
G3 después de escribir las auditorías dentro de la transacción, pérdida de ACK del
commit de auditoría G3, pérdida de ACK del commit de auditoría G1, y ACK remoto G1
sin persistencia del resultado local. No se ejecutaron estas fallas sobre una DB real.

### Garantía exacta de auditoría

Todas las llamadas a `AuditService.record()` de esta recuperación entregan `tx`.
Se ejecuta la rama que devuelve `transaction.logAuditoria.create()` y propaga
errores; no se utiliza la rama que captura y oculta un fallo. No se modificó
AuditService ni su comportamiento para otros módulos.

- **G3:** las dos auditorías y `audit=COMPLETADA` comparten transacción y bloqueo.
  Si falla el marcador antes del commit, también se revierten las auditorías.
  Si el commit ocurre pero se pierde su ACK, el siguiente proceso lee el marcador
  confirmado y no vuelve a insertarlas.
- **G1:** el resultado confirmado permanece independiente. Las auditorías se
  deduplican por acción, tracking e intento bajo bloqueo de su fila. Si se pierde
  el ACK después del commit, una recuperación busca las filas ya persistidas;
  no depende del marcador G3 ni de memoria del proceso para reconocerlas.
- No existe una restricción UNIQUE en LogAuditoria para esta clave lógica. La
  garantía de deduplicación depende de que los escritores P0-05 respeten el mismo
  bloqueo y protocolo; no cubre inserciones manuales o escritores externos que
  lo omitan. Logs históricos sin `valorNuevo.intento` no se pueden atribuir
  inequívocamente a un intento: no se afirma deduplicación retroactiva universal.
- La reserva local evita envíos concurrentes durante la lease. La ausencia de un
  segundo efecto físico tras un ACK perdido depende de que G1 deduplique el mismo
  evento/payload. G8 conserva esa evidencia, pero no ofrece una transacción
  distribuida ni exactamente-un-envío entre G8 y G1.

La recuperación sigue siendo **bajo demanda**, sin worker periódico. Estas
garantías están sustentadas por inspección y pruebas unitarias con fallos y
reinicios simulados; bloqueos, commits y procesos independientes en PostgreSQL QA
siguen pendientes. No se identificó necesidad de modificar el esquema compartido.

## Procedimiento operativo futuro (no ejecutado)

1. Revisar en QA autorizado el tracking G3 y el evento correspondientes, sin usar
   OT históricas reales como fixtures. Confirmar empresa y evidencias.
2. Para un cierre comercial confirmado, un operador autorizado utiliza la ruta
   existente `POST /api/integrations/g3/installations/{trackingG3}/reconcile`.
   En este caso recupera efectos **localmente**, sin nuevo GET/POST hacia G3 y sin
   llamar a `InstallationActivationService.activate()`.
3. Revisar `result.postClosure` de esa respuesta local. Si hay un intento G1 previo
   pendiente, diagnosticarlo y utilizar explícitamente
   `POST /api/integrations/g1/activations/{trackingG1}/retry`, con el rol autorizado.
   Esta acción puede emitir un POST G1 real: requiere autorización del ambiente.
4. Repetir la recuperación local para actualizar un marcador G3 atrasado.
5. Ante ERROR_REQUIERE_REVISION o evidencia histórica insuficiente, detenerse y
   auditar. No editar snapshot, hash, eventId ni relaciones para forzar éxito.

No se incorpora un worker periódico ni se reenvía al arrancar el servidor. La
recuperación durable se dispara mediante duplicado autenticado o reconciliación
autorizada. La pantalla actual oculta «Consultar cierre» después de COMPLETADA;
esta etapa deja la operación disponible por API, sin ampliar el frontend.

Se mantienen guardas y alcance empresarial existentes. El webhook conserva su
respuesta comercial anterior y no expone el descriptor. La respuesta local de
reconciliación de un cierre completo agrega estado de recuperación; el consumidor
actual `G3InstallationStatus` ignora el body del POST y vuelve a cargar el tracking.
No se modifican endpoints ni payloads S2S G1/G2/G3 ni rutas de históricos.

## Antes / después

| Antes | Después |
| --- | --- |
| Fallo de creación G1: solo log | Descriptor transaccional permite recrear el tracking con el payload original |
| Duplicado: retorno temprano | Recuperación de trabajo pendiente sin activación comercial |
| Auditoría sin confirmación durable | Auditoría transaccional independiente con marcador/deduplicación |
| Dos envíos leen pendiente | Reserva condicional por intento y estado |
| Error de auditoría puede contaminar resultado G1 | Confirmación G1 independiente y auditoría recuperable |
| Histórico incompleto | Bloqueo explícito, sin reparación automática |

## Archivos

1. `backend/src/g3-integration/g3-closure.processor.ts`: intención durable y recuperación independiente.
2. `backend/src/g3-integration/post-closure-work.ts`: tipos, validación y proyección pública segura.
3. `backend/src/g3-integration/installation-integration.service.ts`: recuperación local de cierres confirmados, después del control empresarial.
4. `backend/src/g1-integration/g1-activation.service.ts`: snapshot durable, correlaciones, reserva de envío y auditoría independiente.
5. `backend/src/g3-integration/post-closure-recovery.spec.ts`: 34 pruebas de ambos servicios con persistencia simulada y AuditService real.
6. `backend/src/g3-integration/g3-closure.processor.spec.ts`: adaptación de pruebas existentes al trabajo posterior separado.
7. `backend/src/g3-integration/installation-integration.service.spec.ts`: dos regresiones de recuperación local y aislamiento empresarial.
8. `backend/src/g1-integration/g1-activation.service.spec.ts`: mocks de reserva/transacción y dos regresiones de RUT faltante y tracking de empresa ajena.
9. Este documento.

## Pruebas y resultados

38 pruebas nuevas respecto de develop: 32 de la implementación y seis de la
auditoría final, ligadas a dos defectos y cuatro ventanas de fallo. La suite de recuperación cubre éxito, rollback, fallos de
auditoría/creación/envío/marcador, duplicados, reintento explícito, concurrencia
simulada, respuesta tardía, hashes, seis referencias del tracking, cinco relaciones
contractuales, empresa 2, reinicio desde JSON, series ausentes e históricos.
Las pruebas existentes de OT inválida, snapshot G1 alterado, aprobación G3 y
protección de estados financieros se conservan.

| Validación local | Resultado |
| --- | --- |
| `npm --prefix backend test -- g3-integration g1-integration --runInBand --silent` | 351 aprobadas, 15 suites |
| Regresión backend completa | 1.215 aprobadas, 3 fallos históricos, 8 omitidas; 77 suites aprobadas, 3 fallidas, 5 omitidas; 85 descubiertas |
| `npm --prefix frontend test` | 44/44 aprobadas en la implementación anterior; no repetida en esta auditoría sin cambios frontend |
| `npm --prefix backend run build` | Aprobado |
| `npm --prefix backend run lint` | Aprobado |
| `git diff --check` | Aprobado |

Baseline documentado y comprobado antes del cambio: 1.177 aprobadas, mismos tres
fallos y ocho omitidas (`docs/i4-p0-04-reactivacion-g3.md`).
Fallos conservados:

- Billing: dos pruebas de prórroga con fecha fija 10-10-2026 ya vencida; esperan
  BadRequestException y reciben TypeError de los mocks al seguir otro camino.
- Frontera CU-86: espera «Registrar metadata», pero el frontend muestra
  «Registrar documento externo».
- Además, la suite SMTP no inicia por fallo de OpenSSL al crear su fixture TLS
  local; no añade casos ejecutados a los tres fallos anteriores.

Las flags `CRM_INTEGRATION_TESTS=0`, `RUN_DB_INTEGRATION=0` y
`RUN_POSTGRES_INTEGRATION_TESTS=false` se establecieron solo en el proceso de
regresión, sin editar `.env`. Los mocks y pruebas HTTP locales no certifican
PostgreSQL, Railway ni E2E intergrupos.

## Validación PostgreSQL QA pendiente

No ejecutada. Antes de autorizar producción, usar una base aislada aprobada y
cliente G1 simulado, con fixtures QA y conexiones independientes:

1. Confirmar rollback real al fallar inserción del evento antes de commit.
2. Terminar el proceso después del commit comercial y antes del upsert G1;
   reiniciar otro proceso y recuperar por tracking sin payload en memoria.
3. Hacer fallar la segunda auditoría y comprobar que ninguna de las dos queda
   parcialmente confirmada; recuperar y contar una sola pareja de auditorías.
4. Ejecutar dos recuperaciones con conexiones/procesos distintos y verificar
   clave única, bloqueo FOR UPDATE, updateMany condicional y un envío inicial.
5. Interrumpir después de la confirmación G1 y antes del marcador/auditoría;
   verificar recuperación sin nuevo POST y sin degradar COMPLETADA.
6. Vencer una lease en QA y entregar una respuesta tardía del primer trabajador;
   verificar que no sobrescribe el resultado posterior.
7. Comprobar aislamiento de empresas, cliente compartido y rechazo de evidencia
   inconsistente; no usar OT #53 ni modificar históricos.

Son pruebas preparadas como procedimiento, no ejecutadas ni certificadas por los
mocks. No se requiere DDL nuevo: el riesgo pendiente es validar el comportamiento
real de transacciones, JSON, bloqueos y fallos de proceso en el motor existente.

## Operaciones no realizadas

Sin stage, commit, push, PR, merge de publicación ni deploy. Se hizo únicamente
el fast-forward autorizado de develop antes de crear esta rama. Sin Railway,
pagos, proveedores reales, reconciliaciones reales, migraciones, seeds ni cambios
de datos productivos. Sin cambios P0-03/P0-04, schema, credenciales o `.env`.
Se preservaron `-f`, `output/`, respaldos e históricos sin incorporarlos a Git.
