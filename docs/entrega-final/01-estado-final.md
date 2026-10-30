# Incremento 4 — Estado para entrega académica

> Consolidación 29-10-2026: este documento conserva resultados y sesiones históricas. El estado de publicación vigente está en [19](19-consolidacion-publicacion-p0-07.md). Las sesiones con TTL vencido no deben reutilizarse. Las referencias a `evidencias-qa/` corresponden a archivos locales preservados, excluidos de este PR; el resumen automatizado publicable está en [validación](p0-07-validacion-publicacion.json). La distribución académica y la certificación productiva siguen separadas de esta PR.

Fecha: 26-10-2026. Rama: `docs/i4-p0-07-cierre-entrega`.
Base: `a8d2598151c988ef8f4f4a09977fe36167d79f62` (develop, PR #62).
Objetivo de entrega: antes del 15-11-2026.

**ACADEMIC_CONDITIONAL. Producción: NO-GO / no certificada.** Son decisiones
separadas. Las pruebas locales aprobadas no acreditan la operación con proveedores.

Se actualizó la referencia remota y se creó esta rama directamente desde
`origin/develop`, sin merge. Solo se agregan estos seis documentos. No se cambian
funcionalidades, contratos intergrupo, políticas, credenciales ni esquema.

## Qué se entrega

- [Instalación y validación reproducible](02-manual-instalacion.md).
- [Guion integral con datos sintéticos y resultados esperados](03-guion-demostracion.md).
- [Resultados ejecutados y registro de capturas pendientes](04-evidencias-validacion.md).
- [Dependencias y responsables](05-dependencias-intergrupos.md).
- [Auditoría de exposición y criterios de decisión](06-riesgos-y-criterios-go-no-go.md).

## Completitud y evidencia

La matriz detallada por requisito/CU permanece en
[P0-06, sección 4](../i4-p0-06-release-candidate.md). Se conserva la trazabilidad de
los [CU iniciales](../casos-uso-primer-incremento.md) y la
[reasignación intergrupal](../matriz-responsabilidades-incremento-2.md).
No se declaran cumplidos los 86 RF/CU mediante una extrapolación de tests.

| Área | Cumplimiento defendible | Límite actual |
| --- | --- | --- |
| Login y roles, CU43/44 | Implementación y pruebas de guards/roles/usuarios | Login en navegador con cuentas QA no ejecutado en P0-07 |
| Aislamiento, CU45 | Pruebas de proyecciones, HTTP y clientes compartidos aprobadas | Capturas comparativas por rol pendientes |
| Prospectos, CU01/02/04/10/15/67 | Alta, reglas comerciales, pérdida y validación probadas localmente | No puede fabricarse activación mediante pipeline manual |
| Cobertura, CU06/70 | Autoridad comercial y ubicación probadas con fixtures | Geocodificar no acredita factibilidad técnica ni disponibilidad real |
| Planes/cotización/contrato, CU03/12/69/73/74 | Generación y versiones PDF, plan e historial probados | Recorrido UI completo y entrega por correo pendientes |
| Activación G8 por cierre, CU07 | Pruebas y PostgreSQL QA P0-05 aprobados | Cierre G3 simulado; E2E real actual no certificado |
| Instalación intergrupos, CU17/20/59/60 | Contrato ratificado, correlaciones, idempotencia y recuperación locales | Parcial hasta smoke coordinado G3→G8→G1 |
| Clientes/servicios, CU08/14/64/65 | Relaciones compartidas y protección de estados probadas | Datos físicos pertenecen a G1/G3; UI pendiente |
| Facturas/pagos/cobranza, P0-03 | Pruebas de empresa contractual, saldo, replay y rollback aprobadas | Concurrencia financiera PostgreSQL específica pendiente |
| Reactivación al pago, P0-04 | Evidencia G3 persistida exigida; protección financiera probada | No sustituye una instalación ni habilita contratos de otra empresa |
| Tickets, CU21/23/24/25/26 | Diagnóstico auditado y seguimiento comercial probados | No demuestra ejecución de una reparación técnica |
| Reparación CU75/76 y retiro | **BLOCKED_EXTERNAL**: autoridad G3 preservada | Faltan acuerdos de derivación/cierre; no hay endpoints nuevos |
| Inventario G1, CU53/54/55–58/62/63/72 | Consultas/contrato y activación con simulador probados | Asociación física real depende de G1; no inventar stock/MAC/puertos |
| Reportes/auditoría, CU33/46/68/71 | Pruebas locales y auditorías transaccionales aprobadas | Exportaciones visuales con datos QA pendientes |
| Recuperación P0-05 | Persistencia, reinicio, concurrencia y ACK perdido probados en QA | Bajo demanda; efecto único externo depende de G1 |
| Documentos externos CU86 | Registro de metadata y fronteras probados | No equivale a emisión fiscal |
| SMTP/Meta/Facturación.cl/Smart OLT/TV IP | Pruebas locales según capacidad; implementaciones parciales | Recepción/provisión real y permisos de proveedores no certificados |
| VPS/Nginx y demo visual completa | **NOT_TESTED** en P0-07 | Docker sin daemon accesible; falta stack UI/API QA atestado |

## Evidencia que se conserva, sin duplicarla

- [P0-02](../i4-p0-02-tickets-autoridad-g3.md): diagnóstico atómico y autoridad de OT.
- [P0-03](../i4-p0-03-cobranza-compartida-g2.md): finanzas compartidas/G2.
- [P0-04](../i4-p0-04-reactivacion-g3.md): reactivación comercial con evidencia técnica.
- [P0-05](../i4-p0-05-recuperacion-post-cierre-g3.md): trabajo durable posterior al cierre.
- [PostgreSQL QA](../i4-p0-05-postgresql-qa.md) y [JSON original](../i4-p0-05-postgresql-qa.evidence.json): ocho escenarios PASS, clúster eliminado.
- [P0-06](../i4-p0-06-release-candidate.md): estabilización y RC_CONDITIONAL.

La advertencia de PostgreSQL pendiente del primer informe P0-05 es histórica:
la certificación posterior la supera para esos ocho escenarios, no para toda la DB.
Los tres fallos históricos y SMTP/OpenSSL fueron corregidos en P0-06 y permanecen
verdes en la ejecución P0-07.

## Condiciones para el cierre académico

1. Propietario autoriza el material distribuible: excluir datos, `.git`, respaldos,
   credenciales, reportes privados e imágenes con datos reales. No se creó un paquete
   ni se eliminó información automáticamente.
2. G8/QA prepara cuentas, fixtures y simuladores en un entorno exclusivo y ensaya
   el guion. Cada pantalla requiere ejecución y captura reales, no solo un test.
3. Evaluación acepta expresamente las simulaciones y los CU externos pendientes,
   o exige completar esos acuerdos antes de asignar ACADEMIC_GO.

El núcleo técnico puede defenderse ahora con pruebas. Una afirmación de
«demostración integral completada» o «producción lista» sería incorrecta.
