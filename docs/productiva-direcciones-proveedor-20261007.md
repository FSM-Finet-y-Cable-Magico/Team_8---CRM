# Direcciones no localizadas: diagnóstico y proveedor preparado

Revisión del 7 de octubre de 2026, rama `feat/productiva-ux-ui`.

## Resultado

La consulta residencial autorizada por el usuario confirmó que Photon respondía correctamente, pero devolvía otra calle con el mismo número y coincidencias parciales sin numeración. No entregó el domicilio solicitado, tanto con búsqueda libre como por campos. No se conservaron nombres, RUT, contactos, domicilio residencial ni coordenadas del usuario en este documento o las pruebas versionadas.

Una dirección existente puede faltar en los datos del proveedor. Rechazar una coincidencia incorrecta evita asignar cobertura a otro domicilio. El CRM no identifica la existencia de una dirección a partir de PostgreSQL.

## Ajustes aplicados

- Photon intenta primero buscar calle, número, comuna y región por campos separados; si no obtiene un domicilio exacto, intenta la búsqueda libre. Mantiene caché y límite de solicitudes.
- El mensaje aclara que la dirección puede existir aunque el servicio de mapas no la confirme. No clasifica esa situación como No factible.
- Se preparó el proveedor ArcGIS con autenticación privada del servidor. Photon continúa seleccionado: ArcGIS no está activo y no se realizaron solicitudes reales a ese proveedor.
- ArcGIS requiere una credencial habilitada para geocodificación con almacenamiento. Las peticiones usan `forStorage=true`, cabecera de autorización y resultados en WGS84. No se transmiten claves en la URL ni al frontend.
- Solo se aceptan resultados de domicilio `PointAddress` o `Subaddress`, confianza al menos 95 y coincidencia de calle, número, comuna y región. Se rechazan centros de calle, coordenadas inválidas, países distintos y domicilios de otra calle aunque tengan el mismo número.

## Configuración pendiente

Antes de activar ArcGIS se necesita una cuenta/credencial del proveedor con permiso de geocodificación almacenada y aprobación del servicio que se usará. Si existe otro proveedor contratado, se debe confirmar cuál es para utilizarlo.

Configuración del servidor para ArcGIS, una vez disponible y autorizado:

```dotenv
GEOCODING_PROVIDER=ARCGIS
GEOCODING_API_URL=https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates
GEOCODING_API_KEY=
```

La clave real se coloca únicamente en `.env.railway` para el entorno Docker conectado a Railway, o en las variables del servicio para el despliegue remoto. `.env.example` y `.env.railway.example` mantienen este campo vacío. Una clave de inventario o instalaciones no sustituye la credencial del geocodificador.

Después de activar el proveedor se debe validar el domicilio con consentimiento para ese nuevo destino antes de afirmar que el caso concreto quedó resuelto. No se ha comprobado todavía esa dirección en ArcGIS.

## Validación

- Compilación de backend y frontend y revisión de código.
- Pruebas aisladas de búsquedas por campos y libre, rechazos por número/calle/país, credencial ausente, destino incorrecto, errores de permisos, confianza baja y tipo de ubicación.
- Photon comprobado con dirección pública de museo y, tras autorización explícita, con el domicilio informado por el usuario.
- No se registraron prospectos ni se corrigieron datos productivos durante las pruebas.

Documentación oficial:

- Photon: https://github.com/komoot/photon/blob/master/docs/api-v1.md
- ArcGIS, búsqueda y permiso para almacenar: https://developers.arcgis.com/rest/geocode/find-address-candidates/
- Cobertura de direcciones por país: https://developers.arcgis.com/rest/geocode/geocode-coverage/
