# Incremento 3 - Etapa 1: geolocalizacion y zonas comerciales

## Objetivo

Esta etapa incorpora una capa comercial geografica al CRM. Permite persistir la ubicacion de un Prospecto, comprobar si el punto esta dentro de la cobertura aceptada por la empresa, resolver una microzona, obtener planes y precios aplicables y combinar el resultado con una validacion tecnica desacoplada.

La cobertura comercial no representa topologia de red, cajas NAP, OLT ni inventario. Es una decision comercial administrada por G8. La confirmacion tecnica sigue perteneciendo a G3.

## Reutilizacion del sistema existente

| Componente | Estado previo | Decision | Motivo |
| --- | --- | --- | --- |
| `ZonaPago` | Zona de cobranza sin geometria | Extender | Evita crear dominios paralelos y conserva contratos/servicios existentes |
| `PlanZonaPrecio` | Precio activo por Plan y ZonaPago | Extender con vigencia | Sirve para cobertura general y microzonas, con herencia dinamica |
| `CoveragePicker` | Punto manual y consulta TomoDAT | Extender | Conserva Leaflet y agrega cobertura comercial, planes y geocodificacion opcional |
| `CoverageService` directo a TomoDAT | Integracion temporal | Deprecar como dependencia central | El flujo nuevo usa providers; el codigo legacy queda aislado y activable por configuracion |
| `Prospecto` | Direccion textual; coordenadas solo en auditoria | Extender | La ubicacion debe poder recuperarse y recalcularse |
| `LogAuditoria` | Auditoria comun | Reutilizar | Mantiene una sola trazabilidad de negocio |

## Modelo

`ZonaPago` agrega, de forma opcional y aditiva:

- `tipoZona`: `COBERTURA_GENERAL` o `MICROZONA_COMERCIAL`;
- `idZonaPadre`: autorrelacion; se exige en microzonas;
- `poligonoGeojson`: `Json` nullable para preservar filas historicas;
- `centroLat` y `centroLng` para referencia visual;
- `prioridad`, sin reglas complejas mientras no existan solapamientos ambiguos;
- `fuenteCobertura`;
- `fechaInicio` y `fechaFin`;
- indices por empresa/tipo/activo, padre y vigencia.

Una microzona solo puede depender de una cobertura general activa de la misma empresa. El backend impide autorreferencia, padres de otro tipo o empresa, geometria fuera del padre y solapamiento con otra microzona activa cuya vigencia se intersecte.

`Prospecto` agrega `comuna`, `region`, `latitud`, `longitud` e `idZonaPago`. Esta ultima es una captura comercial del resultado; la geometria se vuelve a evaluar en cada consulta y al cotizar, por lo que no actua como unica fuente de verdad.

`PlanZonaPrecio` agrega `fechaInicio` y `fechaFin`. Las reglas sin fechas son permanentes. Una regla futura o expirada no participa en la resolucion.

## GeoJSON y coordenadas

El sistema usa WGS84 / EPSG:4326. GeoJSON siempre almacena posiciones como `[longitud, latitud]`; Leaflet trabaja con `[latitud, longitud]`. Las funciones `toGeoJsonPosition` y `toLeafletLatLng` hacen la conversion explicita.

Se acepta `Polygon`. Cada anillo debe tener al menos tres vertices mas el cierre, terminar en su primer punto, contener coordenadas dentro de rango, tener area distinta de cero y no cruzarse consigo mismo. Un punto exactamente sobre el borde cuenta como dentro de cobertura comercial.

No se usa PostGIS. La cantidad esperada de zonas permite ejecutar en aplicacion las operaciones `validatePolygon`, `pointInPolygon`, `isChildPolygonInsideParent`, `polygonsOverlap`, `resolveZoneForPoint` y `resolveCommercialMicrozone`.

## Planes, disponibilidad y precio efectivo

`CommercialCoverageProvider` aplica este orden:

1. busca una cobertura general activa y vigente de la empresa que contenga el punto;
2. busca una microzona activa y vigente dentro de esa cobertura;
3. obtiene planes activos de la misma empresa;
4. usa una regla `PlanZonaPrecio` vigente de la microzona;
5. si no existe, busca la regla vigente de la cobertura padre;
6. si tampoco existe, usa `Plan.precioMensual`.

La respuesta separa `precioBase` de `precioAplicable` y declara `origenPrecio` como `MICROZONA`, `ZONA_PADRE` o `PLAN_BASE`. Las reglas no se duplican para implementar herencia. Un plan inactivo, de otra empresa o ausente del resultado geografico no puede cotizarse.

## Factibilidad y providers

Los estados de la capa combinada son:

- `NO_FACTIBLE`: punto fuera de cobertura comercial o rechazo tecnico confirmado;
- `PENDIENTE_VALIDACION_TECNICA`: punto dentro, sin decision tecnica, con timeout o con error;
- `FACTIBLE`: punto dentro y confirmacion tecnica positiva.

Un timeout nunca se convierte en `NO_FACTIBLE`.

### CommercialCoverageProvider

Funciona localmente y no necesita APIs externas. Resuelve cobertura, microzona, planes y precios con `idEmpresa` obligatorio.

### G3CoverageProvider

Es el proveedor tecnico predeterminado. Usa `G3_API_URL` y, si corresponde, `G3_API_KEY`. Genera un `traceId` UUID v4 por consulta. Sin URL configurada, ante timeout, error HTTP o respuesta desconocida, devuelve pendiente y deja intacta la cobertura comercial.

La forma final del contrato debe ratificarse con G3. El adapter concentra el payload provisional para poder ajustarlo sin cambiar el dominio comercial.

### LegacyTomodatCoverageProvider

Conserva temporalmente la consulta anterior y solo se usa con `COVERAGE_TECHNICAL_PROVIDER=LEGACY_TOMODAT`. Requiere `TOMODAT_COMPANY_ID` y `TOMODAT_API_TOKEN`. Los secretos nunca aparecen en respuestas ni se envian al frontend. Debe retirarse cuando G3 publique y estabilice su servicio oficial.

### GeocodingProvider

`GeocodingService` implementa el contrato `geocode` y `reverseGeocode`. El modo predeterminado `MANUAL` no usa red. El modo `HTTP` requiere `GEOCODING_API_URL`, HTTPS y timeout. Los tests usan mocks; no llaman a servicios reales. Si no hay candidatos, el usuario recibe un mensaje y puede colocar o corregir el punto manualmente.

Antes de habilitar un proveedor publico en produccion se deben confirmar terminos de uso, cuotas, identificacion requerida y volumen esperado.

## API

- `GET /coverage/status`
- `POST /coverage/check`
- `GET /coverage/zones`
- `GET /coverage/zones/:id`
- `POST /coverage/zones`
- `PATCH /coverage/zones/:id`
- `POST /coverage/zones/:id/deactivate`
- `GET /coverage/plans-for-location`
- `POST /coverage/geocode`
- `PATCH /prospects/:id/location`

La eliminacion fisica no forma parte del flujo geografico. Las zonas se desactivan para conservar historico.

## Frontend

La vista Cobertura permite crear cobertura general o microzona, agregar vertices con clic, moverlos, eliminar el ultimo o vaciar el borrador, ingresar coordenadas manuales, definir vigencia, guardar al confirmar, cancelar y desactivar. El mapa distingue cobertura general, microzona, zona inactiva y borrador mediante nombres, tooltips, bordes y patrones, ademas de color.

El selector de Prospectos permite geocodificacion opcional, pin manual y coordenadas manuales. Muestra zona, microzona, estado combinado, proveedor tecnico y planes con precio aplicable. La ubicacion guardada vuelve a cargarse al gestionar el Prospecto.

## Seguridad y auditoria

Las consultas respetan el `idEmpresa` del usuario. Administrador y Comercial reutilizan `MANAGE_PAYMENT_ZONES` para crear, editar y desactivar; Soporte puede consultar cobertura, pero el servicio vuelve a validar permisos en backend. Plan, zona, Prospecto y regla de precio deben pertenecer a la misma empresa.

Se registran `CREAR_ZONA_GEOGRAFICA`, `ACTUALIZAR_ZONA_GEOGRAFICA`, `DESACTIVAR_ZONA_GEOGRAFICA`, `CREAR_MICROZONA`, `ACTUALIZAR_MICROZONA`, `CONSULTAR_FACTIBILIDAD` y `ACTUALIZAR_UBICACION_PROSPECTO`. Las operaciones de precio conservan la auditoria existente.

## Migracion y validacion local

La migracion `20260925120000_i3_geolocation_commercial_zones` agrega columnas, checks, claves foraneas e indices. No elimina datos ni exige geometria a las `ZonaPago` historicas. Se valida solo en PostgreSQL local mediante:

```text
npm run db:bootstrap:local
```

El verificador local comprueba las nuevas columnas, las claves padre/prospecto, lectura Prisma y conteos legacy de `ZonaPago` y `PlanZonaPrecio`.

## Pruebas

Las suites cubren validacion GeoJSON, orden Leaflet/GeoJSON, punto interior/exterior/borde, contencion completa, solapamientos, vigencias, aislamiento por empresa, permisos, precios de microzona/padre/base, persistencia de Prospecto, G3 positivo/negativo/error/timeout, activacion explicita de TomoDAT legacy y fallback de geocodificacion. La integracion PostgreSQL es optativa y se activa con `RUN_DB_INTEGRATION=1` contra la base local.

## Limitaciones

- El editor soporta `Polygon`; `MultiPolygon` queda fuera de esta etapa.
- No hay PostGIS ni indice espacial; la resolucion recorre el conjunto reducido de zonas de una empresa.
- El contrato G3 es provisional hasta ratificacion formal.
- El geocoder HTTP queda desactivado por defecto.
- La referencia `idZonaPago` de Prospecto es recalculable y no reemplaza la geometria.
