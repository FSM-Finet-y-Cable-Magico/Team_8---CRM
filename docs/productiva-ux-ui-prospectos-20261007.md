# Prospectos e instalaciones — revisión del 7 de octubre de 2026

Rama: `feat/productiva-ux-ui`. Cambios de interfaz y validación de direcciones. Sin migraciones, correcciones masivas ni modificaciones de registros productivos durante las pruebas.

## Registro y cobertura automática

- El formulario consulta la ubicación al terminar dirección y comuna, y nuevamente antes de guardar si cambiaron los datos. La comuna es obligatoria; la región ayuda a desambiguar. No requiere mapa editable, botones de consulta ni coordenadas manuales.
- Muestra Factible o No factible según las zonas comerciales vigentes de la empresa. Una dirección no localizada, ambigua o un servicio de ubicación caído bloquea el registro y conserva el formulario. Ninguna de esas situaciones se interpreta como falta de cobertura.
- El backend vuelve a verificar la dirección para las solicitudes con `validarDireccion: true`; guarda las coordenadas del proveedor, no un punto arbitrario enviado por el navegador. Las integraciones anteriores conservan su contrato sin este indicador.
- Se habilitó Photon en los archivos privados `.env` y `.env.railway`, y en ambos entornos Docker locales. Las variables son `GEOCODING_PROVIDER=PHOTON` y `GEOCODING_API_URL=https://photon.komoot.io/api/`. No se cambiaron credenciales ni conexiones de base de datos.
- La configuración del servidor desplegado en Railway se administra por separado en sus variables de entorno. El archivo local `.env.railway` no actualiza automáticamente ese despliegue.
- Solo se confirma un candidato que coincida con calle, número, comuna y región cuando está indicada, dentro de Chile. Se agrupan puntos separados por hasta 35 metros con el mismo domicilio verificado, porque un edificio puede tener entrada y punto de interés separados. Ubicaciones distantes siguen siendo ambiguas.
- Las consultas idénticas comparten una solicitud y una caché limitada; las nuevas consultas salen espaciadas al menos un segundo. El servicio público de Photon se usa para pruebas y no garantiza disponibilidad o cobertura de todas las direcciones. Para el volumen productivo se debe definir un proveedor o instancia con capacidad acordada: https://github.com/komoot/photon/blob/master/README.md

## Gestión de prospectos

- Muestra la dirección y un punto automático en el mapa. Comprueba la cobertura comercial con `GET /coverage/plans-for-location` y permite acercar con la rueda del mouse.
- Abrir una ficha anterior sin coordenadas consulta su dirección completa sin modificar registros. Si la dirección se confirma y el usuario genera una cotización, el backend guarda el punto verificado y registra auditoría antes de continuar. Una dirección no localizada o sin comuna requiere completar sus antecedentes.
- Cotización y contratación necesitan ubicación confirmada, cobertura vigente y un plan activo de la misma empresa. Los procesos finalizados y contratos pendientes de firma mantienen sus bloqueos. La cobertura visible no transforma por sí sola un registro histórico en un prospecto comercial vigente.
- Los antecedentes que indican servicio activo sin cliente asociado se presentan como Registro histórico, con un aviso separado de cobertura. Sus acciones comerciales siguen bloqueadas y sus datos originales se conservan.
- Instalaciones muestra solicitudes, visitas e historial sin etiquetas de equipos de desarrollo, fuentes técnicas ni códigos de integración. El detalle histórico conserva su carácter de consulta.
- Inventario mantiene el catálogo y la consulta por serie; no incorpora altas, asignaciones físicas ni cierres de instalación.

## Regla de conversión revisada

| Etapa | Resultado actual del backend |
| --- | --- |
| Registro y cobertura | Crea un prospecto factible o no factible; no crea cliente ni servicio. |
| Cotización | Registra cotización y actualiza el estado comercial; no crea cliente ni servicio. |
| Contratación | Crea un contrato pendiente de firma, vinculado al prospecto. |
| Firma | Deja el prospecto pendiente de activación. |
| Instalación completada y validada | Crea o vincula el cliente, activa su servicio y actualiza contrato y prospecto. |

## Antecedentes y pendientes separados

- La revisión de solo lectura en Railway encontró cinco prospectos con Servicio Activo y sin cliente asociado. Esta inconsistencia ya existía; no fue creada por la ubicación automática y no se corrigieron los registros por inferencia.
- La ruta antigua `PATCH /prospects/:id/pipeline` valida el orden de estados, pero permite Servicio Activo sin verificar cliente, servicio o cierre técnico. Requiere una corrección separada; no se pudo atribuir a esa ruta el origen de los cinco antecedentes.
- `LEGACY_LOCAL` identificaba antecedentes históricos guardados en la base del CRM; no indicaba que PostgreSQL estuviera alojado en el computador. La interfaz ya no muestra esa etiqueta técnica.
- Sigue pendiente la adaptación del sobre `{ success, data }` de la API de instalaciones. La limpieza de textos no modifica ese cliente HTTP ni confirma una agenda técnica sincronizada.

## Verificación

- Compilación de backend y frontend y revisión de código correctas. Pasaron 75 pruebas aisladas de backend y 10 de frontend, sin escrituras en la base compartida.
- Proveedor real: dirección pública Plaza de Armas 951, Santiago, ubicada; dirección ficticia rechazada. No se enviaron domicilios de clientes durante estas pruebas.
- Revisión visual con datos simulados: factibilidad antes del registro, punto en el mapa, dirección no encontrada y ambigua, caída del servicio, registro fuera de cobertura y bloqueo de cotización, y geolocalización de un registro previo sin coordenadas.
- A 390 px, formulario, tabla, ficha y mapa mantienen el ancho de la pantalla sin desplazamiento horizontal.

Las pruebas visuales, capturas y datos simulados son archivos locales ignorados por Git. Los archivos privados de configuración también están ignorados.

## Revisión de domicilios no encontrados

La revisión posterior confirmó respuestas de otra calle con el mismo número en Photon. Se mejoró la consulta por campos, se aclaró el mensaje y se preparó un proveedor autenticado sin activarlo. Los detalles, configuración pendiente y límites se describen en [Diagnóstico de direcciones](productiva-direcciones-proveedor-20261007.md). La validación anterior de una dirección pública no confirma la cobertura de todos los domicilios.
