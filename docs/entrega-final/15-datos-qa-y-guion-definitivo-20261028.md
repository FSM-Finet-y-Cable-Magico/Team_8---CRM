# P0-07 — Datos QA y guion del operador, 28-10-2026

> Consolidación 29-10-2026: este documento conserva resultados y sesiones históricas. El estado de publicación vigente está en [19](19-consolidacion-publicacion-p0-07.md). Las sesiones con TTL vencido no deben reutilizarse. Las referencias a `evidencias-qa/` corresponden a archivos locales preservados, excluidos de este PR; el resumen automatizado publicable está en [validación](p0-07-validacion-publicacion.json). La distribución académica y la certificación productiva siguen separadas de esta PR.

**DEMO_PARTIAL / ACADEMIC_CONDITIONAL.** Preparación HTTP real local, sin prueba
visual nueva. Este documento es la referencia operativa de esta sesión; 03 y 14
se conservan como guiones anteriores, con sus IDs y URLs históricos.

## Arranque, acceso y vigencia

Sesión comprobada: **http://127.0.0.1:50066**.
Run `931e5690-fd81-470c-b093-f9ac2a478166`.
Expira automáticamente el **28-10-2026 a las 11:55:45 America/Santiago**
(`14:55:45Z`). Después de expirar, crear una sesión nueva; no asumir el mismo puerto.
Health 200, database UP, global_schema READY. Se preserva la rama
`docs/i4-p0-07-cierre-entrega`, HEAD `a8d2598151c988ef8f4f4a09977fe36167d79f62`.

Desde la raíz del checkout, con dependencias instaladas, builds locales y
PostgreSQL 18 en `C:/Program Files/PostgreSQL/18/bin`:

```powershell
node scripts/p0-07-demo-qa.cjs --operator-ready
```

Una sola orden inicia PostgreSQL exclusivo, carga el contrato canónico y fixtures
sintéticas, inicia simuladores y backend, sirve el frontend y comprueba los cuatro
logins. Además prepara el caso SECUNDARIO de reactivación mediante APIs existentes.
No ejecutar otra instancia si la sesión actual sigue vigente. Mantener su consola
abierta. No usar Docker/Compose conectado a Railway ni cargar `.env` privado.
Si falta un build, compilar localmente antes; frontend debe usar API relativa `/api`.

El modo anterior sin `--operator-ready` conserva sus fixtures mínimas y no prepara
el servicio suspendido. No ejecutar el HTTP runner completo sobre la sesión manual.

```powershell
# Para ESTA sesión; reemplazar por privatePath de QA_READY en un nuevo arranque.
$qaPrivateFile = '<archivo-privado-del-run-QA-actual>'
node scripts/p0-07-qa-http-check.cjs $qaPrivateFile --status
```

La contraseña de cada usuario es aleatoria y está solo en ese archivo temporal
privado, fuera de Git. No imprimir su contenido ni capturar tokens:

```powershell
$qaSession = Get-Content -LiteralPath $qaPrivateFile -Raw | ConvertFrom-Json
($qaSession.accounts | Where-Object alias -eq 'finet').password | Set-Clipboard
# Pegar en el login LOCAL y luego vaciar el portapapeles:
Set-Clipboard -Value ''
```

Cambiar el alias por admin/cable/soporte según el paso. No guardar contraseñas en
el navegador. Cerrar sesión al cambiar de usuario. El operador controla su navegador
manualmente; no se reintentó el mecanismo de Opera bloqueado.

## Inventario efectivamente preparado

| Cuenta | Rol / empresa | Login HTTP real en esta sesión |
|---|---|---|
| qa-admin@example.invalid (`admin`, usuario 1) | Administrador, empresa principal 1; consolidado autorizado | 201 PASS |
| qa-finet@example.invalid (`finet`, usuario 2) | Comercial, QA FiNet 1 | 201 PASS |
| qa-cable@example.invalid (`cable`, usuario 3) | Comercial, QA Cable Magico 2 | 201 PASS |
| qa-soporte@example.invalid (`soporte`, usuario 4) | Soporte, empresa 1 | 201 PASS |

| Objeto | Datos existentes en esta sesión |
|---|---|
| Empresas | 1 QA FiNet; 2 QA Cable Magico |
| Planes | 1 Internet QA 1 / empresa 1; 2 Internet QA 2 / empresa 2. Tipo Internet, cliente Residencial, 300 Mbps, precio mensual 19.990 |
| Zonas y precios | 1 QA zona 1 / empresa 1; 2 QA zona 2 / empresa 2. COBERTURA_GENERAL, activas, comuna Santiago, precio por zona 19.990, día sugerido 10 |
| Punto interior FiNet | latitud -33.475, longitud -70.675; polígono -70.7…-70.65 / -33.5…-33.45 |
| Punto interior Cable | latitud -33.475, longitud -70.475; polígono -70.5…-70.45 / -33.5…-33.45 |
| Punto exterior QA | latitud -35, longitud -72; fuera de ambas zonas |
| Cliente compartido | ID 1, Identidad compartida QA, RUT sintético 99000003-4, shared@example.invalid, +56900000000; estado global Moroso |
| Relación compartida FiNet | contrato 1 Activo, servicio 1 Activo, factura 1: saldo 19.990 |
| Relación compartida Cable | contrato 2 Activo, servicio 2 Activo, factura 2: saldo 7.000 |
| Reactivación secundaria Cable | prospecto 1, RUT 99000004-2, Reactivacion secundaria QA, reactivation@example.invalid, +56900000004, Calle sintetica QA 404, Santiago/Metropolitana |
| Evidencia técnica secundaria | cliente 2, contrato 3, servicio 3, tracking G3 1, OT simulada 9700001; G3 COMPLETADA, G1 COMPLETADA, un evento de cierre |
| Estado listo para reactivar | contrato 3 Suspendido, servicio 3 Suspendido; factura 3 pendiente por 1.000, emitida/vencida 01-10-2026; cero pagos |
| Inventario simulado | empresa 1: QA-I4-ONT-1-001 en bodega; empresa 2: QA-I4-ONT-2-001 asociada al servicio secundario 3. Tipo ONT QA simulado |
| Categoría ticket | Soporte sintetico QA, SLA 24 h |
| Prospecto PRINCIPAL | **NO EXISTE**: RUT 99000001-8 reservado para creación manual |

Conteos al entregar: 1 prospecto secundario, 2 clientes, 3 contratos, 3 servicios,
3 facturas, 1 evento de cierre y 0 pagos. No hay un prospecto principal oculto o
precargado. Los contratos compartidos y su estado financiero permanecen intactos.

El caso suspendido no se fabricó insertando un tracking COMPLETADA: recorrió
prospecto → cobertura → cotización → contrato → firma → solicitud G3 → cierre
simulado → activación G8/G1 → factura QA → suspensión comercial autorizada.
La factura es una fixture explícita; no demuestra emisión tributaria o facturación
de un proveedor. Los fixtures base compartidos no tienen cierre G3 y sirven de
contraste. No se inventaron MAC, puerto OLT, potencia ni nombre de técnico.
El cierre simulado mínimo aporta correlaciones y series; campos opcionales ausentes
deben verse como no informados, no completarse con datos ficticios en el frontend.

G1/G3 son simuladores en memoria de esta sesión. Soportan la serie indicada por
empresa para este recorrido; no son un emulador general de stock ni una prueba de
recuperación tras reinicio. D15 usa evidencia P0-05 separada.

## Datos del prospecto principal: formulario real

Entrar como **finet** y abrir **Prospectos**. No seleccionar plan en el formulario
de alta: se selecciona después, en cotización/contratación.

| Campo | Valor concreto | Validación y obligatoriedad observada en código |
|---|---|---|
| RUT | 99000001-8 | Obligatorio; formato con guion; valor exclusivamente sintético |
| Nombre completo | Prospecto Manual QA FiNet | Obligatorio; mínimo 5 caracteres, máximo 120 |
| Email | manual-finet@example.invalid | Opcional; si se informa, formato email válido |
| Teléfono | +56900000001 | Obligatorio; celular chileno, sin espacios |
| Origen de contacto | Formulario web | Selector real; no escribir «Web» como opción inventada |
| Dirección | Calle sintetica QA 101, Santiago | Obligatoria; mínimo 8 caracteres, máximo 200 |
| Comuna | Santiago | Opcional en DTO; completarla para dirección/ubicación |
| Region | Metropolitana | Opcional en DTO; completarla para dirección/ubicación |
| Latitud / Longitud | -33.475 / -70.675 | Abrir «Confirmar ubicación y consultar cobertura» y pulsar «Ubicar punto» |

Opciones reales de origen: Formulario web, Telefono, Sucursal, Referido,
Redes sociales, Terreno. No hay necesidad de introducir estado comercial en el
alta. El backend determina cobertura y etapa. Cambiar una dirección invalida la
selección previa de ubicación: confirmar nuevamente el punto antes de registrar.
Nominatim y TOMODAT están deshabilitados; cobertura procede del polígono comercial
local. La ausencia de tiles externos del mapa por CSP es esperable.

## Recorrido principal y comprobaciones

Cada fila está **NOT_EXECUTED VISUAL** hasta que el operador la realice. Los
resultados esperados no son resultados observados. Guardar captura CAP-xx real
sin contraseñas, cabeceras, tokens ni archivo privado.

| Paso / rol | Pantalla y acción | Datos y resultado esperado / comprobación | Captura |
|---|---|---|---|
| D01 / finet | Login, credencial QA incorrecta una vez y luego correcta | Rechazo y acceso a empresa 1; no usar credenciales personales | CAP-01 |
| D02 / admin, finet | Selector de empresa y navegación; contrastar roles tras cerrar sesión | Admin consolidado; Comercial solo ámbito propio. Los logins HTTP ya se comprobaron, la UI no | CAP-02 |
| D03 / finet | Prospectos → completar tabla anterior → Registrar prospecto | Nuevo prospecto con cobertura comercial; anotar ID real. NO precargado | CAP-03 |
| D04 / finet | Gestionar prospecto → Generar cotización | Plan Internet QA 1, precio 19.990. Abrir PDF; correo deshabilitado. Debe existir cotización factible para ese plan | CAP-04 con PDF abierto |
| D04b / finet | Confirmar contratación | Plan aceptado Internet QA 1; fecha de confirmación 2026-10-28 (o día real de ejecución), observación «Contratacion sintetica QA sin validez comercial». No hay campo día de vencimiento en este formulario; no inventarlo. Queda pendiente de firma; anotar contrato | CAP-04b |
| D05 / admin, empresa 1 | Clientes → pendiente de firma/contratación → Gestionar → Contrato y plan | Confirmar firma de contrato; observación «Firma sintetica QA». Generar PDF, Descargar PDF, Generar nueva versión; abrir ambas y verificar legibilidad/versiones sin cambiar histórico | CAP-05 |
| D06 / admin | Gestionar contratación → Instalación → Solicitar instalación a G3 | Solicitud al simulador, empresa 1 y OT nueva (diferente a 9700001 secundaria). Obtener IDs con --status y usar Ver detalle | CAP-06 |
| D07 / operador + admin | Control QA --approve OT_NUEVA y refrescar seguimiento | Una activación local, cliente/servicio reales de QA; repetir approve idéntico conserva resultado sin duplicar. --conflict produce 409 y no sustituye cierre aceptado | CAP-07, consola saneada aparte |
| D08 / admin | Clientes → Gestionar servicio y seguimiento G1 | Servicio Activo, G3/G1 confirmados; serie QA-I4-ONT-1-001 exclusivamente simulada. No inventar datos técnicos ausentes | CAP-08 |
| D10-principal / operador + finet | Preparar factura QA del contrato NUEVO con --invoice-fixture; Libro de control → fila del contrato → Ver factura / registrar pago | Fixture 1.000; Registrar pago, Monto 1.000, Medio de pago Efectivo, Referencia QA-20261028-PRINCIPAL; Guardar. Saldo cero en ese contrato. No ejecutar emisión fiscal ni pasarela real | CAP-10-P |

Para el cierre y la factura del prospecto principal, usar solo sus IDs observados
tras D06/D07. Los placeholders siguientes se reemplazan; no son comandos literales:

```powershell
node scripts/p0-07-qa-http-check.cjs $qaPrivateFile --status
node scripts/p0-07-qa-http-check.cjs $qaPrivateFile --approve <OT_NUEVA_QA>
node scripts/p0-07-qa-http-check.cjs $qaPrivateFile --approve <OT_NUEVA_QA>
node scripts/p0-07-qa-http-check.cjs $qaPrivateFile --conflict <OT_NUEVA_QA>
node scripts/p0-07-qa-http-check.cjs $qaPrivateFile --invoice-fixture <CONTRATO_NUEVO_QA>
```

El control de factura se permite solo una vez para un contrato QA con cliente y
sin facturas. Es preparación sintética explícita, no un botón productivo ni emisión
tributaria. Si ya hay factura, usar la existente; no insistir ni cambiar IDs para
evadir el rechazo. Los pagos se realizan manualmente en Libro de control; no existe
un menú independiente «Facturación» en la navegación actual.

## Escenarios independientes

| Paso | Cuenta / acciones y datos | Resultado esperado / evidencia pendiente |
|---|---|---|
| D03 exterior | cable, prospecto nuevo 99000002-6, «Prospecto Fuera QA Cable», outside-qa@example.invalid, +56900000002, Calle sintetica QA 202, Santiago/Metropolitana, Formulario web; punto -35/-72 | Sin cobertura comercial; impedir contratación. CAP-03-EXT |
| D09 compartido | finet/cable/admin; consultar cliente 1 | Contrato 1 para finet, 2 para cable, ambos admin; datos globales técnicos no atribuibles ocultos. Identidad principal y estado Moroso no se reasignan. CAP-09 |
| D10 compartido | finet, Libro de control, contrato 1/factura 1: pago 5.000 Efectivo referencia QA-20261028-F-PARCIAL; luego 14.990 referencia QA-20261028-F-FINAL | Saldo 14.990 y 0; factura Cable 2 conserva 7.000. No reenviar con otra referencia para fingir retry. Replay de pago es un subcaso HTTP previo hasta ejecutarlo expresamente. CAP-10-C |
| D11 reactivación | cable (o admin ámbito 2); contrato 3/factura 3 ya suspendidos: Registrar pago 1.000, Efectivo, QA-20261028-REACTIVA | Servicio 3 vuelve Activo por cierre G3 válido. No usar contrato principal ni OT histórica. Contraste sin cierre: admin puede suspender contrato 2 y pagar factura 2 por 7.000, referencia QA-20261028-SIN-CIERRE; no debe fabricar activación. Hacer contraste solo después de capturar aislamiento D10. CAP-11 |
| D12 tickets | soporte, Tickets → Crear ticket; RUT 99000003-4, categoría Soporte sintetico QA, prioridad Media, descripción «Ensayo QA sin averia real». Gestionar → prioridad Alta; nota «Seguimiento sintetico QA». Diagnóstico: causa «Ensayo QA», problema «Sin incidencia real», acciones «Comprobacion local» | Clasificación/notas/diagnóstico conservados, estado global Moroso sin alteración; reparación G3 sigue pendiente, no inventar derivación/cierre. Si UI permite elegir servicio, usar empresa 1/servicio 1; registrar el valor real asociado. CAP-12 |
| D13 inventario | admin, Inventario, empresa 1 serie QA-I4-ONT-1-001 tras D07; empresa 2 serie QA-I4-ONT-2-001 | G1 simulado es autoridad del stock; asignaciones a servicios distintos por empresa. No mover equipos ni inventar stock real. CAP-13 |
| D14 reportes | admin, Reportes, clientes/CSV, Generar reporte y abrir archivo; Auditoría, revisar eventos QA. Como Comercial, exportación no permitida | ADMIN_ONLY; complemento opcional --check-export-permissions da HTTP 200/403, no captura. CAP-14 |
| D15 recuperación | QA presenta docs/i4-p0-05-postgresql-qa.md y su JSON | Evidencia PostgreSQL histórica; no repetir caída/reinicio sobre esta demo ni declarar recuperación automática. Nueva captura/ensayo NOT_EXECUTED. CAP-15 pendiente |

No hay correos, WhatsApp, Smart OLT, TV IP o DTE reales. La ausencia de comprobante
tributario generado con emisor deshabilitado no se corrige habilitando proveedores.
G2 no participa como proveedor real en esta demo; pagos UI no certifican su S2S.

## Checklist y bitácora

- [ ] Confirmar `--status`, run/origen loopback y vigencia antes de operar.
- [ ] Confirmar rol y empresa antes de cada registro, sin `.env` ni datos reales.
- [ ] Crear personalmente el principal; anotar sus IDs nuevos, no copiar IDs históricos.
- [ ] Capturar PDF abierto, versiones, estados antes/después y ámbito empresarial.
- [ ] Registrar cada subcaso omitido o fallido; no convertir HTTP PASS en visual PASS.
- [ ] Guardar capturas reales bajo `evidencias-qa/manual-931e5690-fd81-470c-b093-f9ac2a478166/`.
- [ ] Añadir fila de ejecución a 09-bitacora-demo.csv con fecha/zona, rol, IDs, resultado,
  ruta y SHA-256. Las filas preparadas no son ejecución; preservar rondas anteriores.
- [ ] Obtener hash con `Get-FileHash -Algorithm SHA256 -LiteralPath '<captura real>'`.
- [ ] Exportar lo necesario antes de la expiración y detener solo esta sesión:

```powershell
node scripts/p0-07-qa-http-check.cjs $qaPrivateFile --status
node scripts/p0-07-qa-http-check.cjs $qaPrivateFile --stop
```

Esperar cleanup confirmado en el acta. Los JSON/capturas en docs permanecen; la base
y archivos privados son desechables. No se borran respaldos ni carpetas ajenas.

## Evidencia y límites de esta preparación

El acta `evidencias-qa/run-931e5690-fd81-470c-b093-f9ac2a478166.json` guarda los cuatro
logins, operaciones y verificación del suspendido. La sesión anterior del 27-10 se
cerró por TTL. El primer intento del 28-10 (`c07d9867-b246-4200-86a6-c941b4abdc47`)
falló con 400 al omitir cotización; su cluster fue limpiado. Se corrigió únicamente
el preparador QA para respetar la precondición, sin modificar el CRM ni sus reglas.

Nueva preparación: PASS HTTP, no visual. Siete tests de aislamiento/simuladores y
rechazo de origen externo PASS; sintaxis Node y diff-check PASS. PDF productivo no
se volvió a modificar: sus hashes fuente/compilado coinciden con los 9/9 PostgreSQL
del 27-10. No se presenta una nueva ejecución de esa suite ni de build/lint.

[Snapshot inmutable de preparación](evidencias-qa/operator-ready-931e5690-fd81-470c-b093-f9ac2a478166.json).
`SHA256SUMS-operator-railway-20261028.txt` registra esta evidencia y los GET públicos
autorizados; el acta viva cambia con el uso y su cierre. Los 17 artefactos históricos
de los manifiestos anteriores siguen coincidiendo con sus hashes.
