# Preparación de integración G1

Estado: `G8_TO_G1_REAL_RAILWAY=PASS`, `G1_RECONCILIATION_LOGIC=PASS`, `FULL_REAL_G3_TO_G1_CROSS_GROUP_E2E=PENDING`. Tipos, unidad, equipos por servicio, activación, idempotencia y asignación activa están confirmados para empresa 1. El flag permanece en `false` hasta probar el cierre con G3 real.

Fuente revisada: `Team_1-Inventario-y-Bodega-main (1).zip`, recibido en Downloads; SHA-256 `845db003ce625856fc8ba2057c76a2c559c814f48a8f086872d063b3fd0d9f0c`. Se extrajo como referencia fuera del repositorio G8, sin modificar código G1. El snapshot no identifica por sí solo qué commit está desplegado en su servicio.

## Contrato observado

Raíz dentro del snapshot: `codigo/backend-inventario/src/integraciones/`. Evidencia: `integraciones.controller.ts`, `guards/api-key.guard.ts:39`, `integraciones.service.ts:357` (activación), `:1111` (comparación de duplicados), y entidades de activación/asignación.

|Método y ruta|Uso|
|---|---|
|GET `/api/integraciones/tipos-equipo`|Catálogo G8 y smoke obligatorio|
|GET `/api/integraciones/unidades/:numeroSerie`|Consulta G8 y smoke opcional|
|GET `/api/integraciones/equipos`|Consulta por servicio G8 y smoke opcional|
|GET `/api/integraciones/stock`|Smoke opcional; disponibilidad actual|
|POST `/api/integraciones/activaciones`|Evento G8; HTTP, idempotencia y conciliación posterior probados con cierre simulado por G1|
|POST `/api/integraciones/ordenes/:idOt/cierre`|Cierre técnico; no apropiarse de esta función desde CRM|

URL pública confirmada: `https://backend-production-6ada.up.railway.app`. Los smokes manuales de tipos de equipo y unidad por serie demostraron disponibilidad, HTTPS, autenticación y scope para empresa 1. El cliente acepta origen HTTPS y un slash final opcional; rechaza rutas como `/api`, varios slash finales, credenciales en URL, query o fragmento. HTTP solo para loopback local. No corrige URLs dudosas silenciosamente. Timeout AbortController y prohibición de redirects protegen las peticiones y credenciales.

G1 lee `INTEGRACION_API_KEYS` como una lista con `key`, `grupo`, `empresas`. Comparación real: `k.key === key.trim()` sobre el header recibido, sin bcrypt. G8 envía `G1_API_KEY` literal en `X-API-KEY`, solo desde backend; no deshashea, rehasea ni ensaya variantes. El smoke rechaza valores vacíos/con espacios exteriores en lugar de transformarlos. Un 401 se informa como `AUTH_CONFIGURATION_MISMATCH` y detiene el smoke.

La API key real fue utilizada por el operador en los smokes manuales y no se copió a Git, fixtures, logs ni documentación. `G1_INTEGRATION_ENABLED=false`. No se modificaron variables Railway ni se habilitó integración productiva.

## OT real, multiunidad y reintentos

- `id_ot` admite un entero positivo PostgreSQL o cadena decimal canónica como `"901"` normalizada a número. Rango 1..2147483647. Fuente: `closure.id_ot` o `tracking.idOtG3`; nunca `codigoOtG3` ni `tracking-{id}`.
- Si falta: tracking `ERROR_G1`, `G1_ID_OT_REQUIRED`, sin llamada G1. La cadena vacía en `idOtG3` representa ausencia, no un identificador inventado. Series faltantes: `PENDIENTE_DATOS_EQUIPO_G1`.
- Series: trim, deduplicación y orden estable. `numero_serie` conserva la primera; `numeros_serie` conserva la lista real. Un solo `event_id` para todo el evento.
- Persistencia de snapshot y hash en la primera creación; un upsert posterior no sobrescribe el evento. Dispatch verifica hash e identificadores y envía el snapshot; no consulta el RUT actual.
- Registros completados no se reenvían. Snapshot histórico ausente: `G1_PAYLOAD_SNAPSHOT_MISSING`; inconsistente: `G1_PAYLOAD_SNAPSHOT_INCONSISTENT`. No se hace backfill especulativo. Eventos originalmente incompletos necesitan corrección revisada antes de poder enviarse.
- La columna JSONB fue aplicada manualmente por el operador y ahora pertenece al [contrato global canónico](../db/global/init-global.sql). La lectura Railway `READ ONLY` posterior confirmó su presencia y el verificador final obtuvo PASS.

Tests puros cubren RUT A al crear, cambio a RUT B antes de retry, envío de RUT A y conservación de event_id/OT/servicio/contrato/series; identificadores inválidos; múltiples unidades; snapshot alterado o ausente; respuestas 401 y URL inválida.

## Diferencias entre premisa y código G1

`mismaActivacion` compara empresa, OT, servicio, contrato y series ordenadas; **no compara RUT, cliente ni trace_id** en este snapshot. Por tanto, no se afirma que cambiar solo el RUT produzca hoy un 409 real de G1. Aun así, conservar todo el evento es necesario para integridad e idempotencia funcional G8. La captura de una carrera SQL `23505` devuelve duplicado sin repetir toda la comparación semántica: queda como revisión del owner G1, sin modificar su repositorio.

Se contrastó la unicidad de `integracion_activacion.event_id` y del par `(event_id,id_unidad)` de asignaciones con el contrato global y entidades/comportamiento G1. G1 puede aceptar una activación como `PENDIENTE_CIERRE`. El tracking G8 solo marca `COMPLETADA` cuando la respuesta confirma todas las asociaciones solicitadas; la asignación física final se comprueba además mediante las lecturas G1.

## Smoke preparado

Desde la raíz, cargar variables mediante entorno seguro o archivo ignorado (nunca pegar la key en argumentos):

```powershell
node --env-file=backend/.env scripts/smoke-g1-readonly.mjs
```

Requeridas: `G1_API_URL`, `G1_API_KEY`, `G1_SMOKE_COMPANY_ID` autorizada por G1. Opcionales: `G1_SMOKE_SERIAL`, `G1_SMOKE_SERVICE_ID`, `G1_SMOKE_STOCK=1`, `G1_REQUEST_TIMEOUT_MS`. Solo GET; salida con endpoint plantilla, status, duración y resultado saneado. Sin cuerpos de clientes, series, headers ni secretos.

Evidencia final: tipos y unidad respondieron dentro del scope. El POST autorizado devolvió `equipos_asociados=0`, estado correcto para `PENDIENTE_CIERRE`, y el retry exacto devolvió `duplicado=true`. G1 simuló después el cierre técnico mediante su webhook. Los GET posteriores confirmaron `QA-ONT-F-0001` instalada y asignada al cliente, servicio, contrato y OT coordinados. `G1_RECONCILIATION_LOGIC=PASS`; el E2E con cierre originado por G3 real continúa pendiente.

G1 confirmó que el flujo usa exclusivamente la API key literal en `X-API-KEY`; no existe una segunda credencial HTTP por request. G1 no consume operaciones G8 en el contrato actual, por lo que `G8_INTEGRATION_API_KEYS=[]` y no se agregó un endpoint inbound. Ver [cierre real G8 → G1](i3-g1-real-integration-closure.md).

`scripts/smoke-g1-activation.mjs` está separado y requiere `ALLOW_G1_ACTIVATION_WRITE=1` antes de cualquier fetch, además del payload explícito `G1_ACTIVATION_PAYLOAD_JSON` y configuración. El POST real fue ejecutado manualmente por el operador con autorización de G1; Codex no lo repitió. El evento usado no debe reutilizarse con un payload distinto.

CU-61 permanece `PARCIAL_BLOQUEADO_G1_P2`: stock actual no resuelve consumo mensual, costo, variación ni exportación histórica.

## Hallazgo de seguridad

`POTENTIAL_COMMITTED_SECRET_G1`: `docs/13-guia-global-endpoints-4-grupos.md:358` del snapshot, posible credencial de integración `[REDACTED]`. No se reprodujo, copió, utilizó ni rotó. G1 debe verificar si está vigente y, de ser así, revocarla/rotarla por su canal seguro. No se contactó al grupo automáticamente.
