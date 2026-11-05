# Acta previa obligatoria — Demostración QA aislada

> Consolidación 29-10-2026: este documento conserva resultados y sesiones históricas. El estado de publicación vigente está en [19](19-consolidacion-publicacion-p0-07.md). Las sesiones con TTL vencido no deben reutilizarse. Las referencias a `evidencias-qa/` corresponden a archivos locales preservados, excluidos de este PR; el resumen automatizado publicable está en [validación](p0-07-validacion-publicacion.json). La distribución académica y la certificación productiva siguen separadas de esta PR.

**Estado actualizado: QA LOCAL ATESTADO Y EJECUTADO POR HTTP; VALIDACIÓN VISUAL BLOQUEADA.** La solicitud P0-07A autorizó expresamente crear una instancia nueva, cargar el esquema y usar datos sintéticos. La tabla siguiente conserva la lista de controles de la plantilla; sus resultados efectivos se detallan al final. No certifica proveedores ni producción.

| Control | Evidencia requerida (sin secretos) | Estado inicial |
| --- | --- | --- |
| Identidad de código | SHA de `develop` y rama de demo; `git status` sin cambios accidentales | PENDIENTE |
| Exclusividad del clúster | PostgreSQL nuevo en directorio temporal creado para esta ejecución, marcador/propietario, usuario específico | PENDIENTE |
| Identidad de DB | Base recién creada, nombre único, catálogo inicial vacío, hostname `127.0.0.1`, puerto efímero; lectura de `data_directory` y usuario PostgreSQL coincide | PENDIENTE |
| Esquema canónico | Hash SHA-256 vigente verificado antes de crear fixtures; carga únicamente en QA exclusivo (no `db push`, migraciones globales ni dumps) | PENDIENTE |
| Aislamiento de redes | Conexiones de salida denegadas salvo destinos loopback controlados; sin proxy ni DNS hacia proveedores | PENDIENTE |
| Variables y secretos | Proceso limpio sin herencia de `.env` real; secretos QA efímeros no incluidos en logs, documentación o Git | PENDIENTE |
| G1 simulado | Solo loopback; catálogo/consulta y activación necesarios para escenarios; no usar G1 real | PENDIENTE |
| G3 simulado | Solo contrato de instalaciones aprobado, solicitud/GET/cierre `COMPLETADA` approval-only; sin rutas inventadas de reparación/retiro | PENDIENTE |
| Controles de usuario | Cuatro cuentas QA con roles reales (Admin, Comercial E-F/E-C, Soporte), contraseñas separadas y no publicadas | PENDIENTE |
| Datos sintéticos | IDs generados y relaciones legítimas; sin restauración de respaldos, OT #53 ni clientes reales | PENDIENTE |
| Orígenes web | API, frontend, DevTools y descargas apuntan únicamente a loopback (sin assets o llamados externos inesperados) | PENDIENTE |
| Preparación de captura | Redacción de JWT, claves, cookies, RUT/personas reales; carpetas de evidencia exclusivas QA | PENDIENTE |
| Apagado seguro | Proceso/clúster identificable, cierre y eliminación solo de recursos temporales creados por este ensayo | PENDIENTE |

## Firma del acta

- Fecha y zona horaria: 26-10-2026, America/Santiago; marcas UTC exactas en los JSON.
- Operador/QA: agente de desarrollo; no se atribuye una firma humana.
- Responsable de aislamiento: ejecutor del harness local; revisión posterior del propietario.
- SHA confirmado: `a8d2598151c988ef8f4f4a09977fe36167d79f62`.
- Identificador del clúster QA (no URL ni contraseña): `9386bb82-1d2e-4e52-b796-8a0b8e5febed`.
- Evidencia de verificación SQL/marker (saneada): registro enlazado en el acta ejecutada siguiente.
- Autorización **solo entorno QA:** solicitud explícita P0-07A del usuario. No autoriza publicación ni producción.

**Regla de detención:** cualquier indicador de base compartida, host remoto, secretos heredados, certificados falsos o dependencia no simulada cancela la escritura. No modificar el sistema para forzar un PASS.

## Límites

Los scripts de P0-05 validan una ejecución autónoma de servicios y destruyen su propio clúster; **no se deben reutilizar como servidor persistente de login o simular su capacidad de UI**. El stack QA integral debe ser preparado y verificado de forma independiente.

## Acta ejecutada P0-07A (26-10-2026, America/Santiago)

- Operador: agente de desarrollo, bajo autorización explícita del usuario para QA local.
- Código: `docs/i4-p0-07-cierre-entrega`, SHA `a8d2598151c988ef8f4f4a09977fe36167d79f62`.
- Motor: PostgreSQL 18.6 local; Docker no estaba disponible. No se reutilizó ninguna base existente.
- Ensayo final: `9386bb82-1d2e-4e52-b796-8a0b8e5febed`.
- Base: `p005_qa_9386bb821d2e4e52b7968a0b8e5febed`; usuario efímero `p005_qa`.
- Antes de CREATE DATABASE: marcador de instancia y directorio propio comprobados por lectura.
- Antes del esquema y fixtures: nombre, usuario, dirección loopback, puerto, marcador y directorio comprobados; **0 tablas public**.
- Hash canónico: `f42140bff257d8bcaf46d2f74d5c44fa6d304bd8f84e20085ba3bbf07bfeb2aa`.
- Prueba de atestación y limpieza: [registro saneado final](evidencias-qa/run-9386bb82-1d2e-4e52-b796-8a0b8e5febed.json). Se guardó antes de ejecutar el DDL QA; el mismo archivo acumuló resultados y cierre.
- Backend: entorno creado con lista permitida de variables; cwd temporal sin `.env`; URL derivada exclusivamente de la capacidad QA atestada. Pool de aplicación: 5 conexiones.
- Node: guard bloquea fetch y sockets salvo puertos loopback del ensayo; no se heredaron proxies. PostgreSQL/Prisma usan la URL atestada. No se cambió firewall del equipo: **no es un aislamiento de red de todo el sistema operativo**.
- Frontend: bundle con `/api`, proxy local y CSP `connect-src 'self'`; mapas/recursos remotos bloqueados. DevTools y renderizado visual **no comprobados** por falta de autorización de control de Opera.
- Proveedores: G1/G3 simulados en loopback; SMTP, WhatsApp y Facturación.cl deshabilitados; geocodificación manual. No se consultó ningún proveedor real.
- Usuarios: cuatro cuentas sintéticas con roles vigentes y contraseñas aleatorias, guardadas únicamente en el directorio temporal privado; nunca en los entregables.
- Fixtures: empresas 1/2, planes 1/2, cliente compartido 1 con contratos 1/2. Flujo creado por API: prospecto 1, contrato 3, tracking 1, OT simulada 9700001, cliente 2, servicio 3. Estos IDs pertenecen solo a este clúster nuevo; no son referencias productivas.
- Capturas: **0**. No se produjeron imágenes que aparenten una pantalla ejecutada.
- Apagado: las tres instancias creadas durante la preparación confirmaron `cleanup=true`. Se eliminaron únicamente directorios temporales propios, después de detener PostgreSQL; archivos del repositorio y respaldos preservados.
- Resultado: autorización de escrituras **exclusivamente QA ejercida**; autorización de producción/distribución **no otorgada**.
