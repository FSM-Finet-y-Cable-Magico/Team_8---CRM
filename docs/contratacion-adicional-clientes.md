# Añadir un plan a un cliente existente

El formulario de Clientes reutiliza `CoveragePicker`, el dominio de cobertura, las cotizaciones PDF y el circuito de firma existente.

1. Elegir la empresa cuando el catálogo contiene varias.
2. Seleccionar una dirección registrada o ingresar una nueva con comuna. La región ayuda a ubicarla automáticamente; también se puede marcar el punto manualmente.
3. Consultar la factibilidad automáticamente y seleccionar uno de los planes disponibles en esa ubicación.
4. Generar una o varias cotizaciones; cada una intenta enviar el PDF al correo del cliente y abre el documento. Un aviso de tres segundos indica Cotización enviada si el correo confirmó el envío, Cotización generada si no hay envío real, o el error correspondiente.
5. Consultar el historial en Documentos, con el mismo diseño de prospectos. En Datos de contratación solo se ofrecen los planes cotizados, vigentes y disponibles para esa dirección. También se puede pulsar una cotización histórica para recuperar su dirección y revalidar su cobertura antes de contratar.
6. El servidor vuelve a validar cliente, empresa, plan, ubicación y deuda; genera el PDF y ejecuta el envío automático a firma después de confirmar la transacción.
7. La instalación y la activación siguen requiriendo firma y cierre técnico por el circuito vigente de G3.

## Persistencia y referencias

`POST /api/prospects/customer-quotes` crea un antecedente comercial vinculado explícitamente al cliente (`prospecto.idCliente`), clasificado como CLIENTE y con origen Plan adicional. Conserva la ubicación particular de la cotización; no modifica el domicilio principal ni crea otro cliente. Este antecedente no aparece entre los prospectos activos porque ya tiene cliente asociado.

`GET /api/prospects/customer-quotes?idCliente=N&idEmpresa=N` recupera el historial persistente, autorizado por cliente y empresa, e informa qué cotizaciones ya tienen un contrato vigente. El historial se conserva al cerrar la ficha o cambiar de dirección.

Se utiliza `cotizacion.idProspecto` para mantener las referencias existentes del PDF y la instalación. `POST /api/contracts` requiere `idCotizacion` para una contratación adicional. Guarda cliente, antecedente comercial, plan, dirección y comuna en el contrato; la zona para precios se calcula por cobertura y no se elige en el formulario.

La misma cotización y antecedente reutilizan un contrato vigente existente al repetir la confirmación. Otra ubicación requiere otra cotización. Los contratos y servicios previos no se reescriben. El nuevo servicio se activa únicamente mediante el cierre técnico existente.

Los documentos del contrato recuperan sus cotizaciones por las referencias anteriores. Se conserva la forma de comunicación y los endpoints existentes de G1/G3; no hay migración de esquema.

La ficha muestra el precio aplicable de la zona del contrato cuando existe una regla de precio, en lugar de sustituirlo por el precio base del catálogo. Tras recibirse la firma se refresca la ficha y la contratación sin servicio activo se presenta como Pendiente de instalación. No se activa un servicio por generar una cotización, contratar ni firmar.

## Verificación

- Pruebas de formulario: factibilidad, selección explícita de cotización, nueva dirección, invalidación por cambio de ubicación y bloqueo de doble clic.
- Pruebas de servidor: identidad, empresa, cobertura actual, zona calculada, datos cambiados, deuda e idempotencia.
- `customer-plan-acquisition.postgres.spec.ts`, optativa con `CRM_INTEGRATION_TESTS=1`: flujo real de cotización, PDF, documentos y requisitos de G3. Revierte sus registros, elimina únicamente su PDF temporal y simula el envío de correo.
