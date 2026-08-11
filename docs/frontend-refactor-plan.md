# Plan de refactor frontend CRM FiNet / Cable Magico

## 1. Diagnostico actual

El frontend actual esta concentrado casi por completo en `frontend/src/App.tsx`, archivo que hoy tiene aproximadamente 6.083 lineas. En ese archivo conviven:

- Enrutamiento manual entre login interno, CRM interno y Portal Cliente.
- Layout del CRM interno: sidebar, topbar, selector de empresa, perfil de usuario y contenido.
- Paneles funcionales completos: Dashboard, Prospectos, Instalaciones, Clientes, Inventario, Planes, Cobranza, Tickets, Ordenes de Trabajo, Reportes, Importacion, Usuarios y Auditoria.
- Modales reutilizables y modales especificos de gestion.
- Utilidades de formato, normalizacion, validacion y transformacion de datos.
- Estado global del CRM interno y estado local de cada panel.
- Consumo directo de API en varios niveles.

Archivos revisados en esta fase:

- `frontend/src/App.tsx`
- `frontend/src/api.ts`
- `frontend/src/permissions.ts`
- `frontend/src/styles.css`
- `frontend/src/main.tsx`
- `docker-compose.yml`
- `package.json`

La aplicacion levanta mediante `npm run docker:local`, usando:

- `finet-crm-db` en PostgreSQL 15, puerto `5432`.
- `finet-crm-backend`, puerto `3000`.
- `finet-crm-frontend`, puerto `5173`.

## 2. Problema detectado con App.tsx

`App.tsx` funciona, pero cumple demasiadas responsabilidades a la vez. El riesgo principal no es visual sino estructural: cualquier cambio pequeño en una vista obliga a tocar un archivo enorme donde tambien viven el portal, el login, el layout, los paneles, los modales y utilidades compartidas.

Problemas principales:

- Alta dificultad para revisar cambios en pull requests.
- Alto riesgo de conflictos al trabajar en equipo.
- Dificultad para separar Portal Cliente como app independiente.
- Reutilizacion limitada de componentes UI.
- Estado global y llamadas API mezcladas con JSX de paneles.
- Estilos globales en `styles.css` asociados a componentes que aun no existen como archivos independientes.
- No existe una frontera clara entre CRM interno y Portal Cliente.

## 3. Componentes encontrados dentro de App.tsx

Componentes de entrada y autenticacion:

- `App`
- `LoginScreen`
- `CustomerPortal`
- `Dashboard`

Layout y navegacion:

- `Sidebar`
- `DashboardHome`
- `DashboardStatCard`
- `StatCard`
- `QuickActionCard`
- `StatusBadge`
- `Modal`

Alertas y dashboard:

- `ExpiryBadge`
- `ExpiryCustomerCard`

Prospectos e instalaciones:

- `ProspectsPanel`
- `ProspectWorkflowPanel`
- `InstallationsPanel`
- `InstallOrderForm`

Clientes, servicios y observaciones:

- `CustomersPanel`
- `ObservationsModal`
- `MonitoringStatusView`
- `HistoryBox`

Planes y cobranza:

- `PlansPanel`
- `BillingPanel`

Inventario:

- `InventoryAdvancedPanel`
- `InventoryPanel`

Soporte y operaciones:

- `TicketsPanel`
- `WorkOrdersPanel`

Administracion y reportes:

- `ReportsPanel`
- `ImportPanel`
- `UsersPanel`
- `AuditPanel`

## 4. Utilidades encontradas dentro de App.tsx

Constantes y patrones:

- `rutPattern`
- `emailPattern`
- `chileanMobilePattern`
- `macPattern`
- `reportMinimumDate`
- `serviceTypeOptions`
- `serviceStatusOptions`
- `captureOriginOptions`
- `equipmentModeOptions`

Utilidades de formato y fecha:

- `normalizeRutInput`
- `dateInputValue`
- `addYearsToInputDate`
- `parseDateValue`
- `formatDateOnly`
- `formatDateTime`
- `formatConnectionType`
- `normalizeWorkOrderValue`
- `formatWorkOrderValue`

Utilidades de datos y validacion:

- `technicalEntries`
- `normalizeAuthUser`
- `settledData`
- `validateProspectForm`
- `emptyServiceForm`

Utilidades de alertas:

- `expiryAlertKey`
- `expiryUrgency`
- `expiryLabel`

Estas utilidades son candidatas naturales para una primera extraccion porque no deberian depender del arbol visual.

## 5. Estado global detectado

Estado raiz en `App`:

- `user`: sesion interna del CRM.
- `portalMode`: determina si se renderiza Portal Cliente o CRM interno.

Estado principal en `Dashboard`:

- `activeTab`: vista activa del CRM.
- `scope`: selector de empresa o consolidado.
- `settingsOpen`: apertura del modal/perfil de usuario.
- `focusedInstallationProspectId`: foco para instalacion desde acciones rapidas.
- `companies`
- `summary`
- `prospects`
- `plans`
- `customers`
- `inventory`
- `advancedInventory`
- `billingOverview`
- `tickets`
- `ticketCategories`
- `workOrders`
- `users`
- `roles`
- `audit`
- `message`

Valores derivados importantes:

- `permissions`
- `canViewInventory`
- `canViewBilling`
- `canViewTickets`
- `canViewWorkOrders`
- `canManageCustomers`
- `canViewInstallations`
- `writeCompanyId`
- `currentCompanyName`
- `mainItems`
- `secondaryItems`

Funcion global clave:

- `loadData`: carga resumen, prospectos, planes, clientes, inventario, cobranza, tickets, OT, usuarios, roles y auditoria segun permisos y `scope`.

## 6. Dependencias principales entre componentes

Dependencias globales:

- `Sidebar` depende de `activeTab`, `mainItems`, `secondaryItems` y `setActiveTab`.
- `DashboardHome` depende de `summary`, datos precargados, permisos y navegacion por `setActiveTab`.
- La mayoria de paneles dependen indirectamente de `loadData` mediante callbacks `onChanged`, `onCreated`, `onUpdated` u `onImported`.
- `CustomersPanel` depende de `customers`, `plans`, `scope`, `permissions` y recarga datos globales despues de mutaciones.
- `BillingPanel` depende de `billingOverview`, `plans`, `scope`, `writeCompanyId`, `permissions` y recarga global.
- `PlansPanel` depende de `plans`, `companies`, `writeCompanyId` y recarga global.
- `ReportsPanel` depende de `companies` e `initialScope`.
- `ImportPanel` depende de `writeCompanyId` y `onImported`.
- `UsersPanel` depende de `users`, `roles` y `onUpdated`.

Dependencias de Portal Cliente:

- `CustomerPortal` usa `api.ts`, tipos compartidos (`PortalCustomer`, `CustomerService`, `Ticket`, `Plan`, `TvipCredentialSummary`) y `localStorage`.
- El portal no usa `Dashboard`, pero vive en el mismo `App.tsx` y comparte estilos globales.

Dependencias de Login interno:

- `LoginScreen` usa `/auth/login`, `normalizeAuthUser` y abre el portal mediante `onOpenPortal`.
- El login interno no deberia depender de componentes del dashboard.

## 7. Riesgos tecnicos

- Romper recargas globales si se extrae `loadData` sin definir contratos claros de props.
- Duplicar tipos si se separa Portal Cliente antes de estabilizar `api.ts`.
- Perder estilos por mover componentes sin conservar classNames.
- Introducir cambios visuales involuntarios al dividir CSS.
- Romper permisos si se separan paneles sin mantener `DashboardPermissions`.
- Mezclar responsabilidades si se crea estructura por carpetas pero se mantiene logica global sin criterio.
- Generar conflictos de importacion circular entre features y componentes compartidos.
- Romper Docker/HMR si se agregan nuevos entrypoints antes de separar correctamente el portal.
- Sobrerrefactorizar: mover demasiadas piezas en un solo commit haria dificil detectar regresiones.
- CustomersPanel fue extraído estructuralmente sin rediseño. Queda pendiente una fase UX/funcional posterior para transformar Gestionar cliente en un flujo secuencial coherente con Gestionar prospecto. El flujo futuro debe permitir: Cliente → Servicio → Orden de instalación → OT → Cierre técnico, mostrando acciones según estado y evitando botones sin destino funcional.


## 8. Estructura objetivo para frontend/

Estructura objetivo sugerida para el CRM interno:

```text
frontend/
  src/
    app/
      App.tsx
      InternalCrmApp.tsx
      routes.ts
    api/
      client.ts
      types.ts
      errors.ts
    constants/
      validation.ts
      catalogs.ts
      tabs.ts
    lib/
      dates.ts
      formatting.ts
      rut.ts
      auth.ts
      settled-data.ts
    permissions/
      index.ts
    components/
      layout/
        Sidebar.tsx
        Topbar.tsx
        ContentShell.tsx
      ui/
        Modal.tsx
        StatusBadge.tsx
        StatCard.tsx
        QuickActionCard.tsx
        HistoryBox.tsx
    features/
      dashboard/
        DashboardHome.tsx
        ExpiryAlerts.tsx
      prospects/
        ProspectsPanel.tsx
        ProspectWorkflowPanel.tsx
      installations/
        InstallationsPanel.tsx
        InstallOrderForm.tsx
      customers/
        CustomersPanel.tsx
        CustomerModal.tsx
        ServiceProfile.tsx
      observations/
        ObservationsModal.tsx
      plans/
        PlansPanel.tsx
      billing/
        BillingPanel.tsx
      inventory/
        InventoryPanel.tsx
        InventoryAdvancedPanel.tsx
      tickets/
        TicketsPanel.tsx
      work-orders/
        WorkOrdersPanel.tsx
      reports/
        ReportsPanel.tsx
      imports/
        ImportPanel.tsx
      users/
        UsersPanel.tsx
      audit/
        AuditPanel.tsx
    styles.css
    main.tsx
```

En esta etapa no se recomienda dividir `styles.css`. Primero hay que estabilizar componentes y conservar exactamente las classNames actuales.

## 9. Estructura futura para portal/

Cuando el Portal Cliente se separe, la estructura sugerida es:

```text
portal/
  package.json
  index.html
  vite.config.ts
  tsconfig.json
  src/
    main.tsx
    App.tsx
    api/
      client.ts
      types.ts
    auth/
      PortalLogin.tsx
      portalSession.ts
    features/
      home/
        PortalHome.tsx
      services/
        PortalServices.tsx
      tickets/
        PortalTickets.tsx
        CreatePortalTicket.tsx
      tvip/
        PortalTvip.tsx
      wifi/
        WifiChangeRequest.tsx
    components/
      PortalLayout.tsx
      PortalCard.tsx
    styles.css
```

Separacion futura esperada:

- El CRM interno queda en `frontend/`.
- El portal queda en `portal/`.
- Ambos consumen el mismo backend.
- No se comparten estados de React.
- Se puede mantener un paquete comun solo si mas adelante el equipo decide crear `packages/shared`, pero no es necesario para esta etapa.

## 10. Fases propuestas

### Fase 1: extraer utilidades

Mover constantes y funciones puras desde `App.tsx` hacia `src/lib/` y `src/constants/`.

Orden sugerido:

1. Fechas y formateadores.
2. Normalizacion de RUT y autenticacion.
3. Validaciones.
4. Catalogos de opciones.

Validacion:

- El build debe pasar.
- No debe cambiar ningun JSX.
- No debe cambiar ningun className.

### Fase 2: extraer componentes compartidos

Mover componentes UI reutilizables:

- `Modal`
- `StatusBadge`
- `StatCard`
- `DashboardStatCard`
- `QuickActionCard`
- `HistoryBox`

Validacion:

- Misma estructura visual.
- Mismos nombres de clases.
- Imports sin ciclos.

### Fase 3: separar login interno

Crear `features/auth/LoginScreen.tsx` o `app/LoginScreen.tsx`.

Validacion:

- Login interno sigue funcionando.
- El acceso al Portal Cliente desde login sigue funcionando.
- `localStorage` de usuario interno no cambia.

### Fase 4: separar layout CRM

Extraer:

- `Sidebar`
- `Topbar`
- `ContentShell`
- Configuracion de navegacion.

Validacion:

- `activeTab` mantiene comportamiento.
- Permisos siguen ocultando/mostrando vistas.
- Selector consolidado/empresa sigue funcionando.

### Fase 5: separar paneles por features

Orden recomendado de extraccion:

1. `AuditPanel`
2. `ImportPanel`
3. `ReportsPanel`
4. `UsersPanel`
5. `PlansPanel`
6. `BillingPanel`
7. `WorkOrdersPanel`
8. `TicketsPanel`
9. `InventoryPanel` e `InventoryAdvancedPanel`
10. `InstallationsPanel` e `InstallOrderForm`
11. `ProspectsPanel` y `ProspectWorkflowPanel`
12. `CustomersPanel`

Motivo: partir por paneles con menor acoplamiento y dejar Clientes/Prospectos para el final, porque concentran mas modales, API y estados derivados.

Validacion:

- Cada panel debe compilar despues de extraerse.
- Cada commit debe mover pocos componentes.
- No cambiar comportamiento ni estilos.

### Fase 6: crear app independiente Portal Cliente

Crear carpeta `portal/` con Vite/React, aun sin cambiar backend.

Validacion:

- CRM interno sigue funcionando en `frontend/`.
- Portal puede levantar separado en otro puerto local.
- No se modifica la API backend.

### Fase 7: desacoplar portal del CRM interno

Mover `CustomerPortal` y sus tipos/servicios al nuevo proyecto `portal/`.

Validacion:

- Login portal funciona separado.
- Cliente ve sus servicios, contratos, tickets, TV IP y solicitud Wi-Fi.
- CRM interno ya no contiene codigo visual del portal.

### Fase 8: limpieza final y documentacion

Revisar imports, nombres, carpetas, README y documentacion de ejecucion.

Validacion:

- Build y lint limpios.
- Docker local documentado.
- Equipo entiende donde vive cada feature.

## 11. Criterios de validacion por fase

Criterios comunes:

- No modificar backend.
- No modificar Prisma.
- No modificar Docker.
- No cambiar endpoints.
- No cambiar estilos visuales.
- No cambiar classNames sin justificacion.
- No cambiar permisos ni roles.
- No ejecutar `npm audit fix`.

Comprobaciones por fase:

- `npm run build`
- `npm run lint`
- `npm run docker:local`
- `docker compose ps`
- Prueba visual manual en `http://localhost:5173/`

## 12. Comandos de prueba

Comandos recomendados:

```powershell
npm run build
npm run lint
npm run docker:local
docker compose ps
```

Comandos que no deben ejecutarse en esta etapa:

```powershell
npm audit fix
npm audit fix --force
```

## 13. Plan de commits

Commit de esta fase:

```text
chore(frontend): documenta plan de refactor CRM y portal
```

Plan sugerido posterior:

```text
refactor(frontend): extrae utilidades de formato y validacion
refactor(frontend): extrae componentes UI compartidos
refactor(frontend): separa login interno del App principal
refactor(frontend): separa layout principal del CRM
refactor(frontend): extrae paneles administrativos simples
refactor(frontend): extrae paneles operativos del CRM
refactor(frontend): extrae gestion de clientes y servicios
chore(portal): crea estructura base para portal cliente
refactor(portal): mueve portal cliente a app independiente
docs(frontend): actualiza guia de estructura modular
```

## 14. Recomendacion final

La Fase 1 debe limitarse a utilidades puras. No conviene empezar por `CustomersPanel`, `ProspectWorkflowPanel` ni `CustomerPortal`, porque son bloques con alto acoplamiento de API, estado y modales. La extraccion debe avanzar desde piezas sin estado hacia componentes con mayor dependencia.
