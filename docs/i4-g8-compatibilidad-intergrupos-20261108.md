# I4 — Compatibilidad G8 con G3/G1, 08-11-2026

## Alcance y base

Solo `Team_8---CRM`. Rama independiente `fix/i4-g8-compatibilidad-intergrupos`, desde `0a3d538225781cbfbe5b737bf9318bd2e01e5541`. Sin commit, push, migraciones ni deploy. El candidato G1 generado durante la instrucción anterior fue retirado; no se modificó código ni repositorios G1/G3. La referencia local de G1 se conservó intacta. No se implementan equivalencias de roles o identidades técnicas.

## Correcciones propias de G8

1. **EN_CURSO**: faltaba en `G3_WORK_ORDER_STATES`. Se incorpora sin equipararlo a COMPLETADA: tracking ENVIADA, presentación/OT EN_CURSO. No activa servicios ni procesa cierre; PENDIENTE_APROBACION sigue siendo desconocido mientras G3 no ratifique su contrato.
2. **Correlación del detalle**: `InstallationIntegrationService.detail()` validaba empresa pero podía aceptar referencias de otra OT/solicitud de esa misma empresa. Se rechazan id_ot, request_id, trace_id, contrato, prospecto o plan incompatibles cuando son informados. No se requieren campos adicionales a las respuestas legacy. Se conserva el estado confirmado y snapshot; solo se registra error saneado/fecha de consulta, sin exponer datos técnicos del detalle ajeno.
3. **ID técnico externo**: el detalle solo presenta `idTecnicoG3` si es un entero positivo seguro. No convierte cadenas, objetos o valores inválidos ni busca usuarios locales por ese identificador. Los datos válidos siguen identificados como provenientes de G3.

Se preservan rutas, payloads, autenticación S2S, hash/snapshot, reintentos y cierre legítimo. El tratamiento de cierre sigue en el processor transaccional existente, con correlación y validación de campos técnicos opcionales. El GET de detalle puede persistir metadatos de sincronización: no ejecutarlo como supuesto preflight de solo lectura en una base compartida.

## Revisión G1 dentro del CRM

No fue necesario cambiar lógica productiva del adaptador o activación G1. El código vigente valida wrapper, ámbito empresarial de consultas, correlación de evento/servicio, conteo asociado, snapshot persistido y protección frente a respuestas atrasadas. `equipos_asociados=0` con equipos solicitados mantiene PENDIENTE_SINCRONIZACION_G1; no se convierte en fallo definitivo ni éxito funcional. Un duplicado aceptado tampoco prueba asociación física.

Se agrega una regresión que confirma que `id_tecnico`/rol/usuario contenidos en el cierre G3 no se convierten ni se envían en el contrato de activación G8→G1. Se mantiene exactamente su conjunto de campos actual, por empresa/contrato/OT/cliente/servicio. G1 conserva la autoridad sobre inventario y asignaciones físicas.

## Regresiones y validación

- EN_CURSO: normalización, ambas empresas, consultas pendientes con HTTP 409 correlacionado, conflictos incompatibles y ausencia de activación/cierre.
- Correlación/técnicos: antes de la corrección local adicional, 11 FAIL/98 PASS reprodujeron seis referencias incompatibles y cinco IDs técnicos inválidos. No es una reproducción en producción.
- Se conservan pruebas existentes de cierres legítimos, rollback, recuperación durable, concurrencia, respuestas atrasadas, estado financiero del cliente e idempotencia G1/G2.
- El runner descarta variables operativas, usa credenciales sintéticas y bloquea conexiones fuera de loopback. No carga `.env` privado ni usa PostgreSQL o proveedores reales.
- Resultados finales y hashes: `Entregables/G8-compatibilidad-intergrupos-20261108/resultado-validacion.json`, fuera de Git. Logs locales ignorados: `.codex-review/g8-compatibilidad-20261108/`.

No se modifican módulos financieros G2/billing/commercial/Facturación.cl, fixtures aprobados, Webpay, API keys, credenciales, datos QA, saldos ni contratos financieros. La regresión local no sustituye ni repite pagos o Webpay reales. El estado de aceptación operativa previa se conserva sin afirmar nueva certificación de proveedores.

## Hallazgos para comunicar a los propietarios

|Responsable|Hallazgo y evidencia|Acción requerida|
|---|---|---|
|G1|Nombres de roles reportados por el usuario difieren de los literales G1. El main consultado es d52f3c6fda113ba80351cb0c273f586cc7f61e5d, sin afirmar SHA desplegado.|Ratificar permisos/roles canónicos y su ámbito por empresa. G8 no modifica roles, usuarios ni JWT de G1.|
|G1|La revisión estática detectó administración de usuarios por ID sin verificación empresarial uniforme y un selector que consulta usuarios mediante una ruta restringida a ADMIN/SUPERUSUARIO.|G1 debe revisar autorización/aislamiento y su mecanismo permitido para listar técnicos. No conceder ADMIN como atajo.|
|G1 y G3|Correspondencia entre técnico G3 y usuario/inventario G1 no confirmada.|Definir identidad por empresa y evidencia explícita; conservar SERIE_DE_OTRO_TECNICO. No igualar IDs ni reasignar equipos para pasar QA.|
|G3|PENDIENTE_APROBACION no ratificado como estado de OT en el contrato revisado.|Aclarar si es estado, subestado o literal de otro entorno antes de cambiar catálogo G8.|
|G8/G3/G1|Falta evidencia operativa actual de SHA de imágenes, catálogo y OT QA.|Ventana autorizada con evidencia saneada y solo lectura primero; no usar el endpoint de detalle G8 como sustituto de lectura SQL.|

Estos son hallazgos estáticos/de contrato, no incidentes productivos reproducidos durante esta tarea. Los SHA GitHub no prueban el código desplegado. Las equivalencias permanecen pendientes de ratificación, conforme a la instrucción del propietario.

## Revisión y rollback

Revisar solo los seis archivos listados en el informe final de Git. No publicar el código de otros grupos. Al aprobar una futura integración, desplegar únicamente G8 con su procedimiento autorizado; este cambio no necesita migración. El rollback de aplicación consiste en volver a la imagen G8 anterior verificada, conservando datos, snapshots y eventos. No borrar tracking ni repetir cierres históricos para revertir. Un binario anterior vuelve a tratar EN_CURSO como desconocido; registrar ese límite antes de decidir rollback.

GO para revisión local sujeto a resultados finales. NO-GO de deploy/aceptación operativa mientras falten aprobaciones, SHA desplegados y smoke coordinado. Ninguna regularización de datos ni prueba externa se ejecutó en esta tarea.
