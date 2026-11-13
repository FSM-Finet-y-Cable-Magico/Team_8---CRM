# Importación del Libro de control histórico

Implementada en `feat/arreglos-productiva`, 13 de noviembre de 2026.

## Resultado del archivo entregado

Se examinó `LIBRO-CONTROL.csv.xlsx` sin modificar el archivo ni cargar sus clientes en una base de datos. La hoja `LIBRO CONTROL` contiene un CSV de 70 columnas dentro de celdas de Excel: 1 encabezado y **74 registros**.

| Filas del archivo original | Resultado |
| --- | --- |
| 70 registros | Superan la validación estructural y de identidad dentro del archivo. Falta contrastarlos con la empresa y los clientes existentes de la base de destino. |
| 29 y 30 | Comparten RUT con nombres diferentes. Ambas quedan para revisión; no se decide automáticamente a quién pertenece. |
| 39 y 41 | RUT con verificador inválido. No se inventa otro verificador. |
| 24 | Dos correos partidos entre celdas. La reconstrucción se admite únicamente porque ambos correos son válidos y se recuperan exactamente las 70 columnas. Ambos se conservan; el primero válido se usa como contacto principal. |

Los números incluyen la fila de encabezado, como en Excel. Las advertencias por correo ausente u otros contactos ambiguos no bloquean por sí solas el registro de un cliente histórico.

## Flujo en la aplicación

1. Elegir una empresa y un archivo CSV o XLSX, de hasta 5 MB y 10.000 filas.
2. Pulsar **Revisar archivo**. Se muestran filas listas, rechazadas y ya importadas, además de observaciones descargables en CSV. Esta revisión no crea clientes.
3. Pulsar **Importar N filas revisadas**. Se comprueban de nuevo las identidades y la empresa antes de guardar. Las filas bloqueadas no impiden incorporar las demás del formato histórico.
4. Corregir solo las filas que requieran revisión y volver a cargar el archivo. Repetir las mismas filas no duplica los antecedentes ya incorporados.

Las filas reconocidas como Libro de control son **clientes**, nunca prospectos. En el formato general, únicamente `tipo_registro=prospecto` crea prospectos; omitir el tipo crea clientes.

## Qué se guarda y qué requiere interpretación

- Cliente nuevo: RUT validado, nombre, correo válido y teléfono interpretable. La dirección se registra si cabe íntegra en el campo existente; si falta, no se inventa.
- Cliente existente: se exige identidad coincidente y relación confirmada con la empresa. No se sobrescriben sus datos, contactos ni estado. Un prospecto existente sin cliente vinculado requiere revisión, en lugar de crear otra identidad.
- Antecedentes: se conserva la fila con sus encabezados, columnas repetidas, valores originales, observaciones y advertencias. Se puede consultar en el historial del cliente. Las fórmulas de Excel no se ejecutan.
- Los vacíos no se convierten en pagos, deudas cero o fechas. Los importes negativos se conservan. Los `FALSE` de la planilla no se interpretan como baja del cliente.
- Los campos de plan no se toman como identificadores de la base de datos. Fechas, saldos, pagos, convenios, cortes y reposiciones se conservan como antecedentes pendientes de correspondencia; **no alimentan los saldos operativos como si fueran movimientos nuevos**.
- “1 ticket”, “2 ticket” y “2 ticket Azul” aparecen en columnas de envío de boletas y avisos de corte. Su significado no fue confirmado por el usuario. Se conservan como anotaciones, sin crear tickets de soporte ni órdenes de trabajo.
- Un cliente nuevo se registra con estado `Activo` en el catálogo de clientes y con `verificacionOperativaPendiente=true`. Esto no crea ni activa servicios, contratos o equipos. El estado de los clientes existentes permanece intacto.

Para convertir estos antecedentes en facturación, pagos o servicios operativos se necesita confirmar la correspondencia de las columnas, el período y los documentos relacionados. La planilla por sí sola no permite hacerlo sin riesgo de duplicar deuda, imputar pagos incorrectamente o emitir acciones de corte.

## Integridad y compatibilidad

No se añaden tablas, migraciones ni rutas nuevas. No se modifican contratos de integración con otros grupos ni se envían solicitudes externas. La revisión anterior del Libro de control conserva su respuesta cuando no se solicita el flujo nuevo de clientes.

Cada fila histórica se guarda en una transacción con su auditoría. Si falla, se revierte esa fila. Una huella del contenido impide duplicar la misma fila al renombrar o reordenar un archivo. Se comprueba de nuevo bajo bloqueo por RUT para evitar duplicados entre importaciones simultáneas. Los nuevos clientes, antecedentes y direcciones se guardan únicamente tras la confirmación de importación en la aplicación.

Se verificó el formato entregado en modo de lectura y se añadieron pruebas con información ficticia para reconstrucción del Excel, identidades contradictorias, aislamiento por empresa, reintentos, reversión de filas y revisión de **1.500 clientes**. Esa última prueba cubre lectura y validación por lote; no representa una prueba de carga contra la base de producción.
