# Estado del primer incremento

Esta matriz resume el estado actual de los 28 casos de uso cubiertos por el primer incremento. La columna "Estado actual" distingue entre implementado en codigo y demostrable con datos locales.

## Resumen

| Grupo | Estado |
| --- | --- |
| Autenticacion, roles, empresas, auditoria y RUT | Implementado y demostrable con seed base |
| Prospectos y pipeline | Implementado y demostrable con `db/demo_seed.sql` |
| Cotizacion, contrato y orden de instalacion | Implementado, requiere planes y prospectos con datos completos |
| Clientes e historial | Implementado, requiere clientes/contratos/tickets/equipos |
| Inventario | Implementado, requiere equipos demo o creados desde UI |
| Tickets y diagnostico | Implementado, requiere clientes y categorias |
| Reportes | Implementado, su utilidad depende de datos cargados |

## Matriz

| CU | Caso de uso | Backend | Frontend | Datos necesarios | Estado actual | Pendiente recomendado |
| --- | --- | --- | --- | --- | --- | --- |
| CU43 | Autenticar empleado | `POST /api/auth/login`, `GET /api/auth/me` | Login | Usuario admin | Implementado y probado | Mejorar mensajes de credenciales invalidas si se requiere |
| CU44 | Gestionar perfiles por rol | `GET /api/users`, `GET /api/users/roles`, `PATCH /api/users/:id/role` | Usuarios | Usuarios y roles | Parcialmente demostrable | Crear alta/edicion de usuarios si el alcance lo exige |
| CU45 | Alternar vistas por empresa | `GET /api/companies`, `GET /api/companies/summary` | Selector empresa | Empresas | Implementado y demostrable | Validar metricas con mas datos reales |
| CU46 | Registrar acciones en auditoria | `GET /api/audit` y `AuditService` | Auditoria | Acciones ejecutadas | Implementado y demostrable | Ampliar cobertura de auditoria en flujos nuevos |
| CU15 | Validar RUT | `POST /api/rut/validate` | Panel RUT y formularios | RUT ingresado | Implementado y demostrable | Homologar formato visual en todos los formularios |
| CU11 | Importar CSV/Excel | `POST /api/imports/clients` | Importacion | Archivo CSV/XLS/XLSX | Implementado | Probar plantillas con errores y duplicados |
| CU01 | Registrar prospecto | `POST /api/prospects` | Nuevo prospecto | Empresa, usuario | Implementado y mejorado | Seguir afinando validacion y textos de ayuda |
| CU02 | Actualizar pipeline | `PATCH /api/prospects/:id/pipeline` | Gestion prospecto | Prospecto | Implementado | Validar secuencia completa de estados |
| CU06 | Verificar factibilidad | `POST /api/prospects/:id/feasibility` | Gestion prospecto | Prospecto con direccion | Implementado | Mostrar observaciones en historial visible |
| CU03 | Generar cotizacion PDF | `POST /api/prospects/:id/quotes`, `GET PDF` | Gestion prospecto | Prospecto factible + plan + SMTP para envio | Implementado; envio real configurable | Configurar credenciales SMTP del ambiente |
| CU04 | Registrar perdida | `POST /api/prospects/:id/loss` | Gestion prospecto | Prospecto | Implementado | Confirmacion visual antes de marcar perdido |
| CU12 | Registrar plan contratado | `POST /api/prospects/:id/contracts` | Gestion prospecto | Prospecto + plan | Implementado con `db/demo_seed.sql` | Crear administracion de planes |
| CU17 | Generar orden de instalacion | `POST /api/prospects/:id/install-orders` | Gestion prospecto | Prospecto convertido a cliente | Implementado | Guiar usuario cuando falte contrato previo |
| CU08 | Actualizar estado de cliente | `PATCH /api/customers/:id/status` | Clientes | Cliente | Implementado con `db/demo_seed.sql` | Validar catalogo de estados definitivo |
| CU14 | Consultar historial de cliente | `GET /api/customers`, `GET /api/customers/:id/history` | Clientes | Cliente y registros asociados | Implementado con busqueda por RUT, telefono y nombre | Mejorar visualizacion cronologica del historial |
| CU53 | Registrar movimiento inventario | `POST /api/inventory/movements` | Inventario | Equipo | Implementado con `db/demo_seed.sql` | Validar obligatoriedad por tipo de movimiento |
| CU54 | Actualizar estado logico equipo | `PATCH /api/inventory/equipment/:id/status` | Inventario | Equipo | Implementado | Mostrar historial de cambios de equipo |
| CU62 | Visualizar inventario por empresa | `GET /api/inventory?scope=...` | Inventario | Equipos | Implementado con empresa visible por equipo | Agregar filtros por estado/tipo |
| CU20 | Instalar router/ONU | `POST /api/inventory/equipment/:id/install` | Inventario | Equipo disponible + cliente | Implementado | Mejorar seleccion de OT asociada |
| CU59 | Asociar serie, MAC y puerto OLT | `POST /api/inventory/equipment/:id/install` | Inventario | Equipo disponible + cliente | Implementado con cliente, OT y datos tecnicos visibles | Persistir MAC/OLT en campos propios si la base evoluciona |
| CU23 | Registrar ticket | `GET /api/customers/search`, `POST /api/tickets` | Tickets | Cliente + categoria | Implementado con consulta previa por RUT | Agregar mas datos de contacto si el caso evoluciona |
| CU24 | Clasificar ticket | `PATCH /api/tickets/:id/category` | Tickets | Ticket + categorias | Implementado | Mostrar SLA de categoria |
| CU25 | Asignar prioridad | `PATCH /api/tickets/:id/priority` | Tickets | Ticket | Implementado | Definir reglas de prioridad automatica si aplica |
| CU26 | Actualizar estado ticket | `PATCH /api/tickets/:id/status` | Tickets | Ticket | Implementado | Validar transiciones permitidas con feedback visual |
| CU21 | Registrar diagnostico tecnico | `POST /api/tickets/:id/diagnosis` | Tickets | Ticket | Implementado | Hacer obligatorios campos clave del diagnostico |
| CU07 | Cerrar instalacion y activar cliente | `PATCH /api/work-orders/:id/complete-installation` | Ordenes | OT de instalacion | Implementado | Probar flujo completo desde prospecto |
| CU10 | Calcular tiempo conversion | `PATCH /api/work-orders/:id/complete-installation` | Ordenes | Prospecto relacionado a cliente/OT | Implementado | Validar caso desde prospecto creado en UI |
| CU33 | Exportar reportes operativos | `GET /api/reports/export` | Reportes operativos | Datos segun reporte | Implementado con periodo, alcance y empresa | Ajustar columnas finales con el cliente/profesor |

## Siguiente foco recomendado

1. Crear administracion de planes, porque hoy los planes dependen de seed o carga directa.
2. Probar el flujo completo de prospecto a cliente activo con datos demo.
3. Mejorar busqueda/seleccion de cliente en tickets e inventario.
4. Agregar pruebas automatizadas para auth, prospectos, tickets e inventario.
