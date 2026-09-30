# Autenticación S2S G1 ↔ G8

## Separación obligatoria de credenciales

|Dirección|Credencial|Uso|
|---|---|---|
|G8 → G1|`G1_API_URL` + `G1_API_KEY`|G8 consume la API de inventario de G1 y envía la key literal en `X-API-KEY`.|
|G1 → G8|Key independiente emitida por G8; G8 guarda solo su SHA-256 en `G8_INTEGRATION_API_KEYS`|Un servicio externo podrá autenticarse en futuros endpoints S2S de G8.|

Una credencial nunca sustituye a la otra. No se generó, cambió, rehasheó ni reveló `G1_API_KEY`.

## Evidencia del contrato saliente G8 → G1

El acuerdo actualizado G8/G1 y el snapshot recibido de G1 describen `X-API-KEY`. El guard observado en `codigo/backend-inventario/src/integraciones/guards/api-key.guard.ts`:

1. lee `x-api-key`;
2. carga `INTEGRACION_API_KEYS` con `key`, `grupo` y `empresas`;
3. compara la key recibida con `k.key === key.trim()`;
4. aplica grupo y empresas.

No se observó un segundo header, DTO, middleware ni comparación de password/hash en ese flujo HTTP. Por tanto, la credencial adicional mencionada por el usuario tiene un propósito no acreditado por el contrato inspeccionado y **no se envía ni se inventa un header para ella**. El adaptador y el smoke existentes conservan exclusivamente `G1_API_KEY → X-API-KEY`.

## Contrato entrante G1 → G8

Los documentos disponibles detallan la activación G8 → G1 y el cierre G3 → G1, pero no definen de forma suficiente un callback G1 → G8: faltan ruta, método, payload, evento, idempotencia y ownership ratificados.

Estado: **BLOQUEADO_CONTRATO_G1_INBOUND**.

No se creó ningún endpoint de negocio ni payload ficticio. Solo se preparó una capa reusable para conectarla cuando exista contrato.

## Infraestructura entrante G8

`IntegrationApiKeyGuard` es independiente del JWT humano. Requiere:

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

La URL pública documentada de G8 es `https://team8-crm-production-3be0.up.railway.app/api`, configurable como `G8_PUBLIC_API_URL`. No está hardcodeada en lógica de negocio y no se modificaron variables Railway.
