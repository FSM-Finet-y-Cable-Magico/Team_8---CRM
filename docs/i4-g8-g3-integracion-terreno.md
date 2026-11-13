# Integración terreno G8 ↔ G3 — candidato local

Fecha: 2026-11-08. Rama existente: `Fix/integracionTerreno` (Git distingue esta grafía de `fix/integracionTerreno`). Base alineada por fast-forward a `fd24aeb169d6d227fd653032a7185db6097b62c7`; su árbol coincide con el release `22e6cf1d85dcec8bc524f299729a8bbce2a7b8be`.

Alcance ratificado por el propietario en esta intervención: compatibilidad segura, protección contra sobrescrituras y contratos propuestos. No habilitar altas/ediciones comerciales S2S ni derivaciones automáticas. No crear bandeja comercial persistente.

## Evidencia y límites

Inspección estática G8: customers, prospects, tickets, integration-auth, instalación, activación, cierre, retiros, ciclo comercial y pruebas existentes. Referencia G3 fijada en `f834d63f06bc3799d65d881c33f47a1b601e6730`, obtenida del repositorio público; archivos contrastados con sus hashes Git. No es una certificación de lo desplegado.

Fuentes G3:

- [Controlador S2S](https://github.com/FSM-Finet-y-Cable-Magico/Team-3-FSM/blob/f834d63f06bc3799d65d881c33f47a1b601e6730/fsm/backend/src/integraciones/integraciones.controller.ts).
- [Tickets: crear, porCodigo y transiciones](https://github.com/FSM-Finet-y-Cable-Magico/Team-3-FSM/blob/f834d63f06bc3799d65d881c33f47a1b601e6730/fsm/backend/src/tickets/tickets.service.ts).
- [Vocabularios y origen CRM](https://github.com/FSM-Finet-y-Cable-Magico/Team-3-FSM/blob/f834d63f06bc3799d65d881c33f47a1b601e6730/fsm/backend/src/tickets/tickets.constants.ts).

Verificar con G3 la revisión efectivamente desplegada: el código público inspeccionado de `clientes/clientes.service.ts` todavía contiene escrituras comerciales en `registrarCliente`, `editarFicha` y `registrarBaja`. Esto difiere de la eliminación comunicada; no demuestra que esas escrituras sigan desplegadas. No se modificó G3 ni se probó su VPS.

El contexto menciona G3 en `finet_global_validacion` y G8 en `crm_g8_prueba`, además del modelo compartido `public.ticket`. Una coincidencia de IDs entre bases diferentes no identifica el mismo registro. Antes de una sincronización deben ratificarse identidad del entorno y estrategia compartida/federada. No se consultó ninguna de esas bases.

> **Actualización 13-11-2026:** la base efectiva de G8 en la VPS quedó identificada como `finet-postgres-global` / `finet_global_validacion`. Se confirmó con la conexión real de Prisma del backend y con PostgreSQL. G8 **no** usa `crm_g8_prueba`.

## Matriz de flujos

| Operación | Autoridad | Endpoint vigente o propuesto | Datos y respuesta | Estado / responsable |
|---|---|---|---|---|
| Alta/edición comercial solicitada por G3 | G8 | Propuestas abajo; no existen en este candidato | Identidad validada, empresa, autorización comercial, idempotencia | No habilitada; ratificación G8/G3 |
| Solicitud administrativa de retiro | G8 | `/api/service-withdrawals` humano existente | Servicio/contrato/empresa, motivo, fecha; REGISTRADA y BLOQUEADO_CONTRATO_G3 | No cierra servicio ni cliente; coordinar contrato técnico |
| Instalación | G8 solicita; G3 ejecuta | G3 `POST /api/integraciones/instalaciones` | Snapshot inmutable con request_id, trace_id, empresa, prospecto, contrato, plan, persona y dirección; wrapper success/data | Existente; idempotencia y conflictos conservados |
| Seguimiento OT | G3 | G3 `GET /api/integraciones/ordenes/:id?id_empresa=N` | ID OT, estado, técnico y origen_integracion | Compatible EN_CURSO; solo lectura |
| Consulta cierre | G3 | G3 `GET /api/integraciones/ordenes/:id/cierre?id_empresa=N` | Payload de cierre correlacionado | Existente; no activar por un GET detalle |
| Recepción cierre | G8 valida | G8 `POST /api/integraciones/fsm/ordenes/:idOt/cierre` y ruta existente de eventos | Empresa, OT, request/trace, contrato, prospecto, plan, resultado técnico | Transacción e idempotencia vigentes sin cambio de contrato |
| Activación comercial | G8 | Interna, posterior al cierre validado | Contrato y servicio objetivo; identidad vinculada explícitamente | Conserva Moroso/Suspendido globales y propiedad multiempresa |
| Inventario y asociación equipos | G1 | Cliente G1 y recuperación poscierre existentes | event_id y correlación empresa/contrato/cliente/servicio | Sin modificaciones; IDs técnicos G3 no son IDs G1 |
| Ticket comercial existente | G8, reglas actuales | G8 `/api/tickets` y PATCH existentes | ID/código compartido, cliente, servicio y empresa | Consulta técnica protegida; no POST adicional a G3 |
| Nuevo ticket técnico | G3 | G3 `POST /api/integraciones/tickets` | id_empresa, rut_cliente, id_categoria, descripcion, origen | Existe en G3, NO se invoca desde este candidato |
| Consulta ticket técnico | G3 | G3 `GET /api/integraciones/tickets/:codigo?id_empresa=N` | codigo_seguimiento, estado, categoría, fechas/SLA | No devuelve correlación suficiente para adoptar un ticket arbitrario |
| Derivar ticket existente a OT | G3 | No se encontró endpoint S2S de escalamiento ratificado | No confundir ticket con OT | G8 `/api/tickets/:id/work-order` conserva 410 tras autorización |
| Reparación/retiro: cierre técnico | G3 | Contrato S2S pendiente | Evidencia técnica separada de baja comercial/deuda | No simular éxito ni reutilizar cierre de instalación |

## Cambios implementados exclusivamente en G8

1. `ticket-ownership.ts`: clasifica vocabularios para lectura. Mantiene `estado` original y añade `vocabularioEstado`, `estadoPresentacion`, `soloLecturaTecnica` a la lista. Es una protección conservadora, no un registro autoritativo de propiedad.
2. Tickets G3 o de estado desconocido: bloquea categoría, prioridad, estado, diagnóstico y notas, también para administrador. Primero verifica acceso empresarial. Un origen CRM no concede escritura: G3 también usa CRM.
3. Tickets CRM conocidos: preserva operaciones legítimas. La escritura condiciona `idTicket`, `idEmpresa` y estado previamente leído. Si no coinciden, responde conflicto, sin auditar éxito. No ofrece garantía general de serialización de notas concurrentes; no existe versión/revisión del ticket.
4. Interfaz: conserva consulta histórica, muestra el estado recibido/presentación y oculta escrituras en tickets técnicos/desconocidos. Backend anterior: mismo criterio conservador local. No depende de ocultar botones para la autorización.
5. Identidad: consulta RUT válido con y sin guion en búsqueda de clientes y alta de ticket. Si hay dos candidatos visibles no elige uno ni fusiona; requiere revisión. Conserva la autorización por empresa/contratos. No modifica RUT almacenado.
6. Instalaciones: impide crear otra identidad cuando ya existe el RUT compacto sin vínculo contractual explícito, tanto antes del tracking como dentro de la activación. Un cliente explícitamente vinculado puede conservar su RUT compacto; no se reescribe su estado financiero.
7. Detalle OT: valida referencias suministradas tanto en campos directos como en `origen_integracion`. Si ambos existen, ambos deben coincidir. No se aplanan ni sustituyen referencias contradictorias. Cierres siguen su contrato estricto; EN_CURSO sigue sin activar.

No se cambió G2, Webpay, billing, emisión tributaria, cobros, fixtures financieros, esquema, migraciones, roles intergrupo ni formato de payloads existentes. Tampoco se añadió envío de tickets ni un endpoint de mutación comercial G3.

El retiro humano existente no se presenta como API S2S lista: carece de clave idempotente, usa auditoría fuera de transacción y permite seleccionar otro contrato del mismo cliente/empresa aunque no sea el del servicio. Antes de exponerlo a G3 deben resolverse esos puntos y exigirse la relación exacta del servicio. En este alcance de compatibilidad no se cambió ni habilitó esa escritura.

## Estados: contrato propuesto, no ratificado

| Dominio | Valor recibido | Presentación segura | Escritura / autoridad |
|---|---|---|---|
| Cliente G8 | Activo | Mantener valor | No convertir en ACTIVO al enviar ticket |
| Cliente G3 | ACTIVO | No usar como prueba de servicio o autorización | Ratificar vocabulario y elegibilidad por servicio/contrato, no por estado global |
| Cliente financiero | Moroso / Suspendido | Mantener | No activar globalmente por solicitud técnica |
| Ticket G8 | Abierto / En progreso / Escalado / Resuelto / Cerrado | Sin cambio | Reglas CRM actuales, sin inferir OT creada |
| Ticket G3 | ABIERTO / EN_PROGRESO / DERIVADO_OT / RESUELTO | Abierto / En progreso / Derivado a OT / Resuelto | Solo lectura G8 hasta ratificar sincronización |
| Ticket desconocido | Cualquier otro literal | Conservar original | Solo lectura, no asignar índice de transición -1 |
| OT instalación | EN_CURSO | EN_CURSO | Seguimiento, nunca cierre o activación |

`Escalado` no equivale a `DERIVADO_OT`: el primero no demuestra una OT. `Resuelto` no autoriza convertir en `RESUELTO`. G3 admite volver DERIVADO_OT→ABIERTO cuando se cancela OT; no aplicar una comparación ordinal CRM a ese flujo. No existe equivalencia G3 para Cerrado ratificada.

### Incompatibilidad Activo / ACTIVO

`TicketsService.crear` de la referencia G3 exige `cliente.estado === 'ACTIVO'` y `Cliente.id_empresa` principal. G8 usa Activo y permite contratos legítimos compartidos. Transformar ese estado global en G8 rompería reglas financieras y consultas aprobadas; tampoco bastaría para autorizar la segunda empresa. Bloqueo externo a ratificar: G3 debe confirmar elegibilidad por servicio/contrato de la empresa y compatibilidad del vocabulario, sin ampliar privilegios. No se incluyó parche G3.

### RUT: alcance de compatibilidad

Se conserva escritura canónica G8 con guion y se reconocen ambas grafías en los puntos modificados. G3 consulta variantes pero escribe compacto en la referencia. Esto NO certifica compatibilidad bidireccional completa de todos los módulos. No se modificó la búsqueda financiera G2/G8 ni se hizo una normalización global de históricos.

La unicidad textual actual no impide creaciones concurrentes de dos grafías por aplicaciones diferentes. Antes de habilitar altas S2S: ratificar formato canónico de nuevas escrituras y unicidad de identidad normalizada, con revisión de duplicados y migración aprobada si es necesaria. La comprobación de existencia es defensiva; no reemplaza esa restricción intergrupo. RUT válido nunca implica permiso para vincular cliente, empresa o contrato.

## API comercial propuesta — no implementada ni habilitada

Rutas candidatas G8, pendientes de acuerdo; no anunciar como disponibles:

- `POST /api/integraciones/fsm/clientes`: alta de identidad registrada autorizada.
- `PATCH /api/integraciones/fsm/clientes/:idCliente`: modificación de identidad autorizada.
- `POST /api/integraciones/fsm/clientes/:idCliente/solicitudes-baja`: solicitud comercial, no baja efectiva ni OT.

Autenticación: guard S2S existente, grupo G3, API key backend y empresas autorizadas. No traducir JEFE_TECNICO a Soporte ni aceptar JWT humano como credencial del sistema. Empresa declarada debe coincidir con las relaciones comprobadas, no basta el scope del header.

Envolvente propuesta: `request_id`, `trace_id`, `id_empresa`, operación y datos mínimos. Las ediciones requieren revisión esperada y una autorización emitida/verificable por G8 que detalle campos/identidad/empresa/operación y vigencia. Un booleano `aprobado=true` enviado por G3 no sería autorización. La política concreta de aprobación debe ratificarse antes de implementar.

Alta: validar RUT, identidad, empresa existente y duplicados en ambas grafías. No crear contrato, servicio, activación, dirección contractual ni vínculo a cliente compartido por coincidencia RUT. Definir previamente el estado de «cliente registrado sin servicio»; no usar Activo/ACTIVO para satisfacer una precondición técnica.

Edición: lista explícita de campos de contacto permitidos, validación de longitud/formato y revisión esperada. Excluir estado financiero, idEmpresa principal, RUT/identidad, contratos, planes, servicios, datos técnicos de G1/G3 y documentos firmados. Identidad compartida exige autorización comercial consolidada verificable; una API key por empresa no autoriza cambios globales. Dirección contractual firmada requiere su propio flujo de aprobación/firma; no alterarla silenciosamente.

Baja: comprobar relación exacta cliente→servicio→contrato→empresa, autorización comercial, motivo y fecha. Solicitud no cambia cliente/contrato/servicio ni deuda. Separar aprobación comercial, orden de retiro G3, cierre técnico y confirmación final G8. No reutilizar IDs técnicos ni inventar deuda cero. Coordinar trazabilidad de auditoría en la misma transacción que la solicitud.

Idempotencia futura: registro durable único por grupo/empresa/operación/request_id, hash canónico validado y resultado original atómico con la operación. Repetición idéntica devuelve resultado original; distinto hash, 409; trace_id no identifica operaciones. Persistir antes de responder; una auditoría best-effort sin transacción no sustituye el registro. No se creó bandeja ni esquema en esta entrega.

Errores propuestos: 400 validación, 401 credencial, 403 alcance, 404 recurso no visible, 409 identidad/revisión/hash incompatible; sin revelar datos de la otra empresa. La respuesta solo incluiría referencias y campos permitidos, nunca hashes de claves o datos globales sin atribución.

## Correlación e idempotencia de tickets — propuesta

Contrato G3 observado: POST tickets acepta origen CRM, pero no request_id/trace_id/referencia externa ni reutilización de fila. Genera un nuevo código y una nueva fila por llamada. Sus reintentos internos solo resuelven colisiones aleatorias de código. GET por código no prueba relación con un contrato/servicio ni devuelve un registro de idempotencia.

No hacer POST después de `/api/tickets` ni ante timeout/500 sin conocer resultado: puede haber commit remoto con respuesta perdida. No reconstruir correlación por RUT, texto, categoría, coincidencia numérica o cercanía horaria.

Diseño a ratificar:

1. Para tabla y entorno realmente compartidos, adoptar el ticket existente mediante una operación G3 explícita. Validar `(entorno, id_empresa, id_ticket, codigo_seguimiento)` y relaciones de cliente/servicio; transición de autoridad atómica y una sola fila. La operación no crea otro ticket. Todavía no existe ese endpoint S2S confirmado.
2. Para bases separadas, permitir dos registros solo si se ratifica que representan entidades diferentes, con vínculo durable G8↔G3 y claves externas, nunca igualdad implícita de PK. No aplicarlo como solución al caso de tabla compartida.
3. Comando de adopción/creación debe llevar request_id, trace_id, hash canónico y referencia G8; G3 debe persistir una restricción idempotente y resultado. G8 necesita evidencia durable antes del envío y recuperación tras reinicio. Una tabla de tracking solo G8 no hace idempotente un POST remoto sin soporte.
4. Congelar snapshot antes de enviar; empresa, cliente, servicio, categoría y entorno no pueden cambiar en un retry. Mismo ID/distinto hash→409. Timeout tras envío→resultado desconocido, consulta por clave idempotente ratificada; no reenvío ciego ni regeneración de IDs.
5. Eventos técnicos requieren event_id, referencia original, empresa, versión/secuencia, estado original y evidencia de OT cuando corresponda. Actualización condicional, deduplicación persistente y control de respuestas tardías. Estado terminal no retrocede por un GET antiguo. La reapertura por cancelación debe ser evento autorizado explícito.
6. Separar estado comercial de seguimiento de estado técnico. En tabla compartida no escribir dos vocabularios sobre el mismo `estado`. Acordar propietario por campo y estado de adopción persistido antes de habilitar cambios. No usar descripción/auditoría/convención mayúscula como registro durable de correlación.

## Propuesta de fixtures sintéticos — NO ejecutada

Preparar mediante flujos autorizados en una sesión QA nueva y aislada; nunca copiar `crm_g8_prueba` ni introducir estos registros automáticamente en `finet_global_validacion`:

| Caso lógico | Datos sintéticos mínimos | Verificación esperada |
|---|---|---|
| QA-FINET y QA-CABLE | Empresas QA 1/2 confirmadas por operador, usuarios sintéticos y claves solo QA por scope | Una clave no consulta/escribe la otra empresa |
| QA-IDENTIDAD | RUT de prueba con DV válido, nombre QA y correo example.invalid; probar grafía compacta y con guion en sesiones independientes | Misma búsqueda, ninguna reescritura de identidad |
| QA-AMBIGUA | Dos filas sintéticas de grafías equivalentes, solo si el esquema QA lo permite | Conflicto y cero asociación automática |
| QA-COMPARTIDO | Una identidad, dos contratos explícitos por empresa y servicios independientes | Elegibilidad por contrato/servicio, no empresa principal |
| QA-FINANCIERO | Identidad compartida Moroso/Suspendido y un servicio objetivo pendiente con contrato Firmado | Cierre válido activa solo objetivo, conserva estado global |
| QA-INSTALACION | Prospecto, plan, contrato firmado y snapshot coherentes; OT G3 QA asignada por su propietario | EN_CURSO no activa; cierre correlacionado sí; retry sin duplicar |
| QA-TICKET-COMPARTIDO | Una fila por caso ABIERTO/EN_PROGRESO/DERIVADO_OT/RESUELTO, origen CRM | Consulta G8, ninguna escritura ni segundo POST |
| QA-RETIRO | Servicio/contrato/cliente coherentes, solicitud administrativa QA | Sin baja automática ni OT inventada |

No reservar ni manipular IDs históricos (OT 53/56, etc.). Los IDs de usuario técnico G3 y G1 se registran en namespaces distintos. La preparación de fixtures globales requiere autorización de ambos propietarios y comprobación de entorno.

## Ratificaciones pendientes y responsables

- G3/G8: versión desplegada y eliminación efectiva de escrituras comerciales directas; identidad del entorno compartido.
- G8 comercial/G3: estado de cliente registrado y elegibilidad del soporte, especialmente cliente compartido o moroso.
- G3/G8: formato RUT canónico, unicidad normalizada, diagnóstico histórico sin fusiones automáticas.
- G3: adopción idempotente de ticket existente, propiedad por campo, consulta por clave y correlación durable; no hay escalamiento S2S confirmado.
- G3/G8: estados de reparación/reapertura/cierre y eventos fuera de orden; no afecta al cierre de instalaciones aprobado.
- G8 comercial/G3/G1: autorización y secuencia de bajas/retiros; inventario sigue siendo G1.
- G8/G3: autorización de altas/ediciones, auditoría atómica, contrato de errores y persistencia idempotente futura.

## Validación y seguridad operacional

Resultados y comandos exactos: `i4-g8-g3-integracion-terreno-validacion.md`. Pruebas con mocks y sockets restringidos a loopback; variables sintéticas y bloqueo de lectura de archivos privados `.env` en los procesos QA. No se inició AppModule con credenciales operativas.

No se ejecutaron migraciones, seeds, consultas PostgreSQL, escrituras compartidas, pagos, reconciliaciones reales, envío a proveedores, commits, push ni despliegues. No se modificaron otros worktrees ni repositorios G1/G3. La consulta pública del código fuente G3 fue únicamente documental.

Estado: candidato de compatibilidad para revisión. No equivale a integración completa ni aprobación de despliegue. Rollback futuro de código: revertir solo el diff de este candidato, preservando los cambios locales previos. No hay rollback de datos ni migraciones porque no se aplicaron.
