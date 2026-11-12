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

## 4. Credencial de QA enviada a la instancia PostgreSQL equivocada: análisis y recomendación

**Qué ocurrió.** Durante la verificación de la consolidación (12-11-2026), el backend de la rama y una sonda de conexión intentaron conectarse a `127.0.0.1:5433` con la credencial de la QA local. Ese puerto no es el contenedor QA: lo ocupa el servicio Windows `postgresql-x64-18` (datos en `C:\Program Files\PostgreSQL\18\data`, `port = 5433`). Fueron dos intentos y ambos terminaron con «la base no existe» antes de ejecutar ninguna consulta.

**Qué se determinó, sin mostrar la clave:**

- La clave de la QA local es el **valor por defecto público** del compose (`${POSTGRES_PASSWORD:-postgres}`), fijado en un `.env` ignorado por Git. No es un secreto de producción ni de la VPS.
- El PostgreSQL 18 nativo exige `scram-sha-256` y solo acepta conexiones locales (`127.0.0.1/32` y `::1/128` en `pg_hba.conf`).
- Con SCRAM la clave **no viaja en claro**: el servidor recibe una prueba criptográfica.
- PostgreSQL autentica antes de comprobar si la base existe. Por eso, el error «la base no existe» indica que el servidor nativo **aceptó** la credencial: su superusuario `postgres` tiene esa misma clave por defecto.
- La clave no aparece en el diff de la rama, en los commits de esta sesión ni en las evidencias o logs guardados (búsqueda automática de URLs con credenciales: 0 coincidencias).

**Conclusión.** No hubo exposición a terceros: el destino fue un servidor local del mismo equipo y la clave ya era pública. **La credencial de QA no requiere rotación** por este incidente.

El hallazgo de seguridad es otro: **el PostgreSQL 18 local tiene su superusuario con la clave por defecto** y escucha en todas las interfaces (`0.0.0.0:5433`, `[::]:5433`), aunque `pg_hba.conf` solo admite conexiones locales.

Se recomienda que el propietario del equipo:

1. Cambie la clave del superusuario del PostgreSQL 18 local, y del 15 si comparte la configuración (no lo hice: está fuera del alcance).
2. Defina `listen_addresses = 'localhost'` en esas instancias.
3. Si se desea evitar confusiones, cambie el puerto publicado de la QA o el del PostgreSQL 18 nativo.

Ninguna clave se mostró ni se escribió en logs, documentos o commits.

## 5. Estado del HTTP 500 por `orden_trabajo.cierre_equipos`

Sigue pendiente y sin cambios en el código (ver sección 1). Afecta solo a la QA local. El procedimiento propuesto requiere la aprobación del operador de esa QA. En el Dashboard aparece «No se pudo completar la operación» y la pantalla de Órdenes de Trabajo falla en esa base. No es una regresión de esta rama.
