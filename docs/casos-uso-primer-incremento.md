# Primer incremento - avance 13 casos de uso

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
- Backend: crea `cotizacion`, actualiza PDF URL y genera PDF bajo demanda.
- Frontend: selector de plan y apertura de PDF.
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
- Backend: crea direccion principal si falta y genera orden de trabajo.
- Frontend: fecha programada, prioridad y accion de creacion de OT.
- Base de datos: `direccion_servicio`, `orden_trabajo`, `prospecto`, `log_auditoria`.
