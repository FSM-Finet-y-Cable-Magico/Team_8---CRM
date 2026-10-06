# Prerrequisitos externos — estado confirmado por el usuario

2026-10-04: el usuario indicó que no dispone de cuentas de prueba. No se solicitaron ni guardaron secretos en el chat.

| Requisito | Estado | Gestión necesaria |
|---|---|---|
| Facturacion.cl sandbox FiNet | NOT_READY | Responsable FiNet: cuenta de integración, credenciales API PRUEBAS, RUT/perfil y tipos autorizados. |
| Facturacion.cl sandbox Cable Mágico | NOT_READY para esta ejecución | Recuperar acceso seguro y verificar vigencia; la evidencia anterior no proporciona una cuenta disponible ahora. |
| Facturacion.cl productivo y tipos fiscales | NOT_READY / UNKNOWN | Responsable fiscal y proveedor: contrato, tipos, folios, domicilio/giro y política por abonos. Producción permanece bloqueada en código. |
| Meta App, WABA y número | NOT_READY | Responsable de cada empresa: crear/proporcionar recursos de prueba y su alcance. |
| Meta tokens, secrets y templates | NOT_READY | Configurar por empresa mediante canal seguro y aprobar templates/idiomas; confirmar versión Graph. |
| SMTP externo | NOT_READY | Responsable de correo: host/puerto/TLS, cuenta, remitente permitido y destinatario de pruebas. |
| Dominio frontend HTTPS | NOT_VERIFIED | Responsable Railway: confirmar rama/SHA, dominio y origen CORS en ventana de despliegue. |
| Key/canal G2 | NOT_READY localmente | Responsable de integración: principal/hash G2, scopes 1/2, canal privado y registros QA. |
| Coordinación G3 | NOT_READY localmente | Responsable G3: URL/key QA, empresa, candidato, ventana y verificación de OT externa. |
| Docker/PostgreSQL local | NOT_AVAILABLE en la sesión | Preparar Docker Desktop y una base exclusiva de QA para pruebas de persistencia y Nginx. |

Cuando se obtenga una cuenta, cargar sus datos en el gestor seguro o archivo privado ignorado que corresponda. Registrar aquí solo responsable, fecha y READY/NOT_READY; nunca los valores. No habilitar integraciones desde un `.env.example`.

Secuencia de cierre: probar localmente con servicios sintéticos; preparar schema QA; configurar una empresa; verificar configuración sin enviar; acordar destinatario/caso QA; hacer una prueba controlada; conservar evidencia saneada; repetir para la otra empresa. Ninguna cuenta requiere habilitar producción para escribir unit tests.

SMTP: después del build y de cargar configuración en el proceso, `npm run smtp:check -w backend` verifica conexión/autenticación sin mandar correo. `-- --send-test-to <destinatario>` sí envía y corresponde a una prueba acordada.

La limpieza de los dumps versionados/historial sigue a cargo del responsable de datos/repositorio; requiere identificar su origen y decidir el retiro coordinado. No se borraron datos ni se reescribió Git en este trabajo.
