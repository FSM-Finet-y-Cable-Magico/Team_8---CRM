# Preparación de release QA — integración G8/G3

Fecha: 2026-11-08. Estado actual: receptor diferenciado REPARACION/INSTALACION, worker seguro y Compose QA; no publicación ni despliegue. Las secciones 1–13 conservan contexto y evidencia de las intervenciones anteriores; la sección 14 y el informe enlazado describen el candidato final actual.

## Decisión actual

```text
CANDIDATE_FILES_IDENTIFIED=true
CANDIDATE_FILE_COUNT=38
ISOLATION_PROOF=PASS
PLAN_CHANGE_PROCESSOR_QA_OPT_OUT=PASS
QA_STARTUP_LOCAL_SIMULATED=PASS
G3_APPROVAL_MOMENT_RATIFIED_BY_OWNER=true
G3_CONSTRUCTOR_SHAPE_RATIFIED_BY_OWNER=true
G3_DTO_EXPANSION=IMPLEMENTED_AND_TESTED_LOCAL
G3_NEW_RECEIVER_REAL_SMOKE=false
PRISMA_CANONICAL_STATIC_CHECK=PASS_FOR_MODELED_OBJECTS
GLOBAL_DATABASE_VERIFIED=false
QA_DEPLOY_AUTHORIZED=false
GO_DEPLOY_QA=false
RELEASE_READY=false
```

El bloqueo de código del worker queda resuelto para una imagen nueva con `PLAN_CHANGE_PROCESSOR_ENABLED=false`. El propietario ratificó APROBACION y el constructor del payload; el nuevo receptor acepta sus campos definidos y acusa reparaciones independientes sin procesamiento comercial. No arrancar todavía con escritura sobre la base global sin verificar catálogo, permisos, imagen y aislamiento de callbacks. Falta probar la imagen nueva contra G3 real: no se declara aceptación E2E ni autorización de despliegue.

No se conectó a VPS, PostgreSQL, Railway ni endpoints de proveedores. Se consultaron archivos locales, documentación oficial PostgreSQL y referencias públicas de código G3 en GitHub en modo lectura. No se ejecutaron migraciones, GRANT, seeds, pagos, commit, push, merge ni cambios en otros worktrees.

## 1. Base e inventario exacto

Rama actual: `Fix/integracionTerreno`. HEAD y referencia **local** `origin/develop`:

```text
fd24aeb169d6d227fd653032a7185db6097b62c7
```

El árbol de esa base coincide con el release `22e6cf1d85dcec8bc524f299729a8bbce2a7b8be`, ya documentado. No se hizo fetch durante esta tarea; antes de publicar habrá que actualizar referencias y detenerse si develop avanzó.

El candidato funcional inicial contenía **22 archivos: 12 productivos, 7 de pruebas y 3 documentos**. Su evidencia permanece conservada. La extensión del worker alcanzó 31 rutas; la adaptación ratificada del receptor completa **38 rutas publicables**, según sección 14. Los cambios adicionales superpuestos se incluyen selectivamente, sin incorporar trabajos ajenos.

| Grupo | Rutas exactas |
|---|---|
| Backend productivo | `backend/src/customers/customers.service.ts` |
| | `backend/src/g3-integration/g3-integration.types.ts` |
| | `backend/src/g3-integration/installation-activation.service.ts` |
| | `backend/src/g3-integration/installation-integration.service.ts` |
| | `backend/src/rut/rut.util.ts` |
| | `backend/src/tickets/ticket-ownership.ts` — nuevo |
| | `backend/src/tickets/ticket-work-order-state.ts` — nuevo |
| | `backend/src/tickets/tickets.service.ts` |
| Frontend productivo | `frontend/src/api.ts` |
| | `frontend/src/features/tickets/TicketManagementModal.tsx` |
| | `frontend/src/features/tickets/TicketsPanel.tsx` |
| | `frontend/src/features/tickets/ticket-presentation.ts` |
| Pruebas | `backend/src/common/company-response.http.spec.ts` |
| | `backend/src/g3-integration/installation-activation.service.spec.ts` |
| | `backend/src/g3-integration/installation-integration.service.spec.ts` |
| | `backend/src/rut/rut.util.spec.ts` |
| | `backend/src/tickets/tickets-authority.http.spec.ts` |
| | `backend/src/tickets/tickets-compatibility.spec.ts` — nuevo |
| | `frontend/tests/tickets-authority.test.mjs` |
| Documentación funcional | `docs/i4-g8-g3-integracion-terreno.md` — nuevo |
| | `docs/i4-g8-g3-integracion-terreno-validacion.md` — nuevo |
| | `docs/i4-g8-g3-integracion-terreno-revision-final.md` — nuevo |

Este informe es un archivo adicional de preparación fuera de los 22 originales. La propuesta actual incluye también la extensión de arranque/configuración QA de la sección 13; no utilizar la lista original como stage indiscriminado.

### Exclusiones

Se excluyen íntegramente los siete archivos de comentarios ajenos: `coverage-domain.service.ts`, `coverage.controller.ts`, `plans.controller.ts`, `plans.service.ts`, `tickets.controller.ts`, `CoverageZonesPanel.tsx` y `PlanZonesModal.tsx`, en sus rutas actuales. También se excluyen `-f`, output, respaldos, evidencias QA, `.env*` privados, node_modules, generated/dist y `.codex-review/`.

Hay tres comentarios previos dentro de archivos necesarios: RUT util, TicketsService y TicketsPanel. Para no arrastrarlos se preparó una **representación virtual de publicación que omite solo esas tres líneas**, sin borrar ni modificar ninguna de ellas en el worktree. No basta hacer `git add` de esos tres archivos completos: eso incluiría los comentarios anteriores.

## 2. Prueba inicial de aislamiento sin tocar ramas ni worktrees

Artefactos nuevos en `.codex-review/integracionTerreno-release-prep-20261108/`:

- `g8-g3-publication-only.patch`: 22 archivos y ningún cambio ajeno.
- `isolation-proof.json`: hashes del contenido validado y del contenido publicable, con exclusiones por archivo.
- `static-review.json` y `prisma-static.json`: dependencias y auditoría estática.
- `before-status.json`: inventario inicial de 93 rutas pendientes y sus hashes.

Hash SHA-256 del parche publicable:

```text
374c1bcce333f710f9a3478189ed328ffbfbaf82da06aaf75eea79816ae4a623
```

Comprobaciones ejecutadas:

1. Los 22 archivos coinciden con los hashes del último candidato validado.
2. Se reconstruyó la base desde objetos Git y se superpusieron únicamente los 22 contenidos, omitiendo virtualmente los tres comentarios previos.
3. `git read-tree <base>` sobre un índice temporal externo al índice real y `git apply --cached --check <patch>`: PASS. No se aplicó el parche al índice real ni se crearon objetos/commits/ramas.
4. TypeScript, sin emitir archivos, sobre ese árbol virtual: backend 231 archivos, frontend 100 archivos, cero diagnósticos.
5. HEAD y hash del índice real permanecen iguales. No se creó otro checkout ni se cambió de rama.

La diferencia respecto del código probado anteriormente se limita a comentarios omitidos de la representación publicable. Se conservan ambos hashes para revisión. Esto prueba aislamiento de contenido y compilación; no es una imagen Docker construida ni una certificación E2E.

### Evidencia de pruebas conservada

Los hashes de los 22 archivos coinciden con la evidencia de la revisión anterior: 536 pruebas dirigidas PASS; backend 1.488 PASS, 0 FAIL y 9 omitidas; frontend 120 PASS; herramientas 33 PASS. Los builds, Prisma y lint constan aprobados en esa revisión, con 77 advertencias frontend en archivos Dashboard no modificados. Son resultados previos verificados por correspondencia de contenido, **no suites completas reejecutadas en esta preparación**.

En la preparación inicial se ejecutaron el check del parche contra la base, compilación TypeScript virtual backend/frontend sin emisión, auditoría estática Prisma/canónico, consistencia de manifiestos/locks y el probe local de ValidationPipe de la sección 9.1. La revalidación posterior del worker/configuración se registra en la sección 13. No se ejecutaron instalaciones de dependencias, PostgreSQL ni pruebas S2S reales. El whitespace previo de `frontend/src/features/plans/PlanZonesModal.tsx:23` queda preservado y excluido del parche.

## 3. Propuesta de commits y publicación futura

**No ejecutado; requiere autorización posterior.**

Commit funcional propuesto:

```text
fix(i4): harden G8-G3 ticket and identity compatibility
```

Incluye exactamente los 22 archivos de la sección 1, desde el SHA base indicado. No incluye schema, migraciones, manifiestos, locks, Dockerfiles ni credenciales. No se dispone todavía de SHA de commit candidato: el SHA anterior es la base y el identificador disponible del candidato es el hash del parche.

Segundo commit documental opcional:

```text
docs(i4): document G8-G3 QA release gates and acceptance
```

Incluye únicamente este informe.

Secuencia segura propuesta:

1. Autorizar explícitamente commit/publicación y destino; hacer fetch y volver a comprobar base, permisos y política de hooks/firmas. Si develop cambió, no publicar automáticamente sobre una base obsoleta.
2. Usar el parche selectivo y su manifiesto. No usar `git add -A`, `git add .`, stash, reset ni copiar el worktree completo como paquete.
3. Para evitar tocar otros worktrees, puede construirse una nueva referencia de publicación desde un índice temporal dedicado: read-tree de la base, aplicación del parche solo a ese índice, revisión de diff/stat/check y lista exacta. La creación futura del árbol/commit/ref requiere aprobación; esta tarea solo ejecutó el check.
4. Esa alternativa debe ejecutar explícitamente los controles de seguridad, hooks y firma exigidos, porque los comandos de bajo nivel no ejecutan automáticamente todos los hooks de `git commit`. Si la política exige un checkout limpio convencional, preparar ese espacio solo con autorización adicional. No eludir controles.
5. Crear un único commit funcional revisado y una referencia nueva, por ejemplo `qa/i4-g8-g3-integration-20261108`, con comprobación de inexistencia para no sobrescribir ramas. El propietario puede elegir publicar Fix/integracionTerreno, pero no debe arrastrar su índice o contenido ajeno.
6. Push normal de la única referencia autorizada y PR Draft hacia develop, sin merge. Si GitHub devuelve 403, entregar comparación manual; no intentar sortear permisos.
7. Construir imágenes desde el commit aprobado/exportación limpia, registrar plataforma y digests, escanearlas y ejecutar aceptación. No construir desde este checkout con privados/artefactos locales.
8. Solo tras cerrar los bloqueantes y obtener autorización específica levantar QA; producción y el backend financiero existente quedan fuera.

## 4. Dependencias e imágenes

No hay nuevas dependencias del candidato. Se compararon manifests con la entrada raíz de sus tres locks, sin reinstalar paquetes ni sobrescribir node_modules:

- Locks raíz/backend/frontend: versión 3; nombre, dependencies y devDependencies coherentes.
- Prisma CLI y cliente resueltos: **5.22.0**, tanto en lock raíz como backend.
- Node declarado en raíz: `>=20.11`; Dockerfiles existentes usan Node 22 Alpine. NestJS 11, React 18 y los overrides de ExcelJS/UUID permanecen intactos.
- Backend `prod`: npm ci, Prisma generate y build en etapa de compilación; ejecución final `node dist/main.js`. No contiene una orden de migración al inicio.
- Frontend `prod`: build Vite y Nginx; su plantilla actual sirve estáticos y **no contiene proxy `/api`**. El proxy de vite.config.ts es solo de desarrollo.

No se ejecutó npm ci, Docker build ni auditoría nueva de vulnerabilidades en esta preparación. Los locks y Dockerfiles no cambiaron; quedan como controles del pipeline de imagen. Registrar arquitectura real VPS (amd64/arm64) y generar el engine Prisma en la plataforma correcta. No copiar el node_modules de Windows a Linux ni usar `npx prisma` en el contenedor de runtime para descargar herramientas.

Publicar imágenes G8 exclusivas etiquetadas con el commit y desplegar por digest. No reutilizar tags ambiguos ni las imágenes de G3. Registrar también los digests efectivos de las bases Node/Nginx usadas; sus tags actuales son mutables.

`.dockerignore` de backend/frontend excluye `.env` y dependencias locales, pero el build stage hace COPY del contexto. La exportación limpia aprobada evita enviar PDFs, respaldos o artefactos privados al daemon. Ninguna variable privada se pasa como build-arg.

## 5. Prisma frente al contrato global

Auditoría **estática y local**, sin conectar PostgreSQL ni ejecutar el CLI del auditor que escribe informes históricos. Se llamaron únicamente sus funciones puras, guardando resultados en la carpeta nueva.

| Elemento | Resultado |
|---|---|
| Hash SQL canónico | `0472cdc09051404b5c3c41de30de02d9c8859eb212cb2c02b8307c160da70f50` |
| Contrato canónico | 96 tablas, 982 columnas, 96 PK, 230 FK, 63 CHECK, 132 índices |
| Proyección Prisma | 63 modelos |
| Coincidencias auditadas | 929 MATCH |
| Diferencias con representación Prisma concreta | 0 |
| Objetos fuera de la proyección | 35 COLUMN_GLOBAL_ONLY, 325 OWNER_EXTERNAL, 53 INDEX_MISMATCH y 65 FK_MISMATCH con Prisma null |

Las últimas categorías indican elementos físicos no expresados en la proyección; no autorizan eliminarlos ni ejecutar db push. No significan que el catálogo remoto esté reconciliado. El candidato no incorpora DDL; sus migraciones locales permanecen sin cambios. Existen 17 carpetas históricas y no hay `migration_lock.toml` en el checkout inspeccionado. No usar este paquete como autorización para migrate deploy/resolve: el historial remoto no se ha consultado y se desconoce qué intentaría aplicar.

Preflight futuro a cargo del DBA, con autorización READ ONLY separada:

- Confirmar `current_database() = 'finet_global_validacion'`, servidor, versión, rol y search_path; nunca crm_g8_prueba.
- Catálogo fresco completo: tipos, nullability, defaults, PK/FK/índices/CHECK, secuencias, triggers y RLS; contrastar con el hash anterior y el verificador físico vigente, sin nuevas excepciones para forzar PASS.
- Revisar las 63 tablas usadas por Prisma y, especialmente, las tres de integración y los campos de snapshot/result necesarios para recuperación.
- Informar `_prisma_migrations` por nombre/estado/fecha si existe; no crearla ni reconciliar su historial automáticamente.
- Verificar permisos efectivos del rol runtime por separado. information_schema puede ocultar columnas que ese rol no ve; el catálogo global completo debe obtenerlo un rol de auditoría autorizado, no concediendo SELECT indiscriminado al runtime para que el verificador pase.

`/api/ready` comprueba columnas/tipos/nullability, no todos los constraints, permisos ni conectividad S2S. Puede devolver HTTP 200 con `global_schema=DEGRADED`. Exigir `database=UP`, `global_schema=READY`, missing/different=0 y catálogo/permisos aprobados. `g3_configured=true` solo acredita configuración, no autenticación real con G3.

## 6. Worker de cambios de plan: hallazgo y corrección controlada

Hallazgo original: `ContractsModule` registra `PlanChangeProcessor`, que iniciaba tick y timer sin opt-out. `ContractsService.applyDuePlanChanges()` busca hasta 100 cambios pendientes vencidos sin filtrar sesión QA ni empresa. Sus reglas y transacciones permanecen intactas.

Corrección implementada: `ConfigService` inyecta `PLAN_CHANGE_PROCESSOR_ENABLED`; solo el string exacto `false` deshabilita la instancia. Valor ausente, `true`, mayúsculas o espacios mantienen el funcionamiento previo. Con `false` no hay tick inicial, timer ni llamada a applyDuePlanChanges, incluso si se invoca tardíamente un callback. El apagado cancela el timer y bloquea ejecuciones posteriores; una transacción ya iniciada no se interrumpe a mitad.

Pruebas de ciclo de vida y arranque completo con Prisma simulado verifican ese opt-out. El Compose nuevo fija `false` en environment y no hereda env_file del backend financiero. Una imagen antigua ignoraría la nueva variable: comprobar commit/digest antes de arrancar.

Se mantiene la propuesta sin UPDATE de historial_cambio_plan para el rol del smoke. El opt-out no vuelve read-only las rutas comerciales ni sustituye la segregación de permisos/fixtures. No se debe comprobar su eficacia ejecutando operaciones en la base global.

Responsables de revisión operativa: G8, propietario financiero y DBA. No se cambió ninguna política financiera, dato histórico ni estado contractual.

## 7. Instancia QA independiente: procedimiento propuesto

El backend `finet-g8-prueba-backend-1`, su configuración, DATABASE_URL, red y volúmenes no se modifican. Su estado remoto actual no fue inspeccionado. No usar compose.vps.yaml/app.yaml ni `.env.vps` del proyecto existente para esta nueva sesión.

Propuesta, pendiente de revisión de infraestructura:

- Proyecto Compose nuevo: `finet-g8-g3-qa`.
- Directorio propio: `/srv/finet/grupo8/qa-g8-g3/`; no sobrescribir `/srv/finet/grupo8/crm`.
- Archivo Compose y configuración privada nuevos; permisos restrictivos y acceso solo del operador autorizado.
- No incluir servicio db, inicializadores SQL ni volumen PostgreSQL. DATABASE_URL QA debe apuntar exclusivamente al destino global autorizado, con credencial propia de menor privilegio y TLS acordado.
- Volumen de PDFs nuevo del proyecto QA, montado en `/app/generated`, conforme al cwd de la imagen. No compartir volúmenes PDF de la instancia financiera ni importar documentos reales. Verificar permisos de escritura sin chmod 777. El Dockerfile actual no declara USER: no afirmar que la imagen ya corre como usuario no privilegiado.
- Puertos propuestos, no comprobados: backend `127.0.0.1:18808→3000`; frontend opcional `127.0.0.1:18809→8080`. El operador debe reservarlos antes. No reutilizar 8800 ni puertos/redes/volúmenes G3.
- Nueva ruta HTTPS QA, sin modificar las rutas existentes de G3/G8. La persona responsable del proxy debe aprobar cómo llegar a esos loopbacks desde la infraestructura real; no asumir redes Docker compartidas entre daemons/rootless.

La configuración versionable completa está en `compose.g8-g3-qa.yaml`; la plantilla privada vacía en `config/g8-g3-qa.env.example`. Fuerza worker/proveedores deshabilitados y usa únicamente variables QA explícitas, sin heredar un env_file arbitrario. El siguiente fragmento describe la intención; usar el archivo completo y los comandos de la sección 13:

```yaml
services:
  backend:
    image: ${QA_BACKEND_IMAGE:?falta digest aprobado}
    environment:
      DATABASE_URL: ${QA_DATABASE_URL:?falta credencial propia QA}
      JWT_SECRET: ${QA_JWT_SECRET:?falta secreto nuevo QA}
      NODE_ENV: production
      PORT: "3000"
      FRONTEND_URL: ${QA_FRONTEND_ORIGIN:?falta origen HTTPS aprobado}
      G3_INTEGRATION_ENABLED: "true"
      PLAN_CHANGE_PROCESSOR_ENABLED: "false"
      G1_INTEGRATION_ENABLED: "false"
      MAIL_PROVIDER: disabled
      WHATSAPP_PROVIDER: disabled
      BILLING_NOTIFICATION_MODE: disabled
      FACTURACION_CL_INTEGRATION_ENABLED: "false"
      FACTURACION_CL_PRODUCTION_ENABLED: "false"
      FACTURACION_CL_DELIVERY_ENABLED: "false"
      GEOCODING_PROVIDER: MANUAL
      GEOCODING_API_URL: ""
    command: ["node", "dist/main.js"]
    ports:
      - "127.0.0.1:${QA_BACKEND_PORT:-18808}:3000"
    volumes:
      - qa_generated:/app/generated
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
volumes:
  qa_generated:
```

La red default de este proyecto es independiente. El acceso a PostgreSQL/G3 debe resolverse mediante destinos privados/HTTPS autorizados; no conectar por comodidad a redes existentes. El origen HTTPS exigido en producción debe configurarse incluso si inicialmente solo se usa API.

Variables privadas mínimas, sin valores operativos:

| Variable | Requisito |
|---|---|
| DATABASE_URL | Base global QA verificada, schema=public; usuario exclusivo, credenciales escapadas y TLS aprobado. Nunca copiar el valor financiero |
| JWT_SECRET | Nuevo secreto QA, mínimo 32 caracteres, sin placeholders; JWT humanos G8 aislados |
| G3_API_URL | Origen QA autorizado, sin duplicar `/api`; el cliente agrega `/api/integraciones/...` |
| G3_API_KEY | Credencial QA G8→G3 con empresas autorizadas; backend únicamente |
| G8_INTEGRATION_API_KEYS | JSON del guard vigente con keyId, group=G3, sha256, companies y active; claves QA nuevas, independientes por empresa cuando se acuerde |
| G3_REQUEST_TIMEOUT_MS | Valor revisado, inicialmente 8000 conforme al default; no aumentar para ocultar fallos |
| FRONTEND_URL | Lista exacta de orígenes HTTPS QA autorizados; no wildcard |
| G8_PUBLIC_API_URL | Solo metadato/script; **no registra ni cambia por sí mismo el destino del webhook G3** |
| G1_API_URL / G1_API_KEY | Vacías con G1 deshabilitado; si se simula, solo endpoint y clave del stub QA autorizado |
| SMTP / Facturación / WhatsApp / Tomodat | Sin credenciales heredadas; proveedores deshabilitados. Cobertura G3 solo contra su QA ratificado |

Para frontend, construir con VITE_API_URL apuntando al API QA HTTPS o proveer un proxy QA explícito. Poner VITE_API_URL en el entorno de Nginx después del build no se ha demostrado como mecanismo de configuración en esta imagen. No asumir el proxy Vite en el frontend prod.

Comandos **futuros y no ejecutados**, tras cerrar gates:

```sh
docker compose --project-name finet-g8-g3-qa --project-directory /srv/finet/grupo8/qa-g8-g3 --env-file /srv/finet/grupo8/qa-g8-g3/config/compose.qa.env -f /srv/finet/grupo8/qa-g8-g3/compose.qa.yaml config --quiet
docker compose --project-name finet-g8-g3-qa --project-directory /srv/finet/grupo8/qa-g8-g3 --env-file /srv/finet/grupo8/qa-g8-g3/config/compose.qa.env -f /srv/finet/grupo8/qa-g8-g3/compose.qa.yaml up -d --no-deps backend
```

No ejecutar `docker compose config` sin --quiet porque puede exponer secretos. No ejecutar comandos sobre finet-g8-prueba, `down -v`, prune, db push, migrate dev/deploy, seeds o init-global. Una instancia independiente de proceso **no aísla los datos** cuando comparte finet_global_validacion: confirmar que esa base es QA y aprobar cada fixture/operación.

## 8. Permisos PostgreSQL propuestos — sin concederlos

Perfil limitado al recorrido backend de integración, no a todas las pantallas del CRM. Rol runtime dedicado, no propietario, superusuario, creador de roles/DB ni BYPASSRLS; sin pertenencia a roles administrativos. Revisar permisos heredados y PUBLIC. No cambiar roles G1/G3 ni conceder ALL sobre public.

Requisitos generales: CONNECT a la DB QA, USAGE del schema public, SELECT/INSERT/UPDATE solo donde se justifica y USAGE de las secuencias que realmente alimenten INSERT. Un permiso de tabla no concede automáticamente el de su secuencia. Los bloqueos SELECT FOR UPDATE requieren además UPDATE sobre alguna columna. Estos criterios se contrastaron con [Privilegios PostgreSQL 15](https://www.postgresql.org/docs/15/ddl-priv.html) y [GRANT](https://www.postgresql.org/docs/15/sql-grant.html); confirmar la versión real del servidor antes de elaborar el DCL definitivo.

| Objeto | Acceso propuesto para el flujo | Justificación / límite |
|---|---|---|
| empresa, rol, usuario_rol | SELECT | Login, empresa y roles existentes; no equivalencias nuevas |
| usuario | SELECT y UPDATE(intentos_fallidos) | Login G8 reinicia/incrementa intentos; no alta de usuarios, cambios de rol/clave ni datos G3 |
| plan, zona_pago, cotizacion | SELECT | Plan, factibilidad y referencias existentes |
| cliente | SELECT, INSERT | Identidad nueva solo tras cierre validado; no UPDATE del estado financiero global |
| prospecto | SELECT, UPDATE de campos de conversión/seguimiento | estado_pipeline, id_cliente, motivo_perdida, fecha_conversion, tiempo_conversion_dias según flujo; ampliar solo si se autoriza corrección geográfica |
| contrato | SELECT, UPDATE(id_cliente, estado) | Activación del contrato objetivo y row lock cuando corresponda; no cambios de deuda/precio/plan |
| direccion_servicio | SELECT, INSERT | Dirección necesaria para el servicio activado; no modificación de direcciones firmadas |
| servicio_contratado | SELECT, INSERT y UPDATE de activación | id_direccion, estado_operativo, fecha_activacion, datos_tecnicos; referencia contractual validada |
| integracion_instalacion_g3 | SELECT, INSERT, UPDATE | Solicitud/snapshot, intentos, estado y bloqueo del tracking |
| integracion_evento_entrante | SELECT, INSERT, UPDATE | Evento idempotente y recuperación durable; incluido result JSON de P0-05 |
| integracion_activacion_g1 | SELECT, INSERT, UPDATE | Intención poscierre aun con envío G1 deshabilitado; no inventario físico |
| log_auditoria | SELECT, INSERT | Auditoría transaccional y recuperación; no UPDATE/DELETE de evidencia |
| ticket | SELECT; INSERT/UPDATE solo para pruebas CRM expresamente autorizadas | Consultar tickets G3 no requiere escritura. El grant no establece propiedad por estado |
| categoria_falla, orden_trabajo | SELECT | Lectura de categoría/OT; sin INSERT/UPDATE/DELETE del FSM |
| historial_cambio_plan | Como máximo SELECT para diagnóstico, sin UPDATE/INSERT | Worker apagado por PLAN_CHANGE_PROCESSOR_ENABLED=false; conservar mínimo privilegio |
| _prisma_migrations | Lectura con rol de auditoría, si existe | No es permiso de migración runtime |
| factura, pago, cuotas, imputaciones, tablas tributarias, inventario G1 y demás FSM | Ninguna escritura para este smoke | No dar permisos solo para evitar errores de rutas fuera de alcance |

Prisma suele seleccionar/retornar todas las columnas escalares del modelo: ajustar permisos por columnas exige verificar sus consultas reales en QA. Las columnas de UPDATE listadas son propuesta mínima; no declarar el rol completo aprobado sin probar login, tracking, cierre y recuperación. Crear prospectos, cotizaciones, firma/PDF desde cero o abrir todo Dashboard requeriría ampliar el perfil de lectura/escritura y revisar cada ruta; los fixtures mínimos deben prepararse por flujos autorizados previamente.

Las secuencias se identifican por catálogo (`pg_get_serial_sequence` o dependencias), no suponiendo nombres. No se requiere UPDATE de secuencia/setval, CREATE, ALTER, DROP, TRUNCATE, GRANT OPTION, nuevas FK ni extensiones para este candidato. Verificar EXECUTE efectivo de `pg_catalog.pg_advisory_xact_lock(integer,integer)` y acceso a catálogos; no ejecutar funciones de bloqueo como prueba durante el preflight READ ONLY.

Preflight de permisos propuesto: BEGIN READ ONLY; identidad/versión; has_database_privilege, has_schema_privilege, has_table_privilege/has_column_privilege, has_sequence_privilege, has_function_privilege y catálogo RLS/triggers; ROLLBACK. Las herramientas de inspección no deben mostrar URLs de conexión, passwords ni datos personales. No se incluyó ni ejecutó DCL.

Los GRANT de objetos no aíslan filas por empresa ni por sesión. El rol debe seguir las reglas RLS existentes, sin desactivarlas. Si se necesita una protección por filas que no existe, detenerse y acordarla con los propietarios; no introducir una política compartida automáticamente.

## 9. Coordinación G3 y aislamiento de callbacks

Antes del primer POST real QA, G3 debe confirmar origen, revisión desplegada, clave/scope, base y destino exacto del callback de **las nuevas OT QA**. El payload de instalación vigente no lleva callback_url: cambiar G8_PUBLIC_API_URL en G8 no garantiza que G3 deje de notificar al backend financiero existente.

G3 debe controlar sus destinos de fan-out, incluido G1. Desactivar G1 en G8 no impide que G3 llame por su cuenta a un G1 real. No modificar G3 en esta tarea; solicitar al responsable una ruta/estrategia QA que no intercepte cierres históricos ni envíe eventos a otros ambientes.

Si solo se acuerda reconciliación por GET de cierre, esa prueba valida reconciliación y se marca webhook NO EJECUTADO. No ejecutar un cierre cuyo fan-out tenga destinos desconocidos. No reutilizar OT 53/56 ni IDs históricos, ni asumir igualdad de técnicos G1/G3.

### 9.1. Diferencia HTTP detectada antes de la adaptación ratificada

Esta subsección conserva la evidencia del DTO anterior. El propietario autorizó posteriormente la adaptación del constructor y la separación de reparaciones; el comportamiento actual se documenta en la sección 14. El probe histórico no describe la respuesta del DTO nuevo.

`G3ClosureDto` admite correlaciones y los dos arreglos de equipos, sin `estado` ni campos técnicos adicionales. Ambas rutas HTTP de cierre usan ese DTO y `main.ts` configura `whitelist: true` y `forbidNonWhitelisted: true`. Las pruebas vigentes `g3-integration.dto.spec.ts` confirman expresamente el contrato **approval-only** y el rechazo de `estado`. No se modificó esa política ni el DTO.

La referencia G3 ya conservada localmente, repositorio `Team-3-FSM`, revisión `f834d63f06bc3799d65d881c33f47a1b601e6730`, contiene en `fsm/backend/src/integraciones/cierre-payload.spec.ts` asserts de `id_tecnico`, `usuario_tecnico`, `materiales` y `fecha_completada`, y exige coherencia entre reconciliación y webhook. Esto indica una diferencia de formas posibles; **no demuestra por sí solo qué revisión y payload envía hoy G3 específicamente a G8**.

Probe local nuevo, sin abrir servidor, red ni DB, usando el DTO actual y la misma configuración de `ValidationPipe`:

| Entrada sintética | Resultado local |
|---|---|
| Payload approval-only vigente | Aceptado |
| Mismo payload + id_tecnico, usuario_tecnico, materiales, fecha_completada | HTTP 400: propiedades no permitidas |
| Mismo payload + estado=COMPLETADA | HTTP 400: propiedad no permitida |

Evidencia: `.codex-review/integracionTerreno-release-prep-20261108/closure-contract-probe.json`; reproducción: `node .codex-review/integracionTerreno-release-prep-20261108/probe-closure-contract.cjs`. El probe transpila únicamente el DTO en memoria e instancia el pipe; no ejecuta AppModule, processor ni activación.

Antes de A09 se requiere que G3 confirme la forma exacta del webhook a G8, su momento de aprobación y las garantías de correlación. Si manda campos adicionales, esta versión de G8 los rechazará antes del processor. Aceptarlos exige ratificación y una corrección mínima posterior con pruebas HTTP, no retirar el whitelist ni filtrar arbitrariamente un evento firmado/idempotente. GET/reconciliación y datos técnicos históricos no equivalen a aceptación del mismo objeto por el DTO HTTP. No simular un cierre exitoso ni degradar las validaciones para aprobar el smoke.

## 10. Aceptación real prevista — NO EJECUTADA

Cada caso requiere autorización del propietario para escrituras QA, datos sintéticos nuevos y el catálogo/permisos aprobados. No usar fixtures financieros de crm_g8_prueba. Registrar alias QA, IDs generados, request/trace, hashes, status, cantidades antes/después y capturas reales cuando se use UI; no almacenar credenciales, RUT completos ni payloads personales en evidencia publicable.

| Caso | Petición/acción real futura | Criterio de aceptación |
|---|---|---|
| A00 Aislamiento | Operador comprueba proyecto/imagen/DB/rol nuevos y configuración existente preservada | Nuevo destino global QA; backend financiero, sus archivos y volúmenes sin cambios atribuibles al despliegue |
| A01 Salud | GET QA /api/health y /api/ready | UP/READY y verificación de catálogo/permisos independiente; no basta HTTP 200 |
| A02 Roles y empresa | Login QA de usuarios G8 autorizados; consultas propias/ajenas | Roles reales, usuario activo, aislamiento empresa 1/2; credencial S2S no concede rol humano |
| A03 Prerrequisitos | POST G8 /api/integrations/g3/installation-requirements sobre contrato QA firmado, plan y factibilidad válidos | Relaciones coherentes; falta de comuna se rechaza claramente, sin tracking ni POST G3 |
| A04 Solicitud | POST G8 /api/integrations/g3/installations por contrato de cada empresa; G8 consume POST G3 /api/integraciones/instalaciones | Un tracking y una OT por solicitud, wrapper compatible, id_empresa correcto, IDs dinámicos y snapshots persistidos |
| A05 Repetición idéntica | Repetir la misma solicitud G8; retry solo conforme a su política | Se conserva request_id/trace/snapshot. No OT/tracking adicionales; no regenerar IDs para forzar éxito |
| A06 Conflicto | Mismo request_id con datos distintos en una solicitud QA G3 acordada | HTTP 409 preservado, evidencia anterior intacta; no mutar el snapshot persistido para construir esta prueba |
| A07 Seguimiento | GET G8 tracking y GET G3 /api/integraciones/ordenes/:id?id_empresa=N | EN_CURSO informativo, correlación directa/anidada validada, cero activación por lectura |
| A08 Cruce y datos ajenos | Clave/usuario fuera de empresa; OT/referencias incompatibles mediante harness aprobado | Rechazo y cero escrituras cruzadas; no inyectar payloads inválidos sobre una OT de trabajo ajena |
| A09 Cierre real G3 QA | G3 completa técnicamente la OT nueva con usuario técnico propio y fan-out QA confirmado | Webhook S2S a /api/integraciones/fsm/ordenes/:id/cierre; correlación completa, transacción G8 y una activación del objetivo |
| A10 Duplicado de cierre | G3 reentrega exactamente el mismo evento QA autorizado | Un evento procesado, mismo cliente/servicio; hash distinto produce conflicto sin perder evidencia |
| A11 Reconciliación | POST G8 /api/integrations/g3/installations/:id/reconcile; obtiene GET G3 /cierre?id_empresa=N | Mismo resultado, sin activación adicional ni retroceso; cierre no disponible no se toma por fallo de request_id |
| A12 Recuperación | Fallo/reinicio controlado solo en la instancia QA y sobre fixture nuevo | Evidencia durable y recuperación sin duplicación; no simular cortes del backend financiero ni reiniciar G3 |
| A13 Identidad histórica | RUT sintético con puntos/K, otra grafía duplicada y cliente explícitamente vinculado | Ambigüedad bloqueada; sin fusiones ni cambios de identidad/global Moroso/Suspendido |
| A14 Tickets compartidos | GET /api/tickets de cada empresa con fila FSM QA conocida | Misma fila/estado/código, sin segundo POST G3. Estados técnicos/desconocidos solo lectura |
| A15 OT finalizada | Tickets CRM QA con OT Completada/COMPLETADA y mezcla con EN_CURSO/cancelada | Indicador correcto; diagnóstico/cierre comercial explícitos solo cuando procede; OT y finanzas intactas |
| A16 G1 | Deshabilitado por defecto; opcional stub QA autorizado | Intención/tracking correctamente correlacionados; no declarar equipos físicos asociados sin verificación G1 específica |
| A17 Preservación | Revisión operativa y auditoría QA antes/después | Ningún pago, emisión, envío, baja comercial, inventario o registro histórico ajeno alterado por los casos |

Fixtures mínimos: contratos QA nuevos de ambas empresas con prospecto y plan válidos, cotización con factibilidad real del flujo, usuarios G8/G3 autorizados, cliente compartido explícitamente relacionado y tickets/OT QA acordados. No inventar estados/IDs ni crear fixtures con SQL manual para evadir validaciones. La preparación de esos datos requiere aprobación separada.

A06/A08/A12 requieren un harness/fault injection aislado acordado: si G3 no autoriza esas perturbaciones, dejarlas NO EJECUTADO y conservar la evidencia local; no forzarlas sobre su entorno compartido.

Altas/ediciones/bajas S2S de clientes, adopción idempotente del ticket existente, escalamiento a reparación y cierre de reparaciones: **BLOQUEADO POR CONTRATO**, no pasos aprobables de este despliegue. POST G8 /tickets/:id/work-order debe seguir devolviendo 410 tras autorización. Activo/ACTIVO continúa pendiente con G3; no cambiar estados globales para poder crear tickets técnicos.

## 11. Rollback y condiciones de parada

Parar el smoke ante DB/rol inesperado, callback al ambiente equivocado, escritura no autorizada del worker, fuga empresarial, duplicación de OT/activación, hash o referencia incompatible, auditoría incompleta, error Prisma repetido, o modificación de recursos financieros/otros grupos.

Rollback por defecto: detener nuevas acciones QA y únicamente backend/frontend de `finet-g8-g3-qa`; coordinar con G3 detener/reencaminar los callbacks de esas OT. Conservar el volumen QA, snapshots, eventos, auditorías y logs saneados. No borrar tracking, cambiar IDs, regenerar event_id, resetear secuencias, ejecutar reversas financieras ni restaurar toda la base global.

Si se autoriza rollback de imagen, usar un digest G8 QA previamente validado y registrar su compatibilidad con las guardas nuevas; el digest anterior no se ha identificado. Detener QA es preferible a volver a un código que permita escrituras técnicas ambiguas. No tocar finet-g8-prueba-backend-1 ni imágenes, puertos, redes o volúmenes G3.

Una activación ya confirmada no se deshace al retirar la imagen: conservar evidencia y someter cualquier compensación a su procedimiento comercial. Si una transacción falló, comprobar rollback y recuperar con las mismas claves persistidas. Las escrituras QA aprobadas permanecen para revisión, no se limpian automáticamente.

Respaldos/restauración de la base global son responsabilidad del DBA coordinado con todos sus propietarios. Preparar backup verificable antes de escrituras; un restore total borraría operaciones concurrentes de otros grupos y nunca es rollback automático de esta aplicación.

## 12. Bloqueantes y responsables

| ID | Condición para permitir despliegue/smoke | Responsable sugerido |
|---|---|---|
| B01 RESUELTO LOCAL | Worker opt-out implementado y probado; verificar que la imagen QA incluya este cambio y el string exacto false | G8 + operador QA |
| B02 P0 | Catálogo, versión, migraciones, secuencias, triggers y RLS frescos de finet_global_validacion; ningún DDL implícito | DBA + propietarios globales |
| B03 P0 | Credencial runtime propia con privilegios efectivos revisados, sin escritura FSM/inventario/finanzas; fixtures exclusivamente QA | DBA + G8 |
| B04 P0 | Destinos de callbacks/fan-out G3 y G1 exclusivos de QA y empresa/scope confirmados | G3 + G8; G1 si participa |
| B05 P0 | Autorización explícita de commit/publicación, imagen QA y escrituras de cada caso | Propietario G8 y responsables intergrupo |
| B06 Operativo | Arquitectura, puertos libres, nueva ruta HTTPS/proxy, conectividad y persistencia PDF verificadas | Infraestructura G8/VPS sin afectar G3 |
| B07 Validación | Imagen reproducible construida desde commit aprobado y aceptación real registrada | G8 QA |
| B08 Funcional diferido | Ratificar vocabularios de cliente, autoridad/idempotencia de tickets y API comercial/retiradas | G8/G3; fuera del smoke de instalación ya pactado |
| B09 RESUELTO LOCAL / SMOKE PENDIENTE | Momento APROBACION y constructor ratificados. Receptor diferenciado y validado; falta aceptación real de la imagen nueva con callbacks/fixtures QA propios | G8 + G3 |

La instancia QA aún no se levantó. B01 queda cerrado a nivel de código/pruebas locales. B02–B07 siguen siendo verificaciones/autorizaciones operativas; B09 impide declarar aceptación completa del cierre G3. No se declara integración total ni producción lista.

## 13. Evidencia de la intervención anterior: worker seguro y preparación QA

El contenido siguiente registra el estado al cerrar el opt-out, antes de autorizar la ampliación del receptor. Sus informes/parches/logs no se sobrescribieron. Las referencias a DTO pendiente o candidato de 31 rutas son históricas; prevalece la sección 14.

### 13.1. Archivos de esta intervención

| Ruta | Cambio |
|---|---|
| backend/src/contracts/plan-change.processor.ts | Opt-out exacto false, default habilitado y guardas de apagado |
| backend/src/contracts/plan-change.processor.spec.ts | Arranque default/explícito, false sin tick/timer, apagado, callback tardío y no solapamiento; conserva prueba P2021 |
| backend/src/contracts/qa-disabled-startup.spec.ts | Arranque/apagado del grafo AppModule real con almacenamiento simulado, sin dotenv privado, escrituras, timers, fetch ni SMTP |
| backend/src/g3-integration/g3-closure.http.spec.ts | HTTP real local con DTO/guards/controllers/processor vigentes y almacenamiento/activación/transporte simulados |
| compose.g8-g3-qa.yaml | Proyecto, red, puertos y PDF independientes; proveedores apagados, sin DB/migraciones/seeds/build al arrancar |
| config/g8-g3-qa.env.example | Plantilla vacía de configuración propia; no credenciales financieras ni destinos reales |
| scripts/validate-g8-g3-qa-config.mjs | Preflight local sin conexiones ni valores impresos: destino DB, digests, puertos, orígenes y scopes G3 |
| scripts/g8-g3-qa-config.test.mjs | Seis pruebas de configuración y aislamiento Compose |
| docs/i4-g8-g3-preparacion-release-qa.md | Este informe actualizado |

Son nueve rutas en el diff incremental: ocho incorporaciones al candidato anterior más este documento ya preparado. Total acumulado: los 22 originales intactos + este informe + ocho rutas = 31. Sin cambios en DTO, processor de cierre, activación, contratos financieros, schema, migraciones, dependencias/locks ni Compose de la instancia financiera.

Evidencia selectiva nueva: `.codex-review/integracionTerreno-qa-unblock-20261108/g8-g3-qa-unblock-incremental.patch` (nueve rutas), `g8-g3-candidate-qa-safe.patch` (31 rutas contra la base), `final-evidence.json` (hashes por archivo, preservación, pruebas y compilación virtual sin emisión), `candidate-diff-stat.txt` y `git-status-final.txt`. La aplicación se comprobó únicamente con --cached --check en un índice temporal nuevo; no se aplicó al índice real ni se creó otra rama/worktree. Los 22 archivos anteriores coinciden byte por byte con su evidencia validada. De las 94 rutas pendientes iniciales solo se actualiza este informe; se añaden las ocho rutas autorizadas, sin alterar las demás.

Propuesta de commit adicional, **no creado**:

```text
fix(i4): isolate QA startup and disable plan-change worker explicitly
```

Base sigue siendo fd24aeb169d6d227fd653032a7185db6097b62c7. No hay SHA de commit/imagen nuevos: solo hashes de contenido/parches. Las evidencias previas y los tres comentarios ajenos superpuestos se mantienen; el parche acumulado excluye virtualmente esas líneas igual que el candidato anterior.

### 13.2. Qué declara realmente la referencia G3

Se leyó código público fijado a f834d63f06bc3799d65d881c33f47a1b601e6730. Fuentes: [constructor del payload](https://github.com/FSM-Finet-y-Cable-Magico/Team-3-FSM/blob/f834d63f06bc3799d65d881c33f47a1b601e6730/fsm/backend/src/ordenes/fan-out/payload-cierre.ts), [tipo de cierre](https://github.com/FSM-Finet-y-Cable-Magico/Team-3-FSM/blob/f834d63f06bc3799d65d881c33f47a1b601e6730/fsm/backend/src/ordenes/fan-out/fan-out-cierre.ts), [emisor HTTP](https://github.com/FSM-Finet-y-Cable-Magico/Team-3-FSM/blob/f834d63f06bc3799d65d881c33f47a1b601e6730/fsm/backend/src/ordenes/fan-out/webhook-fan-out.ts) y [momento de notificación](https://github.com/FSM-Finet-y-Cable-Magico/Team-3-FSM/blob/f834d63f06bc3799d65d881c33f47a1b601e6730/fsm/backend/src/ordenes/fan-out/momento-fan-out.ts).

| Campo | Referencia pública | G8 vigente y decisión actual |
|---|---|---|
| id_tecnico | Sale en el payload; ID del usuario de G3, nullable | Tipo/procesamiento técnico interno existente; no admitido por DTO HTTP. No buscar ni reasignar usuario G8/G1 por este ID |
| usuario_tecnico | Sale en payload, username G3 nullable | Ampliación HTTP y política de conservación/visualización pendientes; no equivalencia de identidades automática |
| materiales | Sale como lista de id_tipo_equipo, nombre y cantidad | Procesamiento interno existente; extensión HTTP pendiente. ID del catálogo G3 no equivale a inventario G1 |
| fecha_completada | Sale en payload | G8 interno la contempla; HTTP aún no. Atención: el constructor público usa fecha_creacion si falta fecha_completada; ratificar ese caso antes de usarla como fecha técnica de CU47 |
| estado | No es campo del PayloadCierre ni del constructor; se usa internamente para elegibilidad/seguimiento | Se conserva rechazo HTTP incluso para COMPLETADA. EN_CURSO nunca es cierre |

La referencia envía el objeto completo a cada destino; no muestra una proyección especial mínima para G8. Además de los anteriores, incorpora clave_idempotencia, tipo_ot, resultado_llamada, potencia_optica_dbm, resuelto_remotamente, cliente, direccion, categoria_falla y categoria_falla_otro. Aceptar solo cuatro campos nuevos **no bastaría** para compatibilidad completa. Las correlaciones pueden ser null en OT no originadas por G8: esas OT siguen siendo inadmisibles para nuestra activación.

El propietario ratificó en esta conversación que el contenedor QA tiene `CIERRE_FAN_OUT_MOMENTO=APROBACION`, destinos y claves G1/G8 configurados, y OT #1 aprobada/COMPLETADA con auditoría. Es evidencia aportada por el propietario: no se accedió a la VPS, no se consultó ni reejecutó esa OT y no se conocen aquí destinos/valores privados. El valor del momento queda ratificado **para ese entorno**, aunque la referencia pública tenga otro default. La forma exacta enviada por la revisión desplegada aún no está verificada.

Decisión expresa del propietario: **mantener la ampliación del DTO pendiente de ratificación**. Se conservan whitelist, correlaciones y approval-only. No se aceptaron campos arbitrarios, estados intermedios ni un booleano de aprobación inventado. La prueba HTTP de aceptación valida el contrato mínimo actual con un fixture sintético; no certifica el payload enriquecido ni la aprobación real del proveedor.

Antes de ampliar: obtener un fixture saneado del webhook QA efectivo (estructura/tipos/nullability, sin claves ni datos personales), revisión desplegada y ejemplos de retry. Ratificar campos y semántica de fecha. Si se aprueba una proyección enriquecida, probar que webhook y reconciliación producen la misma huella contractual: hoy la reconciliación proyecta campos técnicos seleccionados y el hash es del payload procesado. Agregar campos solo al DTO podría causar 409 falso entre ambos caminos. No recalcular hashes históricos, borrar eventos ni ignorar cambios incompatibles para resolverlo.

### 13.3. Auditoría de arranque y tareas periódicas

| Componente | Actividad al inicio / periódica | Aislamiento QA |
|---|---|---|
| PrismaService | Conexión; sin DDL/seed ni reparación | Credencial propia, catálogo/permisos a revisar antes de conectar realmente |
| PlanChangeProcessor | Tick y timer 60 s si habilitado | false exacto desactiva ambos; prueba del grafo AppModule y de apagado |
| FacturacionClIssuer | SELECT de catálogo incluso deshabilitado; timer 15 s solo si integración habilitada | Flags false, companies/profiles vacíos: no worker ni proveedor; no dar escritura tributaria |
| MessagingService | Worker 15 s solo con provider meta | disabled y companies vacías: sin consulta de cola ni timer |
| MailService | Con smtp valida configuración; no verifica servidor al inicio | disabled; prueba asegura cero createTransport |
| G1/G3 HTTP clients | Constructores sin envío; peticiones bajo demanda | G1 false y sin credenciales. G3 solo QA, sin solicitudes al arrancar |
| Cobertura/geocoding | Red bajo demanda | MANUAL y Tomodat sin credencial; cobertura G3 solo si se autoriza la acción QA |
| Recuperación G3/G1 | Recuperación bajo demanda, no scheduler | Sin proceso periódico nuevo; no disparar reconcile durante bootstrap |

La búsqueda de hooks, timers, colas y transportes no encontró otro worker de arranque en backend/src. Esto y la prueba de arranque simulado no reemplazan revisar triggers/RLS, permisos efectivos y configuración de la imagen real. El Compose no es un firewall: el operador debe controlar egress si requiere garantía de red independiente del código. Deshabilitar proveedores no deshabilita todos los endpoints financieros; mantener credencial mínima y casos autorizados.

### 13.4. Resultados locales actuales

| Control | Resultado real |
|---|---|
| Dirigidas G3/G1, contratos, tickets, RUT y clientes | 27 suites, 553 PASS, 0 FAIL |
| Regresión backend final | 88 suites PASS; 1.521 PASS, 0 FAIL, 9 omitidas en 5 suites opt-in |
| Regresión frontend | 120 PASS, 0 FAIL |
| Herramientas existentes | 33 PASS |
| Configuración/Compose QA | 6 PASS |
| Docker Compose config --quiet | PASS con variables sintéticas; sin daemon, pull, build ni contenedores |
| Build backend | PASS |
| TypeScript y build frontend | PASS; warning previo de bundle grande |
| Lint backend/frontend | 0 errores; 77 advertencias frontend previas en Dashboard |
| Prisma generate/validate | PASS, cliente 5.22.0, sin DB ni cambios de schema |
| Diff/whitespace selectivo | PASS en los 31 archivos; índice real vacío |
| git diff --check global | Whitespace previo en frontend/src/features/plans/PlanZonesModal.tsx:23, conservado y excluido |
| Escaneo saneado del candidato | Sin hallazgos de claves privadas/tokens de proveedor/URI DB no sintética; heurístico, no certifica todo el historial |

La regresión final incluye las 33 pruebas backend nuevas y la comprobación de cero SMTP al arrancar. Todos los procesos de prueba usaron entorno sintético, DB loopback puerto 1 no disponible, suites PostgreSQL opt-in deshabilitadas, transporte restringido a loopback y bloqueo de dotenv privados. El texto genérico de Prisma sobre `.env` no implica uso de credenciales: el guard está instalado antes de cargar dependencias y las lecturas privadas se rechazan. Los avisos QA_PRIVATE_ENV_NOT_LOADED son evidencia del bloqueo; las suites permanecen aprobadas.

El build Vite inicialmente falló por ACL del sandbox al ejecutar esbuild; pasó al repetir el mismo runner local con permisos de proceso ampliados y conservando las guardas de entorno/red. No se modificó vite.config.ts ni se relajaron controles de la aplicación. No hay defectos funcionales nuevos reportados por estas validaciones.

Comandos locales usados, con logs/evidencias nuevos en `.codex-review/integracionTerreno-qa-unblock-20261108/`:

```powershell
node .codex-review/integracionTerreno-qa-unblock-20261108/run-safe.mjs targeted plan-change.processor.spec.ts qa-disabled-startup.spec.ts g3-integration g1-integration tickets rut customers contracts post-closure
node .codex-review/integracionTerreno-qa-unblock-20261108/run-safe.mjs backend
node .codex-review/integracionTerreno-qa-unblock-20261108/run-safe.mjs frontend
node .codex-review/integracionTerreno-qa-unblock-20261108/run-safe.mjs tools
node .codex-review/integracionTerreno-qa-unblock-20261108/run-safe.mjs qaConfig
node .codex-review/integracionTerreno-qa-unblock-20261108/run-safe.mjs generate
node .codex-review/integracionTerreno-qa-unblock-20261108/run-safe.mjs prisma
node .codex-review/integracionTerreno-qa-unblock-20261108/run-safe.mjs backendBuild
node .codex-review/integracionTerreno-qa-unblock-20261108/run-safe.mjs frontendType
node .codex-review/integracionTerreno-qa-unblock-20261108/run-safe.mjs frontendBuild
node .codex-review/integracionTerreno-qa-unblock-20261108/run-safe.mjs backendLint
node .codex-review/integracionTerreno-qa-unblock-20261108/run-safe.mjs frontendLint
```

Los comandos de ese runner son evidencia local preservada, no un script para ejecutar sobre la VPS. PostgreSQL global, proveedores reales y aceptación visual siguen NO EJECUTADOS.

### 13.5. Publicación e imagen previstas, sin ejecutar

1. Revisar diff incremental de nueve rutas y acumulado selectivo de 31, escaneo saneado, hashes, exclusiones y pruebas. Mantener los pendientes ajenos fuera del índice.
2. Con autorización posterior, actualizar referencias y materializar únicamente el acumulado sobre su base en un contexto limpio aprobado, conservando hooks/firmas. Si develop avanzó, revisar integración y repetir lo afectado. No publicar el checkout completo ni usar git add -A.
3. Crear los commits revisados del candidato anterior y de esta extensión; registrar el SHA final. Publicar por push normal exclusivamente la rama autorizada y usar PR Draft, sin merge.

Comandos ilustrativos **solo después de tener un commit aprobado**; los marcadores no son valores reales:

```sh
git show --stat <SHA_CANDIDATO_APROBADO>
git push origin <SHA_CANDIDATO_APROBADO>:refs/heads/Fix/integracionTerreno
# Revisar si ya existe PR para esta rama; actualizarla, no duplicarla.
# Si no existe y el propietario autoriza su creación:
gh pr create --draft --base develop --head Fix/integracionTerreno --title 'fix(i4): preparar integración terreno y arranque QA seguro' --body-file <DESCRIPCION_REVISADA>
```

Imagen prevista: backend G8 con tag del SHA aprobado y despliegue por digest de manifiesto; frontend opcional con build API QA propio. No hay digest disponible ni registro seleccionado en esta tarea. Construir solo desde exportación limpia autorizada; arquitectura de VPS a confirmar:

```sh
docker build --platform <ARQUITECTURA_APROBADA> --target prod -t <REGISTRO_G8>/g8-g3-qa-backend:<SHA_CANDIDATO_APROBADO> ./backend
docker build --platform <ARQUITECTURA_APROBADA> --target prod --build-arg VITE_API_URL=<ORIGEN_API_QA_HTTPS>/api -t <REGISTRO_G8>/g8-g3-qa-frontend:<SHA_CANDIDATO_APROBADO> ./frontend
# La publicación de imágenes requiere autorización separada. Registrar RepoDigest
# efectivo después de publicar; un image ID local no es el digest del manifiesto.
```

Después de aprobación operativa, ensamblar únicamente Compose/config nuevos en `/srv/finet/grupo8/qa-g8-g3/`, fuera del proyecto financiero. El validador se ejecuta desde el código limpio revisado con Node 22, sin cargar `.env` del backend. Plantilla vacía: `config/g8-g3-qa.env.example`; el archivo privado no se versiona, publica ni imprime. El validador no conecta ni prueba que una credencial pertenezca realmente a QA: eso lo confirma DBA.

```sh
node --env-file=/srv/finet/grupo8/qa-g8-g3/config/qa.compose.env scripts/validate-g8-g3-qa-config.mjs
docker compose --project-name finet-g8-g3-qa --project-directory /srv/finet/grupo8/qa-g8-g3 --env-file /srv/finet/grupo8/qa-g8-g3/config/qa.compose.env -f /srv/finet/grupo8/qa-g8-g3/compose.g8-g3-qa.yaml config --quiet
# SOLO tras GO y autorización de arranque:
docker compose --project-name finet-g8-g3-qa --project-directory /srv/finet/grupo8/qa-g8-g3 --env-file /srv/finet/grupo8/qa-g8-g3/config/qa.compose.env -f /srv/finet/grupo8/qa-g8-g3/compose.g8-g3-qa.yaml up -d --no-deps backend
```

Compose interpola también la imagen del perfil UI aunque inicialmente solo arranque backend; configurar ambos digests revisados. No iniciar frontend sin comprobar VITE_API_URL del build. No reutilizar el env financiero, redes/volúmenes externos, puertos G3 ni ejecutar config sin --quiet. El preflight requiere DB exactamente finet_global_validacion y login propio no administrativo, pero TLS, ownership, permisos efectivos y procedencia de la credencial quedan a cargo del DBA. No conceder permisos mediante esta guía.

### 13.6. Gates de avance y parada

**GO para revisión/construcción posterior del candidato:** worker corregido, regresión aprobada, Compose validado y diff aislable. Todavía falta autorización para commit/push/build/publicación/despliegue; no se ejecutó ninguno.

**Arranque QA independiente en espera:** puede planificarse separado del E2E, pero exige primero catálogo/rol propios aprobados, backup a cargo DBA, imagen nueva por digest, puertos/proxy/persistencia propios y autorización explícita. Mantener nuevas claves/callbacks sin distribuir o enrutar hasta aprobación de la integración. No realizar POST ni reconcile mientras no estén acordados sus destinos y casos. No se modifica DATABASE_URL ni datos del backend financiero.

**NO-GO para cierre E2E G3:** hasta recibir el payload efectivo saneado y ratificar su compatibilidad con G8. APROBACION está confirmado por el propietario; eso no prueba la estructura del evento ni que los destinos G1/G8 actuales sean exclusivos de esta nueva instancia QA. No declarar ese smoke PASS por la OT #1 histórica.

Rollback: detener solo el proyecto QA nuevo y coordinar sus callbacks; conservar PDFs/eventos/auditoría. No rehabilitar el worker como prueba, revertir activaciones manualmente, restaurar la base global completa ni tocar finet-g8-prueba/G3. Si cambia la DB esperada, el scope, el payload o aparece cualquier escritura/envío inesperado, detener antes del siguiente caso.

## 14. Candidato final: receptor técnico diferenciado

Informe actual: [receptor de cierre G3 QA](i4-g8-g3-receptor-cierre-qa.md). La confirmación del propietario sobre OT #1 REPARACION explica por qué sus referencias de instalación eran null; ese evento no debía activar comercialmente nada. G8 ahora lo acusa con HTTP 200, received=true, processed=false, activated=false y code=G3_REPAIR_OUT_OF_INSTALLATION_SCOPE. No lee/escribe tracking, cliente, contrato, servicio, ticket, auditoría ni envía G1 para esa reparación independiente.

Instalaciones mantienen el resultado HTTP 201 anterior, referencias completas y correlacionadas, autenticación/scope, locks, transacción, idempotencia y recuperación. `estado` sigue prohibido en el webhook, incluso COMPLETADA. Los 22 campos reales del constructor se validan con tipos, límites y objetos anidados cerrados. Reparaciones que declaren referencias comerciales no nulas, tipos no pactados y contradicciones se rechazan; no se crea una bandeja ni se simula procesamiento.

Webhook y reconciliación conservan el mismo conjunto de campos y la misma huella para un cierre enriquecido. Cambiar un payload ya confirmado sigue causando conflicto; no se reescribieron hashes o datos históricos. El técnico G3 no se busca como usuario G8/G1 y sus metadatos no sobrescriben identidad, dirección comercial o inventario.

Esta intervención modifica diez rutas de código/pruebas G3 y dos documentos: dto, dto.spec, nuevo g3-closure-contract, controller, types, processor, processor.spec, installation-integration.service, su spec y g3-closure.http.spec, más ambos informes. Candidato acumulado: **38 archivos** desde la misma base; diff incremental: **12 rutas**. El worker, sus pruebas de arranque, Compose QA, plantilla y validador permanecen sin cambios respecto de la intervención anterior y vuelven a validarse.

Artefactos nuevos en `.codex-review/integracionTerreno-fanout-20261108/`: `g8-g3-fanout-incremental.patch`, `g8-g3-publication-final.patch`, `final-evidence.json`, `candidate-diff-stat.txt`, logs y resultados de pruebas. Los índices temporales se usan solo para comprobar aplicación/whitespace contra la base; el índice real permanece vacío. Los comentarios ajenos superpuestos siguen excluidos virtualmente.

Validación final local: 263 pruebas dirigidas, 1.560 backend aprobadas y 9 omitidas, 120 frontend, 33 herramientas y 6 configuración QA. Builds, lint sin errores, Prisma validate y Compose config --quiet aprobados; 77 advertencias frontend preexistentes. El candidato aislado compila sin los cambios ajenos, no contiene errores de whitespace y conserva 97 de los 102 pendientes iniciales byte por byte; las cinco diferencias son las rutas autorizadas de esta intervención. El único fallo del diff check global es el espacio final anterior en PlanZonesModal.tsx:23, excluido del candidato. Sin PostgreSQL real ni smoke externo: estos resultados no certifican el despliegue.

La propuesta de commit adicional es `fix(i4): separate G3 repair acknowledgements from installation activation`, todavía sin crear. No se construyó/publicó una imagen Docker ni existe digest nuevo. Se mantiene el procedimiento de publicación/imagen/Compose de 13.5, actualizado para revisar las 38 rutas y este diff incremental. No ejecutar git add indiscriminado ni comandos de publicación hasta autorización.

Bloqueos de código identificados del worker y de la recepción de reparaciones quedan resueltos localmente. Siguen pendientes: catálogo/rol/permisos y backup de finet_global_validacion, imagen revisada por digest, recursos/proxy independientes, autorización de arranque y casos QA, direccionamiento de callbacks/claves hacia la instancia nueva y smoke real de reparación/instalación. La discrepancia G1 reportada requiere su propio diagnóstico. El backend financiero, su DATABASE_URL y todos los datos compartidos siguen intactos.
