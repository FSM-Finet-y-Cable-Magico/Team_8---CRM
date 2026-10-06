# Revisión de seguridad saneada

Fecha: 29-09-2026. Resultado detallado por archivo/línea/tipo: [i3-security-redacted.json](i3-security-redacted.json). Todos los valores están reemplazados por `[REDACTED]`.

Se inspeccionaron archivos trackeados y nuevos del working tree G8, y el snapshot proporcionado de G1, mediante reglas locales para URI PostgreSQL, claves privadas, tokens de proveedores, literales de configuración y credenciales documentadas. El escáner no imprime líneas de código completas ni cuerpos de secretos.

Es una detección heurística; incluye coincidencias en ejemplos, fixtures, hashes y referencias de código. El número de coincidencias no equivale a credenciales vigentes filtradas. No es una certificación de ausencia de secretos ni un escaneo completo del historial Git o un reemplazo de GitGuardian. No se comprobó vigencia intentando autenticarse con valores encontrados.

Hallazgo concreto a revisar con G1: `POTENTIAL_COMMITTED_SECRET_G1`, `docs/13-guia-global-endpoints-4-grupos.md:358` en el snapshot; posible credencial literal de integración. Verificar titularidad/vigencia y revocar/rotar si corresponde, retirar su publicación y revisar historial con el equipo responsable. No se reutilizó esa cadena para solucionar la configuración ausente de G8.

Ejemplos y credenciales demo/hashes del repositorio necesitan revisión contextual si alguna vez se usaron fuera de pruebas; su ubicación en un ejemplo no acredita que nunca hayan sido productivos. Este trabajo no confirma el cierre del incidente histórico GitGuardian ni reescribe commits.

No se rotaron secretos, cambiaron variables remotas o enviaron mensajes a otros grupos. `DATABASE_URL` se cargó solo desde entorno para lecturas. Las herramientas G1 usan key opaca literal y nunca la exponen en CLI, frontend o logs. Los reportes de catálogos contienen metadatos de esquema, no filas de clientes ni logs de migración.
