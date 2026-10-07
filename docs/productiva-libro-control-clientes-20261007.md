# Clientes en el Libro de control

## Causa y corrección

El Libro de control partía de las facturas. Los clientes registrados sin factura quedaban excluidos aunque aparecieran en Clientes. La consulta ahora parte del registro de clientes de la empresa seleccionada e incluye sus contratos, servicios y documentos disponibles.

- Cliente sin contrato: fila propia para contacto y seguimiento.
- Contrato sin factura: conserva el plan, servicio y día de pago que realmente tiene asociados.
- Servicio sin contrato: fila de servicio sin crear relaciones ficticias.
- Contrato con facturas: conserva las filas por documento y sus cálculos de saldo, pagos y atraso.
- Los registros sin factura muestran `SIN_FACTURAS`; los importes y fechas inexistentes permanecen vacíos. No se interpretan como deuda cero ni como «Al día».

Los resúmenes financieros solo consideran facturas. Búsqueda, filtros, paginación y exportación incluyen también los nuevos registros. Se elimina el recorte anterior de 5000 facturas que podía ocultar coincidencias.

## Acciones comerciales

Registrar contacto admite un cliente sin contrato, servicio ni factura. El formulario omite esas relaciones cuando no existen. Los cargos adicionales conservan la regla existente de quedar pendientes de facturación, separados del saldo exigible.

Convenios, prórrogas y último aviso requieren factura con saldo pendiente. El último aviso también requiere atraso. Cambiar día de pago requiere contrato y aviso de retiro requiere servicio. El enlace a cobranza solo aparece si existe una factura.

Se conserva el aislamiento por empresa y los permisos existentes. Los prospectos sin cliente asociado no se incorporan al Libro de control.

## Verificación

Consulta de solo lectura a Railway el 7 de octubre de 2026: los 22 clientes de la empresa 1 y los 3 de la empresa 2 están representados, sin clientes faltantes ni registros de otra empresa. La empresa 1 tiene 24 filas por las relaciones y documentos disponibles; el número de filas puede superar al de clientes. La búsqueda del cliente reportado encuentra su registro sin contrato ni factura.

Pruebas unitarias cubren clientes sin documentos, contrato sin factura, servicio sin contrato, seguimiento, avisos, resúmenes financieros, filtros, búsqueda después de 5000 registros, paginación, exportación y permisos. La revisión visual usa datos ficticios y un adaptador que simula el contacto, sin escribir en Railway.

No se ejecutan migraciones, semillas ni modificaciones de datos compartidos. La localización automática de direcciones queda en standby por indicación del usuario.

Validación previa a publicar la rama: compilan backend y frontend; pasan 156 pruebas aisladas de backend, 11 de frontend y 5 de configuración e higiene del repositorio. La revisión de los archivos pendientes no encuentra literales de las credenciales privadas configuradas. Los entornos reales y las pruebas visuales locales permanecen excluidos de Git.
