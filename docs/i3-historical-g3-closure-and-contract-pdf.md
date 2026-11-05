# Consulta histórica G3 y contratos PDF

Base de trabajo: `develop`, `e56be1f1`. La OT 53, tracking 2, cliente 34,
contrato 22 y servicio 3 de empresa 1 son referencias aportadas por el usuario.
La instalación ya está completada: esta solución no la reconcilia nuevamente.
No se consultó la base compartida ni el endpoint real para desarrollar o probar
el cambio. La disponibilidad concreta de campos de esa OT queda por comprobar
mediante la nueva consulta de lectura; los tests usan respuestas sintéticas.

## Consulta de solo lectura

`GET /api/integrations/g3/services/:idServicio/historical-closure`

- Requiere JWT vigente y roles `VIEW_CORE_DATA`; responde `Cache-Control: no-store`.
- Comprueba primero el acceso a la empresa del servicio. Busca el tracking
  completado del mismo servicio, empresa y contrato; comprueba también cliente,
  fecha de cierre procesado y referencias completas.
- Reutiliza `HttpG3IntegrationClient.getWorkOrderClosure(idOt, idEmpresa)`:
  `GET /api/integraciones/ordenes/:idOt/cierre?id_empresa=N`, autenticado con
  la API key existente exclusivamente desde backend. Conserva el timeout,
  la validación de URL y la compatibilidad wrapper/directa del adaptador.
- Antes de aceptar campos exige coincidencia exacta de `request_id`, `trace_id`,
  `id_empresa`, `id_ot`, `id_contrato`, `id_prospecto` e `id_plan` con el tracking.
  El plan corresponde a la instalación histórica, no a un cambio comercial posterior.
  Los IDs deben ser enteros positivos seguros; solo OT admite también cadena
  decimal, tal como el contrato existente. No completa referencias omitidas por G3.
- `estado` puede faltar en el cierre; si aparece debe ser `COMPLETADA`.
- No usa `detail()`, `reconcile()`, el procesador de cierres, activación G1,
  transacciones de escritura ni registros de auditoría/eventos. No actualiza
  `fechaUltimaSincronizacion`, errores ni datos técnicos del servicio.

La respuesta interna G8 distingue `DISPONIBLE`, `NO_VALIDADO` y `NO_DISPONIBLE`;
siempre incluye `fuente=G3_CONSULTA_TEMPORAL`, `persistido=false` y `consultadoEn`.
Los errores remotos se traducen a un mensaje fijo sin payloads ni secretos.
Errores de autorización G8 siguen siendo errores de acceso, no resultados remotos.

## Campos recuperables si G3 los entrega

| Campo G3 | Presentación temporal | Validación |
| --- | --- | --- |
| `fecha_completada` | Fecha real de finalización | ISO 8601 válido con hora y zona explícita |
| `id_tecnico` | Identificador externo del técnico G3 | Entero positivo seguro; no se busca un usuario G8 |
| `potencia_optica_dbm` | Potencia óptica en dBm | Número finito; cero también es válido |
| `resultado_llamada` | Resultado de llamada | Texto no vacío, hasta 200 caracteres, sin controles |
| `resuelto_remotamente` | Sí / No | Booleano; `false` se conserva |
| `materiales` | Cantidad de registros en el cierre | Array; no se expone su contenido arbitrario |
| `equipos_instalados` | Cantidad de registros en el cierre | Array; no representa inventario físico confirmado |

Campos ausentes o inválidos quedan `null` y se muestran como no informados. Una
lista vacía equivale a cero registros informados; no se inventan equipos.
No se obtiene MAC, puerto OLT ni nombre de técnico de campos no contratados.
La fecha de procesamiento G8 y `fecha_creacion` nunca sustituyen a `fecha_completada`.

En **Gestionar servicio**, la información guardada en G8 conserva su sección.
El botón **Consultar datos históricos G3** presenta los datos temporales aparte.
Cambiar de servicio o cerrar el panel cancela la espera y descarta respuestas
tardías. G1 sigue siendo la única fuente de la sección de equipos físicos.
Un error/incompletitud de G3 no altera la instalación confirmada ni los datos G8.

## PDF

`ContractsService.renderDigitalContract()` imprime etiquetas en español y una
selección explícita de datos comerciales. Valida forma, longitud y tipo de los
valores; no serializa JSON. Incluye fecha real, potencia, MAC y puerto OLT únicamente
si ya están guardados y tienen formato válido. No consulta G3/G1 al generar.
Las fechas del PDF se presentan en horario de Chile.

No imprime IDs internos, referencias de integración, payloads, nombres de técnico
deducidos ni equipos de inventario local. Los datos de persona admiten el prospecto
cuando aún no existe cliente. Texto y direcciones se ajustan al ancho; las filas,
bloques de servicio y notas finales se mantienen juntos al paginar.

La generación sigue creando la siguiente versión, archivo y SHA-256. Descargar una
versión existente devuelve su archivo original: no la regenera ni la modifica.
Una consulta temporal G3 no cambia PDFs previos ni agrega sus valores a PDFs nuevos.

## Validación reproducible en Docker, sin base ni tráfico real

Desde la raíz del repositorio, construir imágenes de prueba (solo dependencias de
paquetes durante el build). No usar un contenedor de backend que arranque la app
contra Railway para esta prueba: `PlanChangeProcessor` procesa cambios pendientes
al iniciar; la aplicación completa no constituye un modo general de solo lectura.

```powershell
docker build --target build -t finet-crm-history-backend-qa ./backend
docker run --rm --network none --entrypoint npm finet-crm-history-backend-qa test -- --runInBand g3-integration contracts-pdf.spec.ts contracts.service.spec.ts services.service.spec.ts
docker build --target build -t finet-crm-history-frontend-qa ./frontend
docker run --rm --network none --entrypoint npm finet-crm-history-frontend-qa test
```

Estas ejecuciones no arrancan Nest ni PostgreSQL: Prisma, G3/G1 y operaciones de
archivo de generación/descarga están simulados. Las pruebas PDF sí producen y
examinan bytes PDF reales en memoria. No requieren `.env`, credenciales reales,
migraciones ni seeds. Comandos preparados; no se ejecutó Docker durante el cambio.

Para una revisión visual con la aplicación completa, usar un entorno Docker QA ya
preparado con base aislada y un stub G3, nunca la DB compartida. Usar la configuración
QA existente, sin editar credenciales productivas. Con un servicio completado QA:

1. Abrir **Gestionar servicio**: los datos persistidos se muestran antes de consultar.
2. Pulsar el botón histórico. Revisar la fecha, ID externo del técnico, potencia,
   origen y marca de no persistido. Comprobar en el stub que solo llegó GET con
   `id_empresa` correcto y autenticación, nunca POST.
3. Repetir con referencias incompletas/otra empresa, campos opcionales ausentes,
   respuesta 404 y timeout. El estado completado y los datos guardados no cambian.
4. Cambiar rápidamente de servicio/cerrar el modal durante una consulta lenta:
   no debe aparecer la respuesta del servicio anterior.
5. Solo en QA, generar una nueva versión PDF con datos sintéticos y descargarla.
   Revisar etiquetas, ausencia de JSON/IDs y direcciones largas/múltiples servicios.
   Descargar una versión previa y comparar su SHA-256 con el anterior.

Una posterior comprobación de la OT 53 debe limitarse al nuevo GET autenticado para
`/api/integrations/g3/services/3/historical-closure` en un backend autorizado con el
cambio instalado. No invocar retry, reconcile, webhooks ni crear otra OT. Registrar
únicamente campos permitidos y el resultado de validación, nunca keys o payloads.
La generación de PDF es una escritura: no forma parte de esa comprobación histórica
de solo lectura. El caso real no se da por validado mediante fixtures.

## Futura sincronización persistente (evaluación, no implementada)

Requeriría autorización y un procedimiento separado: obtener el cierre fuera de
la transacción; validar las mismas siete referencias; preparar un diff solo de
campos técnicos permitidos; bloquear/releer el servicio completado en una transacción
corta; completar únicamente ausencias, dejando conflictos para revisión. Debe
registrar origen, fecha de consulta, actor y valores antes/después, con una identidad
idempotente por empresa, tracking y versión/hash del contenido técnico validado.
Un segundo intento idéntico sería un no-op auditable, sin reprocesar eventos G3 ni
disparar G1, cambios comerciales o PDFs. No reutilizar el hash de creación de la
instalación para esa finalidad. El diseño de almacenamiento/auditoría requiere su
propia revisión; esta entrega no agrega tablas, migraciones ni scripts de backfill.

## Archivos de esta entrega

- `backend/src/g3-integration/installation-integration.service.ts`
- `backend/src/g3-integration/g3-integration.controller.ts`
- `backend/src/g3-integration/g3-historical-closure.ts` (nuevo)
- `backend/src/g3-integration/g3-historical-closure.spec.ts` (nuevo)
- `backend/src/g3-integration/g3-integration.controller.spec.ts`
- `backend/src/g3-integration/http-g3-integration.client.spec.ts`
- `backend/src/contracts/contracts.service.ts`
- `backend/src/contracts/contracts-pdf.spec.ts` (nuevo)
- `frontend/src/api.ts`
- `frontend/src/features/customers/CustomerServiceManagementModal.tsx`
- `frontend/src/features/customers/HistoricalG3Closure.tsx` (nuevo)
- `frontend/tests/g3-historical-closure.test.mjs` (nuevo)
- Este documento (nuevo).

## Validación local realizada el 2026-10-08

- Backend: 13 suites, 161 tests correctos (`g3-integration`, `contracts-pdf`,
  `contracts.service`, `services.service`). Tras el ajuste visual de bloques, se
  repitieron los cinco tests de PDF: correctos.
- Frontend: 33 tests correctos, incluyendo cancelación/descarte de respuestas tardías.
- Backend y frontend build: correctos.
- Backend lint: correcto. Frontend lint: cero errores y 78 advertencias en archivos
  preexistentes no modificados; build advierte por un bundle mayor a 500 kB.
- PDFs sintéticos renderizados con PyMuPDF: una página normal y cuatro con ocho
  servicios/direcciones extensas; todas las páginas inspeccionadas visualmente,
  sin texto fuera de límites ni bloques de servicio/notas cortados.
- `git diff --check`: correcto. Sin ejecución Docker, acceso a la DB compartida,
  solicitudes reales G1/G3, migraciones, seeds, commits ni push.
