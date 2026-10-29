# Guion integral — exclusivamente QA sintético

> Consolidación 29-10-2026: este documento conserva resultados y sesiones históricas. El estado de publicación vigente está en [19](19-consolidacion-publicacion-p0-07.md). Las sesiones con TTL vencido no deben reutilizarse. Las referencias a `evidencias-qa/` corresponden a archivos locales preservados, excluidos de este PR; el resumen automatizado publicable está en [validación](p0-07-validacion-publicacion.json). La distribución académica y la certificación productiva siguen separadas de esta PR.

Estado: **PREPARADO / NO EJECUTADO EN NAVEGADOR**. El ensayo HTTP P0-07A se registra por separado en [12-resultados-demo-qa.md](12-resultados-demo-qa.md); no sustituye este recorrido visual. Duración propuesta: 25–35 minutos,
no cronometrada. No iniciar hasta cumplir el acta de aislamiento del [manual](02-manual-instalacion.md).
Cada captura indicada es una toma pendiente, no un archivo existente.

## Datos de escenario

Los alias se resuelven a IDs generados en QA y se anotan en el acta. No reutilizar
OT #53, tracking #2 ni otros IDs históricos. Las empresas QA representan a FiNet y
Cable Mágico, sin conectarse a sus sistemas reales.

| Alias | Preparación sintética propuesta |
| --- | --- |
| E-F / E-C | Empresas QA FiNet / QA Cable Mágico; resolver IDs, no hardcodearlos |
| U-ADM | qa-admin@example.invalid, Administrador; consulta consolidada |
| U-F / U-C | qa-finet@example.invalid / qa-cable@example.invalid, Comercial de su empresa |
| U-S | qa-soporte@example.invalid, Soporte; permisos según configuración vigente |
| P-F / P-C | Prospecto QA FiNet / Prospecto QA Cable; RUT de fixture 99000001-8 / 99000002-6, correo `.invalid` |
| C-SHARED | Identidad QA compartida 99000003-4, vinculada explícitamente a contratos de ambas empresas |
| PLAN-F / PLAN-C | Internet QA, precio mensual de ejemplo $19.990; tipo de cliente permitido por catálogo vigente |
| Z-F / Z-C | Polígonos comerciales QA separados; punto interior conocido y punto exterior |
| INV-F | Factura QA del contrato FiNet: total $19.990, sin pagos iniciales |
| INV-C | Deuda QA del contrato Cable de C-SHARED: $7.000, vencida respecto de la fecha de ensayo |
| C-REACT | Contrato/servicio QA suspendido mediante flujo autorizado, con cierre G3 COMPLETADA ya persistido; factura vencida con saldo |
| EQ-F | Serie `QA-I4-ONT-F-001` del simulador G1; no representa stock real |

Los RUT son valores inventados para pruebas locales, no datos consultados. No son
autorización para unir registros. C-SHARED debe tener relaciones legítimas por IDs
de contrato/empresa; no fusionar por coincidencia de RUT ni reasignar empresa principal.
Las contraseñas y keys de simuladores se generan/provisionan por QA fuera del guion.

## Preparación de simuladores

- G3 HTTP debe implementar únicamente el contrato de instalación ya ratificado:
  wrapper `{success:true,data}`, request/trace/OT estables, company scope en GET y
  cierre approval-only. Usar las fixtures y pruebas de `g3-integration` como referencia.
- G1 local debe registrar event_id/hash y distinguir primer envío de duplicado.
  Para la UI también requiere las consultas de catálogo/unidad/equipos que consume
  el adapter; el servidor de P0-05 solo atiende activaciones y no basta para toda la demo.
- Nunca agregar endpoints de reparación/retiro para completar artificialmente el guion.
- Un fallo de simulador debe mostrarse como tal. Los pasos pueden detenerse y
  documentarse sin cambiar manualmente estados en DB.

## Recorrido y resultados esperados

| Paso / toma pendiente | Acción | Resultado que debe comprobarse |
| --- | --- | --- |
| D01 / CAP-01 | Abrir Login y entrar con U-ADM. Probar una credencial QA errónea en cuenta separada. | Login correcto permite sesión; error rechaza acceso. `/api/auth/login` no se invoca contra origen real. Capturar UI sin contraseña ni token. |
| D02 / CAP-02 | Como Administrador, alternar E-F, E-C y consolidado. Entrar después como U-F. | Administrador conserva consolidado. U-F no obtiene relaciones operativas exclusivas E-C; verificar respuesta saneada, no solo ocultación del menú. |
| D03 / CAP-03 | Crear P-F, registrar origen/contacto QA y seleccionar plan/zona comercial. Repetir comprobación con punto exterior. | Datos pertenecen a E-F; fuera de cobertura no avanza a contratación. No usar Nominatim como evidencia de cobertura. |
| D04 / CAP-04 | Generar cotización desde Prospectos y descargar/consultar PDF. Confirmar contratación por la acción específica. | PDF legible y precio del plan/zona; correo figura deshabilitado/simulado. La contratación queda pendiente de firma, no Servicio Activo. |
| D05 / CAP-05 | Desde el flujo vigente de Clientes/contrato, registrar firma y generar/descargar contrato digital. | Relación empresa/prospecto/plan correcta; versión PDF e historial conservados. No editar pipeline para fingir firma. |
| D06 / CAP-06 | Solicitar instalación al G3 local. Repetir retry idéntico antes de cierre. | Misma identidad de solicitud, una OT simulada, tracking con empresa correcta. Un usuario de otra empresa no obtiene detalle. |
| D07 / CAP-07 | Simulador G3 aprueba y emite el cierre válido al receptor local. Repetir el mismo cierre. | Una activación comercial, servicio/contrato correctos, un evento terminal. Retry no duplica cliente/servicio. Cierre con hash distinto debe producir conflicto. |
| D08 / CAP-08 | Consultar Gestionar servicio y seguimiento G1 local. | Datos técnicos identifican su fuente; equipo QA solo desde simulador. No inventar MAC, puerto OLT, técnico ni existencias. `equipos_asociados=0` puede ser pendiente de cierre; no presentarlo como fallo definitivo. |
| D09 / CAP-09 | Consultar C-SHARED como U-F, U-C y U-ADM. | Cada comercial ve contratos/servicios/documentos de su empresa; administrador consolida. Datos globales técnicos no atribuibles se protegen. Empresa principal e identidad no cambian. |
| D10 / CAP-10 | En INV-F registrar pago QA de $5.000 y después $14.990, utilizando identidades de transacción distintas. Repetir exactamente un pago. | Saldos $14.990 y $0; replay no duplica. Comprobante pertenece al contrato E-F. INV-C conserva deuda/estado; no cambiar estado financiero global del cliente compartido para simplificar. |
| D11 / CAP-11 | Pagar el saldo de C-REACT; contrastar con otro fixture suspendido sin evidencia de cierre. | Con evidencia legítima, se reactiva únicamente relación/servicio objetivo según política vigente. Sin evidencia, pago no fabrica instalación. No editar datosTecnicos para forzar la prueba. |
| D12 / CAP-12 | Crear ticket QA, clasificar, priorizar, agregar notas y diagnóstico. Intentar derivación/cierre local de reparación cuando corresponda. | Seguimiento/auditoría conservados, sin alterar finanzas. Bloqueo G3 explícito tras autorización; CU75/76 no se muestran como integrados. |
| D13 / CAP-13 | Consultar catálogo, unidad EQ-F y equipos del servicio en G1 simulado. | Fuente simulada visible, scope empresarial correcto; sin acciones de transferencia/stock físico local. Si falta el endpoint local de consulta, marcar paso NO EJECUTADO. |
| D14 / CAP-14 | Como Administrador, exportar reporte de clientes por empresa en CSV y revisar auditorías autorizadas. Intentar la misma exportación como Comercial. | Administrador obtiene CSV; Comercial recibe 403 en `/api/reports/export`, incluso con filtro empresarial. No cambiar permisos. Archivo sintético abierto y contrastado antes de considerar la toma válida. |
| D15 / CAP-15 | Demostrar recuperación: fallo después del commit comercial, reinicio y recuperación local; segundo caso ACK G1 perdido. | No volver a activar comercialmente. Descriptor original preservado. Confirmación G1 no retrocede; retry usa mismo event_id/hash y el simulador mantiene un efecto. Registrar filas/envíos. |

Todos los pasos anteriores están pendientes de ejecución visual en este paquete.
Los resultados esperados son criterios de aceptación, no resultados observados.

## Recuperación: rutas existentes y límites

Solo sobre el origen local atestado y con rol autorizado:

- `POST /api/integrations/g3/installations/{trackingQA}/reconcile`: en cierre
  confirmado recupera trabajo local sin nueva activación.
- `POST /api/integrations/g1/activations/{trackingG1QA}/retry`: puede emitir un POST
  al simulador; no usar si su configuración apunta a G1 real.

La UI puede ocultar «Consultar cierre» tras COMPLETADA. No inventar un botón:
demostrar la operación existente con cliente HTTP local saneado o presentar el
harness P0-05 como prueba separada. No pegar Authorization ni X-API-KEY en capturas.
No hay proceso periódico; la recuperación es bajo demanda.

D15 ya tiene evidencia automatizada PostgreSQL en P0-05, pero su presentación y
captura durante esta demo siguen pendientes. Si no se prepara el simulador UI,
presentar esa evidencia como ensayo de servicios, no como video del flujo completo.

## Acta del ensayo

Para cada Dxx registrar: fecha/zona horaria, SHA, operador/rol, alias→IDs QA, origen
local, acción, resultado esperado, resultado real, estado PASS/FAIL/NO EJECUTADO,
archivo de captura, SHA-256 y limitación. Conservar solo datos sintéticos.

Detener el paso ante destino no local, datos ajenos, fallo de correlación, payload
distinto en retry o scope incorrecto. No reparar con SQL ni repetir un evento con
otro contenido. Un ensayo parcial se entrega como parcial.
