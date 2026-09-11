# Matriz de responsabilidades y linea de trabajo - Incremento 2

## Objetivo

Este documento separa el alcance academico original del Incremento 2 de las decisiones posteriores de integracion entre los cuatro grupos. Su finalidad es impedir que el Grupo 8 mantenga modulos duplicados y convertir el CRM en la fuente de verdad comercial y de cobranza.

## Fuentes y criterio de decision

Fuentes revisadas:

- `CU_Incremento_1.pdf` y `CU_Incremento_2.pdf`: alcance documental original de los incrementos.
- `Cobertura_CU.pdf`: revision del codigo `develop` realizada el 10-09-2026.
- `guia-global-endpoints-4-grupos-v2.md`: acuerdos globales y redistribucion de responsabilidades.
- `solicitud-endpoints-dependencias-crm-grupo8.md`: contrato de integracion solicitado por el CRM.
- Codigo actual de la rama `feature/cu-incremento-2-final`, creada desde `develop`.

Cuando las fuentes difieren se aplica este orden:

1. La guia global v2 decide el equipo propietario.
2. La solicitud del Grupo 8 define la informacion que el CRM necesita consumir o recibir.
3. Los PDF conservan la trazabilidad academica del CU, aunque el responsable haya cambiado.
4. El codigo permite determinar si la solucion actual es definitiva, parcial, temporal o inexistente.

## Regla de arquitectura

- Grupo 8 es propietario de prospectos, clientes comerciales, planes, contratos, servicios, cobranza y seguimiento comercial.
- Grupo 1 es propietario del catalogo de equipos, unidades fisicas, bodegas, movimientos, stock, transferencias, diagnostico, mantenimiento y garantia.
- Grupo 2 es propietario del portal y de las pantallas del cliente final.
- Grupo 3 es propietario de cobertura tecnica, ordenes de trabajo, agenda, tecnicos, instalaciones, evidencia de terreno, SmartOLT y monitoreo de red.
- El CRM conserva referencias externas y presenta informacion resumida. No escribe directamente en las tablas de otro dominio.

## Matriz de los 23 casos del Incremento 2

| CU | Caso de uso | Propietario final | Estado actual en CRM | Decision y trabajo del Grupo 8 |
|---|---|---|---|---|
| CU-28 | Enviar notificacion preventiva de cobro | G8 genera la condicion; G2 muestra/envia al cliente | Parcial | Mantener calculo y trazabilidad. Crear consultas de vencimientos para G2. El canal real depende del acuerdo de notificaciones. |
| CU-38 | Autenticar cliente en portal web con RUT | G2; credenciales aun por ratificar entre G3/G8 | Implementacion local temporal | Desistir de la pantalla del portal en CRM. Habilitar solo los datos de cliente que G2 necesite. |
| CU-39 | Visualizar plan contratado en el portal | G2 consume datos de G8 | Implementacion local temporal | Desistir de la pantalla. Exponer contratos y servicios activos mediante API. |
| CU-41 | Generar ticket desde el portal del cliente | G2 crea la solicitud; G8 recibe el ticket | Implementacion local temporal | Desistir de la pantalla del portal. Habilitar `POST /tickets` con autenticacion entre servicios. |
| CU-55 | Diagnosticar equipo devuelto | G1 | Duplicado local | Desistir de la gestion. Consumir el diagnostico o resumen publicado por G1 si debe mostrarse en la ficha del servicio. |
| CU-56 | Controlar stock de consumibles | G1 | Duplicado local | Desistir. El CRM solo puede consultar disponibilidad informativa. |
| CU-57 | Alertar stock bajo el umbral | G1 | Duplicado local | Desistir. Mostrar la alerta recibida desde G1 solo cuando sea util para un flujo comercial. |
| CU-58 | Transferir equipos entre empresas | G1 | Duplicado local | Desistir por completo. No ofrecer acciones de transferencia en CRM. |
| CU-60 | Adjuntar evidencia multimedia de instalacion | G3 | Parcial y local | Desistir de la carga desde CRM. Recibir o consultar la evidencia asociada al cierre de la OT. |
| CU-63 | Registrar mantenimiento de equipos | G1, coordinado con G3 | Duplicado local | Desistir de la gestion. Mostrar estado o historial externo en modo lectura cuando exista endpoint. |
| CU-64 | Gestionar multiples servicios de un cliente | G8 | Implementado | Mantener. Verificar de punta a punta alta, consulta, cambio y baja por servicio, respetando empresa y contrato. |
| CU-65 | Consultar perfil individual del servicio | G8, consumiendo datos tecnicos de G1/G3 | Implementado | Mantener. Completar la vista con equipos y OT externas en modo lectura. |
| CU-66 | Registrar y consultar solicitudes de cliente | G8 | Implementado en servidor e interfaz actual | Mantener y ejecutar prueba integral de creacion, consulta, estado, factibilidad, permisos y auditoria. |
| CU-67 | Registrar origen de captacion comercial | G8 | Implementado | Mantener y verificar que se conserve durante la conversion de prospecto a cliente. |
| CU-68 | Consultar seguimiento comercial consolidado | G8 | Implementado | Mantener. Validar metricas por empresa con datos reales y reglas comerciales aprobadas. |
| CU-69 | Gestionar planes comerciales | G8; catalogo de tipos de equipo proviene de G1 | Parcial para integracion | Mantener CRUD de planes. Agregar requisitos de equipamiento por tipo usando `GET /api/tipos-equipo` de G1. |
| CU-70 | Gestionar zonas y precios por zona | G8 | Implementado | Mantener y verificar reglas, permisos, empresa y uso del precio durante contratacion/cobranza. |
| CU-71 | Registrar observaciones contextuales | G8 | Implementado | Mantener y verificar contexto, visibilidad, usuario, fecha, permisos y aparicion en historial. |
| CU-72 | Clasificar modalidad de equipo asociado | G1 | Duplicado local | Desistir de la edicion. El CRM puede mostrar la modalidad entregada por G1 en la ficha del servicio. |
| CU-73 | Cambiar plan conservando historial | G8 | Parcial | Corregir la fecha efectiva: un cambio futuro no debe modificar el plan vigente de inmediato. Verificar historial y precio. |
| CU-74 | Generar y consultar contrato digital | G8 | Implementado en servidor e interfaz actual | Mantener. Probar generacion, descarga, versiones, estado de firma, permisos y auditoria. La firma electronica externa no forma parte de este CU local. |
| CU-75 | Derivar ticket a orden de trabajo | Compartido: G8 solicita, G3 crea y administra OT | Solucion local temporal | Sustituir la creacion local por `POST /ordenes` o el endpoint acordado con G3. Guardar `request_id`, `trace_id` e `id_ot`. |
| CU-76 | Generar codigo propio de orden de trabajo | G3 | Implementado localmente, pero contradice la propiedad final | Dejar de generar el codigo en CRM cuando se active la integracion. Mostrar y almacenar el identificador entregado por G3. |

### Resultado de la reasignacion

- 11 CU permanecen bajo responsabilidad funcional del CRM: CU-28, CU-64 a CU-71, CU-73 y CU-74.
- 10 CU pasan completamente a otros grupos: CU-38, CU-39, CU-41, CU-55 a CU-58, CU-60, CU-63 y CU-72.
- 2 CU requieren integracion compartida con FSM: CU-75 y CU-76. La orden y su codigo pertenecen a G3.

## Obligaciones de integracion recibidas por el Grupo 8

Estas obligaciones fueron acordadas despues del alcance original de 23 CU. Deben tratarse como contratos de integracion y no como nuevos CU inventados.

| Identificador | API o capacidad requerida | Estado actual | Trabajo requerido |
|---|---|---|---|
| G8-1 | Consultar deuda por RUT o codigo de abonado | No existe con el contrato acordado | Crear endpoint de lectura usando cobranza como fuente de verdad. |
| G8-2 | Recibir solicitud de cambio Wi-Fi desde G2 | No existe | Crear receptor autenticado. La ejecucion real en SmartOLT debe respetar el acuerdo definitivo con G3/proveedor. |
| G8-3 | Recibir pagos confirmados desde G2 | No existe como webhook | Crear endpoint idempotente por `id_transaccion`, registrar pago y ejecutar reglas de reactivacion. |
| G8-4 | Consultar contratos por RUT | No existe con ese contrato publico | Crear consulta de solo lectura para G2. |
| G8-5 | Actualizar telefono y correo del cliente | No existe | Crear actualizacion limitada a datos de contacto, con validacion y auditoria. |
| G8-6 | Recibir leads desde el sitio/portal | Existe creacion interna de prospectos, falta contrato externo | Crear adaptador de entrada que reutilice las reglas de prospectos e idempotencia. |
| G8-7 | Descargar comprobante de pago PDF | No existe | Definir si G8 genera el comprobante o entrega el documento de la pasarela; implementar el endpoint acordado. |
| G8-8 | Listar proximos vencimientos, nuevos morosos y pagos recientes | No existe con los filtros acordados | Crear consultas para el polling diario de G2. |
| Transversal | Autenticacion servicio a servicio | No existe | Implementar `X-API-KEY` o JWT de servicio, idempotencia y trazabilidad sin exponer claves al frontend. |

## Pendientes heredados que no son CU nuevos del Incremento 2

| CU/area | Situacion | Tratamiento recomendado |
|---|---|---|
| CU-08 Estado del cliente | El endpoint y la interfaz existen en el codigo actual, pero falta prueba integral y validacion del catalogo definitivo de estados | Corregir como continuidad del Incremento 1. |
| CU-13 Morosidad automatica | Existe calculo bajo accion; falta ejecucion programada | Integrarlo con la cadena de cobranza del Incremento 2. |
| CU-14 Historial del cliente | El servidor y la interfaz existen en el codigo actual; falta verificar que toda la cronologia se muestre correctamente | Corregir como continuidad del Incremento 1. |
| CU-16 Churn mensual | La definicion y base temporal aun son debiles | Acordar formula antes de cambiar el codigo. |
| CU-30 Suspension por no pago | Existe cambio local manual; falta automatizacion y accion real de red | G8 decide comercialmente y llama a la integracion acordada. |
| CU-31 Reactivacion por pago | Existe cambio local; falta integracion de red y proteccion de servicios dados de baja | Completar junto con el webhook de pagos. |
| CU-44 Usuarios y roles | Solo permite listar y asignar un rol | Es mejora necesaria del CRM: crear, editar, desactivar/reactivar y restablecer acceso. Evitar borrado fisico por auditoria. |

## Linea de trabajo propuesta

### Etapa 1 - Cerrar lo propio del CRM sin dependencias externas

1. Ejecutar una prueba integral de CU-64, CU-65, CU-66, CU-67, CU-68, CU-70, CU-71 y CU-74.
2. Corregir CU-73 para respetar la fecha efectiva.
3. Completar CU-44 como pendiente interno, si se acepta formalmente como arrastre.
4. Cerrar diseno y mensajes de Clientes, Contratos, Servicios, Solicitudes, Planes y Cobranza.

Justificacion: este bloque depende solo del Grupo 8 y puede quedar completamente demostrable antes de recibir APIs externas.

### Etapa 2 - Construir las APIs que otros grupos consumiran

1. Implementar G8-1 a G8-8, respetando las responsabilidades tecnicas acordadas para Wi-Fi y SmartOLT.
2. Agregar autenticacion entre servicios, idempotencia y `trace_id`.
3. Publicar ejemplos de solicitudes, respuestas y errores para G2.

Justificacion: G2 depende del CRM para deuda, contratos, pagos, clientes, leads y comprobantes. Estos endpoints se pueden probar con datos locales mientras G2 prepara su consumidor.

### Etapa 3 - Integrar Inventario y FSM

1. Consumir tipos de equipo de G1 dentro de CU-69.
2. Mostrar equipos instalados de G1 en CU-65, sin permitir editarlos.
3. Consumir cobertura y factibilidad de G3.
4. Enviar solicitudes de instalacion y derivaciones de tickets a G3.
5. Recibir eventos de OT creada, reprogramada y completada.

Justificacion: este bloque necesita contratos y ambientes de otros grupos. Debe construirse sobre adaptadores separados para no acoplar la interfaz a respuestas externas inestables.

### Etapa 4 - Retirar duplicaciones

1. Ocultar y luego retirar las acciones locales de Inventario transferidas a G1.
2. Retirar las pantallas locales del Portal transferidas a G2.
3. Dejar consultas historicas solo si son necesarias para auditoria o migracion.
4. No eliminar tablas o datos hasta validar la integracion y acordar la migracion.

Justificacion: retirar antes de integrar cortaria flujos actuales; mantenerlos despues de integrar crearia dos fuentes de verdad.

## Definicion de verificado

Un CU se considera verificado cuando cumple todas estas condiciones:

- puede ejecutarse desde la interfaz con el rol correcto;
- persiste y consulta los datos esperados;
- respeta empresa, permisos y transiciones de estado;
- registra auditoria cuando corresponde;
- maneja errores y reintentos sin duplicar operaciones;
- cuenta con una prueba automatizada significativa y una prueba manual de punta a punta;
- si depende de otro grupo, fue probado contra su API o contra un contrato simulado fiel y luego confirmado en integracion.

La existencia de tablas, endpoints o botones por separado no basta para declarar cubierto un caso de uso.

## Decisiones aun pendientes entre grupos

1. Ratificar que G8 desiste definitivamente de Inventario y consume G1.
2. Ratificar el propietario de las credenciales del portal cliente.
3. Acordar autenticacion entre servicios y entrega segura de claves.
4. Confirmar URL, version y formatos finales de los endpoints de G1 y G3.
5. Confirmar el contrato de SmartOLT: G8 decide suspension/reactivacion por cobranza, pero debe definirse que servicio ejecuta la accion tecnica.
6. Acordar catalogos y equivalencias de estados entre CRM, Inventario, Portal y FSM.
