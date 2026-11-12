# QA local: defectos de entorno y de interfaz detectados (no corregidos en esta rama)

Fecha: 12-11-2026. Solo documentación: no se ejecutó DDL, seed ni migración.

## 1. `orden_trabajo.cierre_equipos` ausente en la base QA local

| Dato | Valor |
|---|---|
| Síntoma | `GET /api/work-orders` responde 500 (`column "cierre_equipos" does not exist`, código 42703). El Dashboard muestra «No se pudo completar la operación. Inténtalo nuevamente.» |
| Código que la lee | `backend/src/common/work-order-read.ts` (`readDeclaredOrderEquipment`), sin cambios en este trabajo ni en el PR #80 |
| Propietario | **G3**: migración `fsm/backend/prisma/migrations/20260903163121_add_cierre_equipos_ot` (`ALTER TABLE "orden_trabajo" ADD COLUMN "cierre_equipos" JSONB;`) |
| Contrato global | Presente: `db/global/init-global.sql`, línea 1011 (`cierre_equipos JSONB`) |
| Base afectada | Solo la QA local `finet-libro-qa-db` (`fsm_db`, sembrada desde un esquema anterior a esa migración). No se verificó la base global |
| Regresión del merge | No. Ningún archivo implicado cambió entre `a8e757ee`, `1b5c09b9` y esta rama |

**Procedimiento autorizado propuesto**, solo para la QA local aislada y a cargo de su operador, con respaldo previo:

```sql
-- QA local aislada (finet-libro-qa-db / fsm_db). NO en finet_global_validacion ni en la VPS.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.orden_trabajo ADD COLUMN IF NOT EXISTS cierre_equipos JSONB;
COMMIT;
```

Es aditiva y nula por defecto: no inventa datos de cierre en las OT existentes. Alternativa preferible: recrear la QA desde `db/global/init-global.sql` vigente.

## 2. Tabla de contratos de la ficha recortada a 390 px

En la ficha del Libro de control, en móvil (390 px), las cabeceras de «Contratos y servicios» se parten («CONTRAT O», «DIRECC INSTAL») y la tabla queda recortada dentro del modal. Es CSS de Jean (`commercial-control-book.css`) y no se modificó.

El flujo de baja no depende de esa tabla: el sub-modal muestra contrato, servicio y estado en su propia lista de detalle, sin desbordamiento horizontal a 390 px (verificado en Edge).

**Ajuste mínimo propuesto (no aplicado)**, localizado en el contenedor de la tabla: `overflow-x: auto` en el envoltorio de `.control-contract-table` dentro de `@container controlWorkspace (max-width: 650px)`. Requiere el visto bueno del responsable del diseño.

## 3. Puerto 5433 del equipo

El puerto 5433 del anfitrión lo ocupa un PostgreSQL nativo de Windows (servicios `postgresql-x64-15/18`), no el contenedor QA. Las verificaciones usaron `docker exec` o la red Docker `finet-libro-control-qa_default` (`db:5432`) y confirmaron el destino antes de cada conexión.
