# Dependencias, responsables y condiciones de cierre

> Consolidación 29-10-2026: este documento conserva resultados y sesiones históricas. El estado de publicación vigente está en [19](19-consolidacion-publicacion-p0-07.md). Las sesiones con TTL vencido no deben reutilizarse. Las referencias a `evidencias-qa/` corresponden a archivos locales preservados, excluidos de este PR; el resumen automatizado publicable está en [validación](p0-07-validacion-publicacion.json). La distribución académica y la certificación productiva siguen separadas de esta PR.

No se renegocian contratos ni se inventan rutas. Este documento identifica acciones
pendientes; no autoriza tráfico real, cambios de infraestructura o datos.

## G1 — Inventario y conciliación

- **Propietario:** G1 para unidades, existencias, movimientos y asociación física;
  G8 para tracking comercial y recuperación.
- **Conservado:** adapter y contrato S2S actuales, event_id estable, payload
  persistido, empresa y correlaciones. `equipos_asociados=0` puede indicar
  PENDIENTE_CIERRE, no necesariamente error definitivo.
- **Evidencia:** suites G1 y simulador HTTP/PostgreSQL P0-05. El smoke real histórico
  con cierre técnico simulado por G1 se conserva como histórico, no como E2E actual
  originado por G3 real.
- **Falta:** G1/G8/G3 deben acordar un caso QA físico y aportar consultas posteriores
  de unidad/equipos, replay exacto y asociación a contrato/servicio/empresa correctos.
  La durabilidad/retención de idempotencia tras reinicio de G1 no se acredita con
  el registro en memoria del simulador local.
- **Cierre verificable:** evidencia saneada con un evento, payload compatible,
  conteos antes/después y un solo efecto físico; sin publicar keys ni datos reales.

## G2 — Portal, pagos y WiFi

- **Propietario:** G2 para UX del portal, callback autorizado y recepción del
  resultado técnico; G8 para finanzas contractuales y endpoints pactados.
- **Conservado:** formato de facturas, saldoExigible numérico, empresa por contrato,
  comprobante/documento y resultados WiFi pactados. `codigo_transaccion` determina
  idempotencia del pago; `request_id` opcional no sustituye esa identidad.
- **Evidencia:** contrato JSON, servicio y HTTP multiempresa repetidos en P0-07;
  no se probó el portal desplegado ni una pasarela real.
- **Falta:** G2/G8 deben confirmar los consumidores actuales, identidades QA y
  smokes empresa 1/2, cliente compartido, pagos parcial/completo, replay/conflicto,
  consulta/descarga y resultado WiFi. G3/G2 deben identificar quién confirma
  APLICADO realmente; no declarar una ejecución Smart OLT inexistente.
- **Cierre verificable:** evidencia coordinada de cada operación y rechazo de
  empresa/key incorrectas; política financiera global ratificada si se pretende
  modificar el estado global compartido. Hasta entonces se conserva la protección.

## G3 — Instalación y autoridad técnica

- **Propietario:** G3 para OT/agenda/técnicos/aprobación/cierre; G8 para activación
  comercial de relaciones autorizadas y recuperación posterior.
- **Conservado:** instalaciones con wrapper, request_id/trace_id, scope empresarial
  en detalle/cierre, webhook approval-only y conflicto ante hash incompatible.
- **Evidencia:** tests locales y activación/recuperación en PostgreSQL QA. La OT #53
  histórica no se consulta, modifica ni reconcilia en esta entrega.
- **Falta:** ventana E2E G3→G8→G1 actual con fixture nuevo y evidencia del cierre
  realmente emitido por G3. No usar un cierre simulado para declarar esa cadena real.
- **Cierre verificable:** solicitud/retry idénticos, una OT, aprobación, webhook,
  una activación y asociación G1 con empresa/contrato/servicio coherentes.

### Reparación CU75/76 y retiro

**BLOCKED_EXTERNAL.** G3 y G8 deben ratificar operación, autenticación, empresa,
correlación, estados, errores e idempotencia; G1 participa si hay devolución física.
La UI de tickets permite seguimiento comercial. Los rechazos 410 y el estado
BLOQUEADO_CONTRATO_G3 de retiro son protecciones deliberadas, no errores que se
deban eludir durante la presentación. No reaprovechar instalaciones como reparación.

## Otros responsables

| Dependencia | Responsable | Qué falta y qué demostraría cierre | Prueba local |
| --- | --- | --- | --- |
| SMTP | Administrador de correo | Cuenta/remitente/destinatario QA, TLS y recepción real autorizada | 27 pruebas loopback PASS; OpenSSL corregido |
| Meta/WhatsApp | Comunicaciones de cada empresa | App/WABA/número, templates y scopes; entrega y estado webhook real | Messaging y webhook con fixtures |
| Facturación.cl | Responsable fiscal y proveedor | Perfil sandbox por empresa, tipos/documentos autorizados y conciliación; autorización independiente para producción | Emisor/recovery/prototipo locales; production no certificada sigue bloqueada |
| Smart OLT | G3/red | Acuerdo de fuente/operación, scope y medición real reciente | Consulta de datos locales; no inventar latencia/equipos |
| TV IP | Administrador plataforma TV IP | Acuerdo/provisión y autenticación QA de la plataforma | Credencial comercial local no acredita acceso al proveedor |
| VPS/Nginx | Infraestructura | Imagen, HTTPS, CORS, health/ready, backup/restore y monitoreo | Builds/runtime estático previos; Docker no disponible aquí |
| Schema compartido | Administradores DB y dueños intergrupales | Catálogo/historial frescos READ ONLY autorizados y plan ratificado si existe delta | Canónico y PostgreSQL QA existentes; no inferir DDL pendiente desde informes viejos |
| Seguridad Git/respaldos | Propietario repositorio, seguridad y autenticación | Clasificar exposición, vigencia/revocación, distribución y eventual limpieza coordinada | Auditoría P0-07 sin mostrar valores; ver [06](06-riesgos-y-criterios-go-no-go.md) |

## Coordinación mínima hasta la entrega

Orden recomendado, no compromiso confirmado por los responsables:

1. G8/QA y propietario: seleccionar material distribuible y preparar demo aislada.
2. G8/QA: ensayar el guion, registrar capturas y rechazos de permisos.
3. G1/G2/G3: ratificar pendientes y acordar una ventana de pruebas. Las URLs/keys
   se intercambian por canal privado, nunca en estos documentos.
4. Infraestructura: preparar VPS en paralelo, sin suponer autorización de deploy.
5. Evaluador: aceptar el alcance demostrado y registrar excepciones antes del
   15-11-2026. Si exige todos los CU intergrupales operativos, mantener bloqueo hasta
   sus pruebas reales; no sustituirlas silenciosamente por simuladores.

No se enviaron mensajes a otros grupos ni se alteró su configuración. Las acciones
anteriores están asignadas por responsabilidad funcional, no se presume aprobación.
