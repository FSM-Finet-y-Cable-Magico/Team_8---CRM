# Preparación de integración G1

Estado: IMPLEMENTADO_LOCAL / LISTO_PARA_SMOKE_TEST / PENDIENTE_G1. No PROBADO_G1_REAL.

Fuente revisada: `Team_1-Inventario-y-Bodega-main (1).zip`, recibido en Downloads; SHA-256 `845db003ce625856fc8ba2057c76a2c559c814f48a8f086872d063b3fd0d9f0c`. Se extrajo como referencia fuera del repositorio G8, sin modificar código G1. El snapshot no identifica por sí solo qué commit está desplegado en su servicio.

## Contrato observado

Raíz dentro del snapshot: `codigo/backend-inventario/src/integraciones/`. Evidencia: `integraciones.controller.ts`, `guards/api-key.guard.ts:39`, `integraciones.service.ts:357` (activación), `:1111` (comparación de duplicados), y entidades de activación/asignación.

|Método y ruta|Uso|
|---|---|
|GET `/api/integraciones/tipos-equipo`|Catálogo G8 y smoke obligatorio|
|GET `/api/integraciones/unidades/:numeroSerie`|Consulta G8 y smoke opcional|
|GET `/api/integraciones/equipos`|Consulta por servicio G8 y smoke opcional|
|GET `/api/integraciones/stock`|Smoke opcional; disponibilidad actual|
|POST `/api/integraciones/activaciones`|Evento G8; prueba real no ejecutada|
|POST `/api/integraciones/ordenes/:idOt/cierre`|Cierre técnico; no apropiarse de esta función desde CRM|

URL pública configurada localmente: `https://backend-production-6ada.up.railway.app`. No prueba de disponibilidad/autenticación. El cliente acepta origen HTTPS y un slash final opcional; rechaza rutas como `/api`, varios slash finales, credenciales en URL, query o fragmento. HTTP solo para loopback local. No corrige URLs dudosas silenciosamente. Timeout AbortController y prohibición de redirects protegen las peticiones y credenciales.

G1 lee `INTEGRACION_API_KEYS` como una lista con `key`, `grupo`, `empresas`. Comparación real: `k.key === key.trim()` sobre el header recibido, sin bcrypt. G8 envía `G1_API_KEY` literal en `X-API-KEY`, solo desde backend; no deshashea, rehasea ni ensaya variantes. El smoke rechaza valores vacíos/con espacios exteriores en lugar de transformarlos. Un 401 se informa como `AUTH_CONFIGURATION_MISMATCH` y detiene el smoke.

No había `G1_API_KEY` utilizable en la configuración local inspeccionada; `G1_INTEGRATION_ENABLED=false`. La lectura de `.env.railway` para BD no inspecciona flags del servicio remoto. No se modificaron variables Railway ni se habilitó integración productiva.

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

Se contrastó la unicidad de `integracion_activacion.event_id` y del par `(event_id,id_unidad)` de asignaciones con el contrato global y entidades/comportamiento G1. G1 puede aceptar una activación como `PENDIENTE_CIERRE`; `COMPLETADA` en el tracking G8 significa aceptación del evento, no prueba de asignación física final ni cierre técnico.

## Smoke preparado

Desde la raíz, cargar variables mediante entorno seguro o archivo ignorado (nunca pegar la key en argumentos):

```powershell
node --env-file=backend/.env scripts/smoke-g1-readonly.mjs
```

Requeridas: `G1_API_URL`, `G1_API_KEY`, `G1_SMOKE_COMPANY_ID` autorizada por G1. Opcionales: `G1_SMOKE_SERIAL`, `G1_SMOKE_SERVICE_ID`, `G1_SMOKE_STOCK=1`, `G1_REQUEST_TIMEOUT_MS`. Solo GET; salida con endpoint plantilla, status, duración y resultado saneado. Sin cuerpos de clientes, series, headers ni secretos.

Intento realizado: abortó con `G1_API_KEY_NOT_CONFIGURED` antes de fetch. No es una prueba real de autenticación, conectividad ni respuesta G1.

La revisión adicional del guard G1 confirmó que este flujo HTTP observado solo consume `X-API-KEY`. No se observó segundo header ni validación de password/hash, por lo que no se inventó ni configuró otra variable. Su función queda `PENDIENTE_CONFIRMACION_G1_CREDENCIAL_SECUNDARIA`: G1 debe confirmar si participa en cada request y, si participa, entregar nombre exacto de header/esquema, valor literal o hash, encoding, ejemplo saneado y código/versión de validación. La key entrante que G8 emitirá para G1 es independiente y se documenta en [i3-s2s-auth-g1-g8.md](i3-s2s-auth-g1-g8.md).

`scripts/smoke-g1-activation.mjs` está separado y requiere `ALLOW_G1_ACTIVATION_WRITE=1` antes de cualquier fetch, además del payload explícito `G1_ACTIVATION_PAYLOAD_JSON` y configuración. No se ejecutó POST real. La variable técnica no sustituye aprobación operativa ni coordinación de IDs/series con G1/G3.

CU-61 permanece `PARCIAL_BLOQUEADO_G1_P2`: stock actual no resuelve consumo mensual, costo, variación ni exportación histórica.

## Hallazgo de seguridad

`POTENTIAL_COMMITTED_SECRET_G1`: `docs/13-guia-global-endpoints-4-grupos.md:358` del snapshot, posible credencial de integración `[REDACTED]`. No se reprodujo, copió, utilizó ni rotó. G1 debe verificar si está vigente y, de ser así, revocarla/rotarla por su canal seguro. No se contactó al grupo automáticamente.
