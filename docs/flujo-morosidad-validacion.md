# Bajas y retorno a Prospectos — 17-11-2026

Rama `fix/flujo-morosidad`, creada desde `origin/main` (`959f13d9`), en el checkout existente. Sin nuevos worktrees.

## Diagnóstico publicado, solo lectura

Se verificó por SSH que Nginx publica el puerto 8843 hacia 8800 y el backend es
`finet-g8-prueba-backend-1`, imagen `finet-g8-backend:tk-141d285`, revisión
`141d285f92ceaf3eb9f946e9717df7133902716da`. Su conexión efectiva es
`finet_global_validacion`, rol `g8_app`.

La elegibilidad del servicio 1 de Fernando devolvió `eligible=true`, `habilitado=false`:

- Servicio suspendido, contrato coherente, aviso previo registrado y dirección válida.
- Tres facturas vencidas: una cubierta por convenio y dos exigibles, $39.980, 68 días.
- No hay solicitud de retiro activa. Todos los requisitos comerciales pasan.
- No existe el esquema privado `g8_retiros`; faltan sus cuatro tablas.
- `G3_INTEGRATION_ENABLED=true`, pero no están definidas las variables de despacho de retiros,
  motivo voluntario, seguimiento ni finalización. Sus valores efectivos son deshabilitados.
- Existe «Baja de servicio», categoría 14. Falta «Término de servicio».

El convenio no es la causa del botón bloqueado. La interfaz ocultaba el motivo de falta de almacenamiento.
No se modificó la base, la configuración ni los contenedores publicados.

## Comportamiento acordado

Ambas bajas esperan `COMPLETADA` de G3 (aprobación del jefe técnico) y evidencia correlacionada del cierre BAJA.
`PENDIENTE_APROBACION` conserva los estados comerciales. El estado final y la evidencia se vuelven a validar
bajo bloqueo antes de modificar servicio, contrato, cliente, prospecto y tickets en una sola transacción.

- Morosidad: exige suspensión, deuda exigible y aviso previo. Al cerrar, vuelve como excliente con su deuda
  histórica intacta. Los pagos parciales no habilitan la contratación; la regularización completa sí.
- Voluntaria: no exige morosidad, suspensión ni aviso. La solicitud registra evidencia e identidad y prepara
  el retiro. Solo después del cierre aprobado termina la relación y vuelve como `Perdido`.
  Sin deuda puede volver a contratar; una deuda real se conserva y bloquea igualmente.
- Si conserva otra relación operativa en esa empresa, continúa como cliente. Las relaciones con otras empresas
  y los contratos/documentos históricos se conservan. No se duplica la identidad.
- Los términos voluntarios inmediatos anteriores conservan su fecha y solo completan el retiro técnico.
- Datos de retiro incompletos rechazan la solicitud sin escrituras parciales, para corregirlos y volver a intentar.

Los tickets de consulta muestran categoría, prioridad y OT en el resumen, con un solo desplegable Seguimiento.
Se retira el mensaje amarillo. Los perfiles con gestión editable conservan sus funciones existentes.

## Validación reproducible

`npm run test:morosidad:postgres` crea y verifica un PostgreSQL nuevo de loopback, con datos sintéticos y un rol
de aplicación sin privilegios de administrador. No lee `.env` ni acepta una base externa. G3 es un simulador local.
La evidencia se escribe en `tmp/flujo-morosidad-postgresql.json`.

Cubre bloqueo sin almacenamiento, convenio parcial, ambos cierres pendientes/aprobados, conservación exacta de
facturas y pagos, bloqueo por deuda, pago parcial/completo, retorno Perdido sin deuda e idempotencia.
Aplica 004 dos veces y verifica sus permisos como rol de aplicación.

Resultado final: 10 escenarios PostgreSQL aprobados; backend 2.551 pruebas aprobadas y 65 omitidas por sus
condiciones existentes; frontend 466 aprobadas. Compilaciones backend/frontend, auditoría Prisma/global,
validación Compose y sintaxis de los scripts de preflight aprobadas. No se certifica G3 real ni aceptación visual.

## Habilitación pendiente en el servidor

No basta con publicar el frontend. Sobre la conexión efectiva verificada, el propietario debe autorizar y aplicar
las migraciones privadas, con respaldo previo y verificaciones de definición/permisos:

1. `db/g8/migrations/002_service_withdrawal.sql` y su `.grants.sql` para `g8_app`.
2. `db/g8/migrations/003_withdrawal_voluntary_termination.sql` y su `.grants.sql`.
3. `db/g8/migrations/004_deferred_voluntary_termination.sql` y su `.grants.sql`.
4. Ejecutar los `.verify.sql` correspondientes; el 004 se verifica como `g8_app`.
5. Habilitar la categoría con la propuesta existente `db/proposals/g8-termino-servicio-catalog.sql`, respetando
   su comprobación del catálogo y SLA; no inventar IDs ni sobrescribir categorías.
6. Publicar el código y configurar `G3_WITHDRAWAL_DISPATCH_ENABLED`, `WITHDRAWAL_TRACKING_ENABLED` y
   `WITHDRAWAL_FINALIZE_ENABLED`. El Compose local ahora transmite estas variables; el servidor usa overrides
   propios que también deben incluirlas. Conservar sus URL, claves y ámbito de empresa actuales.
7. Activar `G3_WITHDRAWAL_VOLUNTARY_ENABLED` solo cuando G3 confirme que acepta `motivo=VOLUNTARIA` para BAJA.
   No enviar una solicitud voluntaria disfrazada de morosidad.
8. Probar con G3 real el retiro, aprobación y devolución del cierre correlacionado. Las pruebas locales no
   certifican esa integración ni el despliegue.

La 004 solo modifica `g8_retiros.termino_servicio`: permite una fecha de término comercial pendiente y mantiene
las fechas históricas. No cambia Prisma, el contrato global ni las tablas públicas compartidas.
