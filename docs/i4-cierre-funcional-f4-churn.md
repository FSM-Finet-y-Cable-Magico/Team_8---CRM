# F4 — Indisponibilidad explícita de churn y cierre de validación

03-11-2026. Rama `fix/i4-cierre-funcional-final`, base
`ad668434b3f054a848935ba02d8adf03f9360f3a`.

## Causa y decisión aplicada

`CompaniesService.summary` contaba contratos Baja **o Suspendido** según
`fechaSuspension` y usaba clientes activos actuales + ese conteo como denominador.
Eso no demuestra bajas definitivas únicas ni población al inicio del período.
El dashboard además sustituía ausencia por 0 %. El modelo actual no ofrece una
serie histórica completa y ratificada para reconstruir el denominador.

Se aplica la alternativa autorizada de indisponibilidad, no una nueva fórmula.
Se retira esa consulta de conteo; la respuesta conserva las claves con valores
`churnRateMensual: null`, `churnBajasMensuales: null` y agrega
`churnEstado: HISTORIAL_INSUFICIENTE`. El dashboard muestra **Dato no validado** y
**Historial insuficiente para calcular bajas y población inicial**, incluso ante
respuestas antiguas que todavía traigan un número no certificado.

Consumidores revisados: tipos de resumen en App y DashboardHome y ambas ubicaciones
de presentación del dashboard. Deben integrarse con backend en la misma entrega:
un frontend antiguo que aplique `?? 0` seguiría mostrando una cifra engañosa.
No hay consumidores S2S G1/G2/G3 de estos campos en el repositorio. Cualquier
consumidor privado externo debe admitir null; no se certifica su compatibilidad.

No se cambia la transición manual Suspendido → Baja, que no es un defecto.
No se modifica ningún estado financiero, pago, cuota, servicio, cierre o histórico.
CU47 conserva íntegramente su algoritmo aprobado y clasificación por fecha técnica.

## Evidencia antes/después

Tres regresiones backend fallaron antes: para conteos simulados 0, 1 y 5 se
publicaba 0 % o 100 %, sin estado de indisponibilidad. Una regresión React fallaba
porque aparecía 0 %. Después pasan las tres regresiones backend y la de frontend,
incluida respuesta antigua de 50 %. Pruebas relacionadas: 33 backend / 3 React.

PostgreSQL 18.6 nuevo y desechable: nueve escenarios CU47 PASS y comprobación
adicional de churn: una suspensión temporal, cero bajas definitivas, resultado
null/null/HISTORIAL_INSUFICIENTE. No inventa una baja ni calcula una tasa.
Reproducir tras build backend: `node scripts/i4-installation-metrics-qa.cjs`.
Evidencia: `.codex-review/installation-metrics-qa-f6fd4611-f312-4e00-9b70-759f1c6d1555.json`.

## Validación integrada de F1–F4

| Validación ejecutada | Resultado real |
| --- | --- |
| Backend completo, Jest con bloqueo de red no-loopback | 1.422 PASS, 0 FAIL, 9 omitidas; 84 suites aprobadas |
| Frontend completo, Node/React | 61 PASS, 0 FAIL |
| Herramientas de schema, G1 smoke, entorno, billing smoke e higiene | 33 PASS, 0 FAIL |
| PostgreSQL F1 geografía | 3 PASS |
| PostgreSQL F2 historial | 4 PASS |
| PostgreSQL tributario y reproducción convenios, upgrade/fresh | 17 PASS; convenios funcionalmente pendientes |
| PostgreSQL CU47 | 9 PASS; churn explícitamente no disponible |
| Builds backend y frontend; TypeScript final del detalle local | PASS |
| Lint backend/frontend | 0 errores; 78 advertencias frontend preexistentes |
| Prisma validate con URL loopback sintética sin conexión | PASS |
| Auditoría estática Prisma/global | Sin cambio de contrato: 893 MATCH, 35 COLUMN_GLOBAL_ONLY, 325 OWNER_EXTERNAL, 53 INDEX_MISMATCH, 65 FK_MISMATCH |
| Diff check | PASS |

Las nueve pruebas omitidas son las que requieren sus entornos explícitos:
prisma-tax-intent store (1), commercial integration (1), CRM integration (1),
coverage integration (1), external-tax-documents PostgreSQL (4) y local bootstrap
(1). No se presentan como aprobadas. Los harness PostgreSQL específicos ejecutados
son evidencia distinta y no certifican automáticamente esas suites omitidas.

La auditoría Prisma/global es estática, no un verificador de la DB productiva.
No se cambió schema, migraciones o SQL canónico para forzar paridad. Los reportes
regenerados resultaron idénticos y se conservaron como en el commit base.
Advertencia de build frontend: bundle principal supera 500 kB; sin error de build.

Logs y JSON de esta sesión están en `.codex-review/` ignorado por Git. Se usaron
datos sintéticos, credenciales efímeras y clusters nuevos verificados antes de
escribir. Cero tráfico a proveedores reales, cero escrituras productivas. Los
clusters QA fueron detenidos/eliminados por sus propios harness. No Railway/VPS.

## Entrega y pendientes

| Fase | Estado | Evidencia y límite |
| --- | --- | --- |
| F1 geografía | Corregida / QA local PASS | [Informe](i4-cierre-funcional-f1-geografia.md); no repara ciudades históricas |
| F2 historial G3 | Implementada / QA local PASS | [Informe](i4-cierre-funcional-f2-historial.md); sin llamadas ni sincronización histórica G3 |
| F3 convenios | Reproducción confirmada / decisión pendiente | [Propuesta](i4-cierre-funcional-f3-convenios.md); no imputación automática |
| F4 churn | Mitigación PASS / indicador no validado | Fórmula y serie histórica siguen pendientes de ratificación |

Antes de PR, coordinar con el compañero: `api.ts`, `App.tsx`, cuatro expresiones
de `CustomersPanel.tsx`, formulario de `ProspectWorkflowPanel.tsx`, historial de
`InstallationsPanel.tsx` y presentación de `DashboardHome.tsx`. No hay cambios en
tickets, CSS, billing, Libro Control o contratos intergrupo.

Pendientes: aceptación visual por empresa; medir tamaño/latencia del historial
en volúmenes grandes; política persistente y auditada pago→cuotas; definición y
evidencia histórica para churn. No se declara aceptación completa ni preparación
productiva. No push, PR, merge ni deploy en esta tarea.
