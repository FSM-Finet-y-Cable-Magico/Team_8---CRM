# Protocolo de ensayo visual — P0-07A

> Consolidación 29-10-2026: este documento conserva resultados y sesiones históricas. El estado de publicación vigente está en [19](19-consolidacion-publicacion-p0-07.md). Las sesiones con TTL vencido no deben reutilizarse. Las referencias a `evidencias-qa/` corresponden a archivos locales preservados, excluidos de este PR; el resumen automatizado publicable está en [validación](p0-07-validacion-publicacion.json). La distribución académica y la certificación productiva siguen separadas de esta PR.

**Estado: RECORRIDO VISUAL NO EJECUTADO; ENSAYO HTTP COMPLEMENTARIO EJECUTADO.** Véase [resultado P0-07A](12-resultados-demo-qa.md). La siguiente secuencia visual sigue pendiente y se ejecuta solo después de comprobar `07-acta-aislamiento-demo-qa.md` en una nueva instancia.

## Puertas de entrada

1. Confirmar permisos del operador sobre el clúster nuevo y la red local, sin alterar Railway ni configuraciones reales.
2. Ejecutar build y pruebas locales según `02-manual-instalacion.md` con integraciones externas deshabilitadas.
3. Preparar exclusivamente en QA datos sintéticos y adaptadores HTTP loopback, verificando sus contratos contra tests G1/G3 existentes.
4. Iniciar backend únicamente con configuración QA sin `.env` privado heredado; comprobar `/api/health` y `/api/ready` **sobre localhost** y origen real de todos los recursos HTTP.
5. Arrancar frontend contra ese backend QA y no contra una URL productiva. Verificar DevTools/Network antes de ingresar credenciales.
6. Ejecutar D01–D15 del guion actualizado; cada escenario obtiene `PASS`, `FAIL`, `BLOCKED` o `NO_EJECUTADO`. Nunca sustituir con su resultado esperado.
7. Anotar el SHA, fecha, alias de registros QA, rol y capturas saneadas. Calcular SHA-256 de cada archivo realmente existente.
8. Cerrar únicamente servicios/clúster/archivos creados por el ensayo; preservar todo material ajeno y respaldos históricos.

## Interpretación de resultados

- `PASS`: se observaron resultado y evidencia concreta en este ensayo.
- `FAIL`: ejecución comprobada contradice lo esperado; conservar prueba del error.
- `BLOCKED`: prerrequisito o integración inexistente, con responsable y desbloqueo explícito.
- `NO_EJECUTADO`: no se intentó; no declarar aprobado.

El caso D14 debe comprobar que `GET /api/reports/export` exige Administrador, incluso con filtros de empresa; un comercial no debería exportar. El caso D15 puede respaldarse con evidencia de servicio PostgreSQL P0-05 **identificada como tal** cuando no exista la demostración visual.

## Evidencias mínimas por escenario

Archivo `09-bitacora-demo.csv`: un registro por Dxx. Para cada fotografía/video/log, registrar nombre, hash, persona/rol QA, empresa, pasos ejecutados, resultado observado, código HTTP esperado/observado donde aplique. No registrar tokens, sesiones ni secretos; no usar capturas antiguas como pruebas de esta ejecución.

## Decisiones

- `ACADEMIC_GO`: solo si ensayo, revisión de material y aceptación de excepciones por evaluador están documentadas.
- `ACADEMIC_CONDITIONAL`: pruebas técnicas preparadas, sin demo completa o aprobación.
- `NO-GO productivo`: sigue independiente de cualquiera de los estados anteriores.
