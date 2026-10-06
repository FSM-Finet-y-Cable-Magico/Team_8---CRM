# Recuperación de cambios y revisión de credenciales

Fecha: 2026-10-06. Rama de entrega: `feat/i3-facturacion-cl`. Base del equipo: `feature/incremento3` en `1af19cc`. Checkpoint anterior: `50801ff`. Cambios recuperados: `4b128ff` y `5fd580a`, conservando su autoría.

## Resultado

Se recupera el avance posterior de Felipe Levi: Meta/WhatsApp, recuperación fiscal, distinción de correo simulado, correcciones de interfaz, separación de configuración privada del contenedor frontend y archivos SQL con saltos LF. El historial y los módulos G1/G2/G3 de la base permanecen conservados. No se fusiona con `main` ni con `feature/incremento3`.

La búsqueda dirigida por contraseñas privadas configuradas localmente no encontró coincidencias en los árboles o historia revisados. No se restauraron archivos privados `.env`; permanecen fuera de Git. La configuración real de Railway sigue en un archivo privado del checkout anterior y no se copia a ejemplos, informes ni a esta recuperación.

## Escaneo de secretos

Se usó Gitleaks 8.30.1 desde su distribución oficial, verificando el SHA256 del archivo descargado. Se escanearon el árbol del candidato, su historia y por separado el rango `50801ff..5fd580a`, con salida censurada, decodificación de hasta dos niveles y sin permitir comentarios que omitan detecciones.

- Los dos commits recuperados no produjeron hallazgos del escáner.
- El árbol y la historia textual produjeron dos hallazgos clasificados: la clave TLS pública de prueba de loopback y el nombre de una constraint de base de datos confundido con una API key. No son credenciales operativas. No se agregaron exclusiones amplias para ocultarlos.
- El escaneo de Git se ejecutó sin textconv de PDF. Las imágenes y documentos binarios no quedan certificados automáticamente por ese escaneo.

## Exposición heredada confirmada en respaldos

Los archivos `output/backups/before-crm-final.dump` y `output/backups/crm-before-develop-20260911.dump` ya existían en la base, introducidos en el commit `46d9a98` del 2026-09-11. No fueron añadidos por los dos commits recuperados.

Se examinó su contenido exclusivamente en memoria mediante `pg_restore --data-only --file=-`, sin conexión de destino ni ejecución de SQL. Gitleaks identificó 19 entradas JWT en cada respaldo. No se mostraron sus valores, no se guardó el texto extraído ni se intentó autenticarse con esos tokens. No se comprobó su vigencia criptográfica.

Los dos archivos se retiran del seguimiento de Git en esta rama y se agrega su exclusión a `.gitignore`. Sus copias originales permanecen en el checkout local anterior; no se borra ningún respaldo del usuario ni se modifica una base de datos.

**La eliminación en el nuevo commit no limpia el historial ni las demás ramas.** El responsable del repositorio y de autenticación debe coordinar el retiro histórico de esos respaldos, revisar la vigencia/revocación de sesiones y determinar si corresponde rotar claves. Esta recuperación no realiza force push, reescritura de historia, revocación de sesiones ni cambios en otras ramas.

## Validación del candidato funcional

Entorno desechable Docker, sin red externa, sin archivos privados de configuración y sin bases de datos accesibles. Los tests optativos de PostgreSQL se mantuvieron deshabilitados. No se arrancó el CRM del candidato ni se ejecutaron migraciones.

| Comprobación | Resultado |
|---|---|
| Generación del cliente Prisma | PASS |
| Compilación backend | PASS |
| Compilación frontend | PASS; aviso de tamaño del bundle |
| Jest backend | 69 suites PASS; 711 pruebas PASS; 8 pruebas de base omitidas |
| Herramientas globales, frontend y prototipo fiscal | 44 pruebas PASS |

El primer intento de Jest omitía el montaje del frontend que requieren dos pruebas de fronteras; se corrigió el entorno y la ejecución completa pasó. No se modificaron esas pruebas ni el código funcional para forzar resultados.

Estos resultados acreditan validación local/sintética. No certifican emisión fiscal productiva, SMTP externo, Meta real, recepción en G3 ni compatibilidad completa con Railway. El esquema de Railway verificado hoy sigue sin las tablas fiscales y requiere coordinación del propietario antes de cualquier migración compartida.

El CRM local anterior usa código montado con recarga automática y tenía el emisor sandbox habilitado. Para evitar activarlo con los archivos recuperados, la recuperación se conserva en una copia aislada: no se sustituyen las fuentes del servicio que estaba en ejecución ni se copia su configuración privada.
