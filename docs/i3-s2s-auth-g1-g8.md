# Autenticación S2S G1 ↔ G8

## Separación obligatoria de credenciales

|Dirección|Credencial|Uso|
|---|---|---|
|G8 → G1|`G1_API_URL` + `G1_API_KEY`|Flujo contractual vigente. G8 consume la API de inventario de G1 y envía la key literal en `X-API-KEY`.|
|G1 → G8|`G8_INTEGRATION_API_KEYS=[]`|G1 confirmó que no consume operaciones G8 en el contrato actual. Solo comprobó el health público.|

Una credencial nunca sustituye a la otra. No se generó, cambió, rehasheó ni reveló `G1_API_KEY`.

## Evidencia del contrato saliente G8 → G1

El acuerdo actualizado G8/G1 y el snapshot recibido de G1 describen `X-API-KEY`. El guard observado en `codigo/backend-inventario/src/integraciones/guards/api-key.guard.ts`:

1. lee `x-api-key`;
2. carga `INTEGRACION_API_KEYS` con `key`, `grupo` y `empresas`;
3. compara la key recibida con `k.key === key.trim()`;
4. aplica grupo y empresas.

G1 confirmó que no existe una segunda credencial HTTP para cada request. El adaptador y los smokes conservan exclusivamente `G1_API_KEY → X-API-KEY`.

## Contrato entrante G1 → G8

G1 confirmó que actualmente no consume endpoints de negocio G8. Estado: `G1_TO_G8_CONNECTIVITY=CONFIRMED_HEALTH` y `G1_TO_G8_BUSINESS_OPERATIONS=NOT_REQUIRED_CURRENT_CONTRACT`.

No se creó `/api/integrations/g1/status`, callback ni payload inbound. La capa reusable preexistente permanece sin ampliar y desactivada con `G8_INTEGRATION_API_KEYS=[]`.

## Infraestructura entrante G8

`IntegrationApiKeyGuard` continúa disponible para un contrato futuro y es independiente del JWT humano. No tiene una ruta G1 activa. Si en el futuro se acuerda una operación inbound, requiere:

- header `X-API-KEY`;
- grupo permitido declarado con `@IntegrationGroups(...)`;
- empresa autorizada, cuando el endpoint declare `@IntegrationCompanyScope(source, field)`;
- una entrada activa coincidente en `G8_INTEGRATION_API_KEYS`.

Formato de configuración, usando exclusivamente hashes y scopes:

```json
[
  {
    "keyId": "identificador-no-secreto",
    "group": "G1",
    "sha256": "64-caracteres-hex-del-sha256",
    "companies": [1],
    "active": true
  }
]
```

La key real debe ser aleatoria y de alta entropía, generarse fuera del repositorio, entregarse una sola vez por un canal seguro y almacenarse como secreto en el consumidor. G8 conserva solo SHA-256. La comparación usa `timingSafeEqual`; el request recibe un principal saneado con `keyId`, grupo y empresas, nunca key/hash.

La rotación se realiza agregando una segunda entrada activa, distribuyendo la nueva key y desactivando la anterior después de confirmar la transición. La configuración admite varias keys activas. `scripts/validate-production-env.mjs` rechaza hashes, IDs, grupos o scopes mal formados y duplicados sin imprimir valores.

Pruebas implementadas: 401 sin key, 401 key inválida y sin filtrarla, 403 grupo no permitido, 403 empresa fuera de scope, 200 autorizado con principal saneado y rotación con key antigua inactiva.

La URL pública documentada de G8 es `https://team8-crm-production-3be0.up.railway.app/api`, configurable como `G8_PUBLIC_API_URL`. G1 confirmó acceso a su health; esto no crea una integración de negocio inbound. No se modificaron variables Railway.

La evidencia real y los pendientes salientes están en [el cierre G8 → G1](i3-g1-real-integration-closure.md).
