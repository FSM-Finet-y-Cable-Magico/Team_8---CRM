# Esquema final consolidado

[`init.sql`](./init.sql) es la fotografia estructural de la base de datos del CRM de Finet y Cable Magico Litoral al cierre del Incremento 3, actualizada al 28 de septiembre de 2026. Su objetivo es servir como fuente de comparacion para los `init.sql` de los otros grupos y para actualizar el MERE, el modelo relacional y el modelado fisico final.

El archivo fue exportado desde una base PostgreSQL 15 vacia, construida con los scripts estructurales de `db/init` y las nueve migraciones Prisma existentes hasta `20260928120000_i3_g1_multiunit_api_key_readiness`. Incluye tablas, columnas, secuencias, claves primarias y foraneas, restricciones e indices. No incluye seeds, datos demo, PII, credenciales ni la tabla tecnica `_prisma_migrations`.

## Restauracion

Debe aplicarse sobre una base PostgreSQL 15 vacia:

```powershell
psql -U postgres -d nombre_base_vacia -v ON_ERROR_STOP=1 -f db/final/init.sql
```

No se ubica en `db/init` porque ese directorio se ejecuta automaticamente al crear el volumen Docker y provocaria una segunda creacion de objetos. El bootstrap de desarrollo conserva su secuencia actual; este archivo es el entregable consolidado para intercambio, comparacion y modelado.

## Verificacion del entregable

El archivo se restauro con `ON_ERROR_STOP=1` en una segunda base PostgreSQL 15 vacia. Descontando la tabla tecnica `_prisma_migrations`, el origen y la copia restaurada coinciden en 73 tablas, 73 secuencias, 147 indices y 302 restricciones. El verificador de dominio confirmo 26 tablas, 60 columnas, 28 restricciones y 22 indices criticos. SHA-256 de `init.sql`: `DB1BAAE0618521D0021B849FB52B649A2A90430EA9237E4B36B957FA956CEF9E`.

## Estado frente a Railway

Una consulta de solo lectura realizada el 28 de septiembre de 2026 confirma que `init.sql` representa el estado final objetivo del repositorio, pero la base Railway actual no esta alineada. Railway registra 20 migraciones historicas cuyos archivos no existen en este checkout; a su vez, ninguna de las nueve migraciones locales aparece aplicada en su historial. El verificador final encontro ausentes 18 tablas requeridas, entre ellas `servicio_contratado`, `zona_pago`, las tablas de control comercial, las integraciones G1/G3 y `documento_tributario_externo`.

No se debe ejecutar este `init.sql` directamente sobre esa base no vacia, porque crea objetos completos y chocaria con las tablas existentes. La alineacion requiere respaldo, comparacion de drift y una migracion de reconciliacion revisada. Esta verificacion no modifico Railway.

## Criterios para el modelado final

- G8 es propietario de cliente, prospecto, contrato, servicio, facturacion, cobranza, gestion comercial, zonas, integraciones y garantias comerciales.
- G1 es propietario del inventario fisico. Las tablas locales de unidades, bodegas, movimientos, bajas y mantenciones permanecen en el esquema por compatibilidad e historia, pero no representan la fuente vigente ni habilitan nuevas escrituras desde G8.
- `integracion_activacion_g1` conserva `numero_serie` por compatibilidad y agrega `numeros_serie` para el contrato multiunidad ratificado. Un `event_id` identifica el evento y `equipos[]` contiene todas sus unidades.
- `documento_tributario_externo` contiene el registro externo incorporado en la Etapa 5 y sus relaciones opcionales con cliente, contrato, factura y cargo adicional.

Al comparar modelos entre grupos, las tablas legacy de inventario deben marcarse como historicas o de futura retirada coordinada. No deben interpretarse como duplicacion del ownership actual de G1.

## Integracion G1

G1 confirmo el 28 de septiembre de 2026 que su receptor esta configurado para recibir la clave compartida mediante el encabezado `X-API-KEY`. G8 ya envia ese encabezado exclusivamente desde backend, aplica timeout y mantiene la clave fuera del frontend, los logs y el repositorio.

La preparacion local esta completa, incluida la activacion multiunidad y el retry con el mismo `event_id`. Para habilitar la integracion compartida aun se requiere recibir `G1_API_URL`, intercambiar `G1_API_KEY` por un canal seguro y aprobar el smoke test autenticado de los endpoints P0/P1. Hasta entonces `G1_INTEGRATION_ENABLED=false` sigue siendo el valor seguro por defecto.

