# Ciclo 2 — Retiro por morosidad y ticket CRM

Fecha: 11-11-2026. Revisión exclusivamente local en `Team_8---CRM-LibroControl`, rama `feat/ux-ui-libro-control`, base `123b4ede52b71167f31fe77dc04ad68abadadd62`. Se conserva el candidato del ciclo anterior.

## Resultado

**SOLICITUD_RETIRO_SEGURA=true** mediante las guardas ya implementadas y sus regresiones. **GENERACION_TICKET_RETIRO=BLOQUEADA_POR_VINCULO_ESTRUCTURADO**. No se añadió un endpoint de éxito aparente, no se creó ticket y no se habilitó despacho técnico.

La adenda C2-TK-01 ratifica la categoría comercial `Baja de servicio`; su disponibilidad permite clasificar una solicitud CRM, pero no aporta por sí sola la relación persistente solicitud–aviso–ticket ni confirma un retiro físico. Completar el catálogo no elimina este bloqueo independiente.

## Hallazgos comprobados en el código local

| Componente | Evidencia | Consecuencia |
|---|---|---|
| `backend/prisma/schema.prisma`, `ServicioRetiroSolicitud` | Tiene empresa, cliente, servicio, contrato opcional y estado; carece de `idTicket` e `idAviso`. | No existe asociación estructurada verificable con el ticket y el aviso utilizado. |
| Mismo esquema, `Ticket` | Tiene cliente, empresa, servicio y categoría; carece de vínculo a solicitud de retiro y de contrato directo. `origen` y `codigoSeguimiento` no son claves de retiro. | Una coincidencia de descripción, categoría o servicio no demuestra que un ticket corresponda a una solicitud específica. |
| Mismo esquema, `EventoGestionComercial` | Aviso vinculado a empresa, cliente y opcionalmente servicio/contrato/factura; carece de relación a solicitud/ticket. | No puede utilizarse como tabla de correlación de tickets. |
| `ServiceWithdrawalService.create()` | Serializa sobre la fila del servicio con `FOR UPDATE`; comprueba las relaciones exactas, deduplica la solicitud activa y audita dentro de la transacción. Para `MOROSIDAD` exige servicio suspendido, contrato, observaciones, deuda exigible vencida y aviso exacto. | Protege la intención comercial; registrar una solicitud no crea OT ni cambia el servicio. |
| Auditoría `CREAR_SOLICITUD_RETIRO_SERVICIO` | Conserva el `idAviso` consultado en `valorNuevo`. | Es evidencia de auditoría, **no** una FK/clave única de negocio ni sustituto del vínculo estructurado que falta. |
| `ServiceWithdrawalService.update()` | Rechaza `CERRADA` por falta de contrato técnico ratificado; cancelar no reactiva el servicio. | Se mantiene la separación solicitud/baja técnica. |
| `TicketsService.createForCustomer()` | Valida categoría autorizada y contrato/cliente/empresa del servicio; admite soporte de clientes suspendidos. No relaciona retiro ni aviso. | Reutilizar el alta genérica no resuelve la correlación requerida. |
| `TicketsService.createWorkOrder()` | Devuelve HTTP 410 `G3_INTEGRATION_REQUIRED` después de verificar autorización. | No se cambia ni elude este rechazo. |

Las referencias son al código realmente presente en el worktree; no son una inspección de PostgreSQL ni del contenedor QA.

## Rutas y permisos actuales

| Ruta | Responsabilidad | Permisos actuales |
|---|---|---|
| `POST /api/commercial/events` | Registrar gestión/aviso comercial; no ticket ni retiro técnico. | `MANAGE_COMMERCIAL_COLLECTIONS`: Administrador, Comercial. |
| `GET/POST /api/service-withdrawals` | Consultar/registrar solicitud comercial. | `MANAGE_CUSTOMER_REQUESTS`: Administrador, Comercial, Soporte. |
| `PATCH /api/service-withdrawals/:id` | Gestionar/cancelar solicitud, sin cierre técnico habilitado. | Mismo permiso. |
| `GET /api/tickets` | Consulta por ámbito empresarial. | `VIEW_CORE_DATA`: Administrador, Comercial, Soporte, **Terreno**. |
| `POST /api/tickets` | Alta comercial genérica. | `CREATE_TICKETS`: Administrador, Comercial, Soporte. |
| `POST /api/tickets/:id/work-order` | Derivación no disponible sin contrato G3. | `MANAGE_TICKETS`: Administrador, Soporte; conserva HTTP 410. |

Terreno **sí conserva consulta de Tickets** tanto en el controlador como en `frontend/src/permissions.ts`. No necesita elevarse a creador/administrador de tickets para consultar trabajo. Un ticket futuro solo será visible si existe realmente, pertenece a su empresa y pasa los filtros de consulta vigentes. No se modificaron permisos.

## Propuesta mínima de esquema, pendiente de aprobación

No se generó ni ejecutó migración, DDL ni script de backfill. Se propone intervenir únicamente la entidad G8 de solicitud de retiro, sin agregar columnas a la tabla compartida `ticket`:

1. `ServicioRetiroSolicitud.idAviso` nullable, FK a `evento_gestion_comercial.id_evento`, sin borrado en cascada.
2. `ServicioRetiroSolicitud.idTicket` nullable, FK a `ticket.id_ticket`, con unicidad para impedir que el mismo ticket se atribuya a dos solicitudes, sin borrado en cascada.
3. Los registros históricos conservan ambos valores nulos. No reconstruir relaciones a partir de texto, coincidencia de servicio o un webhook repetido; revisar cualquier incorporación histórica de manera explícita y auditada.
4. La aplicación valida bajo bloqueo que aviso, solicitud, contrato, servicio, cliente y empresa coincidan. La FK a ticket no acredita por sí sola todos esos atributos; son validaciones adicionales obligatorias en la transacción.

Esta propuesta evita modificar el contrato de ticket de G2/G3. Requiere revisión del propietario del esquema global, respaldo y autorización separada antes de implementar Prisma o SQL. Una tabla de vínculo 1:1 dedicada es una alternativa equivalente si el propietario prefiere evitar columnas en la solicitud existente; no se necesitan ambas soluciones.

### Operación local propuesta, todavía no implementada

Un futuro `POST /api/service-withdrawals/:id/ticket`, compatible con las convenciones actuales, podría ejecutarse así:

1. Autenticar y comprobar permiso comercial y empresa antes de revelar detalles.
2. Abrir transacción y serializar sobre el servicio/solicitud siguiendo el mismo orden de locks vigente.
3. Releer solicitud, servicio y contrato; exigir `MOROSIDAD`, estado vigente, servicio `Suspendido`, relaciones coherentes, aviso estructurado válido y deuda exigible vencida actual con `invoiceBalance()`.
4. Si hay `idTicket` persistido, verificar su empresa/cliente/servicio y devolver ese mismo ticket con estado real. Ni un cierre administrativo ni un retry autorizan crear otro ticket automáticamente.
5. Resolver de manera inequívoca la categoría oficial `Baja de servicio` del catálogo real. No fijar ID, SLA ni utilizar un homónimo técnico/interno.
6. Crear **ticket CRM local**, persistir el vínculo en solicitud y registrar auditoría con los IDs mínimos dentro de la misma transacción. Un error de cualquiera de las escrituras revierte las tres. No incluir RUT, contraseñas ni payloads de proveedores en la correlación.
7. Devolver el ticket real; no enviar a G3/G1 ni cambiar contrato, cliente, servicio, inventario o estado de cierre.

La solicitud cancelada o la deuda regularizada impiden crear un ticket nuevo. Un replay de `create()` de una solicitud ya persistida conserva su identidad y evidencias; no equivale a volver a aprobar su elegibilidad actual ni a despachar un ticket. Una acción nueva debe repetir las verificaciones actuales.

### Qué no se hace como alternativa temporal

No se codifica `idSolicitudRetiro` en descripción, `origen`, `codigoSeguimiento`, notas técnicas o auditoría JSON como sustituto de una relación. No se buscan tickets por texto para deduplicarlos. No se crea un botón que prometa una operación inexistente, ni un endpoint que responda éxito sin ticket persistido.

## Contrato técnico RETIRO pendiente de ratificación G3

La creación CRM y la ejecución técnica son etapas distintas. Deben ratificarse: tipo/clase técnica, categoría, identificadores y propiedad, empresa/cliente/servicio/contrato/solicitud/ticket/OT correlacionados, clave idempotente y snapshot, aceptación/rechazo, asignación y técnico, estados, cancelación, evidencia física/fotográfica, equipos y autoridad G1, firma/aprobación, instante efectivo y callback de cierre autorizado. No se implementó `OT Retiro`, nuevo enum ni adaptación del cierre de reparación/instalación.

La generación o cierre administrativo del ticket no da de baja. Cualquier futura baja exige evidencia técnica ratificada e idempotente, revisión de todas las relaciones pertinentes y conservación de deuda e historia.

## Regresiones locales del Ciclo 2

Archivo: `backend/src/g3-integration/service-withdrawal.service.spec.ts`. Se añadieron cinco casos y se reforzaron los existentes:

- El aviso y la deuda se consultan por empresa/cliente/servicio/contrato exactos.
- Una deuda regularizada impide nueva solicitud; cero ticket, OT, mutación de servicio y auditoría de éxito.
- Una factura anulada no acredita deuda exigible.
- Replay posterior a regularizar devuelve la solicitud original y conserva evidencia; no crea ticket, OT ni segunda auditoría.
- Empresa ajena rechazada antes de consultar evidencia comercial o crear registros.
- Doble solicitud, rechazo, fallo de auditoría y cancelación comprueban también **cero creación de ticket**. Se conservan rollback simulado, serialización, no duplicación y bloqueo de cierre técnico del ciclo anterior.

Comando seguro: `npm.cmd --prefix backend test -- service-withdrawal.service.spec.ts --runInBand`.

Resultado: **1 suite, 22 pruebas PASS, 0 FAIL**, código de salida 0; incluye cinco casos nuevos del Ciclo 2. Se utiliza Prisma y auditoría completamente simulados, sin iniciar aplicación, base de datos ni proveedores. La serialización del mock no certifica locks/concurrencia PostgreSQL real.

## Aceptación posterior del operador

Tras aprobar e implementar el vínculo estructurado y revisar el catálogo, ejecutar los casos C2-05 a C2-08 en entorno aislado autorizado: ticket visible para Terreno de su empresa; doble clic/reinicio devuelven el mismo ID; aviso/empresa/relación inválida/deuda regularizada rechazan sin ticket; auditoría fallida revierte ticket y vínculo; ninguna acción administrativa produce Baja ni modifica inventario. Esos escenarios **no están aprobados E2E** por esta revisión local.

No se utilizaron Docker, PostgreSQL, Mailpit, VPS, proveedores, G1/G2/G3 reales ni credenciales. Sin commit, push, PR o cambios de esquema.
