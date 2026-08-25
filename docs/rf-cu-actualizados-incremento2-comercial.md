# RF y casos de uso actualizados — Incremento 2 y etapa comercial

Este documento consolida los requerimientos funcionales trabajados hasta el momento y agrega las nuevas necesidades del área comercial como RF nuevos cuando corresponde. No reemplaza el Documento 0 completo; se enfoca en los RF implementados, reforzados o ampliados durante el Incremento 2, el refactor funcional del CRM/portal y la Fase Comercial 1.

## 1. Criterio de trazabilidad

- Los RF originales que fueron reforzados mantienen su numeración original.
- Los RF complementarios de la reunión de dueños mantienen la numeración RF-64 a RF-77.
- Las mejoras funcionales surgidas durante el refactor se documentan como RF-78 a RF-82 para mantener trazabilidad.
- Los nuevos requerimientos del área comercial se documentan como RFCOM-01 a RFCOM-18.
- Cada RF queda asociado a un caso de uso resumido con actor, objetivo, flujo principal y resultado esperado.
- WhatsApp Business API y Facturación.cl quedan explícitamente como integraciones futuras.

## 2. RF originales reforzados

| RF | Nombre actualizado | Caso de uso asociado | Estado |
| --- | --- | --- | --- |
| RF-13 | Identificar cliente moroso | CU-13 Consultar morosidad de cliente | Reforzado |
| RF-14 | Consultar historial integral del cliente | CU-14 Revisar historial completo del cliente | Reforzado |
| RF-27 | Visualizar clientes programados para corte | CU-27 Revisar cartera en riesgo de corte | Reforzado |
| RF-28 | Registrar aviso preventivo de cobro | CU-28 Registrar aviso de pago manual | Modificado |
| RF-29 | Registrar último aviso previo al corte | CU-29 Registrar aviso de corte manual | Modificado |
| RF-30 | Suspender servicio por no pago | CU-30 Suspender contrato por deuda vencida | Implementado y reforzado |
| RF-31 | Reactivar servicio tras regularización | CU-31 Reactivar servicio tras pago o regularización | Reforzado |
| RF-32 | Registrar pagos | CU-32 Registrar pago asociado a factura | Reforzado |
| RF-33 | Exportar reportes operativos/comerciales | CU-33 Exportar reportes y Libro Control | Parcial |
| RF-34 | Integrar WhatsApp Business | CU-34 Enviar mensajes por WhatsApp API | Futuro |
| RF-35 | Gestionar plantillas WhatsApp | CU-35 Generar mensaje comercial copiable | Futuro cercano |
| RF-43 | Autenticar empleados | CU-43 Iniciar sesión interna | Implementado |
| RF-44 | Gestionar roles y permisos | CU-44 Controlar acceso por rol | Reforzado |
| RF-46 | Auditar acciones críticas | CU-46 Consultar trazabilidad de acciones | Reforzado |

### RF-13 — Identificar cliente moroso

**Descripción actualizada:** el CRM debe identificar clientes con deuda vencida usando `Factura`, `Pago`, `Contrato` y estado del cliente, sin duplicar deuda en otra tabla.

**CU-13 Consultar morosidad de cliente**

- Actor: Administrador, Comercial.
- Flujo principal: el usuario entra a Cobranza, revisa clientes morosos, saldo pendiente y días de atraso.
- Resultado esperado: el sistema muestra deuda vigente y permite iniciar acciones comerciales.

### RF-14 — Consultar historial integral del cliente

**Descripción actualizada:** el historial del cliente debe incluir tickets, órdenes, servicios, observaciones, solicitudes, cambios de plan, contratos digitales y eventos comerciales.

**CU-14 Revisar historial completo del cliente**

- Actor: Administrador, Comercial, Soporte.
- Flujo principal: el usuario abre un cliente y revisa su historial por secciones.
- Resultado esperado: el operador entiende el contexto completo antes de ejecutar una acción.

### RF-27 — Visualizar clientes programados para corte

**Descripción actualizada:** el sistema debe listar clientes que cumplen regla de atraso para corte, considerando deuda vencida, contrato, servicio y eventos comerciales recientes.

**CU-27 Revisar cartera en riesgo de corte**

- Actor: Administrador, Comercial.
- Flujo principal: el usuario entra a Cobranza y revisa clientes programados para corte.
- Resultado esperado: el usuario decide enviar último aviso, registrar gestión o suspender.

### RF-28 — Registrar aviso preventivo de cobro

**Descripción actualizada:** la primera etapa no envía WhatsApp automáticamente; registra evento comercial `AVISO_PAGO` y permite evolucionar a texto copiable.

**CU-28 Registrar aviso de pago manual**

- Actor: Comercial.
- Flujo principal: el usuario selecciona una fila del Libro Control, registra aviso de pago, canal, estado y observación.
- Resultado esperado: la última gestión comercial se actualiza y queda auditada.

### RF-29 — Registrar último aviso previo al corte

**Descripción actualizada:** el último aviso se registra como evento comercial `AVISO_CORTE`; la integración automática queda pendiente.

**CU-29 Registrar aviso de corte manual**

- Actor: Comercial.
- Flujo principal: el usuario selecciona cliente con mora, registra aviso de corte y observación.
- Resultado esperado: el estado comercial refleja aviso de corte enviado.

### RF-30 — Suspender servicio por no pago

**Descripción actualizada:** el sistema suspende contrato, cliente y servicios asociados cuando existe deuda vencida impaga.

**CU-30 Suspender contrato por deuda vencida**

- Actor: Administrador, Comercial.
- Flujo principal: el usuario confirma suspensión desde Cobranza.
- Resultado esperado: contrato, cliente y servicios quedan en estado suspendido y la acción queda auditada.

### RF-31 — Reactivar servicio tras regularización

**Descripción actualizada:** la reactivación debe considerar pago completo, regularización, convenio o prórroga aprobada en fases posteriores.

**CU-31 Reactivar servicio tras pago o regularización**

- Actor: Administrador, Comercial.
- Flujo principal: el usuario valida regularización y reactiva el contrato/servicio.
- Resultado esperado: el cliente recupera estado operativo permitido.

### RF-32 — Registrar pagos

**Descripción actualizada:** el pago se registra asociado a factura, con monto, pasarela y código de transacción/voucher. Debe soportar pagos parciales.

**CU-32 Registrar pago asociado a factura**

- Actor: Administrador, Comercial.
- Flujo principal: el usuario selecciona factura morosa, ingresa monto, medio de pago y voucher.
- Resultado esperado: el saldo se recalcula desde `Factura` y `Pago`.

### RF-33 — Exportar reportes operativos/comerciales

**Descripción actualizada:** los reportes existentes deben ampliarse para exportar Libro Control Comercial.

**CU-33 Exportar Libro Control**

- Actor: Administrador, Comercial.
- Flujo principal: el usuario filtra el Libro Control y solicita exportación.
- Resultado esperado: el sistema genera archivo CSV/Excel con columnas comerciales.

### RF-34 — Integrar WhatsApp Business

**Descripción actualizada:** queda fuera de la primera etapa comercial; el diseño debe preparar plantillas, eventos y respuestas para una integración futura.

**CU-34 Enviar mensajes por WhatsApp API**

- Actor: Comercial.
- Flujo principal futuro: el usuario envía aviso por WhatsApp Business desde CRM.
- Resultado esperado futuro: el sistema registra proveedor, envío, respuesta y estado.

### RF-35 — Gestionar plantillas WhatsApp

**Descripción actualizada:** la primera evolución será generar mensajes copiables para aviso de pago, corte y retiro.

**CU-35 Generar mensaje comercial copiable**

- Actor: Comercial.
- Flujo principal futuro cercano: el usuario genera mensaje desde plantilla y lo copia para envío manual.
- Resultado esperado: queda texto generado y evento de gestión asociado.

### RF-43 — Autenticar empleados

**Descripción actualizada:** los flujos comerciales usan el login interno existente y no la sesión del portal cliente.

**CU-43 Iniciar sesión interna**

- Actor: Empleado.
- Flujo principal: el usuario ingresa correo y contraseña.
- Resultado esperado: el sistema entrega token interno y permisos por rol.

### RF-44 — Gestionar roles y permisos

**Descripción actualizada:** los permisos comerciales se mapearán inicialmente a permisos de cobranza y luego a permisos granulares.

**CU-44 Controlar acceso por rol**

- Actor: Administrador.
- Flujo principal: el administrador asigna roles y permisos.
- Resultado esperado: cada usuario ve solo acciones autorizadas.

### RF-46 — Auditar acciones críticas

**Descripción actualizada:** pagos, suspensiones, eventos comerciales, cambios de plan, equipos, contratos digitales y observaciones deben auditarse.

**CU-46 Consultar trazabilidad de acciones**

- Actor: Administrador.
- Flujo principal: el usuario revisa auditoría por acción, entidad y usuario.
- Resultado esperado: existe evidencia de quién hizo qué, cuándo y sobre qué entidad.

## 3. RF complementarios RF-64 a RF-77

| RF | Nombre | CU asociado | Estado |
| --- | --- | --- | --- |
| RF-64 | Administrar múltiples servicios por RUT | CU-64 Gestionar múltiples servicios de un cliente | Implementado |
| RF-65 | Visualizar perfil individual de servicio | CU-65 Abrir perfil de servicio contratado | Implementado |
| RF-66 | Registrar características específicas del servicio | CU-66 Actualizar datos técnicos/comerciales del servicio | Implementado |
| RF-67 | Vincular equipos instalados a servicio | CU-67 Asociar equipo con modalidad | Implementado |
| RF-68 | Registrar datos técnicos por cliente y servicio | CU-68 Actualizar datos técnicos generales/específicos | Implementado |
| RF-69 | Consultar historial integral de solicitudes | CU-69 Registrar y consultar solicitud de cliente | Implementado |
| RF-70 | Registrar origen de captación | CU-70 Seleccionar origen comercial | Implementado |
| RF-71 | Visualizar seguimiento comercial consolidado | CU-71 Consultar dashboard comercial | Parcial/reforzado |
| RF-72 | Administrar planes comerciales manuales | CU-72 Crear y editar planes | Implementado |
| RF-73 | Configurar pagos según zona | CU-73 Gestionar zonas y precios por zona | Implementado |
| RF-74 | Registrar observaciones contextuales | CU-74 Gestionar observaciones por entidad | Implementado |
| RF-75 | Clasificar modalidad de equipos | CU-75 Asociar modalidad de equipo | Implementado |
| RF-76 | Cambiar plan contratado | CU-76 Cambiar plan sin perder historial | Implementado |
| RF-77 | Generar contrato digital | CU-77 Generar y consultar contrato digital | Implementado |

### RF-64 / CU-64 — Gestionar múltiples servicios de un cliente

- Actor: Administrador, Comercial, Soporte.
- Objetivo: permitir que un cliente identificado por RUT tenga más de un servicio independiente.
- Flujo principal: buscar cliente, abrir detalle, revisar servicios y gestionar cada uno por separado.
- Resultado esperado: no se duplica el cliente por RUT y cada servicio conserva contrato, dirección, plan, estado, equipos, tickets y órdenes.

### RF-65 / CU-65 — Abrir perfil de servicio contratado

- Actor: Administrador, Soporte, Comercial.
- Objetivo: consultar un servicio con su contexto operativo completo.
- Flujo principal: desde cliente, seleccionar servicio y abrir perfil.
- Resultado esperado: se muestran cliente, empresa, contrato, plan, dirección, equipos, tickets, órdenes, observaciones, auditoría y datos técnicos.

### RF-66 / CU-66 — Actualizar datos técnicos/comerciales del servicio

- Actor: Soporte, Terreno, Administrador.
- Objetivo: registrar tecnología, velocidad, IP, MAC, puerto OLT, caja NAP, poste y observaciones.
- Flujo principal: abrir servicio, editar datos técnicos y guardar.
- Resultado esperado: los campos relevantes quedan disponibles para búsqueda, soporte y reportes.

### RF-67 / CU-67 — Asociar equipo con modalidad

- Actor: Inventario, Terreno, Administrador.
- Objetivo: vincular equipo a servicio y cliente instalado.
- Flujo principal: seleccionar equipo disponible, servicio, modalidad y guardar asociación.
- Resultado esperado: el equipo queda asociado al servicio, con validación de empresa y auditoría.

### RF-68 / CU-68 — Actualizar datos técnicos generales/específicos

- Actor: Soporte, Terreno.
- Objetivo: separar datos técnicos generales del cliente y específicos del servicio.
- Flujo principal: editar datos técnicos en cliente o servicio.
- Resultado esperado: cada nivel conserva la información que le corresponde.

### RF-69 / CU-69 — Registrar y consultar solicitud de cliente

- Actor: Comercial, Soporte.
- Objetivo: registrar solicitudes factibles y no factibles sin reemplazar tickets ni órdenes.
- Flujo principal: crear solicitud, actualizar estado/factibilidad y consultar historial.
- Resultado esperado: la solicitud queda como registro transversal asociado a cliente, prospecto o servicio.

### RF-70 / CU-70 — Seleccionar origen comercial

- Actor: Comercial.
- Objetivo: registrar origen de captación desde catálogo centralizado.
- Flujo principal: crear o editar prospecto/cliente y seleccionar origen.
- Resultado esperado: el origen queda visible y editable según permisos.

### RF-71 / CU-71 — Consultar dashboard comercial

- Actor: Administrador, Comercial.
- Objetivo: visualizar métricas reales de prospectos, clientes, servicios, solicitudes, cambios de plan y origen.
- Flujo principal: entrar al dashboard y revisar resumen por alcance/empresa.
- Resultado esperado: el dashboard no usa datos hardcodeados y respeta selector consolidado/empresa.

### RF-72 / CU-72 — Crear y editar planes

- Actor: Administrador, Comercial autorizado.
- Objetivo: administrar planes con valores manuales.
- Flujo principal: crear, editar, activar o desactivar plan.
- Resultado esperado: los planes se usan en prospectos, contratos y servicios sin romper flujos previos.

### RF-73 / CU-73 — Gestionar zonas y precios por zona

- Actor: Administrador, Comercial.
- Objetivo: configurar zona de pago, vencimiento sugerido y precio por zona.
- Flujo principal: crear zona, crear regla de precio y usarla en cobranza.
- Resultado esperado: Billing considera zona para filtros, vencimiento sugerido y precio si existe regla.

### RF-74 / CU-74 — Gestionar observaciones por entidad

- Actor: Comercial, Soporte, Terreno, Administrador.
- Objetivo: registrar observaciones contextuales en cliente, servicio, contrato, ticket, orden o equipo.
- Flujo principal: abrir modal de observaciones, crear nota y consultar historial.
- Resultado esperado: la observación queda ordenada por fecha y auditada.

### RF-75 / CU-75 — Asociar modalidad de equipo

- Actor: Inventario, Terreno.
- Objetivo: clasificar equipo como arriendo, préstamo, compra, propio cliente o propiedad empresa.
- Flujo principal: asociar equipo a servicio con modalidad y valores opcionales.
- Resultado esperado: inventario distingue equipos recuperables y no recuperables.

### RF-76 / CU-76 — Cambiar plan sin perder historial

- Actor: Comercial, Administrador.
- Objetivo: cambiar plan contratado manteniendo plan anterior y motivo.
- Flujo principal: seleccionar contrato, nuevo plan, fecha efectiva, motivo y guardar.
- Resultado esperado: contrato se actualiza y el historial de cambio queda registrado.

### RF-77 / CU-77 — Generar y consultar contrato digital

- Actor: Comercial, Administrador.
- Objetivo: generar contrato digital asociado a cliente y contrato.
- Flujo principal: generar documento, consultar versión, descargar y actualizar estado de firma.
- Resultado esperado: el documento tiene URL/ruta segura, hash, versión y estado.

## 4. RF funcionales agregados durante refactor y estabilización

| RF | Nombre | CU asociado | Estado |
| --- | --- | --- | --- |
| RF-78 | Vincular ticket con orden de trabajo | CU-78 Derivar ticket a terreno | Implementado |
| RF-79 | Gestionar código propio de OT | CU-79 Visualizar código OT independiente | Implementado |
| RF-80 | Generar OT desde cliente/servicio | CU-80 Crear instalación desde servicio pendiente | Implementado |
| RF-81 | Separar Portal Cliente como app independiente | CU-81 Acceder al portal cliente independiente | Implementado |
| RF-82 | Mantener CRM modular por features | CU-82 Navegar CRM interno modular | Implementado como mejora estructural |

### RF-78 / CU-78 — Derivar ticket a terreno

- Actor: Soporte, Administrador.
- Objetivo: crear una OT desde un ticket cuando requiere visita técnica.
- Flujo principal: gestionar ticket, seleccionar generar OT, completar datos de visita y guardar.
- Resultado esperado: la OT queda vinculada al ticket y el cierre real se realiza desde Órdenes de Trabajo.

### RF-79 / CU-79 — Visualizar código OT independiente

- Actor: Soporte, Terreno, Comercial.
- Objetivo: distinguir código de OT de código de ticket.
- Flujo principal: consultar órdenes de trabajo y revisar columnas Código OT y Ticket.
- Resultado esperado: se muestran códigos como `OT-INS-000001` y `TK-XXXX` por separado.

### RF-80 / CU-80 — Crear instalación desde servicio pendiente

- Actor: Comercial, Soporte.
- Objetivo: permitir flujo Cliente → Servicio → Orden de instalación → OT → Cierre técnico.
- Flujo principal: abrir cliente, seleccionar servicio pendiente, generar orden de instalación y cerrar desde OT.
- Resultado esperado: la instalación no se cierra desde cliente; se cierra técnicamente desde WorkOrdersPanel.

### RF-81 / CU-81 — Acceder al portal cliente independiente

- Actor: Cliente.
- Objetivo: separar la experiencia del portal cliente del CRM interno.
- Flujo principal: el cliente entra a `portal/`, inicia sesión y revisa servicios, tickets y TV IP.
- Resultado esperado: el portal usa sesión propia y no expone módulos administrativos.

### RF-82 / CU-82 — Navegar CRM interno modular

- Actor: Empleado interno.
- Objetivo: mantener el CRM operativo con módulos separados por feature.
- Flujo principal: el usuario navega entre Dashboard, Prospectos, Clientes, Inventario, Cobranza, Tickets, Órdenes, Reportes y Usuarios.
- Resultado esperado: App queda como orquestador y los paneles viven en `frontend/src/features/`.

## 5. Nuevos RF comerciales RFCOM

| RF | Nombre | CU asociado | Estado |
| --- | --- | --- | --- |
| RFCOM-01 | Visualizar Libro Control Comercial | CUCOM-01 Consultar Libro Control | Implementado Fase Comercial 1 |
| RFCOM-02 | Calcular estado comercial | CUCOM-02 Calcular estado por factura/evento | Implementado Fase Comercial 1 |
| RFCOM-03 | Registrar aviso de pago | CUCOM-03 Registrar AVISO_PAGO | Implementado base |
| RFCOM-04 | Registrar aviso de corte | CUCOM-04 Registrar AVISO_CORTE | Implementado base |
| RFCOM-05 | Registrar aviso de retiro | CUCOM-05 Registrar AVISO_RETIRO | Implementado base |
| RFCOM-06 | Generar mensaje WhatsApp copiable | CUCOM-06 Generar texto de aviso | Pendiente Fase Comercial 2 |
| RFCOM-07 | Registrar respuesta del cliente | CUCOM-07 Registrar respuesta/observación | Implementado base |
| RFCOM-08 | Validar voucher único | CUCOM-08 Validar código de transacción | Parcial |
| RFCOM-09 | Registrar abono | CUCOM-09 Registrar pago parcial como abono | Pendiente |
| RFCOM-10 | Registrar convenio | CUCOM-10 Crear convenio comercial | Pendiente |
| RFCOM-11 | Registrar prórroga | CUCOM-11 Crear prórroga comercial | Pendiente |
| RFCOM-12 | Registrar cambio de fecha de pago | CUCOM-12 Modificar fecha/día de pago | Pendiente |
| RFCOM-13 | Registrar cargo de reposición | CUCOM-13 Crear cargo adicional | Pendiente |
| RFCOM-14 | Registrar retiro o solicitud de retiro | CUCOM-14 Gestionar retiro comercial/técnico | Pendiente |
| RFCOM-15 | Registrar garantía | CUCOM-15 Registrar garantía comercial/técnica | Pendiente |
| RFCOM-16 | Gestionar permisos comerciales granulares | CUCOM-16 Administrar permisos comerciales | Pendiente |
| RFCOM-17 | Registrar metadata de boleta/factura externa | CUCOM-17 Registrar documento tributario externo | Pendiente |
| RFCOM-18 | Exportar Libro Control Comercial | CUCOM-18 Exportar Libro Control | Pendiente |

### RFCOM-01 / CUCOM-01 — Consultar Libro Control

- Actor: Administrador, Comercial.
- Objetivo: visualizar una vista tipo planilla con clientes, deuda, vencimiento, estado comercial y acción sugerida.
- Flujo principal: entrar a Cobranza, revisar Libro Control, aplicar filtros por búsqueda, estado y vencidos.
- Resultado esperado: el Libro Control se calcula desde `Factura`, `Pago`, `Contrato`, `Cliente`, `ServicioContratado`, `ZonaPago` y eventos.

### RFCOM-02 / CUCOM-02 — Calcular estado por factura/evento

- Actor: Sistema.
- Objetivo: determinar estado comercial sin crear `gestion_comercial_mensual` persistente.
- Flujo principal: calcular saldo, vencimiento, días de atraso y prioridad de último evento relevante.
- Resultado esperado: la fila queda clasificada como `AL_DIA`, `POR_VENCER`, `MOROSO`, `AVISO_PAGO_ENVIADO`, `AVISO_CORTE_ENVIADO`, `CORTADO`, `RETIRO_PROGRAMADO`, `CONVENIO`, `PRORROGA` u otro estado definido.

### RFCOM-03 / CUCOM-03 — Registrar AVISO_PAGO

- Actor: Comercial.
- Objetivo: dejar constancia del aviso preventivo de pago.
- Flujo principal: seleccionar fila, elegir evento `AVISO_PAGO`, canal, estado y observación.
- Resultado esperado: se crea `evento_gestion_comercial` y se actualiza la última gestión.

### RFCOM-04 / CUCOM-04 — Registrar AVISO_CORTE

- Actor: Comercial.
- Objetivo: registrar último aviso antes de corte.
- Flujo principal: seleccionar cliente moroso, registrar `AVISO_CORTE` y fecha/observación si aplica.
- Resultado esperado: el estado comercial prioriza aviso de corte enviado.

### RFCOM-05 / CUCOM-05 — Registrar AVISO_RETIRO

- Actor: Comercial.
- Objetivo: registrar aviso previo a retiro/desconexión.
- Flujo principal: seleccionar cliente, registrar `AVISO_RETIRO` y observación.
- Resultado esperado: la fila queda preparada para retiro programado en fases posteriores.

### RFCOM-06 / CUCOM-06 — Generar texto de aviso

- Actor: Comercial.
- Objetivo: generar mensaje copiable para WhatsApp manual.
- Flujo principal futuro: seleccionar plantilla, previsualizar variables y copiar texto.
- Resultado esperado futuro: el mensaje se genera sin usar WhatsApp Business API.

### RFCOM-07 / CUCOM-07 — Registrar respuesta/observación

- Actor: Comercial.
- Objetivo: registrar respuesta del cliente u observación comercial.
- Flujo principal: abrir modal de gestión, seleccionar `RESPUESTA_CLIENTE` u `OBSERVACION_COMERCIAL`, completar texto y guardar.
- Resultado esperado: la respuesta queda asociada al cliente/factura/contrato y responsable.

### RFCOM-08 / CUCOM-08 — Validar código de transacción

- Actor: Comercial.
- Objetivo: evitar vouchers duplicados.
- Flujo principal: registrar pago con `codigoTransaccion`.
- Resultado esperado: el sistema conserva el código único y prepara validaciones reforzadas.

### RFCOM-09 / CUCOM-09 — Registrar abono

- Actor: Comercial.
- Objetivo: distinguir pago parcial de pago total.
- Flujo principal futuro: registrar monto parcial, factura, compromiso y observación.
- Resultado esperado futuro: se crea `Pago` y evento `ABONO_REGISTRADO`.

### RFCOM-10 / CUCOM-10 — Crear convenio comercial

- Actor: Comercial, Supervisor.
- Objetivo: registrar acuerdo de pago en cuotas o condiciones especiales.
- Flujo principal futuro: indicar deuda, monto comprometido, cuotas, fechas y aprobación.
- Resultado esperado futuro: el cliente queda en estado comercial `CONVENIO`.

### RFCOM-11 / CUCOM-11 — Crear prórroga comercial

- Actor: Comercial, Supervisor.
- Objetivo: extender plazo de pago sin perder trazabilidad.
- Flujo principal futuro: seleccionar factura/cliente, registrar nueva fecha y motivo.
- Resultado esperado futuro: el estado comercial queda como `PRORROGA`.

### RFCOM-12 / CUCOM-12 — Modificar fecha/día de pago

- Actor: Comercial autorizado.
- Objetivo: registrar cambio de día de pago o fecha comprometida.
- Flujo principal futuro: seleccionar contrato, nueva fecha/día y justificación.
- Resultado esperado futuro: queda evento o beneficio comercial auditado.

### RFCOM-13 / CUCOM-13 — Crear cargo adicional

- Actor: Comercial, Administrador.
- Objetivo: registrar reposición, reconexión, retiro u otro cargo.
- Flujo principal futuro: seleccionar cliente/contrato/servicio, tipo de cargo y monto configurable.
- Resultado esperado futuro: el cargo queda separado de la factura interna hasta su facturación.

### RFCOM-14 / CUCOM-14 — Gestionar retiro comercial/técnico

- Actor: Comercial, Terreno.
- Objetivo: registrar solicitud o ejecución de retiro.
- Flujo principal futuro: registrar evento de retiro y, si corresponde, generar OT.
- Resultado esperado futuro: el retiro queda trazado y coordinado con operación.

### RFCOM-15 / CUCOM-15 — Registrar garantía

- Actor: Comercial, Soporte, Inventario.
- Objetivo: documentar garantías asociadas a cliente, servicio o equipo.
- Flujo principal futuro: ingresar tipo, fechas, monto o cobertura y observación.
- Resultado esperado futuro: la garantía queda consultable y no se confunde con observación suelta.

### RFCOM-16 / CUCOM-16 — Administrar permisos comerciales

- Actor: Administrador.
- Objetivo: separar permisos de lectura, gestión, pago, corte, retiro, convenio y exportación.
- Flujo principal futuro: asignar permisos comerciales por rol.
- Resultado esperado futuro: Comercial, Soporte, Terreno e Inventario tienen capacidades diferenciadas.

### RFCOM-17 / CUCOM-17 — Registrar documento tributario externo

- Actor: Comercial, Administración.
- Objetivo: guardar metadata de boleta/factura emitida fuera del CRM.
- Flujo principal futuro: ingresar tipo, número, folio, proveedor, montos, URL y estado.
- Resultado esperado futuro: el CRM queda preparado para Facturación.cl sin emitir documentos todavía.

### RFCOM-18 / CUCOM-18 — Exportar Libro Control

- Actor: Administrador, Comercial.
- Objetivo: exportar la vista comercial filtrada.
- Flujo principal futuro: aplicar filtros y descargar CSV/Excel.
- Resultado esperado futuro: coordinación puede reemplazar gradualmente la planilla manual.

## 6. Matriz de módulos y endpoints relevantes

| Módulo | RF principales | Endpoints/artefactos |
| --- | --- | --- |
| Cobranza | RF-13, RF-27, RF-28, RF-29, RF-30, RF-32, RF-73, RFCOM-01 a RFCOM-05, RFCOM-07 | `/api/billing/*`, `/api/commercial-control`, `/api/commercial-control/events` |
| Clientes/Servicios | RF-64 a RF-69, RF-74, RF-76, RF-80 | `/api/customers/*`, `/api/services/*`, CustomersPanel |
| Planes/Contratos | RF-72, RF-76, RF-77 | `/api/plans/*`, `/api/contracts/*` |
| Inventario | RF-67, RF-75 | `/api/inventory/*`, InventoryPanel |
| Tickets/OT | RF-78, RF-79 | `/api/tickets/*`, `/api/work-orders/*` |
| Portal Cliente | RF-81 | `portal/`, `/api/portal/*` |
| Auditoría/Permisos | RF-43, RF-44, RF-46, RFCOM-16 | `AuditService`, `permissions.ts` |

## 7. Estado comercial implementado en Fase Comercial 1

La Fase Comercial 1 agregó `evento_gestion_comercial` y el Libro Control Comercial calculado. No se creó `gestion_comercial_mensual` persistente.

Estados comerciales considerados:

- `AL_DIA`
- `POR_VENCER`
- `VENCIDO`
- `MOROSO`
- `AVISO_PAGO_ENVIADO`
- `AVISO_CORTE_ENVIADO`
- `CORTE_PROGRAMADO`
- `CORTADO`
- `RETIRO_PROGRAMADO`
- `RETIRADO`
- `CONVENIO`
- `PRORROGA`
- `REACTIVACION_PENDIENTE`
- `REGULARIZADO`

Eventos comerciales disponibles:

- `AVISO_PAGO`
- `AVISO_CORTE`
- `AVISO_RETIRO`
- `RESPUESTA_CLIENTE`
- `PAGO_REGISTRADO`
- `ABONO_REGISTRADO`
- `CONVENIO_REGISTRADO`
- `PRORROGA_REGISTRADA`
- `CORTE_REGISTRADO`
- `RETIRO_SOLICITADO`
- `RETIRO_REGISTRADO`
- `REACTIVACION_REGISTRADA`
- `CARGO_REPOSICION`
- `OBSERVACION_COMERCIAL`

## 8. Pendientes priorizados

1. Fase Comercial 2: generar mensajes WhatsApp copiables, sin API de WhatsApp.
2. Fase Comercial 3: reforzar pago, voucher único y clasificación de abonos.
3. Fase Comercial 4: convenios, prórrogas, descuentos y cambios de fecha de pago.
4. Fase Comercial 5: cargos adicionales, corte, retiro, reposición y reactivación comercial.
5. Fase Comercial 6: documento tributario externo y preparación para Facturación.cl.
6. Fase Comercial 7: importación desde planilla comercial.
7. Fase Comercial 8: permisos comerciales granulares.
8. Fase Comercial 9: exportación y evidencias del Libro Control.

## 9. Nota de alcance

WhatsApp Business API no está implementado en esta etapa. Facturación.cl tampoco está implementado. El CRM queda preparado para ambas integraciones mediante eventos comerciales, plantillas futuras, documento tributario externo y trazabilidad, pero no se deben simular envíos ni emisión tributaria real.
