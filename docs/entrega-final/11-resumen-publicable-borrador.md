# CRM FiNet / Cable Mágico — Resumen para entrega académica

> Consolidación 29-10-2026: este documento conserva resultados y sesiones históricas. El estado de publicación vigente está en [19](19-consolidacion-publicacion-p0-07.md). Las sesiones con TTL vencido no deben reutilizarse. Las referencias a `evidencias-qa/` corresponden a archivos locales preservados, excluidos de este PR; el resumen automatizado publicable está en [validación](p0-07-validacion-publicacion.json). La distribución académica y la certificación productiva siguen separadas de esta PR.

**BORRADOR. No distribuible sin revisión y aprobación del propietario y evaluador.**

## Objetivo y alcance

CRM académico multiempresa para administración comercial, prospectos, contratos, clientes, servicios, cobranzas, tickets y reportes. Integra por contratos definidos con sistemas externos de inventario (G1), portal/pagos (G2) y gestión técnica de instalaciones (G3).

## Evidencia técnica disponible

El Release Candidate local P0-06 registró 1.247 pruebas backend aprobadas (0 fallos, 8 omitidas), 44 pruebas frontend aprobadas, 16 grupos de aceptación local aprobados (13 verificaciones externas no ejecutadas), builds aprobados y lint sin errores. El mecanismo de recuperación G3/G1 P0-05 aprobó ocho escenarios sobre PostgreSQL QA real aislado con proveedor HTTP simulado. Estas cifras proceden de informes técnicos anteriores y no representan una nueva ejecución del ensayo visual.

## Funcionalidades y límites

Las reglas comerciales y el aislamiento empresarial disponen de evidencia automatizada local. La ejecución física externa, los recorridos E2E actuales G1/G2/G3, la reparación/retiro de G3 y la certificación de infraestructura no se dan por completados. Cualquier demostración con simuladores deberá identificarlos visiblemente.

## Condición de aceptación

Estado académico provisional: **ACADEMIC_CONDITIONAL**, sujeto a ensayo visual con datos sintéticos, revisión del material compartible y aceptación explícita del alcance/limitaciones por el evaluador. Estado productivo: **NO-GO**; no se autoriza despliegue ni uso de datos reales.

Documentación interna de soporte: informes P0-02 a P0-06, evidencia PostgreSQL QA P0-05 y seis documentos P0-07. Se distribuyen únicamente los anexos expresamente aprobados.
