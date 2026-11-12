# Propuesta 002: alinear el contrato global con `usuario.fecha_eliminacion` y `cotizacion.codigo`

Estado: **Sección A APLICADA al contrato del repositorio el 12-11-2026, con aprobación de la jefatura del proyecto** (`init-global.sql`, hash `8b744395…`, conteos, README y artefactos regenerados). **Las secciones B (DDL en bases existentes) y C (migración de datos) siguen sin ejecutarse** y requieren su propia aprobación y respaldo.

## Por qué falla `npm run db:audit:prisma-global` (`PRISMA_GLOBAL_PROJECTION_MISMATCH`)

| Punto | Diferencias bloqueantes |
|---|---|
| `develop` (`24ba7d26`) | 0 (el check pasa) |
| Desde `5f6a71de` hasta `880d99b5` (incluye el merge #80, Tickets P0-B y el último commit de Jean) | 3, siempre las mismas |

Las tres diferencias las introdujo el commit `5f6a71de` (11-11, «corrige flujos de prospectos y estandariza interfaz CRM»). Agregó estos objetos al modelo Prisma y a dos migraciones Prisma, pero no al contrato canónico `db/global/init-global.sql`:

| # | Objeto | Estado en la auditoría | Propietario (`ownerOf`) |
|---|---|---|---|
| 1 | `usuario.fecha_eliminacion TIMESTAMPTZ NULL` | `PRISMA_ONLY` | COMPARTIDO (G1/G2/G3/G8) |
| 2 | `cotizacion.codigo VARCHAR(20) NULL` con un valor por defecto generado | `PRISMA_ONLY` | G8 (coordinar columnas compartidas) |
| 3 | Índice único `cotizacion_codigo_key (codigo)` | `INDEX_MISMATCH` | G8 (coordinar columnas compartidas) |

El resto del reporte (53 diferencias de índices, 65 de FK, 35 columnas solo globales y 325 de otros propietarios) ya existe en `develop` y no es bloqueante.

## Qué depende de esos campos (no se pueden revertir sin perder funciones)

- **`usuario.fecha_eliminacion`**: la usan el login (`auth.service.ts`), el guard JWT de cada petición (`jwt-auth.guard.ts`) y la eliminación lógica de usuarios (`users.service.ts`).
- **`cotizacion.codigo`**: código público de la cotización en Prospectos, contratos (`contracts.service.ts`) y el PDF de la cotización.

**Riesgo de despliegue:** Prisma lee todas las columnas del modelo. Si la base de destino no tiene `usuario.fecha_eliminacion`, fallan el login y todas las rutas autenticadas, y sin `cotizacion.codigo` fallan las cotizaciones. El despliegue no ejecuta `prisma migrate deploy` automáticamente: las columnas deben existir **antes** de desplegar.

## Corrección mínima propuesta

### A. Contrato canónico (`db/global/init-global.sql`, como `CONTRACT_CHANGE`)

```sql
-- usuario: agregar tras rut
    rut                          VARCHAR(12),
    fecha_eliminacion            TIMESTAMPTZ
-- cotizacion: agregar tras factibilidad_verificada
    factibilidad_verificada      BOOLEAN DEFAULT false,
    codigo                       VARCHAR(20) DEFAULT ('COT-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 16)))
);
CREATE UNIQUE INDEX IF NOT EXISTS cotizacion_codigo_key ON cotizacion (codigo);
```

Ajustes obligatorios que acompañan el cambio, por las compuertas fijadas del repositorio:

- `scripts/global-schema.mjs`: el `CONTRACT_HASH` pasa a `396c3fbb63df79857fddb18ae9aeed5becf11f1d6f083d06cb598640f2fc9e35`; los conteos esperados de columnas pasan de 982 a 984 y los de índices de 132 a 133.
- `scripts/global-schema.test.mjs`: mismos conteos.
- `db/global/README.md`: hash vigente.
- Regenerar `backend/src/health/global-columns.generated.ts` y `docs/i3-prisma-vs-global-schema.{json,md}` con `node scripts/generate-health-contract.mjs` y `npm run db:audit:prisma-global`.

**Validación local, sin base de datos** (solo sobre archivos, en una worktree desechable):

- Auditoría: `exit 0`, con 932 coincidencias y 0 bloqueantes.
- `global-schema.test.mjs`: 11 de 11.
- Herramientas globales: 38 de 38.
- Sin cambios, el paso «Generated schema artifacts must be current» del CI también fallaría, porque los informes versionados no reflejan el modelo de `5f6a71de`.

### B. DDL para bases existentes (aplicar solo con aprobación, primero en QA aislada)

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.usuario ADD COLUMN IF NOT EXISTS fecha_eliminacion TIMESTAMPTZ;           -- aditiva y nullable: no afecta INSERT ajenos
ALTER TABLE public.cotizacion ADD COLUMN IF NOT EXISTS codigo VARCHAR(20);
ALTER TABLE public.cotizacion ALTER COLUMN codigo SET DEFAULT ('COT-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 16)));
CREATE UNIQUE INDEX IF NOT EXISTS cotizacion_codigo_key ON public.cotizacion (codigo);        -- NULL repetidos permitidos
COMMIT;
```

- `usuario` es una tabla compartida, así que se requiere el visto bueno de los grupos que la usan. La columna es nullable y sin valor por defecto, por lo que los `INSERT` de G1, G2 y G3 no cambian.
- `gen_random_uuid()` requiere PostgreSQL 13 o superior.

### C. Migración de datos separada (requiere aprobación propia)

La migración heredada `20261111180000_i4_cotizacion_codigo` incluye:

```sql
UPDATE cotizacion SET codigo = DEFAULT WHERE fecha_envio IS NOT NULL AND codigo IS NULL;
```

Es una **migración de datos**: asigna códigos aleatorios a las cotizaciones históricas ya enviadas. Se propone separarla del DDL:

- Aprobarla explícitamente.
- Respaldar antes `cotizacion (id_cotizacion, codigo)`.
- Ejecutarla en una ventana distinta.
- Las cotizaciones manuales que se están cargando en la VPS quedarían con código si ya fueron enviadas. No se borran ni se modifica ningún otro campo.

Sin este `UPDATE`, las cotizaciones históricas solo muestran el código vacío.

## Scripts heredados que NO forman parte del despliegue

| Script | Salvaguarda | Riesgo |
|---|---|---|
| `db/seed-crm-local.sql` | Exige base `fsm_db` y conexión local dentro del contenedor (`inet_client_addr() IS NULL`); sin `-v aplicar=true` revierte | Una base de la VPS llamada `fsm_db` ejecutada desde su contenedor no quedaría bloqueada |
| `backend/scripts/seed-control-book-demo.cjs` | Exige `--apply-local`, host `db`/`localhost`/`127.0.0.1` y base `/fsm_db` | Igual que el anterior |
| `db/cleanup-legacy-demo.sql` | Exige `current_database() = 'fsm_db'`; borra clientes demo por id y huella de RUT | Solo valida el nombre de la base |

**No ejecutar ninguno sobre la VPS ni sobre `finet_global_validacion`.** Ningún script de despliegue los invoca.

## Procedimiento sugerido

1. Aprobación del responsable del esquema (y de G1/G2/G3 por `usuario`).
2. Commit del cambio A, con hash, conteos, README y artefactos regenerados, en la rama del PR. El CI debería quedar verde sin tocar el auditor.
3. En QA aislada: respaldo, DDL B y verificación de login, eliminación lógica de usuarios y cotizaciones.
4. Decisión aparte sobre la migración de datos C.
5. Repetir la auditoría y las pruebas antes del merge.
