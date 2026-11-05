# Preparación de despliegue de producción

## Validación previa a publicación de la rama — 2026-10-28

| Comprobación del candidato | Resultado |
| --- | --- |
| Perfiles privados FiNet y Cable Mágico | Completos y validados; boleta 39, IVA incluido, IndServicio 3, UTF-8 |
| Regresión local con lock exacto | 852 PASS, cero FAIL, nueve omitidas; QA_LOCAL_READY=true |
| Ensayo PostgreSQL temporal | 16 PASS; quince solapados y un caso integrado adicional |
| Cobertura única de ambos recorridos | 853 PASS y ocho casos opt-in restantes sin ejecutar |
| Build/lint backend, build frontend y Prisma | PASS |
| Compose locales con valores ficticios | PASS; sin iniciar servicios |
| Recuperación con cambio de perfil | Protegida antes de consultar PDF/conciliar; ocho regresiones nuevas en ambos ambientes |
| Publicación autorizada | Commit y push solo a SecurityRealiseMatrizQA; merge a develop posterior |
| Credenciales y Railway | Privados excluidos; sin modificaciones, activación, migraciones compartidas o despliegue |

El código se probó en una copia temporal sin archivos privados, usando npm ci y red Docker interna. Los errores iniciales del host eran dependencias ausentes; los grupos completos pasaron en el laboratorio. Los resultados no acreditan todos los casos externos ni una emisión fiscal productiva. RELEASE_READY=false. Los perfiles completos resuelven la configuración fiscal local; para activar el entorno final aún corresponde revisar esquema/candidato, cargar los secretos fuera de Git y validar el despliegue e integración acordados.

## Estado vigente: perfiles locales completos; activación sin realizar — 2026-10-28

| Comprobación | Estado actual |
| --- | --- |
| Perfiles FiNet y Cable Mágico | COMPLETOS y validados en el privado productivo existente; approved:true |
| Documento y regla | Boleta 39, IndServicio 3 confirmado por el usuario, precios con IVA incluido, PER_PAYMENT_V1 |
| Codificación y constructor | UTF-8; IndMntNeto=0, total bruto preservado sin sumar IVA de nuevo, folio automático |
| Parser, resolutor y validador fiscal estructural | PASS con el código real ejecutado en memoria; credenciales cruzadas rechazadas |
| API de ambas empresas | PASS real previo de hoy: login y versión HTTP 200, versión 1.2.8.1; mismos bloques guardados |
| Pendiente IndServicio | RESUELTO; las anotaciones anteriores que lo dejan pendiente son históricas |
| Flags y empresas | Cuatro flags false y ambas empresas enabled:false; emisión desactivada |
| Credenciales | Preservadas; solo cambió FACTURACION_CL_PROFILES y comentarios del privado |
| Railway, esquema y servicios | Sin modificaciones, migraciones aplicadas o servicios iniciados |
| Publicación | Cambios locales; sin stage, commit, push, PR o merge; HEAD 3d2c2ed9 |

La preparación de los perfiles está cerrada. La activación del entorno final conserva sus comprobaciones: revisar candidato y esquema/migraciones, cargar variables privadas y validar despliegue/consumo G2 según el flujo acordado. approved:true no habilita flags ni acredita por sí solo una emisión aceptada por el proveedor. No se usaron clientes reales para emitir ni se enviaron nuevos correos. La validación de esta configuración no sustituye la regresión integral del candidato final.

## Estado vigente: Cable Mágico — 2026-10-28

**Acceso API y versión de Cable Mágico verificados; emisión productiva aún desactivada y perfil fiscal pendiente.** El alcance de esta continuación es únicamente Cable Mágico. No se repitieron autenticaciones de FiNet. Los apartados del 22-10 siguientes mantienen su fecha y quedan superados para el acceso de Cable Mágico por esta evidencia.

| Comprobación | Estado actual |
| --- | --- |
| API Cable Mágico, idEmpresa 2 | PASS real en el lector del CRM: login y versión HTTP 200; versión 1.2.8.1 |
| Representación de la versión | String documentado o array de exactamente un string numérico; se conserva la forma observada y se rechazan formatos ambiguos |
| Validación del ajuste | 22 pruebas del comprobador y 38 dirigidas sobre el lector real PASS; no equivale a ejecutar Jest/build/lint/regresión completos |
| FiNet | Fuera del alcance; sin nuevas conexiones ni cambios |
| Perfil fiscal Cable Mágico | Ausente en el privado productivo; pendiente confirmar emisor, boleta 39/41, indicador de servicio y codificación antes de marcar approved |
| Activación | INTEGRATION_ENABLED, DELIVERY_ENABLED, PRODUCTION_ENABLED y PRODUCTION_PREFLIGHT_ENABLED permanecen false |
| Identidad fiscal / habilitación DTE | No certificadas por un login; productionReady=false |
| SMTP | Se conserva la evidencia anterior; no se enviaron correos ni se repitió su prueba en esta continuación |
| Esquema y entrega G2 | Pendientes de revisión y coordinación en el candidato/entorno final acordado; ninguna migración aplicada aquí |
| Railway y privados | Sin cambios, inicio de servicios o conexiones a bases |
| Publicación | Cambios locales en SecurityRealiseMatrizQA@3d2c2ed9; sin stage, commit, push, merge o PR |

El siguiente paso de configuración para Cable Mágico es completar el perfil fiscal con los parámetros confirmados por el responsable. No repetir autenticaciones sin correcciones o una necesidad concreta de validación. No habilitar flags ni usar pagos/clientes reales para probar esta preparación. El resultado actual demuestra autenticación técnica y consulta de versión; no una boleta productiva emitida o correo automático desde un backend desplegado.

## Estado vigente de Facturación.cl y SMTP — 2026-10-22

**Código preparado localmente; activación productiva pendiente de autenticación API y configuración del emisor. Railway permanece intacto por decisión del usuario.** Este apartado actualiza únicamente Facturación.cl/SMTP; las comprobaciones de otros módulos que siguen conservan su fecha y alcance originales.

| Comprobación | Estado actual |
| --- | --- |
| Código de emisión, separación multiempresa/ambiente y recuperación | PASS local; regresión 826 PASS y ensayo PostgreSQL adicional; detalle en el checkpoint |
| SMTP FiNet y Cable Mágico | PASS real de conexión/autenticación, STARTTLS, cero mensajes nuevos |
| API FiNet declarada productiva por el usuario | Dos diagnósticos de autenticación de solo lectura: HTTP 200, objeto con error de tipo string, sin token esperado; versión no consultada |
| API Cable Mágico declarada productiva por el usuario | Mismo resultado; no se probaron otras claves/usuarios ni se emitieron documentos |
| Perfil del emisor | FACTURACION_CL_PROFILES vacío en el privado productivo; pendiente completar con los datos confirmados de cada emisor |
| Migración nueva | PASS únicamente sobre PostgreSQL temporal; no aplicada al esquema compartido |
| Configuración/despliegue Railway | Fuera del alcance actual; sin cambios, acceso a base o despliegue |
| Publicación | Cambios locales sin stage/commit/push/PR; HEAD 3d2c2ed9 en SecurityRealiseMatrizQA |

El usuario reafirmó que los accesos guardados son productivos. No se concluye que una cuenta sea DEMO por su nombre: el bloqueo preventivo que aplica nuestro verificador es una regla local, no una respuesta del proveedor ni prueba del ambiente. Se hizo una comprobación separada, estrictamente de autenticación, para aislar ese bloqueo. El proveedor respondió error y no token en ambos casos. No se imprimió el mensaje remoto; su forma no permite atribuir la causa a contraseña, permisos o habilitación. No se desactivaron controles para convertirlo en PASS.

Detalle posterior del error: una única consulta adicional por empresa devolvió el mensaje saneado **«Clave de empresa no es valida.»**. Se conserva el fallo de login; ahora el proveedor identifica la clave de empresa como inválida para esa solicitud. Confirmar el bloque API y la clave asignada al RUT correspondiente antes de otro intento. No se concluye que sean cuentas de pruebas ni que la clave SOAP deba ser diferente. Los privados, controles y Railway no se modificaron; ver el inicio del checkpoint.

### Secuencia para terminar sin usar clientes reales

1. **Resolver primero la autenticación API.** Confirmar con el administrador/proveedor que los bloques guardados corresponden al servicio utilizado por el CRM, POST https://rest.facturacion.cl/login, y a los emisores de ambas empresas. No confundir acceso web, SOAP o puerto de impresión con el contrato REST. Si se verifica o corrige algún dato, editar únicamente el bloque de su empresa en .env.facturacion-production-private y avisar sin compartir valores. No repetir intentos mientras no exista una corrección o explicación contractual.
2. **Completar el perfil confirmado del emisor.** Para el alcance inicial ya elegido de boleta, el código necesita idEmpresa, issuerRut, defaultDocumentType=BOLETA y receipt con tipoDte 39 o 41, encoding utf8 o latin1 y serviceIndicator 1, 2 o 3. El responsable debe confirmar cuáles corresponden; no adivinarlos. approved=true expresa esa aprobación, no debe copiarse de un ejemplo sin revisar. La regla implementada y elegida por el usuario continúa siendo un documento por pago/abono, PER_PAYMENT_V1.
3. **No exigir un rango de factura para probar solo boletas.** El constructor de boletas usa numeración automática del proveedor. invoice y sus folioFrom/folioTo son necesarios únicamente si se habilitan facturas 33/34; las facturas pueden quedar fuera de la primera activación. No inventar rangos ni interpretar un rango de QA como autorización fiscal.
4. **Preparar el entorno autorizado.** El operador deberá cargar solo los secretos backend de la empresa/ambiente correctos, con MAIL_PROVIDER=smtp y SMTP_COMPANIES/los prefijos ya verificados; nunca VITE ni archivos públicos. No combinar privados sandbox y production para reutilizar identidades. La auditoría local no carga secretos en Railway ni habilita flags persistentes.
5. **Revisión del esquema e integración de la entrega.** El responsable debe revisar el estado y las migraciones pendientes antes de aplicar la nueva migración. El 22-10, origin/develop es 3ee25df1; nuestra rama y develop tienen tres y 32 commits exclusivos respectivamente. G2 contiene cambios pendientes de incorporar, incluido el contrato tributario; no se realizaron merges. Primero integrar y validar el candidato acordado, luego aprobar publicación/despliegue por el flujo del equipo.
6. **Verificación posterior autorizada.** En el entorno final, validar configuración y health/readiness con integración aún desactivada; activar empresas y flags únicamente tras cerrar las comprobaciones anteriores. Una emisión productiva no es una prueba inocua aunque se escriban datos ficticios: queda fuera del alcance actual. La preparación sin clientes reales puede cerrarse sin efectuar esa emisión, pero no debe presentarse como una boleta productiva validada.

La [documentación REST](https://www.facturacion.cl/manualintegracion/apirestintegracion.php) describe login y token; la [documentación WebService](https://www.facturacion.cl/manualintegracion/integracionservicioweb.php) distingue credenciales de integración, acceso web y ambientes. La procedencia/ambiente de nuestros bloques queda declarada por el operador; el login fallido no permite certificar el emisor.

### Consulta concreta para el administrador/proveedor, sin secretos

Nuestro CRM integra mediante POST https://rest.facturacion.cl/login. Los bloques indicados como productivos de FiNet y Cable Mágico, cargados por separado y con RUT normalizado, reciben HTTP 200 con un objeto error y sin token. No emitimos documentos. Necesitamos confirmar la habilitación REST de cada emisor y comprobar que usuario, RUT y clave forman el bloque API completo correspondiente. Si el contrato de autenticación es distinto, indiquen su documentación. Las claves se cargarán únicamente en los privados; no deben enviarse por el grupo ni adjuntarse a capturas.

Estado: **PREPARADO_LOCAL / NO DESPLEGADO**. Este documento no autoriza merge, deploy, cambios Railway, smoke de escritura ni activación G1.

## Configuración del servicio

- Railway debe usar `backend/` como root y `backend/Dockerfile`.
- La imagen de producción compila Nest y Prisma y ejecuta `node dist/main.js` con `NODE_ENV=production`.
- `main.ts` escucha `PORT` en `0.0.0.0`, valida el rango del puerto, habilita shutdown hooks y aplica `REQUEST_TIMEOUT_MS` entre 1 y 120 segundos.
- `TRUST_PROXY_HOPS` acepta 0..10. En Railway se propone `1`; debe confirmarse contra la topología real antes del despliegue.
- En producción, CORS acepta solo los orígenes HTTPS listados en `FRONTEND_URL`. El wildcard de `*.devtunnels.ms` queda limitado a desarrollo.
- Helmet y `ValidationPipe` global continúan activos.

## Variables

|Variable|Condición|
|---|---|
|`DATABASE_URL`|Obligatoria; PostgreSQL válido y no placeholder.|
|`JWT_SECRET`|Obligatoria; al menos 32 caracteres y no placeholder.|
|`PORT`|Obligatoria en runtime Railway; entero 1..65535.|
|`FRONTEND_URL`|Uno o más orígenes HTTPS separados por coma.|
|`TRUST_PROXY_HOPS`|0..10; propuesto 1 en Railway.|
|`REQUEST_TIMEOUT_MS`|1.000..120.000; default 30.000.|
|`G1_INTEGRATION_ENABLED`|Debe permanecer `false` hasta aprobar el E2E con cierre originado por G3 real; la conciliación con cierre simulado por G1 ya está aprobada.|
|`G1_API_URL`, `G1_API_KEY`|Obligatorias solo si se activa G1. La key es la entregada por G1.|
|`G1_REQUEST_TIMEOUT_MS`|1..60.000; default 8.000.|
|`G8_PUBLIC_API_URL`|Opcional; si existe debe ser HTTPS y terminar en `/api`. Valor documentado: `https://team8-crm-production-3be0.up.railway.app/api`.|
|`G8_INTEGRATION_API_KEYS`|Opcional mientras no exista endpoint inbound; JSON con hashes SHA-256 y scopes, nunca keys reales.|

Variables SMTP, TomoDAT y otros módulos siguen siendo opcionales para no bloquear capacidades independientes.

## Validador

Ejecutar en el entorno preparado, sin pasar secretos como argumentos:

```powershell
npm.cmd run env:validate:production
```

`scripts/validate-production-env.mjs` informa solamente estados y códigos de error; no imprime valores. Verifica formatos, dependencias condicionales de G1, configuración multikey S2S y la activación productiva explícita/perfiles/credenciales de Facturación.cl. Un resultado estructural PASS no comprueba autenticación remota ni sustituye la revisión del esquema. El contrato G1 confirmado usa exclusivamente la key literal en `X-API-KEY`; no se define una segunda credencial.

## Health y verificaciones

Con prefijo global `/api`:

- `GET /api/health`: liveness de la aplicación, sin dependencia de BD.
- `GET /api/ready`: consulta la BD en transacción `READ ONLY`, con timeout, y verifica tablas/columnas/tipos/nulabilidad del contrato generado. No realiza llamadas externas.

Orden recomendado para el operador:

1. revisar diff, contrato e informes y realizar merge por el flujo acordado;
2. cargar secretos desde el gestor de Railway, sin pegarlos en Git o logs;
3. ejecutar el validador en un entorno con la misma configuración;
4. desplegar backend con root `/backend`;
5. comprobar `/api/health` y `/api/ready`;
6. mantener G1 desactivado aunque el smoke Railway y la conciliación interna G1 ya aprobaron; falta el E2E con cierre originado por G3 real;
7. no repetir el POST G1; ejecutar en otra ventana el E2E coordinado con G3 real;
8. ejecutar el smoke Billing de escritura solo en una ventana autorizada y con su flag explícito.

## Smokes pendientes

- Los GET reales de tipos, unidad y equipos por servicio aprobaron. Tras el cierre simulado por G1, equipos por servicio y unidad confirmaron instalación y asignación activa. No repetir los casos aprobados sin necesidad.
- `npm.cmd run smoke:billing:write`: preparado y **no ejecutado**. Aborta antes de conectarse salvo `ALLOW_RAILWAY_BILLING_WRITE_TEST=1`, se niega a correr con `NODE_ENV=production`, usa datos `TEST_G8_BILLING_*` dentro de una única transacción y fuerza rollback.
- El POST G1 autorizado confirmó activación, idempotencia y el estado válido `PENDIENTE_CIERRE`; la conciliación posterior aprobó tras el cierre simulado por G1. No repetir el POST. Migraciones y cambios de variables Railway no fueron ejecutados.

La advertencia Vite por un chunk cercano a 590 kB no impide el build, pero conviene planificar code splitting. La validación visual Billing sigue pendiente porque esta sesión no dispone del navegador integrado y el frontend no tiene framework de tests de componentes.

## Continuación frontend y Railway del 2026-09-30

El frontend ya tiene runtime productivo Nginx, `PORT` dinámico, `/health` y fallback SPA. Sus tests de configuración están en `npm.cmd run test:frontend-runtime`; el daemon Docker local no estaba activo, por lo que falta una prueba HTTP real de la imagen antes del deploy. Ver [readiness frontend](i3-frontend-production-readiness.md) y [configuración del servicio Railway](i3-railway-frontend-deployment.md).

La lectura Railway mediante `.env.railway` y TCP Proxy funciona. El contrato esperado coincide por completo, pero el verificador retorna `FAIL` por cinco objetos adicionales no aprobados, aparte de `_prisma_migrations`. Ejecutar `npm.cmd run db:verify:global:railway` y resolverlos mediante acuerdo global antes del deploy. Ver [verificación READ ONLY](i3-railway-readonly-verification.md).
