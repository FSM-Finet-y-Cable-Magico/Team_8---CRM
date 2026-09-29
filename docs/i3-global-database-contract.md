# Contrato global y proyección G8

Estado al 29-09-2026: IMPLEMENTADO_LOCAL para auditorías/alineación; PENDIENTE_RECONCILIACION_GLOBAL en Railway. Fuente física prioritaria: [init-global.sql](../db/global/init-global.sql), hash `af5892827b2e41ce15aec0d620cb10a2336d3236596f487af61cc6b41c2b87da`. El contrato tiene 90 tablas, 876 columnas, 90 PK, 210 FK, 33 checks y 107 índices explícitos. No incluye seeds.

## Precedencia y límites de dominio

1. Init global: tipos, nulabilidad, restricciones y objetos físicos compartidos.
2. Código real de cada grupo: comportamiento implementado.
3. Acuerdos: contrato funcional/API que aún puede requerir implementación.
4. Railway: estado observado que debe converger al contrato, no una definición alternativa.

|Dominio|Owner funcional|Acceso G8|
|---|---|---|
|CRM, comercial, tracking saliente|G8|Servicios G8 con RBAC, ámbito de empresa y auditoría|
|Inventario físico, bodegas, unidades, movimientos|G1|API S2S; no sustituirla por SQL directo|
|Red, terreno, cierre técnico de OT|G3/Ops|Contrato API ratificado|
|Portal|G2|Mantener acuerdos y ownership|
|Identidad, clientes y referencias compartidas|Coordinación intergrupo|Cambios físicos acordados; no propiedad exclusiva por aparecer en Prisma|

Los owners que calcula el auditor son orientativos, no autorizaciones de escritura. `OWNER_EXTERNAL` clasifica objetos fuera de la proyección Prisma G8; no significa necesariamente que toda esa tabla pertenezca exclusivamente a otro grupo.

No fusionar `integracion_activacion`, `integracion_cierre`, `asignacion_equipo_servicio` (G1) con `integracion_activacion_g1`, `integracion_instalacion_g3`, `integracion_evento_entrante` (G8). Cada grupo registra su lado del intercambio.

## Prisma

Se mantienen 58 modelos, sin crear modelos para las 90 tablas. Auditoría reproducible: `npm.cmd run db:audit:prisma-global`. El [reporte completo](i3-prisma-vs-global-schema.md) y sus JSON antes/después incluyen cada columna, PK, relación e índice modelado, y los objetos globales fuera de la proyección. El estado anterior se reconstruyó desde `git show HEAD:backend/prisma/schema.prisma`, usando el mismo auditor final.

Se corrigieron 69 diferencias de tipo/precisión, 5 de nulabilidad y 43 de acciones referenciales. Esto incluye anchos de usuario, IP como VARCHAR(45), TIMESTAMPTZ frente a DATE/TIMESTAMP, hashes VARCHAR(64), puerto NAP y campos nullable. Las PK de los 58 modelos coinciden. No quedan diferencias de tipo/nulabilidad en columnas canónicas modeladas ni conflictos en las relaciones/índices modelados.

Las 66 filas `FK_MISMATCH` y 49 `INDEX_MISMATCH` restantes tienen `prisma: null`: son objetos físicos no representados, no relaciones incompatibles generadas por G8. Se conservan en PostgreSQL. Hay 37 columnas globales adicionales dentro de tablas modeladas. Las 304 filas `OWNER_EXTERNAL` incluyen 260 columnas y 44 FK fuera de la proyección. El auditor no infiere los defaults/checks físicos desde defaults de aplicación: esos se comparan en el verificador PostgreSQL.

La lectura de NULL también se corrigió en código: versión de sesión interpretada como cero, inicialización transaccional de NULL antes de incrementar para invalidar sesiones, y fechas comerciales/facturación admitiendo NULL. No se cambió el contrato para obligar a otros grupos a insertar valores ficticios.

## Única extensión propuesta

`integracion_activacion_g1.payload_snapshot JSONB NULL` tiene estado **GLOBAL_SCHEMA_CHANGE_PROPOSED**. Prisma contiene el campo, el init original no. [SQL aditivo separado](../db/global/proposals/001-g1-payload-snapshot.sql), no aplicado.

Los campos existentes no conservan el RUT original completo del evento; usar la respuesta de G1 para guardar la solicitud mezclaría significados. El snapshot permite reutilizar el mismo payload, hash e identificadores aunque cambie Cliente. No se reconstruyen eventos históricos a partir del cliente actual. Los registros sin snapshot quedan bloqueados con error explícito y necesitan revisión de evidencia original.

La rama no está lista para desplegarse en la BD actual: primero reconciliación y después decisión/aplicación coordinada de esta extensión, o una solución alternativa revisada. Una columna nullable ausente también hace fallar SELECT de Prisma. Una futura versión acordada del contrato debe incorporar esta extensión y actualizar su hash y la generación de health; no modificar silenciosamente el archivo recibido.

## Alcance de igualdad física

El verificador lee catálogos en READ ONLY y compara tablas/columnas completas, tipos, nulabilidad, defaults, PK, FK y sus acciones, checks, índices y características básicas de secuencias seriales. Conserva `_prisma_migrations` como metadato permitido. La normalización SQL es conservadora: no elimina paréntesis/casts para forzar coincidencias; equivalencias no demostradas requieren revisión. No audita permisos, triggers, vistas, contenido comercial ni el valor actual de secuencias como prueba de igualdad. Los tests sintéticos del comparador no son evidencia de una BD local ni remota.
