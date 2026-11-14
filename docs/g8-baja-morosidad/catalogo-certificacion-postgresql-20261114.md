# FINET — Catálogo y certificación PostgreSQL de morosidad

Fecha: 14-11-2026. Base local: `develop`, `8050653ecc60c7550853dcfb4648d1bf48abe1c5`; PR #92 conservado. **Preparación para revisión; no autoriza ejecutar SQL, crear QA, aplicar grants o activar integraciones.**

## 1. Evidencia y estado

Datos operativos confirmados por el propietario, no consultados de nuevo desde esta tarea:

- G8 conecta por socket Unix `/run/g8-global-pg`, rol `g8_app`, a `finet_global_validacion`, PostgreSQL central compartido.
- Se informaron 104 tablas públicas, catálogo `categoria_falla` vacío y cero filas en tickets/clientes/contratos/servicios/facturas de esa base consultada.
- `g8_retiros` no existe; 002/003 no están aplicadas. Permisos públicos principales/complementarios y cinco secuencias revisados sin faltantes.
- El PostgreSQL rootless G8 con datos comerciales no es desechable. **No usarlo ni usar `crm_g8_prueba` para ensayos.**

Que una base compartida tenga tablas vacías no autoriza cargar fixtures, alterar secuencias ni ejecutar pruebas negativas. Los resultados anteriores son una fotografía; repetir identidad/preflight antes de cualquier operación futura.

Esta entrega modifica únicamente dos propuestas SQL de catálogo (una nueva), el verificador privado 003, pruebas estáticas de límites y este documento. No modifica frontend/backend, migraciones ejecutables 002/003, grants, Prisma, SQL canónico, flags, contratos S2S o configuración.

## 2. Catálogo: contrato y propuesta

Fuentes comprobadas en código: `backend/src/tickets/ticket-attention-categories.ts`, `TicketsService.createWithdrawalTicket()` y helpers de `frontend/src/features/tickets/ticket-presentation.ts`. IDs y SLA pertenecen a PostgreSQL, no al orden de las opciones.

| Categoría | Uso actual que se conserva |
| --- | --- |
| Falla de Internet | Alta comercial genérica |
| Falla de TV | Alta comercial genérica |
| Cambio de plan | Alta comercial genérica; no ejecuta automáticamente un cambio contractual |
| Mudanza | Alta comercial genérica |
| Facturación y cobro | Alta comercial genérica; no ejecuta pagos |
| Consulta general | Alta comercial genérica; alias histórico `Consulta` conserva su ID y nombre almacenado |
| Baja de servicio | Séptima oficial, reservada al inicio guiado de morosidad del Libro de Control |
| Término de servicio | Categoría G8 separada, formulario y endpoint exclusivos; no es una octava alta genérica G2/G8 |

Las categorías técnicas de G3 e internas WiFi/chatbot se conservan. No insertar categorías técnicas como sustituto de las oficiales, no duplicar Consulta con Consulta general, no cambiar IDs/SLA ni relajar permisos.

### Propuesta nueva: `db/proposals/g8-attention-catalog.sql`

Prepara las siete oficiales incluso si el catálogo está vacío. No usar en ese caso la propuesta histórica C2-TK-01, que solo agrega Facturación y cobro/Baja. Esta última queda intacta como antecedente, no como procedimiento para la base vacía.

Controles del nuevo script:

1. Requiere el catálogo compartido con `tipo`; no añade ni altera columnas.
2. Exige aprobación explícita `finet.attention_catalog_reviewed='on'` y un manifiesto JSON de exactamente siete entradas canónicas. No basta una marca para fabricar SLA.
3. Cada entrada exige `nombre`, `sla_horas` y `fuente` de aprobación. `sla_horas` debe ser SMALLINT o `null` explícito, sin fallback. `null` significa SLA no definido, nunca cero ni plazo aprobado implícitamente. El propietario debe aprobar esa ausencia si la elige. No se obtuvieron SLA normativos nuevos; los valores de fixtures no son una fuente aprobada.
4. Verifica secuencia real con `pg_get_serial_sequence` y dependencia del default/identity. INSERT omite `id_categoria`, utiliza el generador existente y fija **`tipo='ATENCION'`**. No ejecuta setval ni impone rangos de IDs.
5. Normaliza NFC, mayúsculas/minúsculas y espacios Unicode, incluido NBSP/BOM. Solo aplica el alias Consulta→Consulta general ratificado; no elimina acentos ni traduce nombres técnicos.
6. Antes del primer INSERT revisa todos los objetivos: duplicados, ID positivo, tipo ATENCION y SLA coincidente con el manifiesto si ya existe. Si hay una fila técnica/interna con nombre equivalente, aborta y conserva los datos; no la convierte silenciosamente.
7. Solo inserta faltantes. Un catálogo sin cambios y la misma aprobación produce cero filas nuevas en la repetición. No se ejecutó esa repetición: debe demostrarse en QA.
8. `LOCK TABLE ... SHARE ROW EXCLUSIVE` serializa escritores concurrentes, incluidos dos operadores. Se exige READ COMMITTED para no reutilizar snapshots anteriores a la espera del lock. No se crea una restricción pública de unicidad; un escritor ajeno posterior todavía podría introducir duplicados y debe coordinarse.

Si aparece una secuencia/default desalineado, ID repetido por generador atrasado, tipo o SLA inconsistente, el script falla; no corrige esos hechos. Revisarlos y pedir autorización por separado.

### Propuesta revisada: `db/proposals/g8-termino-servicio-catalog.sql`

Mantiene la autorización separada `finet.catalog_termino_reviewed='on'`, el mismo lock y el uso real de secuencia/ATENCION. Se elimina la selección arbitraria de Baja mediante ORDER BY/LIMIT y el fallback de tipo ausente.

Dos fuentes posibles de SLA, a aprobar:

- Sin entrada adicional: copiar exactamente el SLA de **una sola** Baja de servicio ATENCION válida, después de aprobar ese criterio. Si la fuente tiene NULL, se conserva como desconocido; no se inventa un número. Ausencia, duplicados o tipo incorrecto abortan.
- Entrada explícita `finet.catalog_termino_sla`: objeto con `sla_horas` y `fuente` aprobada; puede operar sin depender de una Baja todavía no creada. La secuencia recomendada sigue siendo siete oficiales primero y término separado después.

Una categoría término existente ambigua, mal clasificada o con SLA distinto al aprobado produce error, sin UPDATE. La repetición con fuente/datos iguales no inserta filas. No afecta el contrato de siete categorías ni habilita automáticamente el alta genérica reservada.

### Plantilla de aprobación, no manifiesto ejecutable

El propietario debe completar siete entradas, por ejemplo:

```text
nombre: Falla de Internet
sla_horas: <entero aprobado o null expresamente aprobado>
fuente: <documento, acta o referencia verificable de aprobación>
```

Repetir para los otros seis nombres canónicos. No se entrega un JSON con números de prueba que pueda confundirse con una política comercial. Una referencia corta o inexistente aborta, pero el script no puede autenticar por sí mismo la validez de un acta: el ejecutor y revisor deben contrastarla.

## 3. Corrección W5 de la verificación 003

`003_withdrawal_voluntary_termination.verify.sql` conserva BEGIN READ ONLY y ROLLBACK. W5 ya no interpreta todo aviso NULL como error:

| Causa / aviso | Resultado esperado |
| --- | --- |
| MOROSIDAD, positivo | Válido |
| MOROSIDAD, NULL | `vinculos_sin_aviso_morosidad` aumenta |
| VOLUNTARIA, NULL | Válido, todos los contadores de anomalías permanecen en cero |
| VOLUNTARIA, no NULL | `voluntarios_con_aviso_invalido` aumenta |
| Causa ausente/desconocida | `causas_ausentes_o_invalidas` aumenta |
| Aviso no positivo | `avisos_no_positivos` aumenta |

La proyección JSON permite consultar con 002 antes de que exista causa; se informa `NOT_APPLIED_CAUSE_COLUMN_MISSING`, incluso con tabla vacía. No confundir cero anomalías con migración aplicada. El verificador requiere que exista solicitud_ticket de 002; no ejecutarlo sobre el esquema totalmente ausente.

Los demás límites del diagnóstico anterior siguen vigentes: capabilities de runtime solo prueba existencia; W2/W3 no certifican todas las definiciones; las ACL directas no bastan; V6 puede ser costoso e inválido como comparación causal ante escritores concurrentes. V2 de 002 comenta tres tablas: tras 003 deben existir **cuatro**, no eliminar término para satisfacer ese comentario histórico.

## 4. Matriz de permisos mínimos

El propietario QA administra esquema/datos sintéticos. El runtime es un rol distinto, sin superusuario, CREATEDB, CREATEROLE, BYPASSRLS, propiedad o grant option. El usuario de la base central no se modifica.

| Objeto | Runtime requerido | Prohibido para este almacenamiento |
| --- | --- | --- |
| Base QA | CONNECT | Administración/creación de bases |
| `g8_retiros` | USAGE | CREATE/propiedad |
| solicitud_ticket | SELECT, INSERT | UPDATE, DELETE, TRUNCATE |
| solicitud_g3 | SELECT, INSERT, UPDATE | DELETE, TRUNCATE |
| recepcion_g1 | SELECT, INSERT | UPDATE, DELETE, TRUNCATE |
| termino_servicio | SELECT, INSERT y UPDATE solo `cierre_tecnico_en` | UPDATE global/otras columnas, DELETE, TRUNCATE |
| Esquema public | USAGE | CREATE para el runtime |
| empresa/usuario/direccion_servicio/categoria_falla/orden_trabajo | SELECT en el flujo | Crear categorías, usuarios, roles u OT como consecuencia de este flujo |
| solicitud_retiro_servicio/ticket | SELECT, INSERT, UPDATE de operación autorizada | DELETE/TRUNCATE |
| cliente/contrato/servicio_contratado | SELECT y UPDATE de estados del flujo, incluidos locks FOR UPDATE | Reasignar empresas, borrar historia |
| prospecto | SELECT e INSERT condicional de excliente | Reescritura automática de históricos |
| log_auditoria | INSERT y lecturas requeridas por RETURNING | Borrar/modificar evidencia |
| evento_gestion_comercial | SELECT; INSERT si se prueba registro real de gestión/aviso | Alterar avisos pasados |
| factura/pago/convenio_pago/prorroga_pago | SELECT del flujo de retiro | DML financiero por el motor de retiro |
| Secuencias de INSERT públicos | USAGE en las concretas utilizadas | setval/UPDATE de secuencia o grants generales |

Las pruebas de pagos/convenios se preparan por owner o por servicios financieros autorizados **solo en QA**; no justificar grants productivos nuevos por necesidades de fixture. Los cinco permisos de secuencia reportados por el propietario son evidencia operativa previa; comprobar nombres/defaults reales en el preflight.

Concesiones privadas exactas: grants 002 y 003 existentes, sin cambios. Revisar `has_schema_privilege`, `has_table_privilege`, `has_column_privilege` y `has_sequence_privilege`, membresías, propietario y RLS. GRANT es acumulativo: los archivos no eliminan privilegios excesivos ya existentes. No confundir UPDATE de cierre_tecnico_en con UPDATE global.

## 5. Diseño QA realmente aislado

**No creado ni arrancado.** Diseñar un clúster PostgreSQL local nuevo y desechable, base `g8moro_<identificador>`, directorio/volumen propio con sentinel UUID, puerto libre ligado exclusivamente a `127.0.0.1`, sin red/volumen/socket de la VPS, Docker G8 o PostgreSQL central. No montar `/run/g8-global-pg`, no aceptar una URL arbitraria/túnel y no cargar `.env` del repositorio.

Atestación antes de cualquier DDL/fixture: UUID del ensayo, PID/contenedor propietario, ruta/volumen, system_identifier cuando sea accesible, base, usuario, puerto, postmaster start y versión. Deben corresponder al recurso creado por el harness, no solo al nombre o IP. Impedir reutilización de un directorio/volumen o URL de ejecución anterior. Preservar evidencia; limpieza posterior solo del recurso cuya identidad se verificó y con autorización.

El clúster tendrá owner QA y runtime QA separado, contraseñas sintéticas privadas y sin secretos operativos. No arrancar AppModule con configuración heredada. Invocar servicios bajo prueba con Prisma y clientes G1/G3 mockeados; si se requiere HTTP, usar servidores loopback del ensayo, sin acceso a proveedores. No activar flags del backend desplegado.

### Contrato compatible y datos

- Obtener el DDL integrado revisado de la versión candidata y contrastarlo con los metadatos del esquema central reportado. `db/global/init-global.sql` describe categoria_falla de tres columnas, mientras el entorno compartido tiene cuatro. **No declarar paridad por cargar solo ese archivo.** La fixture QA deberá incluir `tipo` y las extensiones/dependencias necesarias del contrato integrado, en el nuevo clúster y bajo aprobación de su DDL.
- Inventariar tablas/columnas/constraints/índices/secuencias y Prisma por superficie utilizada. Las 104 tablas reportadas no implican que las 104 estén documentadas íntegramente en el init local. Si falta el DDL de una extensión necesaria, pedir definición saneada al propietario; no improvisarla ni modificar el SQL canónico.
- Usar exclusivamente empresas, roles, personas, contratos, planes, facturas, pagos, avisos y equipos sintéticos. No copiar dumps comerciales o personales de la base rootless. No usar las OT reales ni reconciliarlas.
- No ejecutar el helper existente `createCluster` sin revisión: su configuración/base de P0-05 no es automáticamente un harness `g8moro_*`. Reutilizar patrones de aislamiento, no llamar scripts que aprovisionan o limpian recursos durante esta fase.

### Bloqueantes del harness actual

La spec `withdrawal.storage.postgres.integration.spec.ts` tiene once casos opt-in. El guard de URL no demuestra aislamiento por sí solo. Algunos casos pueden confirmar escritura si el error esperado no ocurre; la prueba de permisos intenta DELETE globales y UPDATE global de recepción fuera de rollback. Algunas pruebas omiten assertions cuando faltan tablas públicas. Los fixtures insertan padres públicos con el rol runtime, y dos claims secuenciales no prueban concurrencia entre conexiones.

**No ejecutarla aún.** Antes: aprobar endurecimiento del harness para atestar clúster, preparar padres con owner QA separado, exigir contrato completo, envolver incluso las pruebas de denegación en transacciones que siempre aborten y sumar conexiones independientes. No otorgar permisos excesivos al runtime para satisfacer fixtures. El rollback no neutraliza secuencias, funciones/triggers externos o conexiones proveedor: también deben estar aislados.

## 6. Orden de aplicación y verificaciones futuras

Todo este apartado es una propuesta, no una ejecución autorizada.

| Paso | Responsable y control | Resultado requerido |
| --- | --- | --- |
| 0. Revisión | Propietario + G8 + dueños del catálogo G2/G3 | Aprobar SHA/diff, SLA/fuentes, alcance y QA nueva; no permiso productivo implícito |
| 1. Identidad/preflight | DBA/QA | Atestación de clúster/DB/rol, metadatos, permisos, flags y consumidores; esquema privado ausente/parcial/completo clasificado |
| 2. Respaldo | Owner QA; en futura central, DBA coordinado | Dump y manifiesto privado con hash; restauración probada en otro destino autorizado; conservar roles/ACL |
| 3. Contrato sintético | Owner QA | DDL completo compatible y padres sintéticos aprobados; sin datos reales |
| 4. Preverify 002 | Owner QA/read-only | Guardar catálogo y hashes públicos en QA quieta; 003 verify todavía NO si no existe solicitud_ticket |
| 5. 002 | Owner del esquema privado | Aplicar archivo exacto, transacción propia y timeouts; nunca db push/migrate dev |
| 6. Preverify 003 | Owner QA/read-only | causa ausente informada; restricción aplicada aún exige recepción G1 |
| 7. 003 | Owner privado | Causa, aviso nullable, CHECK aplicado sin G1 y termino_servicio presentes |
| 8. Grants 002 y 003 | Owner privado | Runtime mínimo; usar `-v g8_runtime_role=<rol_QA>` y ON_ERROR_STOP; no propietario/superusuario |
| 9. Postverify | DBA + G8 | Cuatro tablas/61 columnas/30 constraints/13 índices, permisos efectivos, cero FK privadas y ausencia de drift; W5 correcto |
| 10. Catálogo | Owner catálogo | Siete oficiales con manifiesto aprobado; término separado. Paso DML autorizado aparte, no parte de 002/003 |
| 11. Repetición/concurrencia | QA aislada | Catálogo sin filas nuevas en repetición y dos sesiones; migraciones reejecutables sin pérdida; revisar locks y defaults |
| 12. Funcional | QA/G8 con G1/G3 simulados | Matriz del apartado 7, evidence de filas/estados/envíos/rollback, no solo status HTTP |

Hashes públicos de 002 deben compararse antes/después de la DDL en QA sin escritores. La inserción autorizada de catálogo es un cambio de datos aparte: se espera su diferencia y se verifica que ninguna tabla ajena cambie. 003 recrea CHECK al repetirse y toma locks privados: idempotencia de estado final no implica coste/locks cero.

### Forma de ejecución manual posterior

Ejemplo de estructura, deliberadamente sin valores SLA, credenciales ni conexión ejecutable:

```text
psql -X -v ON_ERROR_STOP=1 -d service=<alias_QA_atestado>
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SET LOCAL finet.attention_catalog_reviewed='on';
SET LOCAL finet.attention_catalog_sla='<JSON de siete entradas aprobado>';
\i db/proposals/g8-attention-catalog.sql
-- Revisar con SELECT IDs/nombres/tipos/SLA. Confirmar solo si concuerda con el acta.
COMMIT;
```

Término se revisa en una transacción separada, con `finet.catalog_termino_reviewed` y fuente aprobada/copiar Baja válida. Las marcas son guardas operativas, no un control de autenticación sustituto del DBA. No ponerlas en `.env` o en el backend. Los grants deben ejecutarse mediante un wrapper psql con ON_ERROR_STOP y control transaccional; sus archivos solos no forman una transacción conjunta. No agrupar sin revisión BEGIN/COMMIT externos con las migraciones que ya contienen sus propias transacciones.

## 7. Matriz de pruebas a preparar y ejecutar tras aprobación

| ID | Escenario PostgreSQL / G1-G3 simulado | Evidencia exigida |
| --- | --- | --- |
| CAT01 | Catálogo vacío + siete SLA aprobados; tipo default INTERNA | Siete filas ATENCION explícitas, IDs generados reales; no asumir rango |
| CAT02 | Repetición idéntica y dos sesiones concurrentes | Siete filas totales, mismo conjunto ID/nombre/SLA; una sesión espera o falla por timeout sin duplicar |
| CAT03 | Consulta histórica; espacios Unicode/caso/NFC | ID/nombre/SLA original preservados; no nueva Consulta general |
| CAT04 | Consulta+Consulta general duplicadas o nombre oficial técnico/interno | Error antes de insertar; ninguna conversión ni fila parcial |
| CAT05 | Manifiesto ausente/parcial/duplicado/SLA inválido o sin fuente | Error; catálogo intacto. NULL solo explícito y aprobado |
| CAT06 | Secuencia ausente/default incongruente/ID collision | Error sin reparaciones automáticas; secuencia no se reinicia |
| CAT07 | Término: Baja única, ausente, duplicada y SLA independiente aprobado | Fuente válida o bloqueo; ningún ORDER BY/LIMIT que elija una fila arbitraria |
| CAT08 | Siete completas con término e internas/técnicas | Seis genéricas; Baja reservada, término su formulario, WiFi/chatbot no ofrecidos; históricos legibles |
| MIG01 | Nueva instalación y evolución desde 002 con vínculos sintéticos previos | Definiciones finales, filas históricas MOROSIDAD/aviso preservadas, grants mínimos |
| MIG02 | W5 antes de 003, vacío y casos válidos/inválidos | NOT_APPLIED antes; VOLUNTARIA/NULL no genera falso positivo; conteos de anomalías exactos |
| SUS01 | Deuda exigible sobre umbral backend configurado | GET sin escritura; confirmación manual suspende solo contrato/servicios de empresa correcta; auditoría atómica |
| SUS02 | Umbral límite, sin deuda, prórroga vigente, convenio activo | Corte rechazado de acuerdo con reglas existentes; estados intactos |
| SUS03 | Pago parcial/total, factura anulada y prórroga vencida | Saldo exigible real sin inventar deuda; no borrar pagos ni activar sin evidencia G3 |
| MOR01 | Servicio suspendido + gestión/aviso + deuda, inicio guiado | Una solicitud, ticket Baja, vínculo, snapshot/hash/request/trace y auditorías en misma transacción |
| MOR02 | Falta aviso, no suspendido, empresa ajena, IDs contradictorios | Rechazo sin filas parciales ni envío |
| VOL01 | Requerimiento autorizado de titular/representante | Término comercial inmediato, ticket exclusivo, evidencia/fecha/canal; no espera G1/G3 |
| VOL02 | Cliente con deuda/convenio | Deuda, pagos y facturas conservados; sin fabricar aviso de morosidad |
| VOL03 | Datos técnicos incompletos o G3 no ratifica VOLUNTARIA | Término comercial conservado; retiro técnico pendiente/bloqueado, cero envíos como MOROSIDAD |
| VOL04 | Dos servicios en contrato y cliente compartido entre empresas | Solo servicio objetivo termina; contrato/cliente se recalculan sin afectar otra relación operativa |
| VOL05 | Retiro MOROSIDAD previo enviado/no enviado | Reutilizar/cancelar según política existente, sin segunda OT ni segunda baja comercial |
| CON01 | Dos conexiones inician mismo servicio y repetición tras reinicio | Un request/ticket/snapshot persistido; no depender de memoria; locks probados |
| CON02 | Finalización MOROSIDAD concurrente con VOLUNTARIA/pago | Una terminación comercial; decisión coherente; sin pérdida de deuda/evidencia |
| RB01 | Fallos al crear ticket/vínculo/snapshot/evento/auditoría | Rollback de todas las filas comerciales y privadas; no envíos externos dentro de transacción |
| G301 | EN_CURSO/PENDIENTE_APROBACION/GET COMPLETADA sin cierre | No aplicar baja por GET ni sin evidencia aprobada y correlacionada |
| G302 | G3 COMPLETADA + cierre baja:id_ot válido, sin recepción G1 | Baja comercial una vez; ticket/solicitud cierran; deuda conservada |
| G303 | Empresa/cliente/contrato/servicio/trace/request/OT contradictorios | Rechazo con evidencias previas conservadas; no activación ni baja ajena |
| G304 | Cierre repetido idéntico/hash incompatible y HTTP tardío | Idempotencia/conflicto; no sobrescribir snapshot ni estado posterior |
| G101 | Recepción pendiente/parcial/NO_RECIBIDO/sin equipos/fallo | Informativo, no veto automático a baja aprobada G3; avisos auditados |
| G102 | Versiones G1, misma clave repetida/cambiada, equipo empresa ajena | Insert-only; conflicto de versión incompatible; historia preservada; no inventar equipos |
| PER01 | Runtime permisos mínimos y actor de otra empresa | Operaciones autorizadas funcionan; denegación efectiva de DELETE/TRUNCATE/UPDATE indebido en transacciones siempre abortadas |
| PER02 | Privilegios excesivos o schema drift | Preflight bloquea el runner antes de cualquier prueba negativa peligrosa |

Registrar por caso: UUID QA, definición/hash/rol, estado inicial/final y número de filas por entidad, envíos simulados por request, decisiones, rollback, PASS/FAIL/NOT_EXECUTED. No imprimir payloads personales o secretos. Los valores QA de SLA/umbral son fixtures explícitos y no se promueven como política productiva.

## 8. Riesgos, recuperación y autorizaciones

| Riesgo / decisión | Control y responsable |
| --- | --- |
| Falta SLA aprobado para catálogo vacío | Propietario comercial/G2/G3 ratifican siete valores o ausencia explícita; no usar los de tests |
| Falta DDL exacto de extensión global | DBA entrega/revisa metadatos saneados y fixture integrada; no alterar SQL canónico a ciegas |
| Locks/uso compartido | DBA coordina ventana, timeouts y ausencia de escritores; SHARE ROW EXCLUSIVE bloquea DML concurrente de catálogo |
| Secuencia no transaccional | Un fallo puede consumir IDs; admitir huecos, nunca setval para ocultarlos |
| Activación indirecta por disponibilidad de almacenamiento | La categoría + 003 pueden habilitar término comercial inmediato aunque flags G3 estén apagados. Control operativo de acceso/ventana separado |
| Datos existentes en base rootless | Excluida; no copiar, restaurar o limpiar como parte de QA |
| G3 VOLUNTARIA sin ratificación | Mantener bloqueo; aprobación del catálogo no ratifica payload/proveedor |
| Rollback destructivo | No DROP SCHEMA CASCADE, no DELETE de categorías ni restauración global compartida para deshacer pruebas |

Recuperación propuesta: dump previo del destino autorizado, hash y manifiesto de esquema/ACL, prueba de restauración en otro recurso desechable aprobado. Fallo de DO de catálogo revierte filas; secuencias pueden avanzar. No borrar filas insertadas después de que otros grupos las referencien. Fallo 002/003 revierte su transacción; revisar grants aplicados por separado. Una vez hay términos voluntarios, no restablecer NOT NULL de aviso, quitar causa o exigir recepción G1 como rollback. Conservar evidencia y preferir corrección hacia adelante aprobada. Nunca restaurar finet_global_validacion completa por un fallo de G8 sin decisión intergrupal y control de escritores.

Autorizaciones **separadas** requeridas:

1. Revisar esta propuesta y aprobar SLA/fuentes/catálogo G8 separado.
2. Crear clúster/base efímera y roles sintéticos; aprobar su DDL/fixtures y endurecimiento del runner.
3. Ejecutar en esa QA DDL/DML/grants, pruebas negativas y simuladores locales, con recuperación ensayada.
4. Evaluar resultados reales antes de autorizar 002/003, grants o catálogo en la central compartida. La aprobación QA no se traslada a producción.
5. Ratificar y autorizar pruebas coordinadas G3/G1 y flags operativos; no implícito en ningún paso anterior.

## 9. Validación de esta preparación

`node --test scripts/g8-catalog-proposals.test.mjs`: **7 PASS / 0 FAIL**, comprobaciones estáticas de contrato, límites insert-only, generador real, aprobación/SLA, normalización/alias, fuente de término y W5. **No ejecutan SQL ni prueban idempotencia/concurrencia real.**

Pruebas backend relacionadas: **161 PASS / 0 FAIL en siete suites** (`ticket-attention-categories`, `ticket-category-intergroup`, `withdrawal-boundaries`, `withdrawal-eligibility`, `withdrawal-voluntary-termination`, `withdrawal-workflow.finalize` y `withdrawal-workflow.closure`). Se ejecutaron con entorno de test sintético y sin opt-in PostgreSQL; son unitarias, no certificación de base real. `node --check` del test y `git diff --check` aprobados. No se repitieron builds/frontend completos al no cambiar módulos funcionales ni dependencias; la línea base P1 se conserva, sin presentar sus resultados previos como ejecución nueva.

Estado de cierre:

```text
PROPOSAL_READY_FOR_REVIEW=true
SLA_APPROVAL_REQUIRED=true
QA_ENVIRONMENT_CREATED=false
POSTGRESQL_CERTIFIED=false
GO_EXECUTE_SHARED_SQL=false
GO_RUN_DESTRUCTIVE_PG_TESTS=false
BUSINESS_MODULES_MODIFIED=false
DATABASE_MODIFIED=false
MIGRATIONS_APPLIED=false
GRANTS_APPLIED=false
COMMIT=false
PUSH=false
PR=false
DEPLOY=false
```
