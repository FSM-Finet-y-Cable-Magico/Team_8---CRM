# Auditoria final de arquitectura CRM FiNet

## 1. Estado general

**Base auditada:** `feature/cu-incremento-2-final`.

Esta auditoria es no destructiva. No se modificaron modulos, Prisma, SQL, Railway, configuracion ni datos. El unico artefacto de esta fase es este documento.

El repositorio contiene un CRM React/NestJS/Prisma con responsabilidad comercial amplia, pero aun incluye implementaciones locales de inventario, FSM/terreno, topologia y monitoreo que deben pasar progresivamente a sus propietarios G1 y G3. El portal no tiene codigo fuente activo en esta rama: `portal/` contiene solamente `dist/`, `node_modules/` y `tsconfig.tsbuildinfo`; no existe `portal/src`, `portal/package.json`, `PortalModule` ni servicio `portal` en `docker-compose.yml`.

Conclusiones principales:

- G8 conserva prospectos, contratos, clientes comerciales, servicios comerciales, planes, zonas/precios, tickets CRM, solicitudes, observaciones, cobranza, pagos, reportes y auditoria.
- Inventario fisico y bodega estan implementados localmente, pero su propietario final es G1.
- OT, agenda, tecnicos, cierres de terreno, NAP/topologia, SmartOLT y monitoreo estan implementados localmente, pero su propietario final es G3.
- El portal local ya no forma parte del runtime del repositorio; el futuro consumo por cliente es responsabilidad de G2.
- El estado intermedio `Pendiente de activacion` no existe como categoria normalizada. Hoy se representa de forma fragmentada mediante `Cliente.estado`, `Contrato.estado`, `ServicioContratado.estadoOperativo`, `Prospecto.estadoPipeline` y `OrdenTrabajo.estado`.

## 2. Arquitectura actual detectada

### Backend

`backend/src/app.module.ts` registra Auth, Users, Companies, Prospects, Customers, Contracts, Services, Inventory, WorkOrders, Tickets, Billing, Plans, Reports, Monitoring, Tvip, Requests, Observations, Imports y Audit. Los controladores exponen REST bajo `/api` y el acceso se restringe por rol y empresa en los servicios.

### Frontend CRM

`frontend/src/App.tsx` centraliza carga y scope mediante `GET /companies/summary`, `/prospects`, `/plans`, `/customers`, `/inventory`, `/inventory/advanced`, `/billing/overview`, `/tickets`, `/tickets/categories` y `/work-orders`. Las features estan modularizadas en `frontend/src/features/*`.

### Persistencia y entorno

Prisma modela entidades comerciales, tecnicas y de inventario en una unica base PostgreSQL. `docker-compose.yml` levanta solo `db`, `backend` y `frontend`; no levanta Portal. `.env.example` no declara adaptadores para G1/G2/G3, eventos, webhooks, TOMODAT o SmartOLT.

## 3. Tabla completa de modulos

| Modulo / superficie | Endpoints o acciones actuales | Entidades principales | Frontend asociado | Clasificacion final | Razon, reemplazo y lectura que conserva CRM |
|---|---|---|---|---|---|
| Auth / Users / Companies | `/auth/*`, `/users/*`, `/companies`, `/companies/summary` | Usuario, Rol, UsuarioRol, Empresa, LogAuditoria | auth, users, layout, dashboard | MANTENER_G8 | Identidad de empleados CRM, roles y scope multiempresa. G8 conserva el control; futuros servicios externos requieren autenticacion service-to-service separada. |
| Prospects | `/prospects`, pipeline, feasibility, quotes, loss, contracts | Prospecto, Cotizacion, Cliente, Contrato, DireccionServicio | prospects | MODIFICAR | G8 conserva la gestion comercial, pero debe detener la conversion visual a cliente antes de firma y consumir cobertura de G3/TOMODAT. |
| Customers | `/customers`, `/customers/:id/history`, status, technical-data | Cliente, Contrato, ServicioContratado, DireccionServicio | customers | MODIFICAR | G8 conserva perfil comercial e historial. Datos tecnicos y equipos pasan a solo lectura de G1/G3; debe incorporar categoria Pendiente de activacion. |
| Contracts | create, confirm-signature, change-plan, digital-contract | Contrato, ContratoDigital, HistorialCambioPlan, Plan | customers | MANTENER_G8 | Contrato, plan comercial y firma comercial pertenecen a G8. Debe ajustar transiciones para que firma no active cliente; contrato digital externo necesita proveedor/estado interoperable. |
| Services | `/services/customer/:id`, create, update, deactivate, install-order, equipment | ServicioContratado, DireccionServicio, Plan, UnidadEquipo, OrdenTrabajo | customers | MODIFICAR | G8 conserva servicio comercial y estado comercial. Creacion/cierre de OT, datos de red y equipo fisico pasan a integracion G3/G1. |
| Inventory | `/inventory/*`, movimientos, estados, bloqueos, diagnostico, transferencias, mantenciones, evidencia | TipoEquipo, UnidadEquipo, Bodega, MovimientoInventario, StockConsumible, HistorialEstadoEquipo, TransferenciaEquipo, BajaEquipo | inventory, inventory advanced | REEMPLAZAR_G1 | CRM no debe administrar equipos, stock, bodegas, garantia ni movimientos. Mantiene referencias de equipo instalado, serie, modalidad y garantia en lectura. |
| NAP / topologia local | create NAP via `/inventory/nap-boxes`; modelos Olt, TarjetaPon, Mufa, CajaNap, PuertoNap | Olt, TarjetaPon, Mufa, CajaNap, PuertoNap | inventory advanced, monitoring | REEMPLAZAR_G3 | NAP y topologia son red/terreno. CRM debera consultar cobertura y referencia tecnica, sin editar elementos. |
| Work Orders / installations | `/work-orders`, complete-installation, complete-repair; creacion desde prospects/services/tickets | OrdenTrabajo, HistorialOt, EvidenciaFoto, UsoMaterialOt | installations, work-orders, customers, tickets | REEMPLAZAR_G3 | G3 crea, agenda, asigna, ejecuta y cierra OT. CRM solicita instalacion o terreno y muestra OT externa, estado, tecnico y fecha. |
| Monitoring / SmartOLT | `/monitoring/*`, demo-measurements | MonitoreoOnt, HistorialConexionOnt, Olt, UnidadEquipo | customers shared monitoring view | REEMPLAZAR_G3 | G3 es duenio de estado de red, ONU/ONT, SmartOLT, mediciones y topologia. CRM solo consulta estado tecnico y emite solicitudes comerciales de accion. |
| TV IP | `/tvip/contracts/:id/*`, `/tvip/customer/:id` | CredencialesTvip, Contrato, Plan | customers | MODIFICAR | La oferta comercial permanece en G8; aprovisionamiento y credenciales deben definirse con G3/G2. CRM no deberia ser fuente de password tecnico. |
| Tickets CRM | `/tickets`, categories, status, diagnosis, technical-notes, `:id/work-order` | Ticket, CategoriaFalla, OrdenTrabajo | tickets, customers | MODIFICAR | G8 conserva ticket, prioridad y atencion CRM. La derivacion a terreno debe solicitar OT externa G3, conservar `request_id`, `trace_id` e `id_ot_externa`. |
| Customer requests | `/requests/*` | SolicitudCliente | customers | MANTENER_G8 | G8 gestiona solicitudes comerciales y su trazabilidad. Solicitudes de Portal entran desde G2; solicitudes tecnicas se derivan a G3. |
| Billing | `/billing/overview`, payments, notifications, suspend, zones, zone-rules | Factura, Pago, ZonaPago, PlanZonaPrecio, PlantillaNotificacion, LogNotificacion | billing, dashboard | MANTENER_G8 / MODIFICAR | Deuda, pagos, morosidad, precios y decision comercial pertenecen a G8. Suspender/reactivar tecnicamente debe pedir ejecucion a G3; avisos deben alimentar G2/canal acordado. |
| Plans | `/plans`, activate, deactivate | Plan, PlanZonaPrecio, HistorialCambioPlan | plans, prospects, customers | MANTENER_G8 / MODIFICAR | G8 mantiene oferta y precio. Tipos de equipo requeridos deben ser referencias a catalogo G1, no unidades ni stock locales. |
| Reports | `/reports/export` | consultas de Cliente, Contrato, Factura, Ticket, OT, Inventario | reports | MODIFICAR | Reportes comerciales se mantienen G8. Campos tecnicos/inventario deben convertirse en datos externos de lectura y reportarse con fuente/fecha. |
| Observations / audit | `/observations/*`, `/audit` | ObservacionOperativa, LogAuditoria | observations, audit, customers | MANTENER_G8 | Historial comercial y trazabilidad interna permanecen. Deben registrar eventos externos con fuente, trace ID y payload resumido. |
| Imports | `/imports/clients` | Cliente, Prospecto, DireccionServicio, Contrato segun importacion | import | MANTENER_G8 / MODIFICAR | Importacion comercial permanece. Debe respetar la nueva poblacion Prospecto/Pendiente activacion/Activo y no crear inventario u OT local. |
| Portal | Sin endpoints/modulo fuente; solo artefactos compilados en `portal/` | Ninguna entidad propia activa en este repositorio | No hay feature activa | ELIMINAR_DESPUES_INTEGRACION | G2 es propietario. Mantener solo mientras sea necesaria evidencia/migracion; retirar artefactos al validar G2 E2E y sus contratos con G8. |

## 4. Clasificacion final consolidada

### MANTENER_G8

- Auth, usuarios, roles CRM, empresas y scope.
- Prospectos y seguimiento comercial, con correccion de estados.
- Clientes comerciales, contratos, servicios comerciales y direcciones.
- Planes, precios, zonas comerciales y cambio de plan.
- Tickets CRM, solicitudes CRM, observaciones y auditoria.
- Facturas, pagos, morosidad, comprobantes, notificaciones comerciales y reportes financieros.

### MODIFICAR

- Flujo Prospecto/Contrato/Cliente/Servicio para insertar Pendiente de activacion.
- Dashboard para separar prospectos, pendientes de activacion y clientes activos, y consumir metricas externas G1/G3.
- Servicios y perfil de cliente para mostrar referencias externas en lectura.
- Tickets para sustituir la OT local por solicitud G3.
- Cobranza para separar decision comercial de ejecucion tecnica de suspension/reactivacion.
- Planes para vincular requisitos por `idTipoEquipo` de G1.
- Reportes, auditoria e importaciones para registrar fuente externa, trace IDs e idempotencia.

### SOLO_LECTURA_EXTERNA

- Equipo instalado, numero de serie, tipo, estado, garantia, modalidad y bodega: desde G1.
- OT, tecnico, agenda, fecha de ejecucion, evidencia, potencia, ONU/ONT, NAP y monitoreo: desde G3.
- Portal y autoservicio: desde G2.

### REEMPLAZAR_G1

- CRUD de TipoEquipo, UnidadEquipo, Bodega, StockConsumible, MovimientoInventario, TransferenciaEquipo, BajaEquipo y garantia fisica.
- Asociacion fisica de equipo y cambios de estado de equipo.
- `InventoryPanel`, `InventoryAdvancedPanel` y endpoints `/inventory/*` de escritura, despues de integrar G1.

### REEMPLAZAR_G2

- No existe aplicacion Portal fuente que reemplazar en esta rama. Los artefactos en `portal/` deben tratarse como legado y eliminarse solo despues de validacion E2E con G2.

### REEMPLAZAR_G3

- CRUD, agenda, asignacion, cierre y codigos de OT.
- Creacion local de instalacion desde Prospectos, Servicios y Tickets.
- Cierre local de instalacion/reparacion y activacion tecnica automatica.
- Monitoreo, SmartOLT, OLT/PON/MUFA/NAP/PuertoNAP y datos de red.
- Evidencia de terreno, uso de materiales por OT y diagnostico/mantencion tecnico.

### DEPRECAR

- Endpoints de escritura local de inventario y red, una vez existan adaptadores G1/G3 en paralelo.
- Generacion local de codigo OT y asignacion local de tecnico.
- Credenciales TV IP generadas por CRM, hasta definir responsable de provisioning.
- Artefactos `portal/dist` y `portal/node_modules`, porque no son fuente ni runtime actual.

### ELIMINAR_DESPUES_INTEGRACION

- Implementaciones de escritura `/inventory/*` transferidas a G1.
- Creacion/cierre local de OT en `prospects`, `services`, `tickets` y `work-orders` despues de eventos E2E exitosos con G3.
- Tablas tecnicas duplicadas solo despues de migracion, retencion historica y conciliacion de IDs aprobadas.
- Directorio `portal/` solo despues de confirmar que G2 cubre autenticacion, servicios, deuda, tickets y solicitudes contra APIs G8.

### PENDIENTE_COMERCIAL

- Libro de control comercial, convenios, prorrogas, abonos, cargos, documentos tributarios, garantias comerciales y exportacion comercial especifica.
- API interna para G2: deuda, contratos, pagos, comprobantes, vencimientos, leads y actualizacion de contacto.
- Webhook idempotente de pagos y catalogo definitivo de notificaciones comerciales.
- Integracion Facturacion.cl y canal de notificacion real, ambos aun ausentes.

## 5. Inventario: salida de G8 y lectura requerida

### Funciones locales que deben salir del CRM hacia G1

| Funcion actual | Codigo / endpoint | Clasificacion | CRM conservara |
|---|---|---|---|
| Crear equipo y tipo por nombre | `POST /inventory/equipment`, `TipoEquipo`, `UnidadEquipo` | REEMPLAZAR_G1 | id externo, tipo, serie, modelo, estado y empresa en lectura. |
| Cambiar estado, bloquear, diagnosticar, mantener | `/inventory/equipment/:id/status`, `block`, `diagnosis`, `maintenance` | REEMPLAZAR_G1 | Estado, ultimo diagnostico y fecha de actualizacion. |
| Transferir y mover equipo | `/inventory/movements`, `transfer` | REEMPLAZAR_G1 | Referencia de ubicacion y estado actual. |
| Stock, umbral, consumibles y bodega | `/inventory/consumables*`, `StockConsumible`, `Bodega` | REEMPLAZAR_G1 | Disponibilidad agregada por tipo, solo para consulta comercial. |
| Garantia fisica y baja | `fechaVencGarantia`, `BajaEquipo` | REEMPLAZAR_G1 | Vigencia/estado de garantia de equipo instalado. |
| Asociar unidad a cliente/servicio | `installRouter`, `attachEquipment`, cierre local OT | REEMPLAZAR_G1 con evento G3 | ID externo de unidad, serie, modalidad, fecha y servicio comercial asociado. |
| Cajas NAP como inventario | `/inventory/nap-boxes`, `CajaNap` | REEMPLAZAR_G3 | Referencia tecnica y cobertura en lectura; no CRUD desde CRM. |

Riesgo: hoy `WorkOrdersService.completeInstallation` y `InventoryService.installRouter` escriben sobre la misma unidad local. Retirar uno sin el contrato G1/G3 romperia asociacion de equipo, historial y activacion visible.

## 6. Planes y requisitos de equipo

`Plan` contiene nombre comercial, tipo, tipo cliente, velocidad, precio, empresa y reglas por zona. Es suficiente como fuente comercial, por lo que su CRUD permanece G8.

Falta una relacion de requisitos de equipamiento. La implementacion futura debe almacenar solo una relacion comercial, por ejemplo `idPlan`, `idTipoEquipoExterno`, `cantidad`, `obligatorio`, con version y empresa cuando corresponda. No debe almacenar numero de serie, unidad fisica, stock ni bodega.

Dependencia esperada de G1: catalogo de tipos activos, documentado previamente como `GET /api/tipos-equipo`. El contrato exacto, autenticacion y version aun no estan definidos en codigo.

## 7. OT, instalaciones y FSM

### Implementacion local detectada

- `ProspectsService.createInstallOrder` crea `OrdenTrabajo`, agenda, tecnico, codigo OT y cambia pipeline.
- `ServicesService.createInstallOrder` crea una OT local desde un servicio pendiente.
- `TicketsService.createWorkOrder` crea OT de reparacion/soporte y escala el ticket.
- `WorkOrdersService.completeInstallation` cierra OT, activa Cliente/Contrato/Servicio, asocia UnidadEquipo y actualiza Prospecto.
- `WorkOrdersService.completeRepair` resuelve ticket y puede actualizar estado de cliente.
- `InstallationsPanel`, `InstallOrderForm` y `WorkOrdersPanel` son las superficies CRM que consumen estas rutas.

### Destino G3

G3 debe ser propietario de OT, agenda, tecnico, codigo de trazabilidad, ejecucion, evidencia y cierre. El CRM debe reemplazar las escrituras por:

1. Solicitud de instalacion o terreno hacia G3, con cliente comercial, contrato, servicio, direccion, plan, prioridad y `trace_id`.
2. Lectura de OT externa por referencia, estado, fecha, tecnico y resultado.
3. Evento `INSTALLATION_COMPLETED` desde G3, con `id_ot_externa`, resultado, fecha, tecnico y referencias G1 del equipo.
4. Procesamiento CRM idempotente que active el servicio comercial solo luego del evento exitoso.

Endpoint externo esperado: la matriz existente menciona una creacion de orden como `POST /ordenes`, pero no existe una URL/version contractual definitiva. Deben acordarse tambien eventos de OT creada, reprogramada, cancelada y completada.

## 8. SmartOLT, monitoreo y cobertura

`MonitoringService` consulta y escribe localmente `MonitoreoOnt` e `HistorialConexionOnt`; incluso expone `POST /monitoring/demo-measurements` fuera de produccion. `InventoryService` conserva NAP y `CustomersService.updateTechnicalData` permite editar datos tecnicos de cliente.

Clasificacion: REEMPLAZAR_G3. CRM solo debe visualizar un resumen tecnico externo y generar solicitudes comerciales para suspension, reactivacion, cambio WiFi o visita. No debe ejecutar SmartOLT ni almacenar mediciones como fuente primaria.

No existe integracion TOMODAT, mapa ni CoverageService. La futura interfaz minima requerida es:

- entrada: direccion normalizada, comuna/ciudad, empresa y opcionalmente plan/tipo de servicio;
- salida: factible, motivo, zona tecnica, cobertura, fecha de consulta, fuente, referencia de red y planes/restricciones aplicables;
- propiedades transversales: version, `trace_id`, resultado no factible explicito e idempotencia cuando aplique.

`ZonaPago` es comercial y debe permanecer G8. `CajaNap.zona`, latitud y longitud son datos tecnicos que deben ser G3.

## 9. Portal G2

Estado detectado: no hay fuente portal ni endpoints `/api/portal/*` en la rama auditada. README confirma que el portal pertenece a G2 y no se ejecuta en este repositorio.

Clasificacion: los artefactos compilados locales son DEPRECAR y ELIMINAR_DESPUES_INTEGRACION. No se debe reconstruir un portal dentro de G8.

Informacion que G2 necesitara de G8 mediante APIs acordadas:

- identidad comercial minima y datos de contacto permitidos;
- planes, contratos y estado comercial;
- servicios comerciales y estado de activacion;
- deuda, facturas, pagos, vencimientos y comprobantes;
- tickets CRM, solicitudes y sus estados;
- avisos comerciales y trazabilidad de entrega cuando aplique.

La matriz existente identifica como faltantes: consulta de deuda, contratos por RUT, webhook de pagos idempotente, actualizacion limitada de contacto, recepcion de leads, comprobantes y consultas de vencimiento/morosidad. Ninguno esta implementado como contrato service-to-service en la base auditada.

## 10. Tickets y solicitudes

`Ticket` pertenece a G8 como registro CRM. Actualmente el ticket puede crear una OT local unica (`id_ticket` es unico en `OrdenTrabajo`) y su cierre tecnico actualiza Ticket local. Esto debe pasar a una derivacion compartida: G8 conserva clasificacion, prioridad, comunicacion y estado CRM; G3 es propietario de la OT y devuelve resultado.

`SolicitudCliente` permanece en G8. G2 debe notificar solicitudes de portal con un contrato autenticado e idempotente. Si una solicitud requiere trabajo de terreno, CRM debe derivarla a G3, sin acceso directo a tablas de OT. Las solicitudes de cambio WiFi actuales no ejecutan router y por tanto pueden mantenerse como solicitud comercial hasta que G3 defina el adaptador tecnico.

## 11. Flujo actual Prospecto / Cliente

1. `Prospecto` se crea, recibe factibilidad, cotizacion y puede quedar perdido.
2. `ProspectsService.contractPlan` exige cotizacion factible y crea o reutiliza `Cliente`, `DireccionServicio` y `Contrato` con estado `Pendiente firma contrato`.
3. En esa misma transaccion el prospecto recibe `idCliente` y pipeline `Contrato externo registrado`.
4. `activeProspectWhere` excluye inmediatamente cualquier prospecto con `idCliente != null`; por tanto deja de ser prospecto visible antes de firma.
5. `ContractsService.confirmManualSignature` marca contrato `Firmado`, crea/asegura un servicio `Pendiente Instalacion` y reconcilia al cliente como `Pendiente Instalacion`.
6. Rutas locales de Prospectos/Servicios pueden crear OT de instalacion; el cierre local de OT activa cliente, contrato y servicio, y puede asociar equipo.

Puntos de conflicto con la regla nueva:

- La persona deja Prospectos al registrar contrato, no al firmarlo.
- No existe entidad/categoria explicita `Pendiente de activacion`; se usan varios estados locales.
- OT y cierre tecnico son propiedad local CRM, no G3.
- La activacion final depende de escrituras locales de OT/equipo, no de `INSTALLATION_COMPLETED` externo.

## 12. Flujo esperado Prospecto -> Pendiente de activacion -> Cliente activo

1. **Prospecto:** Nuevo -> Factibilidad -> Cotizacion -> Aceptacion -> Contrato generado -> Pendiente firma. Mientras no exista firma, permanece visualmente en Prospectos.
2. **Pendiente de activacion:** al firmar contrato, sale de Prospectos y entra en categoria intermedia de Clientes. Estados conceptuales: `CONTRATO_FIRMADO`, `PENDIENTE_INSTALACION`, `INSTALACION_SOLICITADA`, `OT_GENERADA`, `INSTALACION_EN_CURSO`.
3. **Cliente activo:** solo despues de que G3 complete OT y emita `INSTALLATION_COMPLETED`; CRM valida evento, registra referencias G1, activa cliente/servicio y conserva trazabilidad con prospecto/contrato/OT externa.

No se debe confundir contrato firmado con cliente activo. La implementacion futura debe usar una politica centralizada de estados y no filtros distintos por panel.

## 13. Impacto en Prisma (analisis solamente)

### Entidades propias que permanecen

Cliente, Prospecto, Cotizacion, Plan, Contrato, Factura, Pago, ZonaPago, PlanZonaPrecio, ServicioContratado, Ticket, SolicitudCliente, ObservacionOperativa, LogAuditoria, Usuario, Rol y UsuarioRol.

### Entidades duplicadas o de propiedad externa

- G1: TipoEquipo, UnidadEquipo, Bodega, MovimientoInventario, HistorialEstadoEquipo, StockConsumible, TransferenciaEquipo, BajaEquipo y garantias fisicas futuras.
- G3: OrdenTrabajo, HistorialOt, EvidenciaFoto, UsoMaterialOt, Olt, TarjetaPon, Mufa, CajaNap, PuertoNap, MonitoreoOnt e HistorialConexionOnt.
- G2: no hay modelo Portal activo en esta rama; no crear uno sin contrato acordado.

### Cambios futuros candidatos

- Referencias externas versionadas para OT G3, solicitud G3, equipo G1, tipo equipo G1, evento de instalacion y fuente de datos.
- Tabla o patron de eventos de integracion con `event_id`, sistema origen, tipo, payload resumido, fecha, `trace_id`, estado de procesamiento, idempotencia e error.
- Estado/categoria normalizada de Pendiente de activacion o una proyeccion derivada centralizada que no rompa historial.
- Relacion comercial Plan-RequisitoEquipo con IDs de tipo externo, cantidad y obligatoriedad.
- Separacion entre atributos comerciales del servicio y datos tecnicos externos de solo lectura.

No se recomienda borrar columnas/tablas locales hasta contar con migracion aprobada, retencion historica, equivalencias de IDs y E2E validado.

## 14. Impacto frontend

- `CustomersPanel`, `CustomerContractWorkflow` y `CustomerServiceManagementModal` deben mostrar tres poblaciones y consumir estado de activacion normalizado.
- `InstallationsPanel`, `InstallOrderForm` y `WorkOrdersPanel` deben convertirse en solicitud/consulta G3, sin formularios de creacion o cierre local cuando la integracion este activa.
- `InventoryPanel` e `InventoryAdvancedPanel` deben pasar gradualmente a vistas de referencia G1; primero ocultar escrituras bajo feature flag, luego retirar tras E2E.
- `MonitoringStatusView` y secciones tecnicas de cliente deben consultar G3 y mostrar fuente/fecha del dato.
- `PlansPanel` conserva CRUD G8 y agrega en el futuro requisitos de tipo G1.
- `BillingPanel` conserva acciones comerciales; la ejecucion tecnica debe exhibir solicitud/resultado G3.
- `TicketsPanel` conserva la derivacion CRM, pero muestra el identificador y estado de OT G3.

## 15. Impacto Dashboard

Fuente actual: `GET /companies/summary`, implementado por `CompaniesService`.

| Metrica actual | Fuente actual | Clasificacion futura |
|---|---|---|
| Prospectos activos | `Prospecto` con `idCliente = null` y no Perdido | G8, modificar para que contrato no firmado siga siendo prospecto. |
| Clientes activos | `Cliente.estado = Activo` | G8, confirmar contra al menos un servicio comercial activo posterior a evento G3. |
| Instalaciones pendientes | `OrdenTrabajo` local tipo Instalacion no cerrada | REEMPLAZAR_G3 progresivamente. |
| Tickets abiertos | `Ticket` no Resuelto/Cerrado | G8; OT vinculada se consulta en G3. |
| Clientes morosos | Cliente Moroso/Suspendido | G8; suspension tecnica se consulta en G3. |
| Inventario disponible | `UnidadEquipo.estado = Disponible` | REEMPLAZAR_G1 progresivamente. |
| Instalaciones mensuales | OT local completada | REEMPLAZAR_G3. |
| Churn | Contratos Baja/Suspendido | G8, requiere formula comercial definitiva. |

Se recomienda agregar posteriormente una metrica `Pendientes de activacion` derivada de contrato firmado y servicio no activo. No debe contar en Prospectos ni en Clientes activos.

## 16. Estado de casos de uso comerciales

| CU | Estado | Hallazgo de auditoria |
|---|---|---|
| CU-28 Notificacion preventiva de cobro | PARCIAL | Billing registra notificaciones y plantillas mock; falta contrato de envio/consulta con G2 y canal real. |
| CU-64 Multiples servicios | IMPLEMENTADO | Servicios, contratos y perfil individual existen; equipos/OT tecnicos deben ser lectura G1/G3. |
| CU-65 Perfil individual del servicio | PARCIAL | Existe vista y datos locales; requiere referencias externas de equipo, OT y monitoreo. |
| CU-66 Solicitudes de cliente | IMPLEMENTADO | CRUD y factibilidad local existen; requiere entrada autenticada desde G2 y derivacion G3 cuando aplique. |
| CU-67 Origen de captacion | IMPLEMENTADO | Prospecto conserva `origenContacto`; debe comprobarse en nuevo flujo de firma. |
| CU-68 Seguimiento comercial consolidado | IMPLEMENTADO | Dashboard y datos comerciales existen; debe incorporar pendiente de activacion y fuentes externas. |
| CU-69 Planes comerciales | PARCIAL | CRUD y zonas/precios existen; faltan requisitos de tipo de equipo G1. |
| CU-70 Zonas y precios por zona | IMPLEMENTADO | `ZonaPago` y `PlanZonaPrecio` existen; diferenciar zona comercial de cobertura/NAP G3. |
| CU-71 Observaciones contextuales | IMPLEMENTADO | Servicio y modal existen; agregar referencias de eventos externos en fase de integracion. |
| CU-73 Cambio de plan con historial | PARCIAL | Historial existe; validar aplicacion diferida de fecha efectiva y posibles OT externas. |
| CU-74 Contrato digital | IMPLEMENTADO | Generacion/version/descarga/firma local existen; requiere decision si firma externa sera proveedor interoperable. |

Casos comerciales que G8 debe mantener aunque provengan de G2: pagos, unicidad de transaccion, morosidad, decision comercial de suspension/reactivacion, recargos, reportes financieros, comprobantes y vencimientos. G2 informa o visualiza; G8 conserva la fuente financiera.

## 17. Dependencias intergrupo

| Relacion | Necesidad de CRM | Estado detectado |
|---|---|---|
| G8 <- G1 | Tipos de equipo, unidad instalada, serie, estado, garantia, disponibilidad y referencia de bodega | No existe adaptador/API G1 en esta rama. |
| G8 -> G1 | Solo referencias comerciales de plan/requisito; no administra stock | No existe modelo de requisito externo. |
| G8 <- G3 | Cobertura, factibilidad, OT, agenda, tecnico, cierre, evidencia, instalacion completada, estado tecnico | No existe adaptador/evento G3; hay escrituras locales duplicadas. |
| G8 -> G3 | Solicitud de instalacion, visita/reparacion, suspension/reactivacion comercial | No existe contrato externo; creacion local de OT sigue activa. |
| G8 <- G2 | Leads, solicitudes, pagos confirmados, cambios de contacto | No existe contrato service-to-service ni webhook idempotente. |
| G8 -> G2 | Deuda, contratos, servicios, tickets, pagos, comprobantes, vencimientos, estado comercial | No existe API Portal/G2 publicada en esta rama. |

## 18. Dependencias externas

- Facturacion.cl: no hay adaptador ni credenciales. Las referencias de contrato externo existen en `Contrato`; la integracion futura no debe bloquear el flujo comercial actual.
- WhatsApp/canal de avisos: no hay proveedor activo. Billing usa notificacion mock y tablas de plantilla/log.
- SmartOLT: no existe integracion real; CRM almacena datos locales y solicitudes, pero G3 debe ser propietario tecnico.
- TOMODAT/CoverageService: no existe integracion; la factibilidad actual es manual/local.
- Railway: no se reviso ni modifico en esta auditoria.

## 19. Riesgos

1. **Alto:** dos fuentes de verdad para equipos y OT mientras CRM y G1/G3 escriban los mismos conceptos.
2. **Alto:** el flujo actual elimina visualmente al prospecto al registrar contrato, antes de firma, en conflicto con la regla actualizada.
3. **Alto:** activacion local de cliente/servicio depende del cierre CRM; una activacion duplicada debe prevenirse con evento idempotente G3.
4. **Alto:** no existen IDs externos, `trace_id` ni inbox/outbox de eventos para reconciliar integraciones.
5. **Medio:** dashboard mezcla metricas locales que seran de G1/G3; no debe sustituirse por consultas externas sin fecha/fuente/fallback definido.
6. **Medio:** contratos digitales y TV IP locales pueden duplicar proveedores futuros.
7. **Medio:** Portal no posee fuente en este repositorio; no se puede verificar paridad ni eliminar artefactos hasta la entrega G2.
8. **Medio:** cobertura comercial y zona de pago pueden confundirse con zona tecnica/NAP.

## 20. Orden recomendado de implementacion

1. Definir contratos de integracion: IDs, auth service-to-service, version, errores, idempotencia, `trace_id`, eventos y ownership definitivo.
2. Corregir modelo de ciclo comercial G8: Prospecto hasta firma, Pendiente de activacion tras firma, Cliente activo solo por `INSTALLATION_COMPLETED`.
3. Crear adaptador G3 para solicitar instalacion/terreno y recibir eventos, manteniendo temporalmente coexistencia controlada con OT local.
4. Crear adaptador G1 y lectura de equipos/tipos; llevar Plan-RequisitoEquipo a referencias externas.
5. Cambiar UI Dashboard, Clientes, Servicios, Tickets, Instalaciones e Inventario a lectura externa/progresiva bajo flags de integracion.
6. Publicar APIs G8 requeridas por G2 y recibir leads/pagos/solicitudes con idempotencia.
7. Ejecutar pruebas E2E contra Railway compartido con datos de prueba y conciliacion de estados.
8. Deprecar acciones locales, conservar lectura historica y solo eliminar codigo/tablas tras evidencia E2E, retencion y plan de migracion aprobados.
9. Completar pendientes comerciales sin dependencia externa: control comercial, convenios, prorrogas, abonos, cargos, documentos tributarios y reportes.

## 21. Recomendacion de futuras branches

No se creo ninguna branch en esta auditoria. Candidatas, a crear desde `feature/cu-incremento-2-final` solo despues de aprobar esta auditoria:

- `fix/crm-activation-flow`: categorias, transiciones y dashboard Prospecto/Pendiente activacion/Activo.
- `feat/integration-fsm-g3`: adaptador OT, solicitudes, eventos de instalacion y derivacion de tickets.
- `feat/integration-inventory-g1`: tipos de equipo, referencias de unidades y vistas solo lectura.
- `feat/g8-api-for-g2`: contratos API para deuda, pagos, contratos, leads, solicitudes y datos comerciales.
- `refactor/remove-local-portal`: retiro de artefactos portal una vez validada la integracion G2.
- `feat/commercial-finalization`: control comercial, pagos avanzados, convenios, documentos y notificaciones.
- `refactor/external-integration-events`: inbox/outbox, idempotencia, trace IDs y auditoria de integraciones.

## 22. Recomendacion final

No iniciar eliminaciones ni reemplazos directos. La primera modificacion debe ser el flujo de activacion y el contrato de eventos G3, porque define cuando una persona deja Prospectos, cuando aparece Pendiente de activacion y cuando se vuelve Cliente activo. Inventario, OT y Portal deben coexistir temporalmente en modo de transicion con una unica fuente de escritura por dominio y consultas externas trazables.

La validacion de cualquier retiro debe comprobar permisos, scope multiempresa, auditoria, idempotencia, integridad de IDs, datos historicos y E2E en Railway compartido. Ninguna tabla tecnica local debe eliminarse antes de esa evidencia.
