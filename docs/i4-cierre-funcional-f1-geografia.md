# F1 — Consistencia geográfica

Base: `ad668434b3f054a848935ba02d8adf03f9360f3a`. Rama funcional independiente.

## Causa y corrección

`Prospecto` guarda comuna y región, pero no ciudad. `Contrato` sí guarda
`comunaInstalacion` y `ciudadInstalacion`. La cotización referencia al prospecto;
no tiene una segunda dirección. El formulario de confirmación omitía los dos
campos del DTO y el servicio utilizaba exclusivamente la comuna del DTO.
Pendientes de activación presentaba únicamente el contrato.

La confirmación ahora permite capturar comuna y ciudad explícitas antes de la
firma y conserva la comuna registrada cuando el DTO no la repite. Revalida la
comuna al adquirir el lock del prospecto. No infiere ciudad desde región/mapa.

La proyección aditiva `ubicacionInstalacion` muestra datos contractuales y permite
complementar una comuna ausente desde el prospecto únicamente para la misma
dirección. Identifica su fuente. No escribe ni cambia el contrato firmado.
Una dirección diferente no se complementa automáticamente. La ciudad ausente
sigue ausente. Se mantienen restricciones de etapa, cobertura, roles y auditoría.

G3 conserva su payload pactado (dirección completa y comuna); ciudad no se añade
al contrato intergrupo. No se modifican activaciones ni datos históricos.

## Evidencia

- Antes: tres regresiones backend nuevas fallaban (comuna omitida/proyección
  inexistente). Después: 81 pruebas dirigidas, tres suites, aprobadas.
- Frontend: seis pruebas React de cobertura/cotización/contratación aprobadas,
  incluyendo transporte explícito de comuna y ciudad.
- Backend build aprobado. Lint dirigido: cero errores, 43 advertencias de
  símbolos preexistentes sin uso en los componentes de clientes/prospectos.
- PostgreSQL **18.6**, cluster temporal propio, sin URL externa: tres casos PASS,
  dos empresas, un cliente compartido, dos prospectos y dos contratos sintéticos.
  Persistencia, segregación y conservación del contrato firmado verificadas.
  Sin llamadas externas; cluster detenido y eliminado por su propietario.
- Reproducir: `npm run build -w backend`, después
  `node scripts/i4-geography-qa.cjs`. Evidencia con SHA-256 y UUID en
  `.codex-review/geography-qa-*.json`; no reutiliza bases ni credenciales.

## Coordinación y límites

Archivos compartidos: `api.ts`, `ProspectWorkflowPanel.tsx` y, por necesidad
funcional, cuatro expresiones de `CustomersPanel.tsx` (tabla/modal de pendientes).
Coordinar esas líneas con la rama visual; no se rediseñaron clientes ni tickets.
La captura React no es aceptación visual en navegador. No se repararon ciudades
históricas ni se alteraron firmas. Los datos ausentes requieren el flujo autorizado.
