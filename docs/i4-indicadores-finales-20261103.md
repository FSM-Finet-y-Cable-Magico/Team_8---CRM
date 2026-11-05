# CU47 y churn: corrección controlada de indicadores

Fecha: 2026-11-03. Base inmutable: `72bfedeec680021516d1a87f87b4908dab2ebd19`.
Rama independiente: `fix/i4-indicadores-finales-20261103`.
Worktree: `Team_8---CRM-indicadores-20261103`.

**GO para revisión e integración posterior de la corrección acotada CU47. NO-GO para declarar cerrados ambos indicadores o publicar un release aprobado.** La auditoría inicial se entregó sin commit ni push. Posteriormente el propietario autorizó publicar exclusivamente CU47; churn permanece pendiente. Esta autorización no incluye merge ni despliegue.

## Fuentes y decisiones

- `CU_Extendidos_G8.docx`, RF47, tabla 7.5.47: instalaciones realizadas mensualmente. No limita la fuente a órdenes locales.
- El mismo documento, RF16, tabla 7.5.16: clientes perdidos definitivamente durante el período / clientes activos al inicio del período. Si no existe historial suficiente, informar y omitir el cálculo.
- `Incremento_4_Grupo_8.docx`, secciones 11.3.29 y 11.3.35. SHA-256 del documento examinado: `ffc912c81a41c98e09808440ec561f5f5b84c3a8609bd20dab3e244ae42d2660`.
- Confirmación expresa del propietario: CU47 usa fecha técnica efectiva de G3. Cierre confirmado sin fecha queda «Pendiente de fecha técnica»; nunca usar procesamiento G8 como sustituto.
- Matriz cotejada de preparación: `docs/entrega-final/28-matriz-rf-cu-cotejada-20261102.md`, preservada en el worktree de preparación, no copiada ni sobrescrita aquí.

## Causa y corrección de CU47

`CompaniesService.summary()` solo contaba `ordenTrabajo` de tipo Instalacion, estado Completada y fechaCompletada desde el inicio de mes. Una activación G3 confirmada crea tracking y servicio sin exigir una OT local; por ello desaparecía del indicador. El filtro anterior tampoco acotaba fechas futuras.

Ahora se consultan las dos fuentes en una transacción **de lectura RepeatableRead**. G3 requiere estadoIntegracion y estadoOtG3 COMPLETADA y fechaCierreProcesado informada. Esta última es evidencia de procesamiento, no la fecha del indicador.

La proyección pura usa los datos técnicos persistidos del servicio: `fuenteInstalacion=G3`, `idOtG3` coincidente y `fechaCompletadaG3` o `resultadoInstalacion.fecha_completada`. Son campos ya utilizados por la activación existente; no se modificó G3, su contrato ni su almacenamiento.

- Identidad de instalación: empresa + OT física. Reintentos y espejo local/G3 coherentes cuentan una sola vez.
- Se verifica coincidencia de empresa, cliente, contrato y servicio. La identidad compartida del cliente no fusiona instalaciones de empresas distintas. No se consulta ni compara RUT.
- Referencias contradictorias se excluyen y se contabilizan en `instalacionesRequierenRevision`.
- Dos OT diferentes no se fusionan solo por tener igual cliente o servicio. Una presunta duplicación histórica sin identificador físico común necesita auditoría; no se inventó una correspondencia entre identificadores.
- La fecha técnica G3 prevalece sobre la local, incluso cuando falta. El espejo local no aporta una fecha sustitutiva a un cierre G3.
- Instantes con zona explícita se agrupan por calendario `America/Santiago`, coherente con el período existente. Una fecha sola se conserva como fecha de calendario. Fechas inválidas o sin zona quedan sin clasificar; fechas futuras o contradictorias quedan para revisión.
- Cierres sin fecha no incrementan el mes de procesamiento. `instalacionesSinFechaTecnica` cuenta completadas sin mes asignable, de todo el ámbito consultado. No incrementa `instalacionesPendientes`.
- Si una fecha válida se incorpora mediante un procedimiento autorizado futuro, la siguiente lectura la clasifica en su mes técnico. Este cambio no obtiene fechas remotas ni persiste correcciones históricas. Una consulta temporal al endpoint histórico de G3 no equivale a haber persistido esa fecha.
- Las OT locales completadas independientes mantienen su fecha de finalización; sin fecha quedan identificadas por separado. Se excluyen OT sin atribución empresarial.

El frontend consume los dos campos aditivos opcionales, conserva compatibilidad con respuestas anteriores y explica la diferencia entre completadas sin fecha y trabajo pendiente. Se mantiene el total mensual en su tarjeta existente. No se rediseñó el gráfico general de OT locales ni se agregó una serie histórica, promedio o tendencia para certificar todo CU47.

## Churn: defecto confirmado, sin cambio de política

El código actual cuenta **contratos** Baja o Suspendido por `fechaSuspension`, y utiliza `clientesActivosActuales + contratosContados` como denominador. Esto mezcla entidades y no representa la población activa al inicio del mes. La fecha de suspensión tampoco es una fecha fiable de baja definitiva: la reactivación puede borrarla y una baja de servicio no registra necesariamente esa fecha.

PostgreSQL sintético reprodujo: 1 suspensión temporal, 0 contratos Baja, resultado `churnBajasMensuales=1`, `churnRateMensual=50`. Se registra como **KNOWN_DEFECT**, no como aprobación funcional de CU16. La consulta no modificó estados financieros.

No basta con retirar Suspendido del filtro: persistirían el denominador erróneo, las bajas sin fecha fiable y la duplicación de un cliente con varios contratos. Tampoco se puede reconstruir con certeza el estado histórico por empresa a partir de las relaciones actuales o del estado global del cliente.

Pendiente de autorización separada:

1. Acordar cómo informar «historial insuficiente» en API/pantalla sin sustituirlo por 0 %. La regla original lo contempla; el contrato actual solo expone números y sus consumidores muestran un porcentaje. Este trabajo no introdujo un valor nullable ni alteró esa API.
2. Definir evidencia durable de bajas definitivas y población activa al inicio de período, atribuidas a empresa y cliente, incluyendo último servicio, reactivación y cliente compartido. Evaluar esquema/eventos/snapshots y compatibilidad antes de implementar.
3. Probar suspensión que no cuenta, reactivación que no duplica, varias bajas de contratos del mismo cliente, baja de una empresa con otra activa, denominador inicial, límites mensuales e historial incompleto.

No se cambió `churnRateMensual`, `churnBajasMensuales`, la cobranza ni los convenios.

### Mitigación de presentación: alternativas para aprobación posterior

La revisión de consumidores encontró los tipos en `frontend/src/App.tsx` y dos definiciones de tarjeta en `DashboardHome.tsx`: `stats` (actualmente solo renderiza sus seis primeras entradas) y `keyIndicators` (churn sí es visible). Una mitigación futura debe contemplar ambas definiciones para no reintroducir el porcentaje al cambiar el diseño. El backend conserva la tasa y las bajas actuales: una advertencia visual no corrige ese contrato ni valida CU16.

| Alternativa | Efecto en demostración | Impacto y limitación |
|---|---|---|
| **Recomendada: sustituir porcentaje y cantidad de bajas por «Dato no validado»**, con explicación de suspensiones e historial insuficiente | Evita mostrar una cifra engañosa y conserva visible el requisito pendiente | Cambio exclusivamente de presentación, sin alterar la respuesta API ni calcular un valor alternativo. Debe aplicarse en ambas definiciones y probar accesibilidad/render para todas las empresas. Requiere aprobación antes de implementarse |
| Conservar cifra con advertencia persistente | Expone el defecto sin ocultarlo | No impide interpretar el porcentaje como válido; no recomendada para la entrega |
| Ocultar completamente la tarjeta e informar en el guion | Elimina el dato engañoso de esa pantalla | Reduce trazabilidad del requisito pendiente y no protege otros consumidores de la API; necesita documentar la omisión y aprobación |

No usar 0 %, una base estimada ni un cambio de etiqueta que presente el dato como churn correcto. Una futura API de disponibilidad explícita sería otra intervención, con revisión de consumidores. Ninguna alternativa se implementó en este commit CU47; tampoco se creó un interruptor que pudiera habilitarla sin aprobación.

## Correspondencia con los 86 CU

| Requisito | Estado previo en matriz cotejada | Resultado de esta intervención | Lo que falta |
|---|---|---|---|
| RF47 / CU47, instalaciones mensuales | FAIL FUNCIONAL, F-01 | Defecto del contador corregido; pruebas unitarias, componente y PostgreSQL PASS | Revisión/integración autorizada, aceptación visual y cobertura del CU completo (incluido alcance de histórico/promedio/tendencia). No reclasificar todo el CU como validado |
| RF16 / CU16, churn | NO VERIFICADO, F-02 | Defecto confirmado también en PostgreSQL; sin corrección insegura | Historial y contrato de disponibilidad del indicador; decisión anterior |
| RF80 / CU80, convenio | FAIL FUNCIONAL | Sin cambios; factura 7000 pagada con cuotas 3500 pendientes conserva su fallo conocido | Política explícita de imputación pago→cuotas y aprobación comercial |

Los **dos FAIL** publicados correspondían a CU47 y CU80. Churn era uno de los siete NO VERIFICADO. Tres defectos no implican tres filas FAIL en esa matriz. Sus 86 filas y conteos (48 pendientes de aceptación, 29 bloqueados externos, 7 no verificados, 2 FAIL) no se han sobrescrito ni elevado automáticamente a PASS.

## Archivos de esta rama

| Archivo | Cambio |
|---|---|
| `backend/src/companies/companies.service.ts` | Consulta consistente de ambas fuentes y agregados CU47 |
| `backend/src/companies/installation-metrics.ts` | Proyección de fecha técnica, deduplicación y validación de relaciones |
| `backend/src/companies/companies.service.spec.ts` | Regresión del contador, ámbito y aislamiento de lectura |
| `backend/src/companies/installation-metrics.spec.ts` | Fechas, duplicados, empresa, relaciones, ausencia de mutaciones |
| `frontend/src/App.tsx` | Tipos opcionales de respuesta |
| `frontend/src/features/dashboard/DashboardHome.tsx` | Fecha técnica, aviso de completadas sin fecha y revisión |
| `frontend/tests/installation-metrics.test.mjs` | Render del componente y compatibilidad de respuesta anterior |
| `scripts/i4-installation-metrics-qa.cjs` | Harness de PostgreSQL local desechable y diagnóstico separado de churn |
| Este documento | Evidencia, alcance y decisiones pendientes |

## Validación real

| Validación | Resultado |
|---|---|
| Nuevas pruebas CompaniesService contra implementación anterior | 6 FAIL / 5 PASS; demuestra la regresión (`.codex-review/red.log`) |
| Dirigidas después, compañías/ciclo comercial/clientes/G3/billing | 271 PASS, 9 suites |
| Backend completo | 1397 PASS, 9 omitidas, 0 FAIL; 82 suites aprobadas y 5 omitidas |
| Frontend completo | 56 PASS, 0 FAIL; render real de componente mediante react-test-renderer, no aceptación visual en navegador |
| PostgreSQL 18.6 aislado | 9/9 escenarios CU47 PASS; diagnóstico churn KNOWN_DEFECT separado |
| Build backend / TypeScript frontend / Vite | PASS |
| Lint backend / frontend | 0 errores; frontend conserva 78 advertencias; Vite advierte tamaño de bundle |
| Prisma generate / validate | PASS, URL sintética sin acceso a base para estos comandos |
| Higiene de repositorio | 7 PASS; revisión adicional de archivos nuevos y diff sin credenciales |
| `git diff --check` | PASS |

Se agregaron 25 pruebas backend (19 proyección + 6 servicio) y 2 de frontend. Dos errores del test frontend durante su preparación se corrigieron: buscaba una tarjeta no renderizada y una frase distinta; no fueron regresiones del producto. El primer arranque PostgreSQL y el primer build Vite fallaron por restricciones del sandbox. Se repitieron localmente con permiso de proceso y entorno limpio; no se sustituyeron por resultados anteriores.

Evidencia PostgreSQL final, ignorada por Git:
`.codex-review/installation-metrics-qa-b8d100f5-9b7b-441c-857f-cde1306eb3b9.json`.
Run ID `f9da87fc-7d0e-47b2-811d-9338b2123dca`; loopback; clúster nuevo; `cleanup=true`, llamadas externas=0.

| Escenario PostgreSQL | Resultado comprobado |
|---|---|
| G3 confirmado sin OT local | mensual=1, OT local=0 |
| Dos trackings del mismo cierre físico | mensual=1 |
| Espejo local más dos trackings | mensual=1 |
| G3 sin fecha, espejo con fecha y procesamiento actual | mensual=0, sin fecha=1, pendientes de ejecución=0 |
| Fecha técnica obtenida después, del mes anterior | mes actual=0, mes original=1, sin fecha=0 |
| Identidad compartida y mismo número OT en empresas distintas | empresa1=1, empresa2=1, consolidado=2; estado Moroso conservado |
| Tracking con contrato/servicio inconsistentes | excluido y revisión=1 |
| Estado remoto completado sin procesamiento G8 confirmado | no contado |
| Consultas repetidas | filas y contenido intactos: 1 cliente, 4 contratos, 4 servicios, 5 trackings, 1 OT local |

Comandos reproducibles desde este worktree, después de dependencias locales y Prisma generate, sin `.env` operativo:

```powershell
npm --prefix backend test -- companies installation-activation.service.spec.ts g3-closure.processor.spec.ts billing.service.spec.ts customer-lifecycle.spec.ts company-response customers.service.spec.ts --runInBand
npm --prefix backend test -- --runInBand
npm --prefix frontend test
npm --prefix backend run build
npm --prefix frontend run build
npm --prefix backend run lint
npm --prefix frontend run lint
node -e "const cp=require('node:child_process');const {cleanEnv}=require('./scripts/p0-05-qa-isolation.cjs');const r=cp.spawnSync(process.execPath,['scripts/i4-installation-metrics-qa.cjs'],{env:cleanEnv(),stdio:'inherit',windowsHide:true});process.exitCode=r.status===0?0:1"
node --test scripts/repository-hygiene.test.mjs
git diff --check
```

El harness requiere binarios en `C:/Program Files/PostgreSQL/18/bin` y backend compilado. No acepta una URL de base existente. Crea su propio clúster, atestigua directorio/puerto/identidad antes de materializar el SQL canónico, usa registros sintéticos y detiene/elimina exclusivamente ese directorio temporal. Las actualizaciones de fecha del escenario son fixtures sintéticos, no una reparación histórica. No ejecutar este procedimiento apuntándolo a una base compartida.

## Riesgos y preservación

- Se leen todas las instalaciones confirmadas del ámbito para identificar completadas sin fecha y deduplicar. Se seleccionan campos mínimos, pero `datosTecnicos` es JSON y no hay prueba de carga con volumen productivo. Evaluar rendimiento con volumen sintético representativo antes de ampliar despliegue; no truncar silenciosamente el universo.
- No se certificó concurrencia de escritores productivos ni rendimiento. La consistencia entre las dos lecturas se configura con RepeatableRead y se comprobó el uso de esa opción; el harness valida consultas y relaciones reales.
- No hay prueba visual nueva, G3/G1 real, ni recuperación de fechas históricas. Las pruebas no certifican otros requisitos del dashboard.
- Los cuatro worktrees previos mantienen HEAD y estado Git; hashes de 109 archivos protegidos y los 70 de la línea base anterior permanecen iguales. Se protegió el inventario documental completo, más amplio que los once archivos mencionados.
- Al cierre de la auditoría inicial develop y RC no cambiaron y el stage estaba vacío. Sin cambios de schema, migraciones, contratos S2S, estados financieros ni datos históricos. Sin proveedores reales, Railway o VPS. La publicación posterior autorizada se limita a commit/push de esta rama y PR, sin merge ni deploy.

Recomendación: revisar CU47 como cambio independiente; mantener CU16 y CU80 explícitamente pendientes. No usar este resultado para declarar `RELEASE_READY=true` ni sustituir la aceptación académica pendiente.

## Verificación previa a publicación autorizada

El 2026-11-03 se actualizó la referencia remota con `git fetch origin`: `origin/develop` permanece en `72bfedeec680021516d1a87f87b4908dab2ebd19`. Los nueve archivos corresponden al alcance anterior. Se repitieron las 271 pruebas dirigidas y las 56 frontend: PASS. Se revisaron los resultados previos de backend completo, builds, lint, Prisma y los nueve escenarios PostgreSQL; no se declara una nueva ejecución completa ni una nueva sesión SQL durante la publicación.

Hashes SHA-256 del código que participó en PostgreSQL, comprobados nuevamente antes del commit:

| Archivo | SHA-256 |
|---|---|
| `backend/src/companies/companies.service.ts` | `6be4f04d8dad83f2c6abc8673b32e0750feedfe6c6de79dcc6a36af2179ae6dc` |
| `backend/src/companies/installation-metrics.ts` | `468276428b47df867d20597c30d70598a5cec3aa7a7374625bc01a9c55a2fc07` |
| `db/global/init-global.sql` (sin cambios, fuera del commit) | `52ae791e04e4951bbc0e2b3655dfbf3ecbc1e80e46afcbfa592d90e1aa9a5e91` |

`GO_MERGE_DEVELOP=true` se refiere exclusivamente a la recomendación técnica de CU47 después de revisión humana y checks de la PR. No es autorización de merge automático ni certificación productiva. Churn y convenios siguen pendientes. El SHA definitivo y el enlace de publicación se entregan fuera del commit para evitar una referencia circular.
