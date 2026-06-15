# Primer incremento - cobertura 28 casos de uso

Fuente: `Casos_Uso_Primer_Incremento_CRM_FINET.pdf`.

## CU43 - Autenticando empleado con correo corporativo
- Actor: Administrador, Comercial, Soporte, Terreno.
- Backend: login por email y password bcrypt, JWT, carga de rol y empresa.
- Frontend: pantalla de login y persistencia de sesion.
- Base de datos: `usuario`, `rol`, `usuario_rol`, `log_auditoria`.

## CU44 - Gestionando perfiles de usuario por rol
- Actor: Administrador.
- Backend: listar usuarios/roles y cambiar perfil.
- Frontend: modulo de usuarios con selector de rol.
- Base de datos: `usuario`, `rol`, `usuario_rol`, `log_auditoria`.

## CU45 - Alternando vistas entre FiNet y Cable Magico
- Actor: Administrador.
- Backend: filtros por empresa o vista consolidada.
- Frontend: selector superior de empresa.
- Base de datos: tablas con `id_empresa`, principalmente `empresa`, `cliente`, `prospecto`, inventario.

## CU46 - Registrando acciones en historial de auditoria
- Actor: modulo de ejecucion.
- Backend: servicio transversal de auditoria.
- Frontend: consulta de auditoria para administradores.
- Base de datos: `log_auditoria`.

## CU15 - Validando formato de RUT con digito verificador
- Actor: Comercial, cliente, tecnico, administrador.
- Backend: utilitario de validacion y endpoint de apoyo.
- Frontend: validacion en formularios de RUT.
- Base de datos: `cliente.rut`, `prospecto.rut`.

## CU11 - Importando base masiva desde CSV/Excel
- Actor: Administrador.
- Backend: carga multipart, lectura CSV/XLSX, validacion por fila, deteccion de duplicados.
- Frontend: modulo de importacion con resumen de errores.
- Base de datos: `cliente`, `prospecto`, `log_auditoria`.

## CU01 - Registrando nuevo prospecto comercial
- Actor: Usuario Comercial.
- Backend: crear prospecto con estado inicial `Prospecto Nuevo`.
- Frontend: formulario de nuevo prospecto.
- Base de datos: `prospecto`, `empresa`, `usuario`, `log_auditoria`.

## CU02 - Actualizando estado del prospecto en el pipeline
- Actor: Usuario Comercial.
- Backend: endpoint de transicion controlada de pipeline.
- Frontend: selector de estado en panel de gestion del prospecto.
- Base de datos: `prospecto.estado_pipeline`, `prospecto.tiempo_conversion_dias`, `log_auditoria`.

## CU06 - Verificando factibilidad tecnica de instalacion
- Actor: Usuario Soporte Tecnico.
- Backend: registra factibilidad sin agregar columnas nuevas; usa pipeline, cotizacion de control y auditoria.
- Frontend: accion Factible / No Factible en panel de prospecto.
- Base de datos: `prospecto.estado_pipeline`, `prospecto.motivo_perdida`, `cotizacion.factibilidad_verificada`, `log_auditoria`.

## CU03 - Generando cotizacion en formato PDF
- Actor: Usuario Comercial.
- Backend: crea `cotizacion`, genera el PDF y lo envia como adjunto al correo registrado mediante SMTP cuando el servicio esta configurado.
- Frontend: selector de plan, apertura del PDF y confirmacion visible del resultado del envio.
- Base de datos: `cotizacion`, `plan`, `prospecto`, `log_auditoria`.

## CU04 - Registrando motivo de perdida de prospecto
- Actor: Usuario Comercial.
- Backend: marca el prospecto como `Perdido` y persiste el motivo.
- Frontend: selector de motivo de perdida.
- Base de datos: `prospecto.motivo_perdida`, `prospecto.estado_pipeline`, `log_auditoria`.

## CU12 - Registrando tipo de plan contratado por el cliente
- Actor: Usuario Comercial.
- Backend: crea cliente si no existe y registra contrato con plan.
- Frontend: selector de plan contratado y dia de vencimiento.
- Base de datos: `cliente`, `plan`, `contrato`, `prospecto`, `log_auditoria`.

## CU17 - Generando Orden de Instalacion
- Actor: Usuario Comercial / Tecnico en Terreno.
- Backend: crea direccion principal si falta y genera orden de trabajo con fecha programada desde hoy hasta un ano hacia adelante.
- Frontend: fecha programada con limites visibles, prioridad y accion de creacion de OT.
- Base de datos: `direccion_servicio`, `orden_trabajo`, `prospecto`, `log_auditoria`.

## CU08 - Actualizando estado operativo del cliente
- Actor: Administrador, Soporte.
- Backend: cambio controlado de `cliente.estado` con auditoria.
- Frontend: modulo Clientes con selector de estado.
- Base de datos: `cliente`, `log_auditoria`.

## CU14 - Consultando historial completo del cliente
- Actor: Administrador, Comercial, Soporte.
- Backend: consolida contratos, facturas, pagos, tickets, ordenes, equipos y auditoria.
- Frontend: busqueda por RUT, telefono, nombre o contrato, mas boton Ver historial con resumen operativo.
- Base de datos: `cliente`, `contrato`, `factura`, `pago`, `ticket`, `orden_trabajo`, `unidad_equipo`, `log_auditoria`.

## CU53 - Registrando movimientos de inventario
- Actor: Administrador, Soporte.
- Backend: registra compra, devolucion, asignacion, descarte o transferencia.
- Frontend: panel Inventario con accion de movimiento sobre equipo seleccionado.
- Base de datos: `movimiento_inventario`, `unidad_equipo`, `historial_estado_equipo`, `log_auditoria`.

## CU54 - Actualizando estado logico de equipo
- Actor: Administrador, Soporte.
- Backend: actualiza estado de unidad y guarda historial.
- Frontend: selector de estado en Inventario.
- Base de datos: `unidad_equipo`, `historial_estado_equipo`, `log_auditoria`.

## CU62 - Visualizando inventario por empresa
- Actor: Administrador, Soporte, Terreno.
- Backend: listado filtrado por empresa o consolidado.
- Frontend: pestana Inventario conectada al selector superior y columna Empresa visible por equipo.
- Base de datos: `unidad_equipo`, `tipo_equipo`, `empresa`.

## CU20 - Instalando router/ONU en domicilio
- Actor: Tecnico en Terreno, Soporte.
- Backend: vincula equipo disponible con cliente y marca estado `Instalado`.
- Frontend: formulario Instalar router/ONU en Inventario.
- Base de datos: `unidad_equipo`, `historial_estado_equipo`, `cliente`, `orden_trabajo`, `log_auditoria`.

## CU59 - Asociando serie, MAC y puerto OLT al cliente
- Actor: Tecnico en Terreno, Soporte.
- Backend: guarda serie en `unidad_equipo.numero_serie` y registra MAC/OLT en notas tecnicas existentes.
- Frontend: serie visible, seleccion de cliente y OT, campos MAC/Puerto OLT y consulta posterior de los datos asociados.
- Base de datos: `unidad_equipo.diagnostico_tecnico`, `orden_trabajo.observaciones`, `log_auditoria`.

## CU23 - Registrando ticket de soporte
- Actor: Comercial, Soporte.
- Backend: crea ticket por RUT de cliente existente, categoria y prioridad.
- Frontend: formulario Registrando ticket de soporte que consulta y muestra los datos del cliente al ingresar su RUT.
- Base de datos: `ticket`, `cliente`, `categoria_falla`, `log_auditoria`.

## CU24 - Clasificando ticket por categoria de falla
- Actor: Soporte.
- Backend: actualiza `ticket.id_categoria` con validacion de categoria.
- Frontend: selector Clasificacion en Tickets.
- Base de datos: `ticket`, `categoria_falla`, `log_auditoria`.

## CU25 - Asignando prioridad de atencion
- Actor: Soporte.
- Backend: actualiza prioridad `Alta`, `Media` o `Baja`.
- Frontend: selector Prioridad en Tickets.
- Base de datos: `ticket`, `log_auditoria`.

## CU26 - Actualizando estado del ticket
- Actor: Soporte, Terreno.
- Backend: transiciones progresivas entre Abierto, En progreso, Escalado, Resuelto y Cerrado.
- Frontend: selector Estado con comentario.
- Base de datos: `ticket`, `log_auditoria`.

## CU21 - Registrando diagnostico tecnico post-visita
- Actor: Tecnico en Terreno.
- Backend: agrega diagnostico al ticket, actualiza cliente y completa OT asociada si existe.
- Frontend: formulario Diagnostico tecnico en Tickets.
- Base de datos: `ticket`, `cliente`, `orden_trabajo`, `historial_ot`, `log_auditoria`.

## CU07 - Cerrando instalacion y activando cliente
- Actor: Tecnico en Terreno, Soporte.
- Backend: completa OT de instalacion, activa cliente y contrato.
- Frontend: modulo OTs con cierre de instalacion.
- Base de datos: `orden_trabajo`, `cliente`, `contrato`, `historial_ot`, `log_auditoria`.

## CU10 - Calculando tiempo de conversion de prospecto
- Actor: Sistema / Comercial.
- Backend: al cerrar instalacion exige un prospecto asociado con fecha de creacion, registra la fecha de conversion, calcula los dias transcurridos y marca Servicio Activo. Si las fechas faltan o son incoherentes, la operacion se rechaza sin activar al cliente.
- Frontend: el panel de OTs muestra fecha de creacion, fecha de conversion y dias calculados; tambien presenta la excepcion cuando falta informacion para calcular.
- Base de datos: `prospecto.fecha_conversion`, `prospecto.tiempo_conversion_dias`, `orden_trabajo`.

## CU33 - Exportando reportes operativos
- Actor: Administrador.
- Backend: genera CSV o XLSX de clientes, prospectos, tickets e inventario filtrados por periodo y empresa. Rechaza fechas inexistentes, anteriores a `2000-01-01`, futuras o rangos invertidos.
- Frontend: modulo Reportes operativos con tipo, periodo, alcance, empresa y formato; los calendarios aplican los mismos limites del backend.
- Base de datos: `cliente`, `prospecto`, `ticket`, `unidad_equipo`, `log_auditoria`.

## Nota de compatibilidad con la base compartida

Este bloque no modifica scripts SQL ni agrega columnas. La ampliacion de `backend/prisma/schema.prisma` solo le ensena a Prisma a leer tablas que ya existen en la base PostgreSQL entregada. Donde faltaban columnas especificas, por ejemplo MAC o puerto OLT, se reutilizaron campos tecnicos existentes (`diagnostico_tecnico` y `observaciones`) para mantener la misma base global que usa el equipo.
