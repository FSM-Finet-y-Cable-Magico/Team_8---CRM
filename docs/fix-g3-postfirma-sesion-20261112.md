# Instalaciones postfirma y sesión — revisión local

Fecha: 12-11-2026. Rama: `develop`. Base: `ff45201`.
Estado: corrección validada en `develop`; sin PR ni despliegue.

## Qué ocurría

El diagnóstico adjunto se contrastó con esta rama, que conserva el fallo descrito:

- `InstallOrderForm` pasaba `hideRequest` y ocultaba «Solicitar instalación» incluso con contrato firmado y permiso suficiente.
- El mensaje general de requisitos era texto fijo. Su presencia no demostraba que faltara firma, comuna u otro dato.
- La ficha mostraba el primer contrato de la proyección de pendientes, pero la operación técnica se identificaba solo por prospecto. El backend podía escoger otro contrato por ID descendente.
- La proyección de pendientes actualmente conserva un contrato por prospecto, ordenado por fecha de firma efectiva. Este criterio difiere del criterio de búsqueda por prospecto del servicio de integración.

No se consultó el contrato real #17 ni la base de la VPS. Por tanto, no se afirma que sus datos o su cotización estén incompletos. El preflight local valida datos en G8; no necesita emitir una orden externa para determinar esos requisitos.

## Corrección de instalaciones

El recorrido Clientes → Pendientes de activación → Gestionar instalación transporta prospecto y contrato exactos. La fila de Instalaciones guarda también el contrato elegido y lo conserva si un refresco reordena o reemplaza la proyección.

La misma referencia se usa en:

1. `GET /integrations/g3/contracts/:id/installation`.
2. `POST /integrations/g3/installation-requirements`, cuerpo `{ idContrato }`.
3. `POST /integrations/g3/installations`, cuerpo `{ idContrato }`, solo por clic explícito.

El componente técnico admite contrato o prospecto de forma excluyente. El formulario de instalaciones usa contrato, no oculta la acción, comprueba la correlación del preflight y distingue falta de permisos de estados contractuales bloqueados. Firma pendiente, Suspendido y Moroso no se habilitan por conveniencia.

La solicitud queda deshabilitada durante carga/envío, ante errores o comuna faltante. Un candado inmediato evita dos POST por doble clic antes del siguiente render. Un tracking existente muestra seguimiento; el backend conserva su candado transaccional e idempotencia. Los errores de preflight se muestran y pueden comprobarse de nuevo. El complemento de comuna sigue exigiendo permiso y confirmación de la misma dirección.

## Sesión: causas confirmadas en código

Se encontraron dos mecanismos que podían expulsar al operador antes del vencimiento:

1. `JwtAuthGuard` incluía la consulta de usuario a la base dentro del mismo `catch` de validación de JWT. Un fallo de conexión terminaba en 401 «Token invalido o expirado». Ahora se responde 503 para ese fallo temporal, sin autorizar la operación ni invalidar las credenciales. Tokens inválidos, cuentas desactivadas/eliminadas o sesiones revocadas siguen respondiendo 401.
2. El navegador borraba la sesión ante cualquier 401 de una operación autenticada. Ahora verifica `/auth/me` antes de cerrarla. Un fallo de red, 502 o 503 no borra credenciales; una sesión realmente rechazada sí. Las comprobaciones concurrentes se agrupan y una respuesta vieja no cierra un inicio de sesión posterior. La operación original no se repite automáticamente.

Además, un 401 del proveedor durante la consulta de cierre G3 se propagaba como 401 del CRM. Ahora se informa como 502 de integración, siguiendo la separación de credenciales ya utilizada por G1.

La duración configurada en los archivos locales revisados es `JWT_EXPIRES_IN=8h`; el frontend mantiene una hora de inactividad. Se conserva esta política: la actividad del usuario renueva la inactividad, las consultas automáticas no cuentan como actividad y un JWT vencido no se prolonga. No se ha comprobado el valor efectivo de la VPS, su reloj, su secreto ni el de réplicas. Estos puntos siguen pendientes si el cierre prematuro se reproduce después del parche.

## Archivos y propósito

| Archivos | Propósito |
| --- | --- |
| `frontend/src/App.tsx`, `features/customers/CustomersPanel.tsx`, `features/customers/CustomerPendingInstallations.tsx` | Transportar el contrato mostrado desde pendientes hasta instalaciones. |
| `frontend/src/features/installations/InstallationsPanel.tsx`, `InstallOrderForm.tsx` | Conservar selección y restablecer la solicitud autorizada por contrato. |
| `frontend/src/features/installations/G3InstallationStatus.tsx` | Correlación de preflight, bloqueos reales y prevención de doble envío. |
| `frontend/src/api.ts` | Confirmar sesión ante 401 de recursos sin repetir operaciones. |
| `backend/src/common/guards/jwt-auth.guard.ts` | Separar indisponibilidad de base de datos de autenticación inválida. |
| `backend/src/g3-integration/installation-integration.service.ts` | Traducir únicamente el 401 de credenciales del proveedor a error de integración 502. |
| Pruebas frontend de instalaciones, pendientes y sesión API; pruebas backend de guard e integración | Regresión con datos y transportes simulados. |

## Límites y verificación manual posterior

Validación local completada:

| Comprobación | Resultado |
| --- | --- |
| Backend completo: `node --max-old-space-size=4096 -r ./scripts/qa-loopback-only.cjs ./node_modules/jest/bin/jest.js --config backend/jest.config.js --runInBand` | 99 suites y 1.968 pruebas aprobadas; 6 suites completas omitidas y 52 pruebas omitidas en total, condicionadas a infraestructura/flags de integración. |
| `npm test -w frontend` | 262 pruebas aprobadas, incluidas las de sesión y el recorrido por contrato. |
| `npm run test:global-tools` | 38 pruebas aprobadas. |
| `npm run test:frontend-runtime` | 3 pruebas aprobadas. |
| `npm run build -w backend` y `npm run build -w frontend` | Compilación correcta. Vite mantiene el aviso de tamaño de bundle superior a 500 kB. |
| `npm run db:audit:prisma-global` | Comprobación correcta frente a la auditoría existente; no conecta a una base real. |
| `git diff --check` | Correcto. |

La primera ejecución del backend falló porque el entorno restringido impedía conexiones loopback (`EACCES`) de los servidores simulados. Se repitió con permiso para conexiones locales y con conexiones externas bloqueadas: sin fallos. Las pruebas usaron `DATABASE_URL` deshabilitada e integraciones externas desactivadas. Las suites que requieren bases preparadas no se habilitaron. El mensaje de limpieza de PDF del contrato ficticio 87654321 procede de una prueba que simula deliberadamente ese error.

No se han enviado órdenes reales ni usado clientes productivos como pruebas. No se cambian payloads entre grupos, activación G1, firma electrónica, documentos firmados, facturación, pagos, esquema ni seeds. Los clientes G3 y la persistencia se simulan en pruebas; las conexiones externas se bloquean con `qa-loopback-only.cjs`. No se incluyó trabajo adicional sobre baja por morosidad.

Para validar funcionalmente después de preparar una release:

1. Abrir un pendiente firmado, anotar el contrato visible y gestionar su instalación. Debe poder consultarse el preflight de ese mismo contrato; cualquier bloqueo debe indicar su causa.
2. Con datos completos y permisos, debe aparecer «Solicitar instalación». Crear una orden real requiere la autorización operativa correspondiente. Después debe mostrarse seguimiento sin activar al cliente anticipadamente.
3. Reabrir un contrato con tracking debe mostrar esa misma orden. Probar también lectura sin permisos y contratos bloqueados.
4. Comprobar que un fallo temporal de red/servicio no devuelve al login, mientras que un token realmente vencido o revocado sí lo hace.

La validación remota del contrato #17 y del entorno de sesión, el CI de GitHub, el PR y el despliegue no se han ejecutado. El cambio requiere frontend y backend al preparar la release. Integrar todo `develop` hacia `main` requiere revisar su diff completo: esta revisión local no certifica la composición de una release ni la exclusión de PR previos.
