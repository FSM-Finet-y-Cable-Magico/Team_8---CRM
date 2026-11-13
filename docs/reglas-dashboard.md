# Reglas del dashboard

Todos los indicadores respetan la empresa seleccionada. Los usuarios sin acceso consolidado se limitan a su empresa. En consolidado un cliente se cuenta una sola vez, aunque tenga varios contratos o servicios.

| Indicador | Criterio |
| --- | --- |
| Clientes activos | Clientes distintos con al menos un servicio cuyo estado operativo sea `Activo`, dentro de la empresa consultada. El estado general del cliente es una dimensión diferente: un cliente moroso puede mantener el servicio activo. |
| Clientes registrados | Todas las personas del listado Clientes en esa vista, incluidos morosos, suspendidos y bajas. Incluye los históricos sin servicio. Se informa junto al contador de activos. |
| Prospectos activos | Prospectos sin cliente asociado, sin contrato firmado, activo, suspendido o moroso y no marcados como Perdido. Misma selección que el listado operativo de prospectos. Los perdidos siguen disponibles en su consulta separada. |
| Pendientes de activación / Instalaciones pendientes | Personas del listado Instalaciones en proceso: tienen contrato firmado de la misma empresa y no tienen servicios ya activos, suspendidos, morosos o de baja asociados a ese contrato. Un contrato sin servicio o con servicio Pendiente Instalacion / Instalacion Programada sigue pendiente. Se cuentan personas, no órdenes. |
| Órdenes de instalación pendientes | Órdenes técnicas locales de instalación no completadas, cerradas ni canceladas. Es una métrica distinta de las personas pendientes. El gráfico de órdenes representa órdenes, no personas. |
| Tickets abiertos | Todos los tickets excepto Resuelto y Cerrado, dentro de la empresa consultada. |
| Clientes morosos | En consolidado: estado general Moroso o Suspendido. Por empresa: contrato Moroso o Suspendido en esa empresa. No se infiere deuda a partir de un servicio activo. |
| Instalaciones del mes | Cierres técnicos confirmados, por su fecha efectiva en Santiago, con las reglas existentes de conciliación entre OT local y G3. |

La pantalla se actualiza después de cambios, cada 30 segundos mientras está visible y al volver a ella. Las respuestas antiguas no pueden reemplazar una carga más reciente ni los datos de otra empresa. Un resumen no disponible se presenta como `—`, en lugar de afirmar que existen cero registros.

Los listados de clientes, prospectos activos, instalaciones pendientes, tickets y órdenes no recortan silenciosamente los primeros 100 o 150 registros. Se conserva la paginación visual. La base local y la VPS son fuentes independientes; aplicar los cambios requiere desplegar esta versión en la VPS.
