# TomoDAT y zonas — incremento 3

## Estado y alcance

Base: `feat/arreglos-ui-incremento-2`, commit `6a444bc`, publicado en origin.
Rama de trabajo: `feat/zonas-incremento-3`.

Primera integración implementada contra el contrato público de TomoDAT: consulta de
factibilidad por ubicación, mapa para confirmar el domicilio y registro del resultado
en el flujo de prospectos. **La conexión real de FiNet se verificó en Docker el
23-09-2026; sigue pendiente confirmar un caso positivo de factibilidad.** No se ha
inferido cobertura desde la captura.

La dirección escrita todavía no se convierte automáticamente en coordenadas. El
usuario selecciona el punto en el mapa o ingresa latitud/longitud; entonces la
consulta técnica es automática. Cambiar la dirección o empresa elimina la selección
anterior. El resultado se vuelve a consultar en el servidor al registrar el prospecto
o guardar su factibilidad, sin aceptar un resultado enviado por el navegador.

No se han implementado aún geocodificación de direcciones, polígonos de cobertura,
sincronización de colores/categorías, asociación automática de zonas comerciales,
restricción de planes por cobertura ni asignación de zona a perfiles.

## Hallazgos en el CRM

| Área | Implementación actual | Relación con cobertura |
| --- | --- | --- |
| Prospectos | `prospects.service.ts`, `ProspectsPanel`, `ProspectWorkflowPanel`; dirección como texto y pipeline | Punto inicial para la consulta TomoDAT. Antes se marcaba manualmente Factible/No Factible. |
| Cotizaciones | `Cotizacion.factibilidadVerificada` permite cotizar y programar instalación | Una respuesta positiva crea la verificación dentro del mismo guardado. Una revisión negativa invalida las anteriores. |
| Clientes/perfiles | `Cliente` agrupa contratos, direcciones y servicios; el prospecto se convierte al completar instalación | La cobertura debe corresponder al domicilio del servicio, no al RUT ni a todos los domicilios del cliente. |
| Usuarios empleados | `Usuario`, `Rol`, `UsuarioRol` y empresa | Son permisos de operación; actualmente no existe relación con zonas. No se debe asignarles geografía desde un color sin definir el significado. |
| Zonas | `ZonaPago`: empresa, comuna, nombre y día de vencimiento | Son zonas comerciales/de cobro, sin polígonos ni ID externo TomoDAT. |
| Planes | `Plan` pertenece a empresa; `PlanZonaPrecio` relaciona plan y zona de pago | Las reglas de precio no constituyen una prueba de cobertura técnica. |
| Contratos y servicios | `Contrato.idZonaPago`, `ServicioContratado.idZonaPago`; validaciones por empresa | Hay que definir el mapeo con cobertura antes de automatizar su selección. |
| Solicitudes | `RequestsService.updateFeasibility` maneja factibilidad manual y motivo | Integración futura para nuevas instalaciones o traslados; no alterada en este corte. |
| Inventario | `CajaNap` contiene zona textual, latitud/longitud y capacidad | No tiene equivalencia confirmada con IDs de las cajas de TomoDAT. No se mezclan inventarios automáticamente. |
| Instalación | `WorkOrdersService` convierte prospecto en cliente/servicio y asigna equipos | Consultar disponibilidad no reserva puertos ni instala clientes en TomoDAT. |
| Seguridad y auditoría | JWT, roles, alcance por empresa y `LogAuditoria` | Token exclusivo del servidor y evidencia de consultas guardadas en auditoría. |

Los módulos de cobranza, contratos, servicios y planes ya utilizan zonas de pago;
reportes, monitoreo, tickets e inventario conservan sus reglas actuales. No se ejecutó
ninguna migración ni se modificó información de la base compartida.

## API oficial verificada

Documentación leída el 23-09-2026 en el propio servidor de Chile:
[TOMODAT2 API](https://cl2.tomodat.com/tomodat/api.html).

- Autenticación: token generado en configuración de usuario de TomoDAT, enviado
  directamente en `Authorization` (sin prefijo `Bearer`). No hace falta la contraseña.
- `GET /tomodat/api/clients/viability/{latitude}/{longitude}/`: consulta cajas dentro
  del radio de atención y disponibilidad de puertos de splitter.
- La respuesta documentada es un arreglo de cajas con `id`, `name`, `dot.lat`,
  `dot.lng`, `splitters[].total_ports` y `splitters[].free_ports_number`.
- El parámetro opcional `raio` se omite: se conserva el criterio de alcance configurado
  en TomoDAT, sin inventar un radio local.
- La documentación también expone puntos de acceso por centro/radio y creación de
  clientes. Este corte no crea clientes ni ocupa puertos en el sistema externo.
- No se encontró en esa documentación un catálogo de zonas comerciales, polígonos
  o una relación inequívoca entre color y zona. Requiere confirmar la cuenta real.

## Configuración

Para ejecución local con npm, completar `backend/.env` (ignorado por Git):

```dotenv
TOMODAT_API_URL=https://cl2.tomodat.com/tomodat/api/
TOMODAT_COMPANY_ID=ID_REAL_DE_FINET_EN_ESTA_BASE
TOMODAT_API_TOKEN=TOKEN_GENERADO_EN_TOMODAT
```

Obtener el ID de FiNet del selector de empresas o consultando `empresa`. No asumir
que coincide entre la base demo y Railway. El token debe pertenecer a la cuenta de
FiNet; preferir un usuario dedicado con permisos de lectura si TomoDAT lo permite.

Para Docker local usar las mismas variables en `.env` de la raíz. Para Docker con
Railway usar `.env.railway`; en despliegue alojado configurarlas en el servicio backend.
Reiniciar/recrear el backend tras cambiarlas. Nunca usar variables `VITE_` para el token.

La URL predeterminada es la instancia chilena facilitada por el usuario, y la ruta
se basa en su documentación pública. Es necesario comprobar que el token y los
datos reales de esa cuenta siguen exactamente ese contrato.

## Uso y resultados

1. En registro de prospectos, completar la dirección y desplegar **Confirmar ubicación
   y consultar cobertura**. Seleccionar el domicilio exacto en el mapa o escribir
   coordenadas. El mapa inicial de Santiago es solo una vista de navegación.
2. Con la integración configurada, cada nueva selección consulta TomoDAT. El marcador
   azul identifica el domicilio; verde indica cajas devueltas con puertos libres.
   Los colores son una leyenda del CRM, no una copia de los colores de TomoDAT.
3. Registrar el prospecto vuelve a consultar el proveedor. Si no se eligió un punto,
   se registra como prospecto nuevo pendiente de revisión.
4. En gestión de prospectos, **Verificar y guardar con TomoDAT** reconsulta y registra
   el resultado. Administrador y Soporte conservan la revisión manual; Comercial
   puede solicitar la consulta automática, cuyo resultado decide el servidor.
5. En Cobranza → Zonas de pago y reglas, seleccionar una empresa y desplegar
   **Consultar cobertura de una dirección** para una consulta sin guardar cambios.

| Resultado | Condición | Efecto |
| --- | --- | --- |
| Factible | Respuesta válida con al menos una caja con puertos libres | Habilita la factibilidad del prospecto. No reserva puertos. |
| No Factible | Respuesta válida sin cajas viables con puertos libres | Marca No Factible y revoca verificaciones positivas anteriores al guardar. |
| Pendiente | Sin token/configuración, error, timeout o respuesta inválida | No se inventa falta de cobertura. En registro queda prospecto nuevo; en reconsulta mantiene el estado previo. |

Las revisiones guardadas se limitan a las etapas previas a la cotización/contratación
para evitar retroceder procesos avanzados. La auditoría incluye dirección, coordenadas,
proveedor, resultado, fecha y cajas devueltas. Usa el mecanismo existente de auditoría
de mejor esfuerzo; no es un repositorio geográfico ni una reserva transaccional externa.
La ubicación no se añade como columna al modelo ni se recupera en el mapa al reabrir;
se debe volver a confirmar para cada consulta guardada.

El backend exige HTTPS, impide redirecciones con credenciales, limita la espera a
8 segundos, valida la estructura del proveedor y comprueba la empresa del solicitante.
No envía nombre, RUT, correo ni contraseña a TomoDAT para consultar cobertura.

## Mapa

Se usa [Leaflet](https://leafletjs.com/reference.html) y cartografía OpenStreetMap,
con atribución visible, teselas HTTPS, caché normal del navegador y sin descargas
masivas. Revisar [la política de teselas](https://operations.osmfoundation.org/policies/tiles/)
y elegir infraestructura cartográfica adecuada antes de un despliegue de alto tráfico.
No se agregó un geocodificador ni se envían direcciones a un buscador externo.

## Próximos datos necesarios

1. Confirmar en TomoDAT una dirección viable y sus parámetros de atención/puertos;
   el token y la empresa ya están configurados y responden desde Docker.
2. Significado de los colores, categorías y cajas de la captura; confirmar si las
   zonas existen como polígonos, etiquetas o agrupaciones operativas.
3. Relación entre zonas técnicas y `ZonaPago`, planes disponibles y precios.
4. Proveedor de geocodificación para localizar direcciones escritas con confirmación
   de coincidencias ambiguas; una comuna por sí sola no determina cobertura.
5. Criterio para traslados y cuándo volver a validar/reservar puertos antes de instalar.

El siguiente modelo debe vincular IDs externos estables, empresa, geometría o cajas,
fecha de sincronización y zona comercial. No utilizar el color como identificador.

## Validación reproducible

```shell
npm run test -w backend -- --runInBand
npm run build
npm run lint
```

Las pruebas de cobertura simulan las respuestas documentadas para verificar límites,
aislamiento entre empresas, errores y estado comercial. No sustituyen la prueba
autenticada contra la red real de FiNet. La prueba PostgreSQL optativa de la suite
solo se ejecuta al habilitar `CRM_INTEGRATION_TESTS=1` en un entorno de pruebas.

Verificación de este corte: 135 pruebas aprobadas y una prueba PostgreSQL optativa
omitida; compilación backend/frontend correcta. Lint sin errores, con 79 advertencias
preexistentes de variables sin uso. Mapa revisado en navegador con una página aislada
y respuestas simuladas: ubicación manual, consulta, marcadores y eliminación del
resultado al quitar el punto. No se validó el flujo completo contra la base compartida.

### Prueba real en Docker — 23-09-2026

- Backend, frontend y PostgreSQL iniciados correctamente; empresa local `1`
  corresponde a `FiNet Limitada`. Token leído de la configuración privada, sin
  incluirlo en este documento ni en Git.
- Dirección facilitada por el usuario: Río Coya 204, Puente Alto. Punto confirmado
  en Google Maps: `-33.6131734, -70.6229194`.
- La consulta autenticada de viabilidad respondió HTTP 200 con `[]`, tanto con
  el radio predeterminado como con `raio=250` en el diagnóstico.
- La consulta de puntos de acceso con radio solicitado de 250 devolvió 183 nodos,
  171 de categoría 5. Entre los más cercanos: `nap104` (ID 4422), `nap 107`
  (ID 4097) y `nap105` (ID 4423). Cada uno tiene un splitter de 16 puertos
  registrado; `percentage_free` es nulo. Esto no acredita puertos libres.
- La consulta de viabilidad también devolvió `[]` en las coordenadas exactas de
  esas tres cajas y en una muestra de otros seis puntos de la red. No constituye
  una revisión exhaustiva ni demuestra ausencia de cobertura física.
- Verificado en el navegador: iniciar sesión, seleccionar FiNet Limitada, abrir
  Cobranza → Zonas de pago y reglas → Consultar cobertura de una dirección,
  ingresar el domicilio y sus coordenadas. El CRM muestra `No Factible` y el
  motivo recibido del servicio. No se crearon prospectos ni se alteró la red.

La conectividad y el recorrido de consulta del CRM están comprobados. Para cerrar
la validación funcional falta contrastar un caso positivo con TomoDAT y revisar
con su administrador el radio de atención, la disponibilidad de puertos y los
requisitos/permisos del endpoint de viabilidad. No se ha determinado cuál de esos
factores explica la respuesta vacía. Los colores o la presencia de cajas en el
mapa no sustituyen esa comprobación.

### Ampliación de la prueba real

A petición del usuario se amplió la búsqueda a un radio solicitado de 12.000 m
centrado en `-33.595, -70.626`. El listado devolvió 1.067 nodos, incluyendo 917
cajas de categoría 5, todas con tipo `CTO`. Se eligieron 60 ubicaciones mediante
una muestra espacial dispersa y se consultó viabilidad en las coordenadas de
cada caja. Las 60 respuestas fueron arreglos vacíos, sin errores HTTP o de
conexión. En cinco ubicaciones se repitió con `raio=1000`, también sin resultados.
La muestra no equivale a probar las 917 cajas ni a acreditar falta de cobertura.

Se volvió a leer la documentación pública: el radio de búsqueda no sustituye
el radio de atención del tipo de caja; el servicio comprueba también los puertos
del splitter. El encabezado de autenticación y la ruta implementada coinciden
con ese contrato. Las 16 pruebas unitarias del servicio pasaron, incluido un caso
positivo simulado, que no sustituye un caso positivo real.

### Revisión con sesión iniciada por el usuario

La página `profiles` identifica el perfil de la sesión como **View**. El menú
principal solo ofrece mapa y datos personales; no se dispone de la administración
de tipos de caja desde esta sesión. Esto explica la limitación para revisar su
configuración en la interfaz, pero no demuestra la causa de la viabilidad vacía.

Desde el menú Documentación se encontraron contratos más completos:
[API general](https://cl2.tomodat.com/tomodat/docs/general) y
[API ERP](https://cl2.tomodat.com/tomodat/docs/erp_full).
Con los endpoints de lectura de la API general se confirmó:

- `GET /api/auth/`: token válido (`status: 1`, nivel numérico `1`).
- `GET /api/access_points/{id}`: las cajas 4422, 4097 y 4423 usan el tipo CTO
  ID 3, con radio de atención `50` m y campo `pon: false`. No se ha confirmado
  qué efecto tiene ese último campo sobre el algoritmo de viabilidad.
- `GET /api/access_points/ctos/paginated?ids=4422,4097,4423&limit=3`: cada caja
  contiene un splitter de 16 puertos, los 16 sin cliente asociado. Esto no
  demuestra disponibilidad operativa ni ausencia de otras reservas/restricciones.
- `POST /api/access_points/get_olt_from_splitter` es una consulta documentada
  de trazado, sin modificación. Para los splitters 4678 (nap104), 4397
  (nap 107) y 4679 (nap105), devuelve `status: 1` y `data.status: unconnected`.
  Según el contrato, la ruta registrada no alcanza una OLT. No demuestra que la
  instalación física esté desconectada ni prueba por sí solo la causa del rechazo.
- Las consultas documentadas bajo `/erp/` (viabilidad, cajas implantadas,
  puertos y búsqueda por dirección) devuelven `status: 0`, `message: Auth error`
  con el token actual. No confundir ese rechazo de autenticación con una lista
  vacía de cobertura. No se cambió el CRM a esta API.

Siguiente paso: el administrador de FiNet debe contrastar una CTO que esté
operativa con su ruta registrada hasta la OLT y los criterios del tipo de caja;
si persiste el resultado vacío, soporte TomoDAT puede revisar estos IDs y la
consulta exacta de Río Coya 204. La integración obtiene datos reales de cajas,
ubicaciones y ocupación, pero todavía no existe un caso positivo real verificado.
No se cambió ninguna caja, splitter, puerto ni regla de cobertura.

### Búsqueda dirigida de un caso positivo

Se seleccionaron 24 CTO distribuidas espacialmente entre las 60 ubicaciones
anteriores. El endpoint paginado encontró las 24; todas tienen un splitter con
al menos una salida sin cliente asignado. Se consultó para cada splitter el
endpoint documentado de trazado a OLT: los 24 respondieron `unconnected` y
ninguno `connected`. Por tanto, en esta muestra no hay una caja conectada que
permita una prueba positiva representativa. La respuesta no acredita el estado
físico de la red ni prueba que todas las CTO de la cuenta estén desconectadas.

La ruta de integración del CRM responde según el contrato publicado; la prueba
positiva de punta a punta requiere que el administrador o soporte señale una
ubicación que TomoDAT considere factible o corrija/aclare los datos de una CTO
operativa. Mientras tanto, una revisión técnica manual sigue disponible en el
CRM para no tomar la salida vacía como sentencia sobre la instalación física.
