# Primer incremento - primeros 7 casos de uso

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
