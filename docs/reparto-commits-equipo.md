# Reparto sugerido para commits del equipo

Objetivo: mantener el avance completo de 28 casos de uso y permitir que cada integrante pueda subir una parte clara del codigo sin tocar la base de datos compartida.

## Bloque A - Clientes e historial

Casos cubiertos:

- CU08 Actualizar estado operativo del cliente.
- CU14 Consultar historial completo del cliente.

Archivos principales:

- `backend/src/customers/`
- `backend/src/app.module.ts`
- `frontend/src/App.tsx` seccion `CustomersPanel`.
- `frontend/src/api.ts` tipo `Customer`.

Explicacion corta:

Se agrega un modulo NestJS para listar clientes, cambiar su estado y consultar historial consolidado. El historial se arma con tablas existentes: contratos, facturas, pagos, tickets, ordenes, equipos y auditoria.

## Bloque B - Inventario y equipos

Casos cubiertos:

- CU53 Registrar movimientos de inventario.
- CU54 Actualizar estado logico de equipo.
- CU62 Visualizar inventario por empresa.
- CU20 Instalar router/ONU.
- CU59 Asociar serie, MAC y puerto OLT al cliente.

Archivos principales:

- `backend/src/inventory/`
- `backend/prisma/schema.prisma` modelos de inventario ya existentes en SQL.
- `frontend/src/App.tsx` seccion `InventoryPanel`.
- `frontend/src/api.ts` tipo `InventoryUnit`.

Explicacion corta:

Se implementa inventario usando `unidad_equipo`, `tipo_equipo`, `movimiento_inventario` e `historial_estado_equipo`. No se agregan columnas: la serie se usa desde `numero_serie`, y MAC/OLT se registran como nota tecnica en `diagnostico_tecnico`.

## Bloque C - Tickets y diagnostico tecnico

Casos cubiertos:

- CU23 Registrar ticket de soporte.
- CU24 Clasificar ticket por categoria.
- CU25 Asignar prioridad de atencion.
- CU26 Actualizar estado del ticket.
- CU21 Registrar diagnostico tecnico post-visita.

Archivos principales:

- `backend/src/tickets/`
- `backend/prisma/schema.prisma` modelos `Ticket` y `CategoriaFalla`.
- `frontend/src/App.tsx` seccion `TicketsPanel`.
- `frontend/src/api.ts` tipos `Ticket` y `TicketCategory`.

Explicacion corta:

Se crea el flujo de soporte: alta de ticket por RUT, clasificacion, prioridad, avance de estado y diagnostico final. El diagnostico queda en la descripcion del ticket y, si existe una OT asociada, tambien cierra la orden con historial.

## Bloque D - Ordenes y reportes

Casos cubiertos:

- CU07 Cerrar instalacion y activar cliente.
- CU10 Calcular tiempo de conversion de prospecto.
- CU33 Exportar reportes operativos.

Archivos principales:

- `backend/src/work-orders/`
- `backend/src/reports/`
- `backend/prisma/schema.prisma` modelos `HistorialOt`, `Factura`, `Pago` y relaciones necesarias.
- `frontend/src/App.tsx` secciones `WorkOrdersPanel` y `ReportsPanel`.
- `frontend/src/api.ts` tipo `WorkOrder`.

Explicacion corta:

El cierre de instalacion completa la OT, activa cliente/contrato y calcula el tiempo de conversion del prospecto. Reportes genera CSV o XLSX de clientes, prospectos, tickets e inventario, dejando auditoria de exportacion.

## Bloque E - Preparacion de demo y validaciones de formularios

Casos apoyados:

- CU01 Registrar nuevo prospecto comercial.
- CU03 Generar cotizacion en PDF.
- CU12 Registrar plan contratado.
- CU17 Generar orden de instalacion.
- CU23 Registrar ticket de soporte.
- CU53 Registrar movimientos de inventario.
- CU59 Asociar serie, MAC y puerto OLT al cliente.

Archivos principales:

- `frontend/src/App.tsx` formularios de prospectos, inventario y tickets.
- `db/demo_seed.sql` datos locales para probar planes, clientes, prospectos, equipos, tickets y ordenes.
- `docs/puesta-en-marcha-docker.md` guia reproducible para levantar el entorno.
- `docs/estado-primer-incremento.md` matriz de avance por caso de uso.
- `docs/desarrollo-paso-a-paso.md` referencia a Docker, seed demo y estado del incremento.

Explicacion corta:

Se agregan ayudas de formato y validaciones livianas en formularios criticos para evitar errores antes de llamar al backend. Tambien se separa una semilla demo manual que no modifica `db/init` ni Railway, permitiendo probar flujos end-to-end sin depender de datos compartidos.

## Validacion antes de subir

Ejecutar:

```powershell
npm run prisma:generate
npm run build -w backend
npm run build -w frontend
git diff -- db/init/01_schema.sql db/init/02_local_adjustments.sql db/init/03_seed.sql
```

El ultimo comando debe quedar sin salida. Eso confirma que no se modificaron los scripts SQL compartidos.

Para validar la demo local:

```powershell
docker compose up -d
Get-Content db\demo_seed.sql | docker exec -i finet-crm-db psql -U postgres -d fsm_db -v ON_ERROR_STOP=1
docker compose exec -T frontend npm run build
```
