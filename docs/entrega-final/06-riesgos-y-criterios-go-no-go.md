# Seguridad, riesgos y decisiones de entrega

> Consolidación 29-10-2026: este documento conserva resultados y sesiones históricas. El estado de publicación vigente está en [19](19-consolidacion-publicacion-p0-07.md). Las sesiones con TTL vencido no deben reutilizarse. Las referencias a `evidencias-qa/` corresponden a archivos locales preservados, excluidos de este PR; el resumen automatizado publicable está en [validación](p0-07-validacion-publicacion.json). La distribución académica y la certificación productiva siguen separadas de esta PR.

Auditoría local P0-07, 26-10-2026, HEAD
`a8d2598151c988ef8f4f4a09977fe36167d79f62`.
**Académico: ACADEMIC_CONDITIONAL. Producción: NO-GO.**

## 1. Alcance de la revisión de exposición

Se inspeccionaron los textos del árbol trackeado y **1.719 blobs textuales únicos
alcanzables por las referencias Git locales**. Se buscaron patrones limitados de
JWT, claves privadas PEM, ciertos tokens de proveedores, URI con credenciales y
algunas asignaciones literales. No se omitieron blobs por el límite de 2 MiB.

Es una heurística dirigida, no una certificación Gitleaks exhaustiva. Gitleaks no
estaba disponible en PATH ni en las ubicaciones revisadas. Imágenes, PDF, DOCX,
otros binarios, secretos ofuscados y patrones no cubiertos requieren revisión del
propietario. No se inspeccionaron `.env` privados, no se intentó autenticación y
no se comprobó vigencia/revocación de ninguna credencial.

Para respaldos custom se leyó TOC y salida data-only de `pg_restore` **en memoria**,
sin destino de DB y sin ejecutar SQL. Los dumps históricos se leyeron desde blobs
Git, sin restaurarlos al working tree. Solo se guardaron nombres, hashes, conteos y
tipos de patrón. No se imprimieron ni persistieron valores de tokens/filas SQL.

`origin/develop` fue actualizado mediante fetch. Las demás referencias son las
accesibles localmente: su presencia no certifica el estado actual de todas las ramas
del servidor. Sí se confirmó que el commit de introducción de dumps es ancestro
del develop recién consultado.

## 2. Hallazgos de árbol e historial textual

| Ámbito | Resultado | Interpretación |
| --- | --- | --- |
| Árbol trackeado actual | 0 JWT, 0 claves privadas completas, 0 tokens de los proveedores buscados; 8 URI con forma credencial y 1 asignación literal | Las coincidencias están en ejemplos, documentación y tests. No constituyen prueba de credenciales productivas vigentes ni ausencia universal de secretos. No reutilizar ejemplos fuera de QA. |
| Historia textual | 1 blob con clave privada, 60 coincidencias URI y 4 asignaciones literales; 0 JWT en textos | Conteos por revisión/blob, no número de secretos distintos. La clave corresponde al fixture histórico `backend/src/mail/fixtures/localhost-test-key.pem`, vinculado a 50801ff1; no está en HEAD. |
| Incidente histórico bootstrap | Introducción 92f88ca6 y corrección 22ed4b5c en historial de `scripts/bootstrap-local-db.ps1` | La corrección de archivo no acredita rotación/revocación ni cierre administrativo de GitGuardian #34018865. Propietario debe aportar evidencia; no se utilizó la contraseña histórica. |

Las URI actuales corresponden a `.env.example`, `.env.railway.example`, documentación
de instalación/baseline y tests de aislamiento/validación. La asignación literal
está en un test del adapter G1. No se reprodujeron sus valores. Una clave de fixture
publicada no debe usarse jamás fuera de pruebas; reutilización histórica externa
no verificada.

## 3. Respaldos — evidencia nueva de P0-07

| Archivo / origen | Bytes | Entradas TABLE DATA | Cadenas con formato JWT | Decisión |
| --- | ---: | ---: | ---: | --- |
| `before-crm-final.dump`, blob en 46d9a985 | 4.040.712 | 61 | **19** | Exposición histórica confirmada; vigencia desconocida |
| `crm-before-develop-20260911.dump`, blob en 46d9a985 | 4.023.448 | 59 | **19** | Exposición histórica confirmada; vigencia desconocida |
| `pre-i3-schema-20261007-022439.dump`, local ignorado | 7.360.499 | 93 | **25** | Contiene datos pese al nombre; no distribuir ni usar como fixture |
| `pre-reconcile-ot53-20261008-005834.dump`, local ignorado | 6.204.251 | 96 | **25** | Contiene datos; no distribuir ni usar como fixture |
| `pre-i3-schema-20261007-022219.dump`, local ignorado | 0 | No legible | No evaluable | Archivo vacío, no sirve como evidencia de respaldo recuperable; preservado |

Las cantidades son ocurrencias, no tokens únicos entre archivos. El formato JWT
no demuestra que una sesión siga activa; no se decodificaron claims para mostrar
personas ni se intentó usar los tokens.

Hashes SHA-256 para identificación y preservación:

| Archivo | SHA-256 |
| --- | --- |
| before-crm-final.dump | `30202d4db20fbde5d2f5ca0ebcb8958fed6cc05434a854a2a34119fc96fa55dc` |
| crm-before-develop-20260911.dump | `554e0f83783d732c1224f90745b3b168fa7fe607501094ac04865c3fe164cbdb` |
| pre-i3-schema-20261007-022439.dump | `d414f40f4fe94b197ebd411b45f7c4e30d8a0b8f0b3aa2a223b49acadc1d8925` |
| pre-reconcile-ot53-20261008-005834.dump | `048f1889ab47de840507d3eb88d287f0fb01c9569a724dea19ac83535bb1eec5` |

Los dos dumps antiguos se introdujeron en **46d9a985** (11-09-2026) y fueron
retirados del árbol mediante **0a160452**. No están trackeados en HEAD, pero el
historial alcanzable desde **origin/develop** todavía contiene el commit original.
Otros refs locales/remotos de seguimiento también lo contienen. No se reescribió
historial ni se borró ningún respaldo. Los hashes de archivos locales se comprobaron
de nuevo después de la lectura y permanecieron iguales.

Esta revisión corrobora y amplía el [informe previo de seguridad](../i3-recovery-security-2026-10-06.md).
No considerar resuelto un incidente porque `.gitignore` excluya la copia actual.

## 4. Acciones reservadas al propietario

| Acción pendiente | Responsable y autorización | Evidencia requerida |
| --- | --- | --- |
| Determinar alcance de exposición histórica | Propietario Git + seguridad/datos | Ramas/publicaciones/releases/copias afectadas y material distribuido |
| Revisar vigencia y posible revocación/rotación | Administrador de autenticación/credenciales | Decisión y ejecución autorizadas, sin publicar valores; cierre del incidente |
| Decidir limpieza de historia | Propietario Git y colaboradores | Plan coordinado, impacto en clones/refs y aprobación explícita; no ejecutar automáticamente |
| Clasificar/proteger respaldos | Dueño de datos | Acceso, retención, cifrado si corresponde y prueba de restauración en QA aprobada |
| Aprobar paquete académico | Propietario + evaluador | Lista permitida de fuentes/docs/evidencia sintética; excluir `.git`, dumps, `.env`, `output/`, claves y capturas privadas |
| Ampliar análisis de secretos | Seguridad | Escáner reconocido actualizado, revisión de binarios y falsos positivos; reporte censurado |

No se solicita una aprobación genérica para continuar: la documentación y pruebas
seguras se completaron. Estas decisiones concretas permanecen pendientes y no se
ejecutaron. Tampoco se empaquetó ni compartió el repositorio con terceros.

## 5. Riesgos por prioridad

- **P0 de distribución:** historia y respaldos contienen tokens/datos; publicar
  un clon o ZIP sin revisión puede volver a exponerlos. No distribuir artefactos
  privados hasta aprobación. No implica que se haya demostrado una sesión vigente.
- **P0 de operación:** no hay certificación actual de VPS/schema/secretos/provider
  reales. El código local verde no autoriza deploy ni escrituras compartidas.
- **P1 académico:** demo UI completa no ejecutada y capturas inexistentes. Debe
  ensayarse o aceptarse explícitamente una defensa basada en evidencia de servicios.
- **P1 funcional:** reparación CU75/76 y retiro pendientes de contrato G3; cadena
  E2E real actual G3→G8→G1 y portal G2 pendientes de evidencia coordinada.
- **P1 técnico:** concurrencia financiera PostgreSQL no cubierta por P0-05; estado
  financiero global compartido sujeto a la política conservadora vigente.
- **P1 operativo:** recuperación bajo demanda, sin scheduler; idempotencia física
  tras ACK perdido depende del proveedor G1, no solo de locks locales.
- **P2:** 78 warnings frontend y bundle >500 kB documentados en P0-06; no se hizo
  refactor de rendimiento durante el cierre documental.

## 6. Criterios verificables

| Decisión | Condiciones |
| --- | --- |
| ACADEMIC_GO | Pruebas seguras verdes; material distribuible aprobado; guion ejecutado con cuentas/datos sintéticos; capturas inspeccionadas; simulaciones y CU pendientes aceptados explícitamente por evaluación |
| **ACADEMIC_CONDITIONAL — actual** | Paquete y pruebas locales completos, pero faltan ensayo visual/capturas y decisión de distribución. La defensa puede preparar su evidencia sin afirmar cierre integral |
| ACADEMIC_BLOCKED | Si se exige publicar material sensible sin autorización, usar producción para demostrar, o acreditar todos los CU reales sin aceptar dependencias pendientes |
| GO productivo | Seguridad histórica resuelta según propietario, secretos gestionados, infraestructura/backup/restore/schema aprobados y E2E real por empresa certificado; contratos técnicos completos para capacidades habilitadas |
| **NO-GO productivo — actual** | Faltan esas evidencias y autorizaciones; no hay despliegue ni tráfico real en P0-07 |

## 7. Cierre operativo de esta intervención

Sin commit, push, merge, despliegue, cambios de infraestructura, rotación, borrado
de archivos del usuario, migraciones ni escrituras de DB. La única red utilizada
fue la actualización autorizada de GitHub; los tests usan fixtures/loopback.
No hubo acceso a Railway, VPS o proveedores reales. `-f`, `output/`, respaldos,
reportes y evidencia histórica permanecen preservados; stage vacío.
