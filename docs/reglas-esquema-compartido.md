# Reglas propuestas para el esquema compartido

Estado: propuesta local pendiente de revisión de G1, G2, G3 y G8. No registra aprobaciones ni modifica las protecciones de GitHub o la VPS.

Los cambios deben ser aditivos: se pueden crear tablas o agregar columnas propias coordinadas. Agregar una columna requiere ALTER TABLE ADD COLUMN; lo prohibido es renombrar, alterar el tipo o eliminar columnas ajenas, borrar tablas o reconstruir objetos compartidos sin un acuerdo específico. No ejecutar prisma db push, migrate reset, seeds ni limpiezas sobre la base compartida.

Revisar un cambio de esquema a la vez y avisarlo en el canal de los grupos. Adjuntar la migración, la diferencia del contrato canónico, el inventario de objetos y las pruebas en PostgreSQL temporal. El administrador que realice el despliegue debe documentar revisión, respaldo recuperable y ventana de aplicación. La aprobación del documento y de la migración sigue pendiente; no equivale a activar la firma.

El ownership se obtiene de ownerOf() en scripts/global-schema.mjs, no de una lista paralela mantenida a mano:

- solicitud_instalacion_integracion: G3.
- integracion_resultado_wifi_g2: G8/G2.
- Inventario y equipos: G1 según los patrones de ownerOf().
- Órdenes y operación técnica: G3/Ops según esos patrones.
- Sesiones, preferencias y solicitudes del portal: G2 según esos patrones.
- empresa, usuario, usuario_rol, rol y log_auditoria: compartido.
- Las demás tablas de la proyección: G8, coordinando las columnas compartidas.

La firma lee datos de otros dominios y solo bloquea el contrato y cliente G8. No escribe inventario, órdenes, sesiones o credenciales de otros grupos. La instalación y activación mantienen sus rutas actuales, fuera de la transacción de firma.

El workflow CRM verification comprueba pruebas, compilación y esquema. El administrador del repositorio debe configurar main y develop con PR obligatorio, al menos una revisión, conversaciones resueltas, el control CRM tests and shared schema obligatorio y sin bypass/push directo. CODEOWNERS es una propuesta comentada: faltan usuarios o equipos exactos con acceso de escritura. Estas protecciones requieren configuración real en GitHub y todavía no están activadas por este trabajo.

## Corrección de firma para segunda revisión

La firma propuesta usa g8_contratos.solicitud_firma, sin FKs ni triggers hacia public y sin modelo Prisma global.
Su migración y permisos se revisan por separado en db/g8/. No añade tablas, columnas ni permisos a public.
La asignación al modo automático usa únicamente metadatos de política en la auditoría ya existente.
El catálogo y permisos públicos se comparan antes/después en PostgreSQL exclusivo; el despliegue compartido sigue pendiente.
