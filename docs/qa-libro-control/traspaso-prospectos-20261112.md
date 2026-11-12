# Traspaso: Prospectos (P0-A) para continuar con Libro de control

Fecha: 12/11/2026 · Rama: `feat/ux-ui-libro-control` · Commit de Prospectos: `b6e31f39` (sobre `848c136`).

## Antes de levantar la QA con estos cambios

1. **Migraciones pendientes** (el backend de `848c136` las necesita; sin ellas falla el login y el listado de prospectos):
   - `20261111180000_i4_cotizacion_codigo`: agrega `cotizacion.codigo` y **rellena** `codigo` en las cotizaciones ya enviadas.
   - `20261111220000_i4_usuario_eliminacion`: agrega `usuario.fecha_eliminacion`.
   Aplicar solo con `prisma migrate deploy` en la base QA aislada y **con respaldo previo**. No usar `db push` ni `reset`.
2. **Reiniciar el backend QA** después de actualizar el código: el watcher de `start:dev` no detecta cambios a través del bind mount de Windows (el frontend sí se recarga). Síntoma de no hacerlo: la UI nueva muestra "0 prospectos" porque la API vieja devuelve un arreglo.

## Qué cambió

- **Prospectos `Perdido` siguen visibles** en Gestión de Prospectos (antes `activeProspectWhere` los excluía). Nueva `managedProspectWhere`: no convertidos y sin contrato firmado, incluyendo `Perdido`. `activeProspectWhere` conserva su comportamiento (dashboard y contadores).
- **`GET /api/prospects`**
  - Sin `paginated=true`: mismo arreglo de antes (activos, máximo 100). Compatible con los consumidores existentes.
  - Con `paginated=true`: `{ items, total, page, pageSize, counts }`.
    - Parámetros: `scope`, `page` (≥1), `pageSize` (1–100, por defecto 20), `q`, `estado`, `origen`, `motivoPerdida`, `desde`, `hasta` (`YYYY-MM-DD`). Valores inválidos responden 400.
    - `q` busca en toda la cartera por nombre, correo, teléfono y RUT (con o sin puntos y guion). Orden estable por fecha de creación e ID.
    - `counts` agrupa por estado ignorando el filtro `estado`.
  - La UI usa solo `q` y la paginación. Los demás filtros existen en el backend pero no se muestran.
- **Reactivación**: acción «Reactivar prospecto» (Perdido → Prospecto Nuevo) por `PATCH /api/prospects/:id/pipeline`, misma fila y mismo `idProspecto`. No se ofrece sin permiso, para clientes ni con contratos vigentes. La auditoría `REACTIVAR_PROSPECTO` guarda motivo, observación, fecha y autor de la pérdida anterior.
- Un `Perdido` legítimo ya no se marca como «Revisión comercial requerida».
- Sin cambios: validación de duplicados por RUT y empresa, aislamiento por empresa y permisos.

## Verificado

- Backend 1.902 pruebas aprobadas (52 omitidas); frontend 217 aprobadas.
- QA aislada (`finet-libro-control-qa`) con backend real y datos sintéticos: login, listado paginado con `Perdido`, búsqueda, paginación, aislamiento por empresa, duplicado de RUT rechazado, reactivación con auditoría, y rechazo de reactivar un prospecto con contrato pendiente.
- Queda en esa QA un prospecto sintético (`QA SINTETICO P0-A`, RUT `77123456-9`, empresa FiNet, estado `Prospecto Nuevo`).

## No verificado

- Permisos por rol en vivo (solo se probó el administrador; las otras cuentas de QA no tenían credenciales vigentes). Hay cobertura de pruebas unitarias.
- Integraciones reales con G2 y G3: solo mocks.

## Observaciones abiertas

- Al reactivar, la fila conserva `observacion_perdida`, `fecha_perdida` e `id_usuario_perdida` y solo limpia `motivo_perdida` (comportamiento previo); la historia completa está en la auditoría. Decidir si se limpian.
- Reactivar un prospecto que ya está en «Prospecto Nuevo» responde 200 y registra una auditoría innecesaria (comportamiento previo).

## Tickets

Ver `p0-b-tickets-catalogo-20261112.md`: la QA muestra 5 de 7 categorías oficiales; faltan «Facturación y cobro» y «Baja de servicio». No se creó ninguna categoría.
