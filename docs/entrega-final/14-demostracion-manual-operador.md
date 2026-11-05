# P0-07A — Demostración manual, sin control automatizado del navegador

> Consolidación 29-10-2026: este documento conserva resultados y sesiones históricas. El estado de publicación vigente está en [19](19-consolidacion-publicacion-p0-07.md). Las sesiones con TTL vencido no deben reutilizarse. Las referencias a `evidencias-qa/` corresponden a archivos locales preservados, excluidos de este PR; el resumen automatizado publicable está en [validación](p0-07-validacion-publicacion.json). La distribución académica y la certificación productiva siguen separadas de esta PR.

Estado: **PREPARADO; D01–D15 NOT_EXECUTED visualmente en esta ronda**.
Complementa [03-guion-demostracion.md](03-guion-demostracion.md), sin sustituir su
evidencia histórica. No se volvió a controlar Opera ni se eludió su restricción.

## Sesión local comprobada el 27-10-2026

- URL CRM: **http://127.0.0.1:59557**.
- Run: `3dc0ff81-26f5-4c57-a9ea-bb9c063d324a`.
- Expiración automática prevista: **27-10-2026 12:30:38 America/Santiago**
  (`15:30:38Z`). Después hay que iniciar otra sesión y consultar su nueva URL.
- Health 200; readiness: application UP, database UP, global_schema READY,
  missing_columns=0 y different_columns=0. Esto no certifica el render del navegador.
- Backend loopback 59556; simuladores loopback 59555; PostgreSQL QA loopback 59548.
- Estado inicial: 1 cliente compartido, 2 servicios, 0 eventos G3 y 0 pagos.
  No se ejecutó automáticamente el recorrido HTTP completo sobre esta sesión.
- Identidad y hashes: [acta JSON de sesión](evidencias-qa/run-3dc0ff81-26f5-4c57-a9ea-bb9c063d324a.json).
  El acta se actualiza durante el recorrido y al cerrar; `cleanup=false` significa
  que esta sesión manual se mantiene activa, no que las pruebas PDF sigan abiertas.

## Inicio reproducible y comprobación de aislamiento

Desde `C:\Users\Manguera\CRM Finet proyect\Team_8---CRM`, con Node/dependencias
instalados, PostgreSQL 18 local y los builds disponibles:

```powershell
# Solo si se necesita reconstruir artefactos locales:
npm.cmd --prefix backend run build
npm.cmd --prefix frontend run build
# Una sola orden inicia cluster nuevo, fixtures, simuladores, backend y frontend:
node scripts/p0-07-demo-qa.cjs
```

Mantener esa consola abierta. Usar únicamente `origin` y `privatePath` del mensaje
`QA_READY`, nunca asumir puertos estables. Cada inicio genera base, contraseñas y
puertos nuevos; no reanuda registros de una sesión eliminada.

Se reutilizan los seis scripts QA de P0-07A. Se comprueban marcador de propiedad,
base/rol/puerto y cero tablas antes del DDL local. Solo se carga el canónico en ese
cluster nuevo; no se ejecutan migraciones ni se usa una DB existente. Backend
arranca en carpeta temporal con entorno limpio, proveedores reales deshabilitados,
G1/G3 simulados y guard de red que permite exclusivamente los puertos QA locales.
Frontend usa proxy del mismo origen y CSP que bloquea recursos remotos. No se
modificó el firewall del sistema: el aislamiento no pretende ser una sandbox del SO.

En otra PowerShell, para la sesión actualmente preparada:

```powershell
$qaPrivateFile = '<archivo-privado-del-run-QA-actual>'
node scripts/p0-07-qa-http-check.cjs $qaPrivateFile --status
```

Confirmar run, origen `127.0.0.1`, health 200, READY y las empresas sintéticas antes
de operar. Si no coincide, detener el recorrido; no reemplazar conexiones por `.env`
real. Este comando consulta estado y no inicia sesión ni ejecuta pagos.
**No invocar `p0-07-qa-http-check.cjs` sin una opción en esta sesión manual:**
su modo por defecto ejecuta el recorrido HTTP completo y modificaría los fixtures.

## Cuentas: contraseñas privadas, nunca en capturas

| Alias | Correo QA | Rol / ámbito |
|---|---|---|
| admin | qa-admin@example.invalid | Administrador; consolidado |
| finet | qa-finet@example.invalid | Comercial; empresa 1 |
| cable | qa-cable@example.invalid | Comercial; empresa 2 |
| soporte | qa-soporte@example.invalid | Soporte; empresa 1 |

Copiar una contraseña al portapapeles sin imprimirla; cambiar solo el alias:

```powershell
$qaSession = Get-Content -LiteralPath $qaPrivateFile -Raw | ConvertFrom-Json
($qaSession.accounts | Where-Object alias -eq 'admin').password | Set-Clipboard
```

Pegar solo en el formulario de esta URL local. No guardar en el navegador ni
capturar el portapapeles, el archivo privado, tokens o cabeceras. Después borrar
el portapapeles con `Set-Clipboard -Value ''`. Cerrar sesión antes de cambiar rol.
El archivo privado no se incluye en el repositorio ni en evidencias publicables.

## Recorrido D01–D15 y capturas del operador

Ejecutar en orden. Los nombres de acciones se comprobaron en el código del
frontend, pero no se han pulsado ni verificado visualmente en esta ronda. Si una
acción no aparece, registrar el bloqueo; no fabricar estados mediante SQL.

| Paso | Acciones manuales / criterio esperado | Captura pendiente |
|---|---|---|
| D01 | Abrir URL; probar una contraseña incorrecta de QA, después entrar como admin. Comprobar error y sesión autorizada sin mostrar contraseña. | CAP-01: error y pantalla inicial |
| D02 | Revisar empresas/roles como admin; cerrar sesión y entrar como finet. Verificar empresa 1 y ausencia de operaciones exclusivas de empresa 2. | CAP-02: ámbitos visibles |
| D03 | Como finet crear prospecto `99000001-8`, nombre `Prospecto QA FiNet`, correo `prospect-qa@example.invalid`, teléfono `+56900000001`, dirección `Calle sintetica QA 101`, Santiago. Elegir plan QA 1; coordenadas -33.475 / -70.675 y «Ubicar punto». Como cable crear otro `99000002-6` con correo `outside-qa@example.invalid`, teléfono `+56900000002`, punto -35 / -72 y plan QA 2: contratación bloqueada por cobertura. | CAP-03: cobertura comercial y rechazo exterior |
| D04 | Sobre el prospecto FiNet, «Generar cotización», descargar y abrir el PDF; luego «Confirmar contratación» con día 10 y ciudad/comuna Santiago. Anotar ID real del contrato nuevo. Esperar pendiente de firma, sin envío de correo real. | CAP-04: cotización legible y estado |
| D05 | Como admin, Clientes → «Gestionar» contratación → contrato/plan; «Confirmar firma de contrato» con observación sintética. «Generar PDF», «Descargar PDF», abrir; «Generar nueva versión» y descargar también la anterior. Revisar precio, etiquetas, saltos, márgenes y ausencia de JSON/metadatos indebidos. | CAP-05: PDF abierto y lista de versiones |
| D06 | En pestaña Instalación, «Solicitar instalación a G3». «Ver detalle» para empresa y OT; anotar tracking/OT desde --status. «Reintentar envío» solo aparece para FALLIDA_REINTENTABLE: no inventar ese estado. Retry exitoso previo tiene prueba HTTP histórica; si no es accesible en pantalla dejar ese subcaso no ejecutado. | CAP-06: tracking y OT simulada |
| D07 | Ejecutar control local approve indicado abajo, refrescar seguimiento; repetir approve idéntico y luego conflict. Debe quedar una activación, duplicate=true en el retry y 409 ante payload incompatible. La consola es evidencia de simulador, la pantalla de CRM es evidencia visual separada. | CAP-07: COMPLETADA y conteos saneados |
| D08 | Gestionar servicio nuevo y consultar seguimiento G1; verificar identificación de fuentes. El cierre mínimo simulado no aporta MAC, puerto OLT ni técnico: no completar datos inventados. | CAP-08: servicio y fuente técnica |
| D09 | Consultar cliente compartido 1 como finet, cable y admin: contratos 1/2 respectivamente y ambos para admin. Servicios 1/2; identidad compartida y estado global Moroso conservados. | CAP-09: tres consultas con roles |
| D10 | Como finet, Facturas y pagos → factura 1 → Registrar pago, medio Efectivo: 5.000, referencia QA-MANUAL-F-PARCIAL; luego 14.990, referencia QA-MANUAL-F-FINAL. Saldos 14.990 y 0; factura Cable 2 conserva 7.000 antes de D11. Intentar el mismo pago solo si la UI lo permite, sin cambiar la referencia; no duplicarlo con otra referencia. El 409 de replay es evidencia HTTP previa hasta comprobarlo otra vez. | CAP-10: saldos, comprobante y deuda de otra empresa |
| D11 | Solo después de D07/D10: crear factura QA de 1.000 para el contrato nuevo con el control local indicado abajo. Como admin en Libro Control/finanzas usar «Suspender por no pago», luego pagar esa factura en Facturas y pagos: servicio objetivo debe reactivarse por cierre G3 confirmado. Contraste: suspender contrato Cable 2 y pagar factura 2 por 7.000; no debe fabricar activación sin cierre G3. Si no se encuentra acción autorizada, marcar bloqueado, sin SQL. | CAP-11: estados antes/después y ámbito |
| D12 | Como soporte crear ticket sintético sobre cliente compartido y servicio 1, categoría «Soporte sintetico QA», prioridad Media; cambiar a Alta, agregar nota y diagnóstico QA. Seguir sin alteración financiera. La reparación local permanece bloqueada por autoridad G3; si la UI no ofrece el POST no afirmar una nueva prueba visual de 410. | CAP-12: clasificación y seguimiento, limitación G3 |
| D13 | Como admin, Inventario G1 y equipos del servicio nuevo: buscar `QA-I4-ONT-1-001`, empresa 1. No usar `QA-I4-ONT-F-001` del guion conceptual: la serie real del simulador es la anterior. Comprobar asignación, sin transferencias físicas. | CAP-13: catálogo/unidad/equipos simulados |
| D14 | Como admin, Reportes → clientes, CSV, ámbito autorizado → «Generar reporte» y abrir archivo; revisar auditorías. Como Comercial exportación no autorizada; control --check-export-permissions aporta 200/403 HTTP separado, sin ampliar permisos. | CAP-14: CSV abierto y restricción visible |
| D15 | Presentar el informe PostgreSQL P0-05 existente como evidencia previa de recuperación. Esta sesión no incluye inyección de caída/ACK perdido ni proceso periódico. Dejar NOT_EXECUTED para nueva demostración visual de recuperación; no provocar fallos arbitrarios ni duplicar activación. | CAP-15 pendiente; referencia histórica claramente identificada |

Datos actuales: empresa FiNet=1, Cable=2; planes 1/2; cliente compartido=1;
contratos compartidos=1/2, servicios=1/2 y facturas=1/2. Prospecto nuevo, contrato,
tracking, OT y servicio de D03–D08 deben obtenerse al operar; no usar OT histórica #53.
El mapa remoto puede aparecer sin tiles por CSP; introducir coordenadas manuales.
Nominatim deshabilitado no es una prueba de cobertura. No activar servicios reales
para completar una pantalla. Valores QA no constituyen una relación comercial real.

### Controles explícitos del simulador local

Son operaciones exclusivamente sintéticas y protegidas por el marcador de esta
sesión. El cierre llama al backend local, nunca al G3 real. Sustituir los números
con los observados en `--status`; los siguientes placeholders no son ejecutables:

```powershell
node scripts/p0-07-qa-http-check.cjs $qaPrivateFile --status
node scripts/p0-07-qa-http-check.cjs $qaPrivateFile --approve <OT_QA>
# Repetir EXACTAMENTE el mismo comando approve para demostrar duplicado.
node scripts/p0-07-qa-http-check.cjs $qaPrivateFile --approve <OT_QA>
node scripts/p0-07-qa-http-check.cjs $qaPrivateFile --conflict <OT_QA>
# Una sola factura sintética para D11; no usar contrato ajeno al entorno QA:
node scripts/p0-07-qa-http-check.cjs $qaPrivateFile --invoice-fixture <CONTRATO_NUEVO_QA>
node scripts/p0-07-qa-http-check.cjs $qaPrivateFile --check-export-permissions
```

El control de conflicto crea deliberadamente un cierre incompatible en el simulador
para esperar 409; nunca se utiliza contra datos reales. No cambia la solicitud
original. Registrar su respuesta saneada, sin keys. Export-permissions inicia sesión
solo con admin/finet QA, por lo que genera auditorías locales de login.

## Registro y cierre

Las filas MANUAL_PREPARADA de [09-bitacora-demo.csv](09-bitacora-demo.csv) conservan
NOT_EXECUTED y no contienen capturas inventadas. Al ejecutar, agregar una nueva
fila con fecha real/zona, rol, runId, IDs, acción y resultado observado; no sustituir
la historia anterior. Registrar por separado cada subcaso pendiente o fallido.
Guardar capturas reales como `evidencias-qa/manual-<runId>/CAP-xx.png`, solo después
de tomarlas. Un PDF descargado no equivale a captura del PDF renderizado.

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath '<ruta de captura real>'
# Guardar estado final saneado y detener exclusivamente esta sesión:
node scripts/p0-07-qa-http-check.cjs $qaPrivateFile --status
node scripts/p0-07-qa-http-check.cjs $qaPrivateFile --stop
```

Esperar `QA_STOPPED_CLEANUP_CONFIRMED` y comprobar `cleanup=true` en el acta de
sesión. La parada elimina únicamente el cluster temporal poseído y sus archivos
privados; las capturas y JSON de evidencia en docs se conservan. Guardar las
descargas/capturas necesarias antes de detener o expirar las dos horas.
Si se cierra abruptamente la consola y no consta cleanup, informar el runId y no
eliminar carpetas por su nombre sin comprobar propietario y rutas.

Pendientes: operador ejecuta y captura D01–D14; QA presenta D15 histórico o propone
un ensayo dedicado; G8 revisa PDF nuevo visualmente; propietario ratifica aceptación
y publicación posterior. No hay ACADEMIC_GO ni aprobación de producción derivada
de este procedimiento. Sin commit, push, merge, despliegue ni tráfico productivo.
