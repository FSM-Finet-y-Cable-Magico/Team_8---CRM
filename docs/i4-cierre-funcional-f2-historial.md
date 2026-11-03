# F2 — Historial persistido G3 y trazabilidad CU47

## Antes y después

Antes, `InstallationsPanel` derivaba todo el historial de `workOrders` (OT locales).
Un cierre G3 confirmado sin fila local podía integrar CU47 pero no esa tabla.
No se modificó el algoritmo aprobado `installation-metrics.ts`.

Nuevo GET autenticado `/api/integrations/g3/installation-history?scope=N`:
lee exclusivamente PostgreSQL G8 en un snapshot RepeatableRead. Roles de consulta
operativa vigentes. Un usuario empresarial no puede ampliar su ámbito mediante
`scope`; el administrador conserva consolidado. Respuesta `Cache-Control: no-store`.
No llama a G3/G1, no reconcilia, no modifica fechas, estados ni esquema.

Agrupa empresa + OT física. Preserva todas las referencias de solicitudes G3,
identifica OT locales espejo y evita sumarlas como instalaciones adicionales.
Incluye cierres COMPLETADA/COMPLETADA con fecha de procesamiento persistida y
OT locales Completada. Una OT local pendiente solo aparece en este historial
si es espejo de un cierre G3 confirmado; no se fabrica su cierre local.

La fecha técnica se valida con las reglas de CU47. Su cadena original se conserva;
la fecha de procesamiento se etiqueta por separado y nunca se usa como sustituto.
Sin fecha: **Completada / Pendiente de fecha técnica**, no pendiente de ejecución.
Relaciones/fechas incompatibles: **Requiere revisión**, sin exponer identificadores
de contratos, servicios o clientes de relaciones inconsistentes. No se devuelve
payload, datos personales ni datos técnicos completos.

Frontend incorpora historial paginado, filtro de fecha y referencias desplegables.
Las respuestas tardías de un ámbito anterior no se muestran en otro. Los espejos
se retiran de la lista local y agenda al cargar el historial. Los errores se
presentan como indisponibilidad de consulta, nunca como pérdida de cierres.

## Pruebas

- 49 pruebas backend dirigidas: historial de servicio/HTTP y regresión CU47.
- Dos pruebas React: fecha original/ausente, filtros, error, respuesta tardía
  y aislamiento entre cambios de empresa. No equivalen a aceptación en navegador.
- PostgreSQL 18.6 temporal: cuatro casos PASS; un cliente compartido, tres
  contratos/servicios, cuatro trackings y una OT local. Verificación de snapshot
  antes/después demuestra cero escrituras de la consulta.
- Build backend/frontend aprobados; lint nuevo historial sin errores; advertencias
  previas en App ajenas a esta fase. `git diff --check` aprobado.
- Reproducir: build backend y `node scripts/i4-installation-history-qa.cjs`.
  El harness crea su propio cluster, comprueba identidad antes de escribir y lo
  destruye al terminar. Evidencia con hash fuente en `.codex-review/` (no versionada).

## Límites y coordinación

Endpoint interno aditivo; no cambia contratos S2S ni endpoints existentes.
Archivos compartidos: `App.tsx` (scope), `api.ts` (tipo nuevo), `InstallationsPanel`.
Nuevo componente separado para minimizar conflictos con la rama visual.
La lectura evalúa el conjunto histórico autorizado para deduplicar antes de paginar
en pantalla, como CU47; medir volumen/latencia antes de uso a gran escala.
No recuperación persistente de fechas ni validación con proveedores reales.
