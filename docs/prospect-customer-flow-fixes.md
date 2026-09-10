# Correccion de consistencia Prospectos, Clientes y Dashboard

## Objetivo

Esta correccion alinea la definicion de prospecto activo usada por Dashboard y por el modulo Prospectos, simplifica la confirmacion manual de contratacion y mantiene la conversion hacia Cliente pendiente firma contrato sin crear servicios ni ordenes de trabajo.

## Definiciones de negocio aplicadas

### Prospecto activo

Un prospecto activo cumple todas estas condiciones dentro del scope de empresa seleccionado:

- no tiene `idCliente` asociado;
- su `estadoPipeline` no es `Perdido`;
- permanece en el flujo comercial previo a la confirmacion de contratacion.

Por tanto, los estados Factible, En Factibilidad, Cotizacion Enviada y Cotizacion aceptada siguen contando como prospectos activos. Los prospectos perdidos y los convertidos a cliente no cuentan ni se muestran en el listado activo.

### Cliente activo

La tarjeta Dashboard `Clientes activos` cuenta solo clientes con estado `Activo`, dentro del scope de empresa. Los clientes `Pendiente firma contrato` aparecen en Clientes, pero no incrementan esta tarjeta.

## Correccion de metricas

- `GET /api/companies/summary` reutiliza el mismo filtro de prospecto activo que `GET /api/prospects`.
- El grafico de origen de captacion usa la misma poblacion activa de prospectos.
- La cuenta de clientes de Dashboard queda limitada a estado `Activo`.
- Los fallbacks de Dashboard no vuelven a contar arreglos cargados en frontend con una regla distinta; el backend es la fuente de verdad.

## Confirmacion manual de contratacion

El bloque visible en Gestionar prospecto se llama `Confirmar contratacion`. Su objetivo es registrar que la cotizacion fue aceptada, no simular una integracion de contratos.

Datos solicitados en esta etapa:

- plan aceptado, obligatorio;
- fecha de confirmacion, con la fecha actual por defecto;
- observacion, opcional.

Al confirmar:

1. se conserva la cotizacion factible asociada al plan;
2. se crea o reutiliza el cliente;
3. se crea o actualiza un contrato en estado `Pendiente firma contrato`;
4. se vincula el prospecto al cliente y deja de aparecer en Prospectos activos;
5. se conserva la direccion del prospecto como direccion principal del cliente cuando corresponde;
6. no se crea servicio;
7. no se crea orden de trabajo;
8. no se activa cliente, contrato o servicio.

Los campos externos de Facturacion.cl (proveedor, numero, folio, URL y fechas externas) se mantienen opcionales en el modelo y DTO para una integracion futura. La ausencia de esos datos no bloquea la confirmacion manual ni se presenta como una integracion activa.

La accion queda auditada como `CONFIRMAR_CONTRATACION_MANUAL`.

## Perdida de prospecto

La accion `Marcar como perdido` es secundaria y usa semantica visual de peligro. El pop-up contextual solo solicita:

- Motivo.
- Observacion.

La observacion es obligatoria. Al confirmar, se guarda el motivo y la observacion, se actualiza el listado y se cierran tanto el pop-up como el modal de gestion. Al cancelar, solo se cierra el pop-up.

## Archivos y endpoints revisados

- `backend/src/common/customer-lifecycle.ts`
- `backend/src/companies/companies.service.ts`
- `backend/src/customers/customers.service.ts`
- `backend/src/prospects/prospects.service.ts`
- `backend/src/prospects/dto/contract-plan.dto.ts`
- `frontend/src/features/dashboard/DashboardHome.tsx`
- `frontend/src/features/prospects/ProspectWorkflowPanel.tsx`
- `frontend/src/features/customers/CustomersPanel.tsx`
- `frontend/src/api.ts`
- `frontend/src/styles.css`

Endpoints cubiertos por la correccion:

- `GET /api/companies/summary`
- `GET /api/prospects`
- `POST /api/prospects/:id/contracts`
- `POST /api/prospects/:id/loss`
- `GET /api/customers`

## Fuera de alcance

- Firma de contrato desde Clientes.
- Creacion de servicios para clientes pendientes de firma.
- Generacion de OT o instalacion desde Prospectos.
- Integracion API con Facturacion.cl.
- Emision de PDF propio de contrato.
- WhatsApp API y Fase Comercial 2.

La siguiente fase debe continuar desde Cliente pendiente firma contrato hacia firma corroborada, creacion de servicio pendiente de instalacion y agendamiento de OT, manteniendo esas acciones fuera del flujo de Prospectos.

## Pruebas cubiertas

Las pruebas de `ProspectsService` cubren la conversion manual sin campos externos obligatorios, conservacion de la direccion, ausencia de servicio/OT y registro de perdida con motivo y observacion. Las pruebas de `CompaniesService` validan que el resumen use el mismo filtro de prospecto activo que el listado y que la metrica de clientes activos sea exclusiva para estado `Activo`.

Las pruebas manuales de navegador siguen pendientes de ejecutar en un navegador disponible: verificar conteos Dashboard contra Prospectos, convertir un prospecto, validar direccion en Clientes y comprobar el pop-up compacto de perdida.
## Catalogo de planes para cotizaciones

### Problema y causa

El selector `Plan a cotizar` recibia el mismo arreglo cargado desde `GET /api/plans` que el panel Planes comerciales, pero `ProspectWorkflowPanel` aplicaba un filtro adicional por `idEmpresa` del prospecto. Por eso el catalogo consolidado podia mostrar planes activos de FiNet y Cable Magico Litoral mientras la cotizacion mostraba solo el subconjunto de la empresa del prospecto.

### Regla aplicada

Planes comerciales es la fuente de verdad para los planes disponibles en nuevas cotizaciones. El selector usa el catalogo existente de `GET /api/plans`, filtra solo planes inactivos y muestra cada opcion con su empresa. No usa listas hardcodeadas, nombres como identificador ni un catalogo paralelo: la cotizacion envia el `idPlan` real.

Para esta etapa, un prospecto puede cotizar y confirmar contratacion con cualquier plan activo entregado por el catalogo disponible en el scope actual. La empresa del prospecto no cambia automaticamente. Esta es una regla temporal; la validacion definitiva de compatibilidad empresa-plan queda pendiente de definicion administrativa.

Los planes inactivos se mantienen en historicos, pero no se ofrecen para cotizaciones o contrataciones nuevas. `PlansPanel` dispara la recarga global al crear, editar o cambiar el estado de un plan, por lo que al navegar a Prospectos se utiliza el catalogo actualizado sin reiniciar servicios.

Se revisaron otros selectores: Confirmar contratacion comparte el catalogo activo para preservar el mismo `idPlan` de la cotizacion. Los selectores de Clientes, Portal y otros modulos no se reestructuraron en esta correccion y deben revisarse en una fase posterior si se detecta una fuente distinta.
