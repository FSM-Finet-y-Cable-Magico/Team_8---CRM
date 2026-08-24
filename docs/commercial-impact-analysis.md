# Análisis de impacto del flujo comercial — Incremento 2

## Control de versión del análisis

Este documento fue corregido para utilizar como base la rama derivada de `feat-ux-ui-incremento2`. La verificación técnica se hizo contra `origin/feat/ux-ui-incremento2`, que contiene frontend modularizado, portal cliente independiente, Docker Compose con servicio portal y desacople del portal embebido del CRM. Por tanto, la incorporación comercial debe desarrollarse sobre la estructura modular existente y no sobre el antiguo `App.tsx` monolítico.

La fase 0A.1 solo corrige documentación. No modifica backend, frontend, portal, Prisma, SQL, Docker, `package.json` ni README.

## 1. Estado base del repositorio

El repositorio base actual tiene una arquitectura suficientemente preparada para iniciar la incorporación comercial de FiNet y Cable Mágico sin reescribir los módulos existentes.

### Estado técnico confirmado en la rama base

- Backend NestJS modular, con módulos separados para autenticación, usuarios, empresas, auditoría, RUT, importación, prospectos, clientes, servicios, inventario, tickets, órdenes de trabajo, reportes, planes, cobranza, portal, TV IP y monitoreo.
- Frontend CRM modularizado por features en `frontend/src/features/`.
- `App.tsx` funciona como orquestador principal reducido, no como contenedor monolítico de todos los paneles.
- `BillingPanel` existe como componente separado en `frontend/src/features/billing/BillingPanel.tsx`.
- Existen paneles separados para clientes, prospectos, tickets, órdenes de trabajo, inventario, dashboard, usuarios, reportes, auditoría, planes e instalaciones.
- Portal cliente independiente en `portal/`, con fuente React/Vite en `portal/src/PortalApp.tsx`.
- `portal/package.json` existe y el root `package.json` declara `portal` como workspace.
- Docker Compose levanta `db`, `backend`, `frontend` y `portal`.
- CRM interno corre en puerto `5173`.
- Portal cliente oficial corre en puerto `5174`.
- Backend corre en puerto `3000`.
- El portal cliente está desacoplado del CRM interno; el CRM puede abrirlo mediante `VITE_PORTAL_URL`.
- `docs/frontend-refactor-plan.md` existe y documenta el refactor frontend y la separación del portal.

### Módulo de cobranza actual

`BillingModule` ya cubre la base de cobranza:

- resumen de morosidad;
- facturas vencidas;
- clientes programados para corte;
- notificaciones simuladas o desactivadas;
- suspensión por no pago;
- registro de pagos;
- zonas de pago;
- reglas de precio por zona;
- auditoría de acciones críticas.

### Endpoints actuales detectados en `BillingController`

Todos los endpoints están bajo el prefijo global `/api`:

| Método | Endpoint | Uso actual |
| --- | --- | --- |
| GET | `/api/billing/overview` | Resumen de morosidad, facturas vencidas, cortes programados y notificaciones. |
| POST | `/api/billing/refresh-delinquency` | Recalcula y etiqueta clientes/contratos morosos. |
| POST | `/api/billing/notifications` | Registra aviso preventivo o último aviso previo al corte. |
| PATCH | `/api/billing/contracts/:id/suspend` | Suspende contrato por deuda vencida impaga. |
| POST | `/api/billing/payments` | Registra pago asociado a factura. |
| GET | `/api/billing/zones` | Lista zonas de pago según empresa/consolidado. |
| POST | `/api/billing/zones` | Crea zona de pago. |
| PATCH | `/api/billing/zones/:id` | Actualiza zona de pago. |
| GET | `/api/billing/zone-rules` | Lista reglas de precio por zona. |
| POST | `/api/billing/zone-rules` | Crea regla de precio por zona. |

### Fuentes internas consideradas

- `backend/prisma/schema.prisma`
- `backend/src/billing/billing.controller.ts`
- `backend/src/billing/billing.service.ts`
- `backend/src/common/permissions.ts`
- `frontend/src/features/billing/BillingPanel.tsx`
- `frontend/src/api.ts`
- `frontend/src/permissions.ts`
- `portal/src/PortalApp.tsx`
- `docs/frontend-refactor-plan.md`
- `docs/integraciones-pendientes.md`
- `docs/estado-primer-incremento.md`
- `README.md`
- `db/init/01_schema.sql`
- `db/init/06_seed_incremento2.sql`
- scripts incrementales disponibles en la rama base para zonas, contratos, códigos de OT y portal.

## 2. Capacidades existentes reutilizables

| Entidad | Estado en la rama base | Cómo apoya el flujo comercial |
| --- | --- | --- |
| Cliente | Existente. Incluye RUT, nombre, contacto, estado, empresa, origen y datos técnicos. | Identifica al abonado y permite asociar deuda, avisos, respuestas, observaciones, estado comercial y seguimiento. |
| Contrato | Existente. Incluye cliente, plan, empresa, zona de pago, fecha de inicio, día de vencimiento, estado y suspensión. | Base contractual para deuda, vencimiento, corte, reactivación y cambios comerciales. |
| Factura | Existente. Incluye periodo, monto, emisión, vencimiento y estado. | Base para deuda, saldo, mora, aviso de pago y programación de corte. |
| Pago | Existente. Incluye factura, cliente, monto, fecha, pasarela, comprobante y código de transacción único. | Base para registrar pagos y validar voucher único; debe reforzarse para clasificar abonos. |
| ZonaPago | Existente. Incluye empresa, nombre de zona, comuna, descripción, día sugerido y estado. | Permite filtrar y configurar cobranza por zona, base para reglas comerciales territoriales. |
| PlanZonaPrecio | Existente. Relaciona plan, zona, precio mensual y valor de instalación. | Permite tarifas por zona y prepara reglas comerciales configurables. |
| PlantillaNotificacion | Existente. Incluye tipo de evento, canal, contenido y activación. | Base reutilizable para plantillas de aviso de pago, corte y retiro. |
| LogNotificacion | Existente. Registra cliente, plantilla, canal, fecha y estado de envío. | Base para trazabilidad de avisos manuales y futura automatización. |
| ServicioContratado | Existente. Incluye cliente, empresa, contrato, dirección, zona de pago, estado operativo y datos técnicos. | Une el seguimiento comercial con servicio, corte, reposición, retiro, garantías y operación técnica. |
| ObservacionOperativa | Existente. Permite observaciones por tipo de entidad, entidad, cliente, empresa, usuario y visibilidad. | Base transversal para comentarios comerciales, técnicos o administrativos sin mezclar texto suelto. |
| LogAuditoria | Existente. Registra usuario, acción, entidad, valores e IP. | Trazabilidad de acciones sensibles: pagos, avisos, cortes, convenios, prórrogas, retiros y exportaciones. |
| Usuario | Existente. Incluye empresa, credenciales y estado. | Permite asignar responsable comercial y auditar acciones por operador. |
| Rol | Existente. Define roles del sistema. | Base para mapear permisos comerciales. |
| UsuarioRol | Existente. Relaciona usuarios y roles. | Permite asignación de perfiles comerciales y administrativos. |

### Capacidades complementarias útiles

- `SolicitudCliente` puede apoyar solicitudes comerciales o de retiro si se decide reutilizarla.
- `ContratoDigital` ya existe para contratos digitales, aunque no reemplaza documento tributario externo.
- `HistorialCambioPlan` ya existe y puede apoyar análisis de cambios comerciales recientes.
- `UnidadEquipo.modalidadAsignacion` y garantías de equipo apoyan reposición, retiro y garantías operativas.
- `Ticket` y `OrdenTrabajo` ya soportan flujo Ticket → OT; pueden usarse cuando una gestión comercial derive en retiro, reconexión o visita.

## 3. Brechas detectadas

Las brechas reales ya no son de arquitectura frontend ni de portal. La rama base ya tiene frontend modular, `BillingPanel` separado, portal independiente y Docker con portal.

Brechas comerciales pendientes:

- No existe Libro Control Comercial como entidad, endpoint o vista.
- No existe endpoint `/api/billing/commercial-control` ni módulo equivalente.
- No existe `CommercialControlPanel`.
- No existe entidad formal de evento comercial mensual/diario.
- No existe modelo específico para beneficios comerciales como convenio, prórroga o descuento.
- No existe documento tributario preparado para metadata de Facturación.cl.
- No existe respuesta de notificación modelada de forma explícita.
- Los permisos comerciales granulares aún no están definidos.
- El manejo formal de abono, convenio, prórroga y retiro aún no está separado del pago común o de observaciones.
- No existe cargo adicional formal para reposición/reconexión/retiro.
- No existe exportación específica del Libro Control Comercial.
- No existe estado comercial calculado y persistible para la operación diaria.
- No existe registro estructurado de aviso de retiro.
- No existe registro formal de responsable comercial por gestión más allá de auditoría general.
- No existe flujo de importación desde la planilla comercial al Libro Control.

## 4. Flujo comercial AS-IS

El flujo comercial actual levantado desde coordinación se gestiona principalmente con Google Sheets y WhatsApp. La planilla funciona como sistema operativo manual del área comercial.

### Operación manual actual

1. Revisión diaria o periódica de vencimientos.
2. Revisión de deuda pendiente por cliente.
3. Emisión o revisión de boleta/factura fuera del CRM.
4. Aviso de pago al cliente.
5. Aviso de corte si la deuda continúa.
6. Registro o coordinación de corte.
7. Registro o coordinación de retiro.
8. Registro de pago recibido.
9. Registro de voucher.
10. Registro de abonos.
11. Registro de convenios.
12. Registro de prórrogas.
13. Registro de observaciones.
14. Seguimiento por responsable.

### Interpretación de la planilla

- La planilla entregada es representativa y válida para modelar el proceso, aunque no sea la versión productiva final por confidencialidad.
- Los colores del Excel no deben copiarse como reglas rígidas. Deben convertirse en estados funcionales, clasificaciones o eventos configurables.
- Las reglas comerciales son comunes inicialmente para FiNet y Cable Mágico, pero el modelo debe permitir excepciones por empresa.

## 5. Flujo TO-BE propuesto

El flujo futuro en CRM debe mantener el control operativo de la planilla, pero con datos relacionales, trazabilidad, permisos y preparación para integraciones.

### Operación esperada en CRM

1. Visualizar Libro Control Comercial.
2. Calcular estado comercial desde facturas, pagos, contratos, zonas, avisos y eventos.
3. Generar mensajes WhatsApp copiables.
4. Registrar envío manual de aviso.
5. Registrar respuesta del cliente.
6. Validar voucher único.
7. Registrar pagos completos y abonos.
8. Registrar convenios.
9. Registrar prórrogas.
10. Registrar cambio de fecha de pago.
11. Registrar corte, retiro y reposición.
12. Registrar garantía cuando corresponda.
13. Registrar documento tributario externo.
14. Exportar Libro Control Comercial.
15. Preparar integración futura con Facturación.cl.
16. Preparar integración futura con WhatsApp Business API.

### Alcance inicial recomendado

La primera etapa debe ser interna para empleados. No debe tocar `portal/` salvo que más adelante se quiera mostrar deuda, pagos o historial comercial al cliente final.

## 6. Mapeo Excel → CRM

| Columna o bloque de planilla | Significado operativo | Entidad actual candidata | Tabla nueva candidata si falta | Prioridad | Observación |
| --- | --- | --- | --- | --- | --- |
| Cliente | Titular del servicio | `cliente` | No aplica | Alta | Ya existe. |
| RUT | Identificador legal | `cliente.rut` | No aplica | Alta | Usar validación RUT existente. |
| Teléfono | Contacto comercial | `cliente.telefono` | No aplica | Alta | Necesario para WhatsApp manual/futuro. |
| Correo | Contacto alternativo | `cliente.email` | No aplica | Media | Útil para documentos y respaldo. |
| Dirección | Dirección de servicio | `direccion_servicio`, `servicio_contratado` | No aplica | Alta | Debe mostrarse por servicio. |
| Plan | Plan contratado | `plan`, `contrato`, `servicio_contratado` | No aplica | Alta | Ya existen planes y precios por zona. |
| Día de pago | Fecha esperada de pago | `contrato.dia_vencimiento`, `zona_pago.dia_vencimiento_sugerido` | No aplica | Alta | Debe respetar zona si aplica. |
| Vencimiento | Límite de pago | `factura.fecha_limite_pago` | No aplica | Alta | Base para mora. |
| Boleta | Documento externo | `factura` parcial | `documento_tributario` | Alta | Falta metadata tributaria externa. |
| Factura | Documento externo | `factura` parcial | `documento_tributario` | Alta | Preparar Facturación.cl. |
| Deuda pendiente | Saldo adeudado | `factura` + `pago` | `gestion_comercial_mensual` | Alta | Billing ya calcula saldo. |
| Monto | Valor cobrado/pagado | `factura.monto`, `pago.monto`, `plan_zona_precio` | No aplica | Alta | Debe mostrar saldo y monto original. |
| Pago recibido | Pago completo o parcial | `pago` | No aplica o tipo de evento | Alta | Falta clasificar abono explícito. |
| Voucher | Comprobante único | `pago.codigo_transaccion`, `pago.comprobante_pdf_url` | No aplica | Alta | Ya existe unique para código. |
| Forma de pago | Transferencia, caja, efectivo, etc. | `pago.pasarela` | catálogo futuro | Media | Hoy puede ser texto controlado. |
| Abono | Pago parcial | `pago` | `evento_gestion_comercial` | Alta | Requiere estado y seguimiento propio. |
| Convenio | Acuerdo de pago | No existe formalmente | `beneficio_comercial` | Alta | Debe guardar condiciones. |
| Prórroga | Extensión de plazo | No existe formalmente | `beneficio_comercial` | Alta | Debe tener fecha y autorización. |
| Aviso pago | Contacto preventivo | `plantilla_notificacion`, `log_notificacion` | `evento_gestion_comercial` | Alta | Primera etapa: texto copiable. |
| Aviso corte | Último aviso | `plantilla_notificacion`, `log_notificacion` | `evento_gestion_comercial` | Alta | Primera etapa: registro manual. |
| Corte | Suspensión comercial/operativa | `contrato`, `servicio_contratado`, `cliente` | `evento_gestion_comercial` | Alta | Ya existe suspensión por no pago. |
| Retiro | Retiro de servicio/equipos | `orden_trabajo` posible | `evento_gestion_comercial` | Media | Puede derivar en OT futura. |
| Reposición | Cargo o acción adicional | No existe formalmente | `cargo_adicional` | Media | Monto debe ser configurable. |
| Garantía | Cobertura o condición especial | `unidad_equipo.fecha_venc_garantia` parcial | `garantia_cliente` | Media | Diferenciar garantía técnica y comercial. |
| Observaciones | Comentarios de seguimiento | `observacion_operativa` | No aplica | Alta | Ya existe entidad reutilizable. |
| Responsable | Persona encargada | `usuario`, `log_auditoria` | `evento_gestion_comercial.id_usuario` | Alta | Debe quedar visible en Libro Control. |
| Zona | Agrupación territorial | `zona_pago`, `caja_nap.zona` | No aplica | Alta | Ya existe zona de pago. |
| NAP/POS | Punto técnico/territorial | `caja_nap`, `puerto_nap`, `unidad_equipo.numero_poste` | No aplica | Media | Útil para retiros o cortes por sector. |

## 7. RF impactados

### 7.1 RF existentes reforzados

| RF | Impacto |
| --- | --- |
| RF-13 Cliente moroso | Se refuerza con estado comercial calculado y Libro Control. |
| RF-14 Historial completo del cliente | Debe incorporar eventos comerciales y observaciones operativas. |
| RF-27 Dashboard de clientes programados para corte | Debe cruzar deuda, zona, avisos y estado comercial. |
| RF-28 Notificación preventiva de cobro | Primera implementación: texto copiable y registro manual de envío. |
| RF-29 Último aviso previo al corte | Primera implementación: texto copiable, envío manual y respuesta. |
| RF-30 Suspensión por no pago | Ya existe base; debe integrarse al evento comercial. |
| RF-31 Reactivación tras pago | Debe considerar pago completo, convenio o prórroga aprobada. |
| RF-32 Registro de pagos | Debe reforzar voucher único, abonos y pagos parciales. |
| RF-33 Reportes CSV/Excel | Debe exportar Libro Control Comercial. |
| RF-34 Integración WhatsApp Business | Queda futura. El CRM debe prepararse sin enviar por API todavía. |
| RF-35 Envío de plantillas WhatsApp | Primera etapa: generación de texto copiable. |
| RF-43 Autenticación de empleados | El flujo comercial es interno y usa login actual. |
| RF-44 Roles y permisos | Se requieren permisos comerciales más granulares. |
| RF-46 Auditoría | Debe cubrir acciones comerciales críticas. |

### 7.2 RF que requieren reinterpretación gradual

- RF-28 y RF-29 hablan de notificación automática, pero la primera implementación debe generar mensajes copiables y registrar envío manual.
- RF-30 y RF-31 pueden depender de ejecución técnica real; inicialmente se registrará estado comercial/operativo sin integraciones externas no disponibles.
- RF-34/RF-35 quedan preparados para WhatsApp Business API, pero sin proveedor ni credenciales.
- RF-32 debe distinguir pago total, abono, convenio y voucher único.
- RF-33 debe extenderse con exportación específica del Libro Control Comercial.

### 7.3 Nuevos RF comerciales sugeridos

| ID temporal | Nombre |
| --- | --- |
| RFCOM-01 | Visualizar Libro Control Comercial. |
| RFCOM-02 | Calcular estado comercial. |
| RFCOM-03 | Registrar aviso de pago. |
| RFCOM-04 | Registrar aviso de corte. |
| RFCOM-05 | Registrar aviso de retiro. |
| RFCOM-06 | Generar mensaje WhatsApp copiable. |
| RFCOM-07 | Registrar respuesta del cliente. |
| RFCOM-08 | Validar voucher único. |
| RFCOM-09 | Registrar abono. |
| RFCOM-10 | Registrar convenio. |
| RFCOM-11 | Registrar prórroga. |
| RFCOM-12 | Registrar cambio de fecha de pago. |
| RFCOM-13 | Registrar cargo de reposición. |
| RFCOM-14 | Registrar retiro o solicitud de retiro. |
| RFCOM-15 | Registrar garantía. |
| RFCOM-16 | Gestionar permisos comerciales granulares. |
| RFCOM-17 | Registrar metadata de boleta/factura externa. |
| RFCOM-18 | Exportar Libro Control Comercial. |

## 8. Impacto en base de datos

### Entidades existentes que deben reutilizarse

- `cliente`
- `contrato`
- `factura`
- `pago`
- `zona_pago`
- `plan_zona_precio`
- `servicio_contratado`
- `plantilla_notificacion`
- `log_notificacion`
- `observacion_operativa`
- `usuario`
- `log_auditoria`

### Tablas nuevas candidatas

| Tabla candidata | Clasificación | Relaciones probables | Motivo |
| --- | --- | --- | --- |
| `gestion_comercial_mensual` | Necesaria en primera etapa | cliente, contrato, factura, servicio_contratado, zona_pago, usuario | Snapshot del Libro Control por periodo. |
| `evento_gestion_comercial` | Necesaria en primera etapa | cliente, contrato, factura, pago, servicio, usuario, log_auditoria | Registro histórico de avisos, respuestas, abonos, cortes, retiros y observaciones. |
| `beneficio_comercial` | Necesaria en etapa media | cliente, contrato, factura, usuario | Convenio, prórroga, descuento o excepción comercial. |
| `cargo_adicional` | Necesaria en etapa media | cliente, contrato, factura, servicio | Reposición, reconexión, retiro u otros cobros. |
| `documento_tributario` | Necesaria en etapa media | cliente, contrato, factura | Metadata de boleta/factura externa y futura Facturación.cl. |
| `garantia_cliente` | Futura / etapa media | cliente, servicio, unidad_equipo, contrato | Garantías comerciales o técnicas. |
| `respuesta_notificacion` | Necesaria en etapa media o integrada en evento | log_notificacion, cliente, usuario | Respuesta del cliente al aviso. Puede iniciar como evento comercial. |
| `permiso_comercial` o ampliación de permisos | Futura | rol, usuario | Si los permisos actuales por rol no bastan. |

### Recomendación inicial

No duplicar lo que ya existe. `zona_pago`, `plan_zona_precio` y `observacion_operativa` ya están disponibles, por lo que la primera fase debería concentrarse en:

1. `gestion_comercial_mensual`.
2. `evento_gestion_comercial`.
3. Reutilización de `plantilla_notificacion` y `log_notificacion`.
4. Extensión controlada de pagos para abonos si no basta con el modelo actual.

## 9. Impacto en backend

### Recomendación de módulos

- `BillingModule` mantiene deuda, facturas, pagos, zonas, reglas de precio, suspensión y reactivación.
- Crear `CommercialControlModule` para Libro Control Comercial, estados comerciales, eventos, avisos, respuestas, convenios y prórrogas.
- Crear o encapsular un servicio de mensajes comerciales para generar textos copiables.
- Usar `ReportsModule` para exportar Libro Control Comercial.
- Usar `AuditService` en cada acción sensible.

### Endpoints futuros sugeridos

| Método | Endpoint sugerido | Uso |
| --- | --- | --- |
| GET | `/api/commercial-control` | Listar Libro Control con filtros. |
| GET | `/api/commercial-control/:id` | Ver detalle de una gestión mensual. |
| POST | `/api/commercial-control/events` | Registrar evento comercial. |
| POST | `/api/commercial-control/messages/preview` | Generar mensaje copiable. |
| POST | `/api/commercial-control/notice-sent` | Registrar aviso enviado. |
| POST | `/api/commercial-control/responses` | Registrar respuesta del cliente. |
| POST | `/api/commercial-control/agreements` | Registrar convenio. |
| POST | `/api/commercial-control/extensions` | Registrar prórroga. |
| POST | `/api/commercial-control/additional-charges` | Registrar cargo de reposición/reconexión. |
| POST | `/api/commercial-control/tax-documents` | Registrar documento externo. |
| GET | `/api/reports/commercial-control/export` | Exportar Libro Control. |

## 10. Impacto en frontend

La incorporación comercial debe hacerse sobre la estructura modular existente:

```text
frontend/src/features/billing/
  BillingPanel.tsx
  CommercialControlPanel.tsx
  PaymentRegistrationPanel.tsx
  CommercialMessagesPanel.tsx
  CommercialBenefitsPanel.tsx
  index.ts
```

### BillingPanel actual

`BillingPanel.tsx` ya está separado y actualmente maneja:

- resumen de morosidad;
- clientes morosos;
- clientes programados para corte;
- registro de pagos;
- aviso preventivo;
- último aviso;
- suspensión;
- historial de notificaciones;
- zonas de pago;
- reglas de precio por zona.

### CommercialControlPanel futuro

Debe funcionar como vista tipo planilla, pero con datos relacionales:

- filtros por empresa, zona, periodo, vencimiento, estado comercial y responsable;
- columnas configurables;
- acciones por fila;
- generación de mensajes copiables;
- registro de aviso enviado;
- registro de respuesta;
- registro de pago/abono;
- convenio/prórroga;
- corte/retiro/reposición;
- exportación.

### Portal cliente

El portal independiente ya existe y se mantiene fuera del alcance inicial de la etapa comercial. No se debe tocar `portal/` en las primeras fases comerciales salvo que después se quiera mostrar deuda, pagos, documentos o convenios al cliente final.

El flujo comercial inicial debe ser interno para empleados del CRM.

## 11. Impacto en permisos

Permisos actuales relevantes:

- Backend: `VIEW_BILLING`, `MANAGE_BILLING`, `MANAGE_PAYMENT_ZONES`.
- Frontend: `viewBilling`, `manageBilling`, `managePaymentZones`.

### Permisos futuros propuestos

| Permiso | Uso |
| --- | --- |
| `commercial.view` | Acceso general al módulo comercial. |
| `commercial.view_control_book` | Visualizar Libro Control Comercial. |
| `commercial.register_payment` | Registrar pagos y abonos. |
| `commercial.generate_notice` | Generar mensaje copiable. |
| `commercial.mark_notice_sent` | Registrar aviso enviado. |
| `commercial.register_response` | Registrar respuesta. |
| `commercial.manage_agreement` | Crear/modificar convenio. |
| `commercial.manage_extension` | Crear/modificar prórroga. |
| `commercial.mark_cut` | Registrar corte. |
| `commercial.mark_withdrawal` | Registrar retiro. |
| `commercial.mark_reactivation` | Registrar reactivación comercial. |
| `commercial.supervisor_override` | Autorizar excepción comercial. |
| `commercial.export` | Exportar Libro Control. |

Mapeo inicial sugerido:

- Administrador: todos los permisos.
- Comercial: vista, avisos, respuestas, pagos, convenios, prórrogas y exportación según definición.
- Soporte: lectura cuando el estado comercial impacte operación técnica.
- Terreno: lectura de acciones que deriven en retiro/corte/reposición.
- Inventario: lectura o acción limitada si hay recuperación de equipos.

## 12. Impacto en Facturación.cl

Facturación.cl queda como integración futura. No se debe emitir documento tributario desde CRM en la primera etapa.

Primero se debe registrar metadata externa:

- `tipo_documento`
- `numero_documento`
- `folio_externo`
- `proveedor_emision`
- `fecha_emision`
- `fecha_envio_cliente`
- `monto_neto`
- `iva`
- `total`
- `url_verificacion`
- `estado_envio`

Reglas:

- No guardar credenciales todavía.
- No simular emisión tributaria.
- Asociar documento externo a cliente, contrato y factura.
- Auditar registro y cambios.

## 13. Impacto en WhatsApp

WhatsApp Business API queda para etapa futura. La primera implementación debe ser manual:

- generar texto copiable;
- registrar envío;
- registrar respuesta;
- mantener plantillas y variables;
- no usar proveedor externo;
- no exponer tokens.

Plantillas iniciales:

- `AVISO_PAGO`
- `AVISO_CORTE`
- `AVISO_RETIRO`

Variables sugeridas:

- `cliente`
- `fecha_vencimiento`
- `monto`
- `plan`
- `fecha_corte`
- `hora_corte`
- `fecha_retiro`
- `monto_reposicion`
- `monto_reconexion`

## 14. Roadmap técnico

1. Fase Comercial 1: Libro Control Comercial base.
2. Fase Comercial 2: Mensajes WhatsApp copiables.
3. Fase Comercial 3: Pago mejorado y voucher único.
4. Fase Comercial 4: Abono, convenio, prórroga y cambio de fecha.
5. Fase Comercial 5: Corte, retiro, reposición y reactivación.
6. Fase Comercial 6: Documento tributario y preparación Facturación.cl.
7. Fase Comercial 7: Importación desde planilla.
8. Fase Comercial 8: Permisos comerciales granulares.
9. Fase Comercial 9: Reportes y evidencias.

## 15. Criterios de salida

Checklist para pasar a desarrollo:

- [x] Estado base analizado.
- [x] Documento alineado con branch `feat-ux-ui-incremento2`.
- [x] Frontend modular confirmado como base.
- [x] Portal independiente confirmado como fuera de alcance inicial.
- [x] Entidades reutilizables identificadas.
- [x] Brechas reales documentadas.
- [x] RF impactados definidos.
- [x] Nuevos RFCOM propuestos.
- [x] Modelo de datos preliminar propuesto.
- [x] Módulos afectados identificados.
- [x] Roadmap priorizado.
- [x] Pendientes no bloqueantes identificados.

Antes de implementar código, se recomienda confirmar:

- columnas finales de la planilla comercial;
- reglas definitivas de estado comercial;
- roles comerciales mínimos;
- montos de reposición/reconexión/retiro;
- si `respuesta_notificacion` será tabla propia o evento comercial;
- si `beneficio_comercial` cubrirá convenio y prórroga o si tendrán tablas separadas;
- si el Libro Control tendrá snapshot mensual persistido o se calculará bajo demanda con eventos.

## 16. Pendientes no bloqueantes

- Definición final de roles comerciales.
- Lista final de planes y precios.
- Validación exacta de colores de Excel como estados funcionales.
- Confirmación formal de montos de reposición/retiro/reconexión.
- Acceso futuro a WhatsApp Business API.
- Acceso futuro a Facturación.cl.
- Carga de datos reales anonimizada o controlada.
- Definición final de plantillas de aviso de pago, corte y retiro.
- Definición de si los avisos manuales quedan en `log_notificacion`, `evento_gestion_comercial` o ambos.
- Definición de exportación esperada para evidencias comerciales.

