# Validación de la integración — 11 de noviembre de 2026

Rama revisada: `feat/ux-ui-libro-control`, sobre el merge `54101aa` del PR #79.
Las correcciones de esta revisión están en el directorio de trabajo local.

## Errores encontrados y corregidos

| Área | Fallo | Corrección |
| --- | --- | --- |
| Firma de contratos | Se utilizaba `error` sin obtenerlo del hook. La combinación de condiciones podía ocultar una descarga firmada histórica. | Se conserva la recuperación ante errores, la descarga histórica y la presentación compacta de Prospectos. |
| Tickets | La interfaz utilizaba `catalog` sin construirlo. El merge mezcló el catálogo nuevo con el código anterior. | Se utiliza la validación común del catálogo y se conserva la apertura del ticket seleccionado desde el dashboard. Los detalles administrativos se limitan al permiso correspondiente. |
| Baja y retiro | Faltaban el bloqueo de doble envío y la fecha solicitada. El formulario y sus permisos no correspondían al nuevo flujo de retiro. | El servicio suspendido solicita retiro por morosidad con fecha y observaciones. Una baja administrativa utiliza su ruta existente. La solicitud no anuncia un retiro técnico completado. |
| Contratación | La nueva transacción que también genera el PDF había perdido el aislamiento serializable y la auditoría de rechazo por deuda. | Se conservan el PDF automático y su reutilización, se restaura la protección frente a cambios concurrentes y se registra el rechazo después de revertir la operación. |
| Pruebas | El simulador de retiros seguía esperando formularios dentro de la ficha, sin el modal actual. Otro simulador no admitía opciones de transacción. | Se actualizaron los simuladores; se mantienen las comprobaciones de rutas, permisos, payloads y ausencia de bajas indebidas. |
| Archivo ausente | Una prueba exigía `db/proposals/c2-tk-01-attention-categories-qa.sql`, ausente de la rama. | Se agregó una propuesta manual protegida por revisión explícita del catálogo. No se ejecutó sobre los datos locales ni se incorporó al seed. |

Se añadieron regresiones para la apertura directa del ticket, el permiso exclusivo de solicitudes de retiro y el conflicto concurrente de contratación sin crear contrato ni PDF.

## Verificación final

`npm test` terminó con código de salida 0, después de sincronizar las dependencias locales y regenerar Prisma.

| Comprobación | Resultado |
| --- | --- |
| Backend | 97 suites aprobadas; 1.890 pruebas aprobadas, 52 omitidas |
| Herramientas generales | 38 aprobadas |
| Configuración de frontend | 3 aprobadas |
| Interfaz | 210 aprobadas |
| Total ejecutado | **2.141 aprobadas, 0 fallidas** |
| `npm run build` | Backend y frontend compilan correctamente |
| `npm run lint` | 0 errores; 78 advertencias de elementos sin uso |
| `git diff --check` y búsqueda de marcadores de conflicto | Sin errores ni conflictos pendientes en el código |

La compilación de Vite mantiene una advertencia por el tamaño del paquete principal (719 kB sin comprimir). No impide compilar ni iniciar.

## Comprobación del CRM local

Se reiniciaron backend y frontend. La página, el proxy `/api/health` y los módulos modificados responden HTTP 200.

Con identidad administrativa existente se comprobaron consultas de resumen, prospectos, pendientes de activación, clientes, planes, tickets, categorías, órdenes, usuarios y Libro de control de ambas empresas. Todas respondieron HTTP 200 usando sus parámetros vigentes. No se guardaron cambios de negocio en estas comprobaciones.

La base local devuelve 12 prospectos, 8 pendientes de activación, 28 clientes, 6 tickets y 36 órdenes. Son cantidades de las consultas de lista; no representan necesariamente los estados individuales de cada indicador.

Dirección para probar: **http://localhost:15173**.

## Límites y pendientes de aceptación

- Las 52 pruebas omitidas pertenecen a suites o casos de integración que requieren activación/configuración específica. No se presentan como aprobadas.
- `/api/ready` confirma base de datos disponible, pero informa `global_schema: DEGRADED`: 205 columnas faltantes y 50 diferencias respecto del inventario global compartido. La base local usa un esquema distinto que también omite tablas de otros grupos; no se ejecutó una reconciliación global ni se ocultó el diagnóstico.
- G1 y G3 aparecen sin configurar. Las pruebas con simuladores no certifican intercambios reales con esos grupos, correo ni emisión fiscal.
- La revisión visual automatizada se detuvo porque la herramienta no pudo identificar con suficiente seguridad la URL del navegador. Falta la aceptación visual del usuario; las comprobaciones HTTP no la sustituyen.

## Recorrido recomendado para probar en pantalla

1. **Dashboard → Tickets:** pulsar una tarjeta y comprobar que se abre ese ticket. Cerrar y abrir otro; no debe conservar el anterior.
2. **Tickets:** comprobar las opciones reales del catálogo al crear una atención y la lectura de tickets técnicos históricos. Una categoría ausente o ambigua no debe inventarse ni enviarse.
3. **Prospectos:** consultar documentos, confirmar una contratación válida y descargar el contrato generado. Repetir la consulta no debe crear otro PDF innecesario. La deuda pendiente debe bloquear una nueva contratación con un mensaje controlado.
4. **Clientes:** desplegar un plan, abrir y cancelar Cambiar plan o Dar de baja. En un servicio suspendido debe aparecer Solicitar retiro por morosidad, pedir fecha y observaciones y respetar el aviso previo. Registrar una solicitud no debe confirmar un retiro técnico.
5. **Libro de control:** abrir la ficha de un cliente, recorrer facturas, pagos y gestiones y volver a la cartera; comprobar filtros y selección.
6. **Usuarios:** con un usuario de prueba, comprobar que el toggle desactiva sin quitar la fila y que Eliminar, tras confirmar, retira la fila. Las pruebas automáticas cubren también el rechazo de una eliminación sin perder la fila.

Los pasos que guarden datos deben realizarse con los registros de prueba que se quieran utilizar; esta revisión no ejecutó bajas, pagos ni eliminaciones de usuarios en la base local.
