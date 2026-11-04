# Cambios en los textos de la interfaz

Actualizado el 4 de noviembre de 2026. Rama: `feat/i4-ajustes-ui-finales`.

Esta lista permite localizar los cambios en la aplicación. Las rutas, integraciones, permisos y datos conservan su funcionamiento; esta revisión cambia su presentación al usuario.

## Dónde ver los cambios de esta revisión

| Dónde encontrarlo | Antes | Ahora |
| --- | --- | --- |
| **Instalaciones → bloque de pendientes** | Pendientes para instalación G3 | Pendientes de instalación |
| **Instalaciones → pendientes → botón de una solicitud** | Gestionar en G3 | Gestionar instalación |
| **Instalaciones → modal de la solicitud** | Instalación técnica G3 | Instalación técnica |
| **Instalación técnica → sin orden solicitada** | G3 administrará la orden, agenda, técnico, evidencia y cierre de terreno | Solicita la instalación para coordinar la visita del equipo técnico |
| **Instalación técnica → requisitos** | Referencias al payload G3, ciudad y región | Se requieren contrato firmado, factibilidad aprobada, identificación del cliente, teléfono móvil, dirección y comuna |
| **Instalación técnica → botón principal** | Solicitar instalación a G3 | Solicitar instalación |
| **Instalación técnica → datos incompletos** | Guardar comuna faltante y explicaciones sobre auditoría, coordenadas y PDF | Guardar comuna e instrucciones para verificar el domicilio contratado |
| **Instalación técnica → seguimiento de una orden existente** | Fuente G3 | Se retiró la etiqueta interna |
| **Instalación técnica → seguimiento** | Código OT G3 | Orden de trabajo |
| **Instalación técnica → seguimiento** | Última sincronización / Cierre procesado en CRM / Intentos | Última actualización / Fecha de confirmación del cierre / Intentos de envío |
| **Instalación técnica → detalle** | ID técnico G3 / No informado por G3 | Técnico #… / Sin asignar |
| **Instalación técnica → detalle** | Fecha completada G3 / No informada por G3 | Fecha de finalización / No registrada |
| **Instalación técnica → Consultar cierre** | G3 todavía no dispone de un cierre confirmado | El cierre técnico aún no está confirmado. La instalación continúa en seguimiento |
| **Instalación técnica → estado no reconocido** | Estado original/remoto G3 con el código recibido | Actualización técnica pendiente de revisión; se conserva el cierre confirmado cuando corresponde |
| **Instalación técnica → cliente ausente** | Reprogramación pendiente del mecanismo que defina G3 | No fue posible realizar la visita por ausencia del cliente. Está pendiente coordinar una nueva fecha |
| **Clientes → Gestionar → Contratos y servicios → Gestionar un contrato pendiente → Instalación** | Fuente G3 / Responsable técnico: G3 FSM | Se retiró la etiqueta; Atención: Equipo técnico |
| **Clientes → contratación → confirmar firma** | La instalación técnica ya puede solicitarse a G3 | Ya puedes solicitar la instalación técnica |
| **Instalaciones → agenda e historial** | LEGACY_LOCAL / columna Fuente | Histórico / columna Registro |
| **Órdenes de trabajo → tabla** | LEGACY_LOCAL / columna Fuente | Histórico / columna Registro |
| **Órdenes de trabajo → Gestionar una instalación pendiente** | Instalación administrada por G3 | Instalación pendiente de cierre |
| **Órdenes de trabajo → Gestionar una reparación pendiente** | Trabajo técnico administrado por G3 | Trabajo técnico pendiente de cierre |
| **Órdenes de trabajo → Gestionar → avisos** | Fuente operativa G3; contrato ratificado; derivación y recepción de cierres | Consulta de solo lectura y confirmación del cierre pendiente, según el estado real de la orden |
| **Inventario → consulta no disponible** | Inventario todavía no conectado; conexión necesaria en este entorno | Inventario no disponible. Inténtalo más tarde o contacta al administrador |
| **Libro de control → ficha del cliente → documentos tributarios** | EXTERNO_MANUAL | Registro manual |
| **Cobertura → avisos de conexión o búsqueda de dirección** | Podían mostrarse mensajes internos recibidos del servicio | Mensajes de consulta no disponible o selección manual de la dirección, según el caso |
| **Errores de las acciones y consultas** | Podían mostrarse códigos de integración, referencias a grupos o errores técnicos | Mensajes formales según el contexto: inventario, instalaciones, atención al cliente, retiro o ticket |

### Cambios que aparecen solo en determinados casos

- Los avisos de consulta no disponible aparecen cuando esa consulta falla o no está habilitada; no son mensajes permanentes de las pantallas.
- Los detalles de seguimiento de instalación aparecen cuando ya existe una solicitud de instalación.
- La sección **Instalación** del contrato se usa durante la contratación. Un servicio ya activo abre **Gestionar servicio**, que tiene su propia información de instalación.
- La indicación **Histórico** distingue los antecedentes conservados de la disponibilidad actual. No se presentan registros históricos como datos en tiempo real.
- Los documentos tributarios y sus acciones dependen de los permisos de la cuenta. Los avisos legítimos de documentos o correos de prueba se conservan para identificar su estado real.

## Vistas conservadas sin entrada directa en el menú actual

Se revisaron también estos componentes para que sus textos sean formales si vuelven a mostrarse:

| Vista | Antes | Ahora |
| --- | --- | --- |
| Inventario histórico avanzado | Fuente LEGACY_LOCAL, Dominio G3, CU-61 pendiente G1 P2 | Antecedentes conservados, infraestructura registrada y consumos registrados |
| Inventario histórico avanzado | G1 administra inventario; G3 administra poste/NAP | Antecedentes de solo lectura que no indican disponibilidad actual |
| Detalle histórico de instalación | Instalación administrada por G3 y Fuente operativa G3 | Detalle de instalación; orden disponible para consulta de solo lectura |
| Vista de monitoreo | Podía mostrar un mensaje interno recibido del servicio | La consulta de monitoreo no está disponible en este momento, cuando corresponde |
| Documento tributario del detalle de un pago, en la vista de facturas conservada | Faltan credenciales API / Falta preparar la base de datos | Acceso al servicio tributario pendiente / Configuración tributaria pendiente |

Estas vistas no tienen actualmente un acceso directo desde el menú. No es necesario buscarlas como una opción nueva.

## Cambios realizados previamente en esta conversación

| Dónde | Cambio |
| --- | --- |
| **Tickets → Gestionar** | Gestión, Seguimiento y Resolución separados; mensajes internos reemplazados por el estado concreto de la orden técnica |
| **Clientes → Gestionar → Nueva solicitud** | Formulario ordenado, campos de retiro condicionales y confirmación formal de la solicitud |
| **Clientes → Gestionar → servicio → Gestionar** | Acciones Modificar plan, Observaciones y Dar de baja; sin iconos en esas acciones; detalles agrupados en contrato, instalación/equipos y garantías |
| **Gestionar servicio → Instalación y equipos** | Eliminadas las etiquetas Fuente G1, G3 y G8; rótulos como Técnico, Orden de trabajo y Equipos instalados |
| **Gestionar servicio → Antecedentes del cierre técnico** | Consulta con mensajes formales y sin referencias a grupos |
| **Importación** | Se conserva el diseño de tarjeta original, solo para clientes y prospectos: seleccionar archivo e importar. Se retiró la tarjeta de vista previa del Libro de control. |
| **Prospectos → Registro** | Los campos y la ubicación seleccionada se conservan al cambiar de apartado dentro de la sesión, con un borrador por empresa. Se limpian después de registrar correctamente, al recargar la página o al cerrar la sesión; los errores de guardado conservan lo ingresado. |
| **Prospectos → Registro → RUT** | Se agrega el guion automáticamente, se limita a nueve caracteres sin contar separadores, se aceptan valores con puntos y el dígito verificador K se muestra en mayúscula. |

## Verificación

- Compilación del frontend y revisión de código correctas.
- Pruebas de permisos, consultas, solicitudes y cierre pendientes conservadas.
- Comprobación automática de etiquetas visibles para evitar nuevas referencias a grupos y códigos de desarrollo.
- El backend no se modificó.
