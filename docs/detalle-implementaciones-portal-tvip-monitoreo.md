# Detalle de Implementaciones: Portal Cliente, TV IP, Monitoreo y Tickets

Proyecto: CRM FiNet / Cable Magico  
Etapa: Continuacion posterior al Incremento 2  
Fecha de documentacion: 2026-07-28

## Resumen Ejecutivo

En esta etapa se implementaron los casos de uso pendientes que no dependen de WhatsApp Business. El foco fue separar el Portal Cliente del login interno del CRM, permitir autoservicio basico del cliente, habilitar credenciales TV IP, agregar monitoreo tecnico basado en registros reales y permitir observaciones tecnicas en tickets sin cerrar el caso.

WhatsApp Business no fue implementado en esta etapa. Queda documentado como integracion pendiente hasta que FiNet/Cable Magico defina cuenta Meta Business, WABA ID, numero oficial, proveedor, tokens y webhook.

## Modulos Registrados

Los modulos nuevos quedaron registrados en:

```text
backend/src/app.module.ts
```

Modulos agregados:

```text
PortalModule
TvipModule
MonitoringModule
```

Motivo:

Se mantuvo la arquitectura modular de NestJS, evitando mezclar responsabilidades con `AuthModule`, `TicketsModule` o `ServicesModule`.

## Modelos Prisma Agregados

Archivo:

```text
backend/prisma/schema.prisma
```

Modelos agregados para tablas SQL existentes:

```text
SesionPortal
IntentoFallido
CredencialesTvip
Olt
TarjetaPon
Mufa
PuertoNap
MonitoreoOnt
HistorialConexionOnt
```

Motivo:

Las tablas ya existian en `db/init/01_schema.sql`, por lo que no se crearon migraciones nuevas. Solo se extendio Prisma para poder leer y escribir sobre la estructura existente.

## Permisos Agregados

Backend:

```text
backend/src/common/permissions.ts
```

Frontend:

```text
frontend/src/permissions.ts
```

Permisos:

```text
VIEW_PORTAL_ADMIN
MANAGE_TVIP
VIEW_MONITORING
REGISTER_TECHNICAL_NOTES
```

Roles definidos:

```text
MANAGE_TVIP: Administrador, Comercial, Soporte
VIEW_MONITORING: Administrador, Soporte, Terreno
REGISTER_TECHNICAL_NOTES: Administrador, Soporte, Terreno
```

Motivo:

El Portal Cliente no usa roles internos, porque corresponde a clientes externos. Las acciones internas de TV IP, monitoreo y observaciones tecnicas si requieren control de acceso por rol.

## CU-38: Autenticando Cliente En Portal Web Con RUT

### Donde esta implementado

Backend:

```text
backend/src/portal/portal.controller.ts
backend/src/portal/portal.service.ts
backend/src/portal/dto/portal-login.dto.ts
```

Frontend:

```text
frontend/src/App.tsx
```

Base de datos:

```text
sesion_portal
intento_fallido
cliente.password_portal_hash
```

### Endpoints

```text
POST /api/portal/login
GET  /api/portal/me
```

### Como funciona

1. El cliente ingresa RUT y contrasena en el Portal Cliente.
2. El backend valida el RUT usando la utilidad existente de RUT.
3. Busca el cliente por RUT.
4. Verifica `password_portal_hash`.
5. Registra una sesion en `sesion_portal`.
6. Registra intentos fallidos en `intento_fallido`.
7. Devuelve un token propio del portal.

### Por que se hizo asi

El cliente no debe iniciar sesion como empleado interno. Por eso no se reutilizo `AuthController`. El portal tiene autenticacion propia, lo que evita exponer permisos administrativos o informacion de otros clientes.

## CU-39: Visualizando Plan Contratado En Portal

### Donde esta implementado

Backend:

```text
backend/src/portal/portal.service.ts
```

Frontend:

```text
frontend/src/App.tsx
```

Modelos usados:

```text
cliente
contrato
plan
servicio_contratado
direccion_servicio
```

### Endpoints

```text
GET /api/portal/services
GET /api/portal/contracts
```

### Como funciona

El backend resuelve la sesion del portal y consulta solo datos asociados al `id_cliente` autenticado. El cliente puede ver:

```text
Servicios contratados
Contratos
Plan comercial
Estado operativo
Direccion asociada
```

### Por que se hizo asi

La regla principal es que un cliente solo pueda ver sus propios contratos y servicios. Por eso todas las consultas salen desde la sesion del portal y no desde parametros libres enviados por frontend.

## CU-40: Cambiando Contrasena Wi-Fi Desde Portal

### Donde esta implementado

Backend:

```text
backend/src/portal/portal.controller.ts
backend/src/portal/portal.service.ts
backend/src/portal/dto/wifi-change-request.dto.ts
```

Frontend:

```text
frontend/src/App.tsx
```

### Endpoint

```text
POST /api/portal/wifi-change-request
```

### Como funciona

1. El cliente selecciona uno de sus servicios.
2. Ingresa observaciones y opcionalmente una nueva clave sugerida.
3. El backend valida que el servicio pertenezca al cliente autenticado.
4. Se crea un ticket de soporte con origen `Portal`.
5. El sistema muestra el mensaje: `Solicitud registrada para revision tecnica`.

### Por que se hizo asi

No existe integracion real con router, Smart OLT o plataforma tecnica externa. Por eso el sistema no simula un cambio real de contrasena. La implementacion correcta para esta etapa es registrar una solicitud tecnica trazable.

## CU-41: Generando Ticket Desde Portal Del Cliente

### Donde esta implementado

Backend:

```text
backend/src/portal/portal.controller.ts
backend/src/portal/portal.service.ts
backend/src/portal/dto/create-portal-ticket.dto.ts
backend/src/tickets/tickets.service.ts
```

Frontend:

```text
frontend/src/App.tsx
```

### Endpoints

```text
GET  /api/portal/tickets
GET  /api/portal/ticket-categories
POST /api/portal/tickets
```

### Como funciona

El portal llama a `TicketsService.createForPortal`. Internamente se reutiliza la creacion comun de tickets para no duplicar reglas de negocio.

El ticket queda guardado con:

```text
id_cliente
id_servicio opcional
id_categoria
prioridad
descripcion
estado = Abierto
origen = Portal
codigo_seguimiento
```

### Por que se hizo asi

El ticket creado por el cliente debe verse tanto en el portal como en el CRM interno. Reutilizar `TicketsService` mantiene el flujo de soporte centralizado y evita divergencias entre portal y CRM.

## CU-42: Generando Credenciales De TV IP Automaticamente

### Donde esta implementado

Backend:

```text
backend/src/tvip/tvip.controller.ts
backend/src/tvip/tvip.service.ts
```

Portal:

```text
backend/src/portal/portal.service.ts
```

Frontend:

```text
frontend/src/App.tsx
```

Base de datos:

```text
credenciales_tvip
```

### Endpoints internos

```text
POST /api/tvip/contracts/:idContrato/generate
POST /api/tvip/contracts/:idContrato/regenerate
GET  /api/tvip/customer/:idCliente
```

### Endpoints portal

```text
GET  /api/portal/tvip
POST /api/portal/tvip/regenerate
```

### Como funciona

1. Se buscan contratos del cliente.
2. Se detecta si el plan incluye TV usando `nombre_comercial` y `tipo_plan`.
3. Se genera usuario TV IP unico.
4. Se genera contrasena temporal segura.
5. Se guarda solo el hash en `password_tvip_hash`.
6. La contrasena temporal se muestra solo una vez.

### Por que se hizo asi

La credencial TV IP es sensible. Por eso no se guarda la contrasena en texto plano ni se expone despues de generarla.

## CU-49: Consultando Estado De Conexion Del Cliente

### Donde esta implementado

Backend:

```text
backend/src/monitoring/monitoring.controller.ts
backend/src/monitoring/monitoring.service.ts
```

Frontend:

```text
frontend/src/App.tsx
```

Base de datos:

```text
monitoreo_ont
historial_conexion_ont
unidad_equipo
caja_nap
```

### Endpoints

```text
GET /api/monitoring/customers/:idCliente/status
GET /api/monitoring/services/:idServicio/status
GET /api/monitoring/equipment/:idUnidad/status
GET /api/monitoring/customers/:idCliente/history
```

### Como funciona

El sistema consulta la ultima medicion registrada en `monitoreo_ont`. Si existe dato reciente, muestra:

```text
estado_conexion
potencia_actual_dbm
timestamp_medicion
equipo asociado
caja NAP
historial de eventos
```

Si no existe dato reciente, muestra:

```text
Sin dato reciente
```

### Por que se hizo asi

No se inventa estado online. El sistema solo muestra lo que existe en la base de datos.

## CU-51: Monitoreando Latencia Del Cliente En Tiempo Real

### Donde esta implementado

Backend:

```text
backend/src/monitoring/monitoring.service.ts
```

Frontend:

```text
frontend/src/App.tsx
```

### Como funciona

Actualmente se muestra el estado tecnico real disponible en la base. La latencia aparece como:

```text
No disponible
```

### Por que se hizo asi

La tabla actual no contiene una columna de latencia ni existe integracion real con Smart OLT. Simular latencia seria incorrecto para el caso de uso. La estructura queda preparada para una integracion futura.

## CU-52: Registrando Observaciones Tecnicas En Ticket

### Donde esta implementado

Backend:

```text
backend/src/tickets/tickets.controller.ts
backend/src/tickets/tickets.service.ts
backend/src/tickets/dto/technical-note.dto.ts
```

Frontend:

```text
frontend/src/App.tsx
```

### Endpoints

```text
GET  /api/tickets/:id/technical-notes
POST /api/tickets/:id/technical-notes
```

### Como funciona

La observacion tecnica se agrega al ticket como un bloque fechado:

```text
[Observacion tecnica - fecha - Usuario]
Texto de la observacion
```

No cambia el estado del ticket.

### Por que se hizo asi

Antes el diagnostico tecnico resolvia el ticket. Este caso de uso necesitaba registrar observaciones durante la atencion sin cerrar ni resolver el ticket.

## Frontend Implementado

Archivo principal:

```text
frontend/src/App.tsx
```

Se agrego:

```text
CustomerPortal
Vista de login portal
Vista de servicios y contratos
Vista de tickets del cliente
Formulario de creacion de ticket
Formulario de solicitud cambio Wi-Fi
Panel TV IP
Panel de monitoreo dentro del modal de cliente
Panel de monitoreo dentro del perfil de servicio
Seccion Observaciones tecnicas dentro del modal de ticket
```

Tambien se corrigio el interceptor de API:

```text
frontend/src/api.ts
```

Motivo:

El interceptor antes podia reemplazar el token del portal con el token interno del CRM si ambos existian en `localStorage`. Ahora respeta un `Authorization` ya definido.

## Seed Local Agregado

Archivo:

```text
db/init/07_seed_portal_monitoring_tvip.sql
```

Datos demo:

```text
Cliente portal demo
Plan Internet + TV
Contrato activo
Servicio contratado
Equipo ONT
Caja NAP
Medicion monitoreo ONT
Historial conexion ONT
```

Acceso portal demo:

```text
RUT: 18765432-7
Contrasena: portal123
```

## Correccion Aplicada A La Base Local Docker

Problema detectado:

La base local estaba usando un volumen antiguo. El backend si conectaba a PostgreSQL, pero Prisma esperaba columnas/tablas que no existian en ese volumen.

Errores observados:

```text
cliente.origen_contacto does not exist
ticket.id_servicio does not exist
orden_trabajo.id_servicio does not exist
servicio_contratado does not exist
```

Solucion aplicada:

```text
db/init/02_local_adjustments.sql
db/init/06_seed_incremento2.sql
db/init/07_seed_portal_monitoring_tvip.sql
```

Se aplicaron manualmente dentro del contenedor sin borrar datos.

## Comandos Para Levantar Local

Desde:

```powershell
cd "C:\Users\Manguera\CRM Finet proyect\Team_8---CRM"
```

Levantar:

```powershell
npm run docker:local
```

Detener:

```powershell
npm run docker:local:down
```

Ver contenedores:

```powershell
docker compose ps
```

Ver logs backend:

```powershell
docker compose logs -f backend
```

## Validaciones Realizadas

Se valido:

```text
API responde en http://localhost:3000/api
Frontend responde en http://localhost:5173
Dashboard carga metricas reales
Portal login funciona con RUT 18765432-7 / portal123
Portal carga servicio, contrato y plan TV
Portal detecta contrato elegible para TV IP
Logs recientes sin errores Prisma P2021/P2022
```

## Pendiente Real

WhatsApp Business queda pendiente hasta definicion formal con FiNet/Cable Magico.

Datos necesarios para avanzar:

```text
Cuenta Meta Business
WhatsApp Business Account
Numero telefonico oficial
Proveedor/API
WABA ID
Phone Number ID
Access Token
Webhook publico HTTPS
Verify Token
App Secret
Plantillas aprobadas por Meta
```

No se implemento modulo, pantalla, adapter ni envio mock de WhatsApp en esta etapa.

