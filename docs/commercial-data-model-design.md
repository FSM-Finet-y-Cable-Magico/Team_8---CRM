# Diseño del modelo de datos comercial — Incremento 2

Base de análisis: rama derivada de `feat-ux-ui-incremento2`, con CRM interno modularizado en `frontend/src/features/`, portal cliente independiente en `portal/`, backend NestJS modular, Prisma/PostgreSQL y cobranza base con facturas, pagos, notificaciones simuladas, zonas de pago y precios por zona.

Esta fase es exclusivamente documental. No modifica Prisma, SQL, backend, frontend, portal, Docker ni dependencias.

## 1. Objetivo del modelo

El modelo comercial busca representar dentro del CRM el flujo que hoy se gestiona mediante Google Sheets y WhatsApp: cobranza operativa, avisos, pagos, abonos, convenios, prórrogas, corte, retiro, reposición, documentos tributarios externos y trazabilidad de gestiones comerciales.

La intención no es reemplazar de golpe el flujo operativo actual, sino trasladarlo progresivamente a entidades auditables, consultables y exportables, manteniendo una base preparada para futuras integraciones con Facturación.cl y WhatsApp Business API.

## 2. Entidades existentes reutilizables

| Entidad actual | Uso actual | Uso propuesto en flujo comercial | Requiere modificación | Observaciones |
| --- | --- | --- | --- | --- |
| Cliente | Identificación, contacto, empresa, estado y origen. | Base del Libro Control Comercial, identificación del deudor, contacto para avisos, segmentación por empresa. | No inicial | No duplicar clientes por RUT. Usar como entidad principal de consulta. |
| Contrato | Relaciona cliente, plan, empresa, zona, vencimiento, estado y facturas. | Determinar ciclo comercial, día de pago, estado contractual, suspensión/reactivación y zona de cobro. | No inicial | Ya tiene `diaVencimiento`, `estado` e `idZonaPago`. |
| Factura | Deuda interna por periodo, monto, vencimiento y estado. | Fuente principal para deuda, vencimiento, atraso, saldo y priorización de avisos/cortes. | No inicial | No mezclar con boleta/factura tributaria externa. |
| Pago | Registro de pagos asociados a factura y cliente. | Registrar pagos completos o parciales, validar voucher/código de transacción único y alimentar saldo. | Sí, etapa media opcional | `codigoTransaccion` ya es único. Se puede reforzar por DTO y luego agregar clasificación de pago si hace falta. |
| ZonaPago | Zonas por empresa, comuna y día sugerido de vencimiento. | Filtrar y priorizar cobranza por zona, día de pago y futuras reglas de corte/retiro. | No inicial | Ya existe; debe reutilizarse antes de crear nuevas tablas de zona. |
| PlanZonaPrecio | Precio mensual e instalación por plan y zona. | Calcular valores comerciales cuando el precio depende de zona. | No inicial | Ya existe para reglas por zona. No quemar precios en código. |
| PlantillaNotificacion | Texto de plantilla por evento/canal. | Base para mensajes comerciales copiables: aviso pago, aviso corte y aviso retiro. | No inicial | Puede ampliarse luego con variables/versionado si WhatsApp API lo requiere. |
| LogNotificacion | Registro de envío de notificaciones. | Trazar envío manual o simulado de mensajes comerciales. | No inicial | Se complementa con eventos comerciales; no debe cargar toda la conversación. |
| ServicioContratado | Servicio por cliente, contrato, dirección, zona y estado operativo. | Determinar servicio afectado por corte, retiro, reposición o reactivación. | No inicial | Ya relaciona cliente, contrato, zona, tickets, OTs y equipos. |
| ObservacionOperativa | Observaciones por tipo de entidad e id de entidad. | Comentarios generales comerciales o técnicos sin estado operativo formal. | No inicial | Para acciones con significado de flujo, usar evento comercial. |
| LogAuditoria | Auditoría de acciones críticas. | Auditar creación/modificación de eventos, pagos, convenios, cortes, retiros, beneficios y documentos. | No | Debe seguir siendo la trazabilidad transversal. |
| Usuario | Usuario interno responsable de acciones. | Responsable de aviso, pago, convenio, corte, retiro, revisión o aprobación. | No inicial | Relacionar eventos/beneficios con usuario. |
| Rol | Agrupación de permisos internos. | Mapear permisos comerciales iniciales a Administrador y Comercial. | No inicial | Roles definitivos quedan por definir. |
| UsuarioRol | Relación usuario-rol. | Controlar acceso a gestión comercial según rol. | No inicial | Puede mantenerse hasta requerir permisos comerciales más granulares. |

## 3. Principios de diseño

- No duplicar datos ya existentes.
- No reemplazar `Factura` ni `Pago` si ya cumplen la función financiera base.
- Registrar eventos comerciales sin destruir historial.
- Separar documento tributario externo de factura interna.
- Permitir integración futura con Facturación.cl.
- Permitir integración futura con WhatsApp Business API.
- Mantener reglas configurables por empresa, zona, plan y permisos.
- No quemar planes, precios, cargos de reposición ni montos de retiro en código.
- Permitir roles y permisos comerciales futuros sin bloquear la primera implementación.
- Auditar acciones sensibles con `AuditService` y `LogAuditoria`.
- Mantener separación de datos por empresa y selector consolidado/empresa.
- Traducir colores de la planilla a estados funcionales, no a reglas rígidas.

## 4. Modelo propuesto por etapas

### 4.1 Primera etapa obligatoria

Tablas necesarias para iniciar el Libro Control Comercial:

- `evento_gestion_comercial`: necesaria para registrar cada acción comercial histórica.
- `gestion_comercial_mensual`: necesaria como concepto de Libro Control; puede implementarse inicialmente como vista calculada/DTO desde `Factura`, `Pago`, `Contrato`, `Cliente`, `ServicioContratado` y `ZonaPago`.

Evaluación de `zona_pago`: ya existe en la rama base, junto con `plan_zona_precio`. Por tanto, se debe reutilizar `ZonaPago` y no crear una nueva tabla de zonas en la primera etapa.

### 4.2 Segunda etapa

Tablas para excepciones comerciales y reglas especiales:

- `beneficio_comercial`: convenios, prórrogas, descuentos, cambios de fecha y excepciones.
- `cargo_adicional`: reposición, reconexión, retiro/desconexión u otros cargos comerciales.
- `respuesta_notificacion`: solo si las respuestas del cliente superan el registro simple en `evento_gestion_comercial`.

### 4.3 Tercera etapa

Tablas de preparación futura:

- `documento_tributario`: metadata de boletas/facturas emitidas fuera del CRM.
- `garantia_cliente`: garantías comerciales o técnicas asociadas a cliente, servicio, contrato o equipo.
- permisos comerciales granulares, solo si el modelo actual de roles/permisos no alcanza para la operación real.

## 5. Tabla: gestion_comercial_mensual

Propósito: representar una fila del Libro Control Comercial para un periodo determinado, asociando cliente, contrato, factura y servicio con su estado comercial, deuda, vencimientos y responsable.

| Campo | Obligatorio | Descripción |
| --- | --- | --- |
| id | Sí, si es tabla persistente | Identificador interno. |
| idCliente | Sí | Cliente asociado a la gestión mensual. |
| idContrato | Recomendado | Contrato que origina la factura o deuda. |
| idFactura | Recomendado | Factura del periodo evaluado. |
| idServicio | Opcional | Servicio afectado por el estado comercial. |
| periodo | Sí | Periodo comercial, por ejemplo `2026-08`. |
| empresaId | Sí | Empresa propietaria del registro. |
| zonaPagoId | Opcional | Zona de pago asociada al contrato o servicio. |
| estadoComercial | Sí | Estado calculado o congelado del cliente/factura. |
| montoFacturado | Sí | Monto facturado para el periodo. |
| montoPagado | Sí | Suma de pagos asociados. |
| saldoPendiente | Sí | Diferencia entre facturado y pagado. |
| diasAtraso | Sí | Días desde vencimiento cuando exista deuda vencida. |
| fechaVencimiento | Sí | Fecha límite de pago de la factura. |
| fechaAvisoPago | Opcional | Último aviso preventivo registrado. |
| fechaAvisoCorte | Opcional | Último aviso previo a corte. |
| fechaCorteProgramado | Opcional | Fecha prevista de corte. |
| fechaRetiroProgramado | Opcional | Fecha prevista de retiro/desconexión. |
| responsableId | Opcional | Usuario comercial responsable. |
| ultimaGestionAt | Opcional | Fecha de la última acción comercial. |
| createdAt | Sí, si es tabla persistente | Fecha de creación del snapshot. |
| updatedAt | Sí, si es tabla persistente | Fecha de actualización del snapshot. |

Índices recomendados:

- `periodo`
- `idCliente`
- `idContrato`
- `idFactura`
- `estadoComercial`
- `empresaId`
- `zonaPagoId`
- `responsableId`

Decisión vista calculada vs tabla persistente:

- Para la primera implementación, se recomienda partir como vista calculada desde `Factura`, `Pago`, `Contrato`, `Cliente`, `ServicioContratado` y `ZonaPago`.
- Si coordinación requiere histórico congelado mensual, diferencias entre lo calculado hoy y lo informado en el mes, o auditoría de cierres comerciales por periodo, entonces conviene pasar a tabla persistente.
- Recomendación inicial: no crear `gestion_comercial_mensual` persistente en Fase Comercial 1 salvo que el negocio confirme necesidad de snapshot congelado.

## 6. Tabla: evento_gestion_comercial

Propósito: registrar acciones comerciales históricas: aviso pago, aviso corte, aviso retiro, respuesta, corte, retiro, reactivación, abono, convenio, prórroga, reposición u observación comercial.

| Campo | Obligatorio | Descripción |
| --- | --- | --- |
| id | Sí | Identificador interno. |
| idCliente | Sí | Cliente afectado. |
| idContrato | Opcional | Contrato relacionado. |
| idFactura | Opcional | Factura relacionada. |
| idPago | Opcional | Pago relacionado, cuando aplique. |
| idServicio | Opcional | Servicio afectado. |
| idUsuario | Opcional | Usuario que registra la acción. |
| idEmpresa | Recomendado | Empresa asociada para filtros y separación de datos. |
| tipoEvento | Sí | Tipo de acción comercial. |
| canal | Opcional | Canal usado: manual, WhatsApp copiable, llamada, correo, presencial o sistema. |
| estado | Sí | Estado del evento. |
| mensajeGenerado | Opcional | Texto generado para copiar/enviar. |
| respuestaCliente | Opcional | Respuesta registrada manualmente. |
| observacion | Opcional | Comentario operativo. |
| montoRelacionado | Opcional | Monto asociado a pago, abono, cargo o convenio. |
| fechaCompromiso | Opcional | Fecha comprometida por cliente o área comercial. |
| fechaEvento | Sí | Fecha efectiva de la acción. |
| metadataJson | Opcional | Datos variables sin alterar esquema. |
| createdAt | Sí | Fecha de creación del registro. |

Tipos de evento sugeridos:

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

Índices recomendados:

- `idCliente`
- `idContrato`
- `idFactura`
- `idServicio`
- `idEmpresa`
- `tipoEvento`
- `fechaEvento`
- `idUsuario`

## 7. Tabla: beneficio_comercial

Propósito: representar convenios, prórrogas, descuentos, cambios de fecha o acuerdos comerciales que justifican una excepción sobre el flujo normal de cobranza.

| Campo | Obligatorio | Descripción |
| --- | --- | --- |
| id | Sí | Identificador interno. |
| idCliente | Sí | Cliente beneficiado. |
| idContrato | Opcional | Contrato relacionado. |
| idFactura | Opcional | Factura afectada. |
| idUsuario | Opcional | Usuario que registra el beneficio. |
| idEmpresa | Recomendado | Empresa asociada. |
| tipoBeneficio | Sí | Tipo de beneficio o acuerdo. |
| estado | Sí | Estado del beneficio. |
| montoOriginal | Opcional | Monto original de la deuda o cargo. |
| montoComprometido | Opcional | Monto acordado o comprometido. |
| fechaInicio | Opcional | Inicio de vigencia. |
| fechaCompromiso | Opcional | Fecha comprometida para pago o regularización. |
| numeroCuotas | Opcional | Cantidad de cuotas si hay convenio. |
| observacion | Opcional | Justificación o detalle. |
| aprobadoPorId | Opcional | Usuario aprobador si requiere autorización. |
| createdAt | Sí | Fecha de creación. |
| updatedAt | Sí | Fecha de actualización. |

Tipos sugeridos:

- `ABONO`
- `CONVENIO`
- `PRORROGA`
- `CAMBIO_FECHA_PAGO`
- `DESCUENTO`
- `EXCEPCION_SUPERVISOR`

Decisión sobre abonos:

- El pago parcial vive en `Pago`.
- La justificación, promesa, excepción o acuerdo comercial vive en `BeneficioComercial` o `EventoGestionComercial`.
- En primera etapa, el abono puede registrarse como `Pago` + `EventoGestionComercial`.
- En etapa media, si se requiere seguimiento de compromisos, cuotas o aprobaciones, se crea `beneficio_comercial`.

## 8. Tabla: cargo_adicional

Propósito: registrar cargos comerciales adicionales como reposición por corte, reconexión, retiro/desconexión física u otros cobros no cubiertos por el plan mensual.

| Campo | Obligatorio | Descripción |
| --- | --- | --- |
| id | Sí | Identificador interno. |
| idCliente | Sí | Cliente afectado. |
| idContrato | Opcional | Contrato relacionado. |
| idFactura | Opcional | Factura donde se cobra o cobrará. |
| idServicio | Opcional | Servicio asociado al cargo. |
| idEmpresa | Recomendado | Empresa asociada. |
| tipoCargo | Sí | Tipo de cargo adicional. |
| monto | Sí | Valor del cargo. |
| estado | Sí | Pendiente, facturado, pagado o anulado. |
| motivo | Opcional | Motivo operacional o comercial. |
| idUsuario | Opcional | Usuario que registra el cargo. |
| createdAt | Sí | Fecha de creación. |
| updatedAt | Sí | Fecha de actualización. |

Tipos sugeridos:

- `REPOSICION_CORTE`
- `RECONEXION`
- `RETIRO_DESCONEXION`
- `OTRO`

Consideraciones:

- Reposición por pago fuera de plazo/corte: referencia operativa de $500.
- Retiro/desconexión física: referencia operativa de $5.000.
- Estos valores deben ser configurables por empresa/zona/regla y no deben quedar fijos en código.

## 9. Tabla: documento_tributario

Propósito: registrar metadata de boletas/facturas emitidas fuera del CRM, preparando una integración futura con Facturación.cl.

| Campo | Obligatorio | Descripción |
| --- | --- | --- |
| id | Sí | Identificador interno. |
| idCliente | Sí | Cliente asociado. |
| idContrato | Opcional | Contrato asociado. |
| idFactura | Opcional | Factura interna relacionada. |
| idEmpresa | Recomendado | Empresa emisora. |
| tipoDocumento | Sí | Boleta o factura. |
| numeroDocumento | Opcional | Número visible del documento. |
| folioExterno | Opcional | Folio entregado por proveedor tributario. |
| proveedorEmision | Sí | Proveedor externo, inicialmente `FACTURACION_CL`. |
| fechaEmision | Opcional | Fecha de emisión externa. |
| fechaEnvioCliente | Opcional | Fecha de envío al cliente. |
| montoNeto | Opcional | Monto neto. |
| iva | Opcional | IVA. |
| total | Opcional | Total documento. |
| urlVerificacion | Opcional | URL pública o segura de verificación. |
| estadoEnvio | Opcional | Estado de envío al cliente. |
| metadataJson | Opcional | Respuesta o payload externo sin guardar credenciales. |
| createdAt | Sí | Fecha de creación. |
| updatedAt | Sí | Fecha de actualización. |

Tipos:

- `BOLETA`
- `FACTURA`

Proveedor inicial:

- `FACTURACION_CL`

Reglas:

- No emitir documentos desde el CRM todavía.
- No guardar credenciales de Facturación.cl en esta tabla.
- No simular emisión tributaria.
- No confundir `Factura` interna con documento tributario externo.

## 10. Tabla: garantia_cliente

Propósito: registrar garantías comerciales o técnicas asociadas a cliente, servicio, equipo o contrato.

| Campo | Obligatorio | Descripción |
| --- | --- | --- |
| id | Sí | Identificador interno. |
| idCliente | Sí | Cliente asociado. |
| idServicio | Opcional | Servicio cubierto. |
| idEquipo | Opcional | Equipo cubierto. |
| idContrato | Opcional | Contrato asociado. |
| idEmpresa | Recomendado | Empresa asociada. |
| tipoGarantia | Sí | Tipo de garantía. |
| monto | Opcional | Monto cubierto o garantía monetaria. |
| fechaInicio | Opcional | Inicio de vigencia. |
| fechaFin | Opcional | Fin de vigencia. |
| estado | Sí | Estado de la garantía. |
| observacion | Opcional | Detalle operativo. |
| createdAt | Sí | Fecha de creación. |
| updatedAt | Sí | Fecha de actualización. |

Clasificación: etapa media/futura. No es imprescindible para el Libro Control Comercial inicial, salvo que coordinación confirme que la garantía condiciona cobranza, retiro o reposición.

## 11. Tabla: respuesta_notificacion

Opción A: crear tabla separada `respuesta_notificacion`.

- Ventaja: permite conversación más estructurada, múltiples respuestas por aviso, adjuntos y seguimiento fino.
- Desventaja: aumenta complejidad antes de integrar WhatsApp Business API.

Opción B: integrar respuesta dentro de `evento_gestion_comercial`.

- Ventaja: cubre la primera operación manual con menos tablas.
- Desventaja: si luego hay hilos conversacionales, puede quedarse corta.

Recomendación: para simplificar la primera etapa, registrar la respuesta del cliente en `evento_gestion_comercial.respuestaCliente` o en un evento de tipo `RESPUESTA_CLIENTE`. Crear tabla separada solo si se necesita conversación/hilo más complejo o integración real con WhatsApp Business API.

## 12. Ajustes a tablas existentes

`Pago`:

- Mantener `codigoTransaccion` como voucher/código único.
- Reforzar desde DTO/backend que el voucher sea obligatorio cuando el método de pago lo requiera.
- Agregar `tipoPago` o `clasificacionPago` solo en etapa media si se necesita distinguir pago total, parcial, abono, ajuste o reversa.

`Factura`:

- Mantener como deuda interna del CRM.
- No mezclar metadata tributaria externa en esta tabla.
- Relacionar con `documento_tributario` cuando Facturación.cl entre en alcance.

`Contrato`:

- Reutilizar `diaVencimiento`, `estado` e `idZonaPago`.
- No duplicar día de pago en una nueva tabla salvo que se requiera histórico de cambios.
- Si se implementa cambio de fecha de pago, registrar la justificación en `beneficio_comercial` o `evento_gestion_comercial`.

`LogNotificacion`:

- Mantener como bitácora de envío.
- Complementar con `evento_gestion_comercial` para contexto comercial, respuesta, monto, compromiso y responsable.
- No reutilizarlo como conversación de WhatsApp.

`ObservacionOperativa`:

- Mantener para comentarios generales sobre cliente, servicio, contrato, ticket, orden o equipo.
- Usar `evento_gestion_comercial` cuando la observación represente un hito comercial o cambie el estado del flujo.

`ZonaPago`:

- Ya cubre nombre, comuna, empresa, día de vencimiento sugerido y activación.
- Puede usarse para filtros del Libro Control y reglas de cobro.
- Si se requieren reglas de corte/retiro por zona, agregar una extensión mínima futura en vez de crear otra zona paralela.

Cambios mínimos recomendados:

- Fase Comercial 1: crear `evento_gestion_comercial` y leer el Libro Control como vista calculada.
- No modificar `Factura`, `Pago`, `Contrato` ni `ZonaPago` en la primera etapa salvo validaciones DTO/servicio.

## 13. Relaciones principales

- `Cliente` 1:N `GestionComercialMensual`.
- `Cliente` 1:N `EventoGestionComercial`.
- `Contrato` 1:N `GestionComercialMensual`.
- `Contrato` 1:N `EventoGestionComercial`.
- `Factura` 1:N `EventoGestionComercial`.
- `Factura` 1:N `Pago`.
- `Factura` 1:1 o 1:N `DocumentoTributario`, según si se permite reemisión/versionado.
- `ServicioContratado` 1:N `EventoGestionComercial`.
- `Usuario` 1:N `EventoGestionComercial`.
- `Usuario` 1:N `BeneficioComercial`.
- `ZonaPago` 1:N `GestionComercialMensual`.
- `Cliente` 1:N `BeneficioComercial`.
- `Cliente` 1:N `CargoAdicional`.
- `Cliente` 1:N `GarantiaCliente`.

## 14. Estados y enums recomendados

`EstadoComercial`:

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

`TipoEventoComercial`:

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

`CanalGestionComercial`:

- `MANUAL`
- `WHATSAPP_COPIABLE`
- `LLAMADA`
- `CORREO`
- `PRESENCIAL`
- `SISTEMA`

`EstadoEventoComercial`:

- `REGISTRADO`
- `PENDIENTE`
- `ENVIADO`
- `RESPONDIDO`
- `FALLIDO`
- `ANULADO`

`TipoBeneficioComercial`:

- `ABONO`
- `CONVENIO`
- `PRORROGA`
- `CAMBIO_FECHA_PAGO`
- `DESCUENTO`
- `EXCEPCION_SUPERVISOR`

`EstadoBeneficioComercial`:

- `ACTIVO`
- `CUMPLIDO`
- `INCUMPLIDO`
- `VENCIDO`
- `ANULADO`

`TipoCargoAdicional`:

- `REPOSICION_CORTE`
- `RECONEXION`
- `RETIRO_DESCONEXION`
- `OTRO`

`EstadoCargoAdicional`:

- `PENDIENTE`
- `FACTURADO`
- `PAGADO`
- `ANULADO`

`TipoDocumentoTributario`:

- `BOLETA`
- `FACTURA`

`EstadoDocumentoTributario`:

- `REGISTRADO`
- `ENVIADO`
- `ACEPTADO`
- `RECHAZADO`
- `ANULADO`

## 15. Impacto en scripts SQL y Prisma

Archivos que deberán tocarse en la siguiente fase de implementación:

- `backend/prisma/schema.prisma`
- `db/init/01_schema.sql`
- posiblemente nuevo `db/init/10_commercial_control.sql`
- seeds demo comerciales, por ejemplo `db/init/11_seed_commercial_control.sql`

Cambios esperados:

- Agregar modelo Prisma para `evento_gestion_comercial`.
- Evaluar si `gestion_comercial_mensual` será vista calculada, vista SQL o tabla persistente.
- Agregar modelos para `beneficio_comercial`, `cargo_adicional`, `documento_tributario` y `garantia_cliente` solo cuando entren en fase.
- Mantener `zona_pago` y `plan_zona_precio` existentes.

Esta fase no modifica esos archivos.

## 16. Priorización final

| Elemento | Prioridad | Fase | Justificación |
| --- | --- | --- | --- |
| `evento_gestion_comercial` | Alta | Fase Comercial 1 | Es la base histórica no destructiva para avisos, respuestas, pagos, cortes, retiros y observaciones comerciales. |
| `gestion_comercial_mensual` | Alta | Fase Comercial 1 como vista calculada | Permite visualizar Libro Control sin congelar datos antes de validar operación real. |
| `beneficio_comercial` | Alta | Fase Comercial 4 | Necesario para convenios, prórrogas, descuentos y excepciones con seguimiento. |
| `cargo_adicional` | Media | Fase Comercial 5 | Necesario para reposición, reconexión y retiro cuando esos cobros entren al flujo formal. |
| `documento_tributario` | Media | Fase Comercial 6 | Prepara Facturación.cl sin emitir ni simular documentos desde CRM. |
| `garantia_cliente` | Media | Futura | Útil para garantías comerciales/técnicas, pero no bloquea Libro Control inicial. |
| `respuesta_notificacion` | Baja | Futura si se requiere | Puede integrarse inicialmente en eventos comerciales. |
| permisos comerciales granulares | Media | Fase Comercial 8 | Necesarios cuando los roles comerciales definitivos estén definidos. |

## 17. Decisión recomendada para implementación inicial

Para Fase Comercial 1 se recomienda:

- Crear `CommercialControlModule`.
- Crear endpoint de lectura del Libro Control como vista calculada.
- Crear `evento_gestion_comercial` para registrar acciones comerciales.
- No crear todavía `gestion_comercial_mensual` persistente salvo que el negocio confirme necesidad de snapshot mensual congelado.
- Reutilizar `Factura`, `Pago`, `Contrato`, `Cliente`, `ServicioContratado`, `ZonaPago`, `PlantillaNotificacion`, `LogNotificacion` y `LogAuditoria`.
- Preparar enums/tipos comerciales en backend y frontend.
- Mantener mensajes WhatsApp como texto copiable y registro manual de envío.
- Mantener Facturación.cl fuera de alcance funcional, registrando metadata solo en una fase posterior.

Decisión concreta:

La primera implementación debe persistir eventos, no snapshots. El Libro Control se calcula desde deuda/pagos/contratos y se complementa con el último evento comercial relevante.

## 18. Criterios de salida

Checklist para pasar a desarrollo:

- Entidades existentes revisadas.
- Tablas nuevas priorizadas.
- Relaciones definidas.
- Enums definidos.
- Decisión vista calculada vs tabla persistente tomada.
- Archivos a modificar en próxima fase identificados.
- Riesgos documentados.

Riesgos documentados:

- Si se crea `gestion_comercial_mensual` persistente demasiado pronto, puede duplicar deuda y generar diferencias con `Factura`/`Pago`.
- Si los abonos se modelan solo como eventos, se pierde cálculo financiero exacto; por eso el monto pagado debe vivir en `Pago`.
- Si los convenios se modelan solo como pagos, se pierde la promesa/acuerdo comercial; por eso el acuerdo debe vivir en `beneficio_comercial` o evento.
- Si `LogNotificacion` se usa como conversación, quedará corto para respuestas y compromisos; usar eventos primero y tabla separada después si hace falta.
- Si los montos de reposición/retiro quedan fijos en código, se romperá la configurabilidad por empresa o zona.
- Si Facturación.cl se mezcla con `Factura`, se confundirá deuda interna con documento tributario externo.
- Si WhatsApp se automatiza antes de definir proveedor, número y credenciales, se puede comprometer seguridad y trazabilidad.
- Si los permisos comerciales se endurecen antes de definir roles reales, puede bloquear la operación diaria.

Validación de esta fase:

- Confirmar que solo se creó `docs/commercial-data-model-design.md`.
- Ejecutar `git diff --check`.
- Ejecutar `git status`.

