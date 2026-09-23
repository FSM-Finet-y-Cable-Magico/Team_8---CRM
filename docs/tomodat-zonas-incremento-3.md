# TomoDAT y zonas — incremento 3

## Estado y alcance

Base: `feat/arreglos-ui-incremento-2`, commit `6a444bc`, publicado en origin.
Rama de trabajo: `feat/zonas-incremento-3`.

Primera integración implementada contra el contrato público de TomoDAT: consulta de
factibilidad por ubicación, mapa para confirmar el domicilio y registro del resultado
en el flujo de prospectos. **La conexión con la cuenta real de FiNet queda pendiente
de configurar y verificar con su token.** No se ha inferido cobertura desde la captura.

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

1. Token y empresa configurados para probar al menos una dirección viable y otra sin
   viabilidad, contrastándolas con la cuenta de FiNet.
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
