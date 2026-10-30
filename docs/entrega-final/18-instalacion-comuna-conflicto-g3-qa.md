# P0-07A — Comuna de instalación y conflicto de consulta G3

> Consolidación 29-10-2026: este documento conserva resultados y sesiones históricas. El estado de publicación vigente está en [19](19-consolidacion-publicacion-p0-07.md). Las sesiones con TTL vencido no deben reutilizarse. Las referencias a `evidencias-qa/` corresponden a archivos locales preservados, excluidos de este PR; el resumen automatizado publicable está en [validación](p0-07-validacion-publicacion.json). La distribución académica y la certificación productiva siguen separadas de esta PR.

Fecha: 28-10-2026. Rama: `docs/i4-p0-07-cierre-entrega`.
HEAD: `a8d2598151c988ef8f4f4a09977fe36167d79f62`, con cambios locales conservados.

**Resultado técnico: QA_PASS (HTTP + PostgreSQL 18 local).**
La aceptación visual D06–D08 y el E2E con proveedores reales siguen pendientes.
No se certifica producción ni se atribuyen las pruebas simuladas a G1/G3 reales.

## 1. Causas confirmadas y alcance de la evidencia

Sesión diagnosticada: `71c013a4-2f40-4cbf-8267-51e6897b5f88`.

| Caso original | Evidencia de lectura | Diagnóstico |
|---|---|---|
| Prospecto 2 / contrato 4 | Contrato Firmado; prospecto sin comuna ni región; contrato sin comunaInstalacion ni ciudadInstalacion | La comuna era opcional en el registro y no había un complemento autorizado visible después de firmar. La validación G3 rechazó antes de crear tracking. |
| Prospecto 3 / contrato 5 / tracking 2 / OT 9700002 | Prospecto con comuna; contrato sin comunaInstalacion. POST instalación 201; tracking ENVIADA; orden simulada pendiente | El payload pudo usar la comuna del prospecto, conforme al fallback existente. No era un problema de prospecto no precargado. |
| Consulta de cierre | `GET /api/integraciones/ordenes/9700002/cierre?id_empresa=1` al simulador | El simulador devuelve 409 mientras no exista cierre. Este GET no crea una solicitud ni compara un request_id nuevo. |
| HTTP 500 al navegador | `POST /api/integrations/g3/installations/2/reconcile` | El cliente HTTP clasificaba cualquier 409 como conflicto de request_id. `reconcile` relanzaba `G3IntegrationError`, que no es una HttpException; Nest respondía 500. |
| Consulta de detalle | `GET /api/integrations/g3/installations/2` | Respondió 200, no 500. |

Las rutas/status están en el acta original y en
[diagnóstico sanitizado](evidencias-qa/installation-diagnosis-71c013a4.json).
La lectura de `/prospects` no devolvió los casos firmados; se consultó después
`/prospects/pending-activation`, y se guardaron solo IDs y presencia de campos en
[contratos originales](evidencias-qa/installation-contracts-71c013a4.json).
El log privado del backend confirmó la excepción en `HttpG3IntegrationClient.request`
y `InstallationIntegrationService.reconcile`; no se copió su contenido completo.

No se encontró evidencia de una colisión real de POST en esta incidencia. Cada
contrato nuevo genera UUID independientes. Los reintentos utilizan el snapshot
persistido y verifican su hash. En la sesión original la API deliberadamente no
expone el snapshot/hash: no se afirma haber leído directamente esas columnas allí.
Su correspondencia completa se comprobó en PostgreSQL QA nuevo, abajo.

**Estado de la OT original:** la última lectura confirmó PENDIENTE en el simulador,
ENVIADA en G8, sin cliente/servicio asociado al tracking 2: coherente con ausencia
de cierre. No se cerró ni se reparó manualmente. La sesión expiró por su TTL
preexistente a las **16:55:35 Chile**, con `cleanup=true`; esa base temporal ya no
existe. No confundir sus IDs con IDs iguales de otros runs.

## 2. Corrección de datos faltantes sin cambiar lo firmado

Se añaden dos operaciones internas G8 con JWT, no endpoints S2S:

- `POST /api/integrations/g3/installation-requirements`: consulta sin escrituras
  ni tráfico G3, con las validaciones de empresa/contrato/plan/cliente/factibilidad
  e identidad existentes. Informa si falta comuna y si el rol puede completarla.
- `PATCH /api/integrations/g3/contracts/:id/installation-data`: acepta únicamente
  `comuna` y `confirmarMismaDireccion=true`. Solo Administrador/Comercial.

La operación exige que la comuna efectiva esté ausente; no reemplaza valores
existentes. Se bloquea si hay tracking para el prospecto o contratos adicionales
que hagan ambigua la modificación. No modifica contrato, dirección, coordenadas,
región, ciudad, plan, empresa, clasificación, factibilidad, documentos ni firma.
Actualiza únicamente `Prospecto.comuna`, que el payload G3 ya admitía como fallback.
Se requiere confirmación humana de la misma dirección, nunca inferencia del mapa.

Comparte el advisory lock transaccional por contrato con `requestInstallation` y
bloquea la fila del prospecto, como `contractPlan`. Relee y valida antes de escribir.
La auditoría `COMPLETAR_COMUNA_INSTALACION` se guarda en la misma transacción;
un fallo se propaga para impedir una corrección sin auditoría.

`PATCH /prospects/:id/location` conservaba permisos por empresa, pero no tenía
bloqueo por contratación: podía alterar datos de ubicación después de firmar.
Ahora bloquea si existe cualquier contrato, bajo el mismo lock de prospecto que
la contratación. Antes de contratar conserva la edición y registra la auditoría
en su misma transacción. No se habilita una edición general de direcciones firmadas.
Un cambio de dirección requiere el procedimiento contractual y las aprobaciones
o firmas correspondientes; esta corrección no implementa ni omite ese procedimiento.

**Contrato original #4:** su situación permite continuar de forma autorizada con
el complemento de comuna verificada, sin regenerar PDF ni firma, siempre que se
trate de la misma dirección y se mantengan los demás requisitos. No se ejecutó
ese complemento sobre el original. Su base QA expiró; la nueva sesión usa casos
distintos, preparados por los flujos normales, sin restaurar IDs o relaciones.

### Campos por etapa

| Etapa | Validación pertinente |
|---|---|
| Registro | Conserva los validadores vigentes; comuna/región opcionales. El mapa no las infiere. |
| Factibilidad/cotización | Ubicación y cobertura comercial real del plan; correo para cotizar. Nominatim no es autoridad de cobertura. |
| Contratación/firma | Plan de empresa autorizado y cotización válida; documento/firma según flujo existente. No se reescribe un documento firmado. |
| Solicitud G3 | Contrato Firmado/Activo, referencias empresariales consistentes, factibilidad del plan, RUT/nombre, móvil chileno normalizable, dirección y comuna. |
| Región/ciudad | `region` es metadato del prospecto; `ciudadInstalacion` pertenece al contrato. No son requisitos ni se agregan al payload actual de `buildPayload`. No se confunden entre sí. |

La tarjeta de instalación muestra los requisitos antes del envío, bloquea el botón
si falla el preflight y ofrece completar la comuna solo al rol autorizado. Informa
que el PDF firmado no cambia; Soporte debe solicitar la corrección a Comercial.

## 3. HTTP 409, estado pendiente e inventario simulado

- POST 409 conserva `G3_REQUEST_ID_CONFLICTO`, sin regenerar UUID ni aceptar otro
  payload. Se mantiene el rechazo definitivo del envío incompatible.
- GET 409 se clasifica como `G3_CONFLICTO_CONSULTA`, sin inventar una causa de
  idempotencia. No se interpreta automáticamente como pendiente.
- Ante ese conflicto durante conciliación, G8 consulta el detalle y exige empresa,
  OT, request_id y trace_id coincidentes, más un estado pendiente conocido. Solo
  entonces responde `available=false`, sin activación ni cambios del snapshot.
- Si no hay esa evidencia, conserva el error sanitizado y responde mediante
  HttpException con el status correspondiente, evitando un 500 accidental por
  relanzar un Error ordinario. No se expone el body externo.
- La UI indica que aún no existe cierre confirmado. No se modificaron los endpoints,
  payloads, validadores de cierre ni acuerdos de los proveedores.
- El simulador registra también el status HTTP. Mantiene 409 para cierre pendiente
  y 409 para POST incompatible, lo que permite probar que G8 los distingue.
- Se corrigió una limitación adicional del simulador G1: elegía la primera
  activación de la empresa al consultar equipos. Ahora consulta por servicio o
  serie; dos OT de la misma empresa tienen unidades QA distintas. Ningún cambio
  se hizo al cliente productivo G1 ni a su contrato S2S.

## 4. Validación reproducible y resultados

Desde la raíz del checkout (dependencias instaladas y PostgreSQL 18 local):

```powershell
npm --prefix backend test -- g3-integration g1-integration prospects.service.spec.ts prospects-quote-flow.spec.ts contracts-pdf.spec.ts --runInBand --silent
npm --prefix frontend test -- --run
npm --prefix backend run build
npm --prefix frontend run build
npm --prefix backend run lint
npm --prefix frontend run lint
node --test scripts/p0-07-demo-qa.test.cjs
node scripts/p0-07-demo-qa.cjs --installation-flow
git diff --check
```

| Validación | Resultado real |
|---|---|
| Backend dirigido G1/G3/prospectos/PDF | 429 pruebas, 18 suites PASS |
| Frontend completo | 54/54 PASS |
| Guardas y simulador QA | 3/3 PASS |
| Build backend / frontend | PASS / PASS; aviso Vite de tamaño de chunk |
| Lint backend / frontend | Sin errores / sin errores, 78 advertencias preexistentes |
| git diff --check | PASS; stage vacío |
| Regresión PostgreSQL final | 10/10 PASS, cleanup confirmado |

No se ejecutó la suite backend completa en esta ronda; el resultado anterior es
regresión dirigida. El sandbox impidió inicialmente iniciar PostgreSQL y leer
vite.config.ts con esbuild: se repitieron esas operaciones locales con el permiso
correspondiente. No son fallos funcionales ni accesos a sistemas externos.

Acta final:
[run-b63247d9](evidencias-qa/run-b63247d9-cbd3-4ab2-8fc4-0ffd6e06763d.json).
Una ejecución previa detectó el permiso de complemento demasiado amplio para
Soporte; se corrigió antes de esta ejecución. Se conserva el acta fallida
`run-51f3d716-c058-486b-b144-38274d45573b.json`, sin ocultarla.
Los runs `c7237b51-d465-49c8-a2eb-8670f06f2b93` y
`371a9da9-9ff4-44fb-a918-2b60e2d4c086` también aprobaron 10 casos. El final
comprueba hashes canónicos, bloqueo final de ubicación y unidades simuladas
distintas tanto por serie como por identificador.

| Caso | Resultado |
|---|---|
| 1. Comuna presente | Instalación aceptada, 201 y OT propia |
| 2. Comuna ausente | 400 claro; cero tracking para ese contrato |
| 3. Complemento autorizado | Una auditoría; solo cambia comuna del prospecto; contrato/cotizaciones intactos; otra empresa/Soporte rechazados |
| 4. Dos prospectos | Dos tracking/OT, request_id y trace_id diferentes; referencias y hash canónico verificados contra DB/simulador |
| 5. Repetición/retry | Solicitud repetida no reenvía; retry idéntico conserva snapshot/hash y reutiliza OT |
| 6. Mismo ID, otro payload | 409; orden y payload originales intactos |
| 7. Pendiente | Detalle 200; cierre remoto 409; conciliación G8 201 con available=false, sin 500 ni servicio |
| 8. Cierre simulado | Dos activaciones; dos eventos, referencias consistentes |
| 9. G1 simulado | Dos tracking COMPLETADA; empresa/cliente/contrato/servicio coincidentes; unidades distintas |
| 10. Recuperación y conflicto | Retry cierre/reconciliación sin duplicados; cierre incompatible 409; snapshots y estados confirmados preservados |

Al final del run: 3 clientes (incluye el compartido inicial), 4 servicios (incluye
2 iniciales), 2 eventos de cierre y 2 efectos G1. Cada base se creó vacía y exclusiva
con identidad/directorio/puerto/rol/marker comprobados antes del DDL sintético;
no se aceptaron URLs DB externas ni `.env` heredados. El harness se eliminó a sí
mismo al terminar la regresión; no tocó bases existentes.

`snapshotSha256` del acta usa JSON.stringify para evidenciar inmutabilidad del
objeto leído; `storedPayloadHash` usa el algoritmo canónico G8 (claves ordenadas).
No deben compararse entre sí como si fueran el mismo algoritmo. Se comprobó
explícitamente `installationSnapshot()` y la igualdad del objeto recibido por G3.

## 5. Archivos de esta corrección y preservación

Código y pruebas nuevos/modificados en esta intervención:

- `backend/src/g3-integration/g3-integration.controller.ts`
- `backend/src/g3-integration/g3-integration.dto.ts`
- `backend/src/g3-integration/http-g3-integration.client.ts` y `.spec.ts`
- `backend/src/g3-integration/installation-integration.service.ts` y `.spec.ts`
- `backend/src/prospects/prospects.service.ts`
- `backend/src/prospects/prospects-quote-flow.spec.ts` (ya existía sin seguimiento)
- `frontend/src/features/installations/G3InstallationStatus.tsx`
- `frontend/tests/g3-installation-data.test.mjs`
- `scripts/p0-07-demo-qa.cjs`, `scripts/p0-07-qa-providers.cjs`
- `scripts/p0-07-installation-flow-qa.cjs`
- Este informe, continuidad, bitácora y nuevas evidencias sanitizadas.

Los demás cambios de PDF/mapa/cotización/contratación ya estaban presentes. Se
conservaron. Los hashes de las dos fuentes PDF coinciden con el inicio y los 24
artefactos de los cuatro manifiestos anteriores se verificaron sin diferencias.
`-f`, `output/` y respaldos quedaron fuera del stage, sin borrados.

Sin schema, migraciones productivas, seeds externos, Railway, proveedores reales,
pagos reales, commit, push, merge ni deploy. Los resultados no certifican la
idempotencia o disponibilidad del proveedor real; sí el comportamiento de G8 ante
el simulador HTTP y PostgreSQL QA utilizados.

## 6. Retomar D06–D08

La nueva sesión se prepara con `node scripts/p0-07-demo-qa.cjs --installation-ready`.
Solo crea fixtures sintéticos y dos contratos firmados por los endpoints normales.
No crea tracking ni aprueba cierres durante esa preparación. URL, run y expiración
se registran a continuación; las credenciales aleatorias quedan exclusivamente
en el archivo privado temporal, fuera de Git.

1. Entrar como Comercial FiNet. En Pendientes de activación, elegir el contrato
   sintético sin comuna. Completar **Santiago**, que es el dato explícito de la
   fixture (no una deducción del mapa), confirmar la misma dirección y guardar.
2. **D06:** solicitar instalación, anotar tracking/OT del run actual, consultar
   detalle y cierre pendiente. Crear la del segundo contrato y comprobar que
   tiene otra OT. Capturar ambas; no reutilizar identificadores de otro run.
3. **D07:** el operador usa el control autenticado del simulador local para la OT
   recién observada. Por ejemplo, `node scripts/p0-07-qa-http-check.cjs <archivo-privado-actual> --approve <OT-actual>`.
   El control emite el webhook válido; no modifica directamente estados ni IDs.
   El mismo comando repetido prueba el cierre idempotente. La regresión automatizada
   ya conserva el caso conflictivo; no es necesario repetirlo durante la demo.
4. **D08:** refrescar Clientes/Gestionar servicio y seguimiento G1. Verificar empresa,
   contrato, servicio, estado COMPLETADA y unidad QA propia. No inventar datos
   técnicos no informados. Guardar capturas nuevas con run/IDs/rol.

Mantener separado **preparación HTTP**, **pruebas automatizadas PASS** y **capturas
visuales pendientes**. No registrar contraseñas/tokens en bitácora o capturas.

### Sesión lista para el operador

- Run vigente: `44810c0b-7d6c-4b3d-90b1-63d44ebecbdb`.
- URL: **http://127.0.0.1:59525**.
- Expira: **28-10-2026, 22:29:50 Chile** (`2026-10-29T01:29:50.013Z`).
- Empresa FiNet: 1. Contrato **3**, prospecto **1**: comuna faltante.
- Contrato **4**, prospecto **2**: comuna Santiago ya informada en el prospecto.
- Inicialmente: cero tracking G3 y cero OT. Ambos contratos están firmados.
- Archivo privado local de acceso (no versionar ni publicar):
  `<archivo-privado-del-run-QA-actual>`.
  La cuenta `finet` usa credenciales sintéticas aleatorias contenidas allí.
- Snapshot de preparación, sin credenciales:
  [installation-manual-ready](evidencias-qa/installation-manual-ready-44810c0b.json).

Ejemplo de cierre, **solo después de observar la OT creada en esta sesión**:

```powershell
node scripts/p0-07-qa-http-check.cjs "<archivo-privado-del-run-QA-actual>" --approve <OT-observada>
```

El contrato 4 y una eventual OT 9700002 de este run no son los registros de la
sesión original. No se clonaron ni reasignaron identidades para aparentar continuidad.

La preparación intermedia `700dfa69` en puerto 61119 se conserva con su TTL;
no se modificó su DB. Se reemplaza como recomendación por la sesión 44810c0b,
que incorpora también el identificador de unidad exclusivo del simulador G1.
Usar únicamente la URL 59525 para las capturas de esta corrección.
