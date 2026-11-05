# Checkpoint: boleta por pago y solicitud G3

## Validación del candidato para publicar en rama — 2026-10-28

El usuario autorizó auditar, hacer commit y push únicamente a SecurityRealiseMatrizQA; el merge a develop queda para una revisión posterior. Base auditada local/remota: 3d2c2ed9e93ef77ce266633e8270aeeb1a738c4b. El remoto de esta rama coincidía con la base al actualizar referencias. origin/develop se observó en a8d2598151c988ef8f4f4a09977fe36167d79f62; no se mezcló con el candidato.

### Corrección adicional encontrada en la auditoría

Se reprodujo con código actual y transportes ficticios que recuperar PDF o conciliar manualmente un DTE podía consultar un folio con un perfil tributario nuevo, si el operador cambiaba el perfil y sus credenciales dentro de la misma empresa. El trabajador normal ya comprobaba profileHash; faltaba la comprobación en esas rutas manuales.

Se añadió la comparación del perfil y ambiente persistidos antes de recuperar artefactos o conciliar una emisión y en la entrega central. Un perfil distinto detiene la operación antes de llamadas al proveedor o envío de correo. La lectura histórica sigue disponible. Rotar usuario/clave manteniendo el mismo perfil y RUT continúa permitido. Ocho pruebas nuevas cubren rechazo manual/directo y rotación válida, en sandbox y production. No se cambian Pago/Factura, políticas de emisión, credenciales o flags locales.

### Regresión y compilación del candidato exacto

Ejecución local aislada: 2026-10-28T15:28:42.568Z. Se copiaron 612 archivos del índice de origen más la migración autorizada, sin privados, historial Git, node_modules o datos operativos. npm ci usó el lock raíz; Node 22.23.3, TypeScript 5.9.3, Jest 30.5.2, ts-jest 29.4.14, Nodemailer 10.0.14 y Vite 6.4.4. Tras instalar dependencias públicas, el contenedor quedó únicamente en una red Docker interna sin salida externa ni puertos publicados.

| Control | Resultado |
| --- | --- |
| Backend | 776 PASS, cero FAIL, nueve omitidas; 69 suites PASS y cinco omitidas |
| Herramientas globales | 24 PASS |
| Higiene del repositorio | 7 PASS |
| Frontend runtime estático / modelo frontend | 3 / 6 PASS |
| Prototipo DTE y comprobador de accesos | 36 PASS |
| Total regresión local | 852 PASS, cero FAIL, nueve omitidas; QA_LOCAL_READY=true |
| Build backend / lint backend / build frontend | PASS / PASS / PASS |
| Prisma generate / validate | PASS / PASS con variables sintéticas |
| Compose general / Facturación local | PASS / PASS con plantilla pública y valores ficticios, sin iniciar servicios |
| PostgreSQL temporal y migración | 16 PASS, cero FAIL y cero omitidas; quince se solapan con la regresión y un caso integrado adicional |

No sumar 852 + 16: la cobertura única de esos recorridos es 853 PASS y ocho casos opt-in ajenos sin ejecutar. Los casos omitidos no se consideran aprobados. En el host faltaban dependencias para dos grupos de pruebas; la regresión representativa es la del laboratorio con las versiones fijadas, donde ambos grupos pasaron.

El ensayo PostgreSQL aplicó las cuatro migraciones tributarias anteriores y la nueva migración sobre padres mínimos y datos ficticios. Comprobó conservación de la fila sandbox previa, empresas aisladas, concurrencia/repetición con un solo procesamiento por pago, timeout incierto sin reenvío, PDF y SMTP simulados, cambio de ambiente bloqueado, separación de folios y unicidad del pago incluso entre ambientes. No reproduce todo el esquema compartido ni valida un despliegue Railway. No hubo consultas al proveedor, correos reales o bases compartidas en estas pruebas.

Huella SHA-256 de la copia inicial del candidato: 8bc4ff147c1a75be3484c281ce2334691529d2c50fc3f534dd7ed90261b000f4. Los 26 archivos modificados de código, pruebas, plantillas, Compose y migración se comparan con la copia probada antes de publicar. Los informes se actualizan después con los resultados; ello no sustituye ni altera la ejecución del código probado.

### Alcance de publicación y producción

Se publican 31 archivos: implementación y pruebas, plantillas vacías, Compose locales, cinco informes existentes y la migración ya autorizada. Los tres privados quedan fuera del commit; los perfiles completos de ambas empresas siguen únicamente en el privado local y deberán configurarse de forma privada en el entorno final. Se conserva la evidencia previa de login/version y SMTP; no se repiten emisiones o envíos reales para publicar esta preparación.

La auditoría de secretos se aplica al diff final y al contenido del índice, con Gitleaks y comparación literal de las claves privadas actuales; se verifican exclusiones antes de commit y otra vez antes del push. No se afirma una certificación de todo el historial Git. Los privados y docker-compose.railway.yml deben conservar sus huellas de inicio de esta auditoría.

RELEASE_READY=false: el candidato está validado para publicar y revisar, con producción aún desactivada. Falta validar la configuración/esquema y las integraciones del entorno final por el flujo del equipo; una boleta fiscal real, despliegue, migración compartida o merge no forman parte de este push. Se retiraron exclusivamente los dos contenedores y la red temporales, tras verificar IDs, etiquetas y ausencia de volúmenes persistentes u otros usuarios; se comprobó su ausencia. No se eliminaron archivos del host ni se alteraron los servicios habituales.

## Perfiles de ambas empresas completos y validados, sin activar emisión — 2026-10-28

Estado vigente a las 2026-10-28T15:03:40.439Z. El usuario confirmó IndServicio 3 (ventas y servicios) en continuidad con su confirmación de boletas tipo 39 y precios con IVA incluido para ambas empresas. Se completaron los dos perfiles en FACTURACION_CL_PROFILES del privado productivo existente. Ya no queda pendiente el indicador de servicio. Las etapas de borrador y bloqueos conservadas más abajo son históricas.

| Perfil | Estado | Documento y montos | Parámetros |
| --- | --- | --- | --- |
| FiNet, idEmpresa 1 | Completo, approved:true, validación PASS | BOLETA 39, precios brutos con IVA incluido | serviceIndicator 3; encoding utf8 |
| Cable Mágico, idEmpresa 2 | Completo, approved:true, validación PASS | BOLETA 39, precios brutos con IVA incluido | serviceIndicator 3; encoding utf8 |

Cada issuerRut se normalizó desde el bloque API correspondiente, sin modificar ese bloque; los dos emisores son distintos. No se copiaron RUT, usuarios, claves, correos o datos de clientes a este informe ni a código versionado. Se retiraron los borradores comentados obsoletos y se añadieron notas que distinguen aprobación del perfil de activación. La única variable activa modificada en el privado fue FACTURACION_CL_PROFILES. Las demás variables y credenciales permanecieron exactamente iguales.

### Validación de los perfiles guardados

- parsePaymentTaxProfiles del código actual acepta ambos perfiles completos. Se usó la clase FacturacionClPaymentConfig y sus funciones reales, transformadas exclusivamente en memoria y sin el decorador de inyección, sin iniciar Nest.
- validateProductionTaxConfig PASS para los dos perfiles y sus bloques reales. La comprobación evaluó un objeto de configuración aislado con producción/empresas habilitadas únicamente en memoria; no cambió process.env, flags persistentes o procesos del CRM, ni hizo solicitudes externas.
- El resolutor real seleccionó exactamente el bloque productivo de su empresa, con RUT normalizado coincidente con el perfil. Sustituir en memoria su bloque por el de la otra empresa fue rechazado por PRODUCTION_CREDENTIALS_MISSING en ambos casos; no hubo fallback.
- El constructor real produjo en memoria boletas ficticias tipo 39, indicador 3, IndMntNeto=0, folio automático 0, UTF-8 y email del proveedor vacío. Conservó el total bruto sintético de 11900 sin sumar IVA otra vez; no exigió períodos propios de indicadores 1/2.
- Relectura del archivo guardado: perfiles completos y única diferencia de variables en FACTURACION_CL_PROFILES. Cero solicitudes de emisión, correos, conexiones a bases, nuevos archivos o carpetas.

Esto es validación de configuración y construcción en memoria, no Jest, build, regresión integral, emisión productiva o aprobación tributaria del proveedor. Las 60 pruebas del ajuste de versión y las 16 pruebas posteriores de construcción son evidencia previa separada; la regresión general del 22-10 no se repitió para este cambio de configuración privada.

### Accesos y estado operativo

Se mantiene la comprobación real 2026-10-28T14:18:35.961Z: FiNet y Cable Mágico autenticaron y consultaron versión 1.2.8.1 con HTTP 200 usando FacturacionClReadClient. Un login y una consulta de versión por empresa, sin reintentos; los bloques de credenciales se conservaron después. En este cierre no se repitieron llamadas al proveedor. La procedencia productiva está declarada por el operador; el login no certifica por sí solo identidad fiscal o habilitación DTE.

Los dos PDF recibidos son de FiNet y no imprimen IndServicio ni contienen XML adjunto. Se utilizaron como referencia visual y de IVA incluido sin copiar documentos o datos de clientes al repositorio. El indicador 3 proviene de la confirmación posterior del usuario, no de una inferencia sobre esos PDF. La factura de muestra no amplía el alcance automático de boletas ni habilita facturas 33/34. La regla por pago continúa PER_PAYMENT_V1.

Los cuatro flags INTEGRATION_ENABLED, DELIVERY_ENABLED, PRODUCTION_ENABLED y PRODUCTION_PREFLIGHT_ENABLED siguen false; ambas entradas de FACTURACION_CL_COMPANIES permanecen enabled:false. Tener approved:true en el perfil no activa emisión ni carga estos privados en servicios desplegados.

Perfil productivo local: COMPLETO Y VALIDADO. Activación/despliegue: NO REALIZADOS. Antes de activar en el entorno final siguen la revisión del candidato completo, esquema/migraciones, carga privada de variables y coordinación de la entrega G2. Railway permanece intacto por decisión del usuario; no se aplicó la migración ni se iniciaron servicios. No se pide nuevamente un dato fiscal ya confirmado.

Cambios de esta continuación: privado productivo y tres informes existentes; código y otros privados intactos. Sin stage, commit, push, PR o merge. SecurityRealiseMatrizQA@3d2c2ed9e93ef77ce266633e8270aeeb1a738c4b. Auditoría de cierre sobre diff actual, migración y claves privadas vigentes; no certifica todo el historial Git.

## Perfil de Cable Mágico preparado como borrador inactivo — 2026-10-28

A petición del usuario se añadió únicamente un bloque de comentarios al final del privado productivo existente. Contiene idEmpresa 2, issuerRut tomado del bloque API que autenticó y defaultDocumentType BOLETA, manteniendo la política por pago ya elegida. El RUT del acceso no se presenta como identidad fiscal certificada por el proveedor. No se copió ningún valor privado a este informe.

El borrador está marcado approved:false y deja tipoDte, serviceIndicator y encoding como null, expresamente PENDIENTES. No es una variable activa ni un perfil que pueda cargarse en el emisor: FACTURACION_CL_PROFILES activo conserva su valor anterior. El parser exige perfiles completos y approved:true; no se cambió esa regla ni se añadieron valores fiscales inferidos para pasar la validación.

Se comprobó antes y después que parsear el privado produce exactamente el mismo mapa de variables, incluidas las credenciales de ambas empresas. Los cuatro flags siguen false. La modificación es solo de comentarios; los otros privados y docker-compose.railway.yml conservan su huella original. No hubo solicitudes externas, documentos, correo, acceso a bases, nuevos archivos/carpetas, stage, commit o push. El lector y sus pruebas no cambiaron respecto de las 60 comprobaciones dirigidas registradas abajo.

Para finalizar el perfil activo faltan los valores confirmados por el responsable o una muestra corporativa válida: tipo de boleta 39/41 e indicador de servicio. La codificación debe acordarse con el KIT o especificación de integración del proveedor; no es necesario que el usuario decida un detalle técnico sin esa referencia. El [manual de boleta TXT](https://www.facturacion.cl/manualintegracion/archivoboletaelectronica.php) documenta esos campos; no determina cuáles usa específicamente Cable Mágico. No se declara producción lista ni se activa emisión con el borrador.

## Cable Mágico: autenticación real y lectura de versión verificadas — 2026-10-28

Este apartado fija el estado actual de Cable Mágico y sustituye para esa empresa el bloqueo de autenticación del 22-10. Alcance solicitado: únicamente CABLE_MAGICO, idEmpresa 2. No se autenticó FiNet ni se modificaron sus datos. Rama SecurityRealiseMatrizQA; HEAD 3d2c2ed9e93ef77ce266633e8270aeeb1a738c4b, sin stage, commit, push, merge o PR.

El usuario confirmó la corrección de las credenciales en el privado productivo. El bloque de Cable Mágico es JSON completo, tiene RUT con formato/dígito verificador válido y no corresponde a la identidad DEMO compartida bloqueada localmente. Sus valores se leyeron exclusivamente en memoria; no se muestran en este informe.

| Operación real | Resultado |
| --- | --- |
| Primera comprobación, 2026-10-28T13:53:43.386Z | POST /login: PASS, HTTP 200; GET /wsds/version: HTTP 200 y version como array de un string; el comprobador anterior devuelve UNEXPECTED_RESPONSE |
| Verificación del lector real actualizado, 2026-10-28T14:00:18.912Z | authenticate(2): PASS; version(2): VERIFIED, versión numérica 1.2.8.1; ambas respuestas HTTP 200 |
| Comprobador independiente actualizado | PASS login y versión al reproducir en memoria las mismas dos respuestas de la segunda comprobación; no hizo otras conexiones |
| Operaciones externas de esta continuación | Dos logins y dos consultas de versión en total; cero reintentos automáticos, cero solicitudes /procesar, PDF, correo o conexiones a bases |

La documentación REST muestra version como string, pero la respuesta observada contiene una lista de un solo string numérico. Se ajustaron únicamente el lector de versión y el comprobador existentes, con sus pruebas: se acepta el string numérico documentado o una lista de exactamente un string numérico con puntos. Se conserva la forma version:array en el resultado. Listas vacías, múltiples, anidadas, objetos, números, texto arbitrario, espacios/saltos de línea y HTTP fallidos siguen rechazados. No se cambiaron políticas de emisión, autorización, aislamiento, idempotencia ni secretos.

Validación local nueva: 22 pruebas existentes/actualizadas del comprobador PASS y 38 pruebas dirigidas PASS sobre FacturacionClReadClient importado desde el código real de esta rama, usando Node 24.22.1 y la transformación TypeScript de Node en memoria. Incluyen respuestas válidas/inválidas en ambos ambientes, HTTP fallido, aislamiento de tokens y controles productivos. Total: 60 PASS, cero FAIL y cero omitidas. El spec Jest actualizado también se transformó sin errores de sintaxis; no se ejecutó Jest ni el build/lint/regresión completos por ausencia de dependencias locales y Docker apagado. No se instalaron paquetes, iniciaron servicios ni crearon archivos/carpetas de pruebas. La regresión de 826 pruebas del 22-10 y su snapshot son históricos; no se presentan como una nueva ejecución ni como identidad del código modificado hoy.

Los tres privados y docker-compose.railway.yml permanecieron byte a byte iguales durante la revisión. Los cuatro flags persistentes INTEGRATION_ENABLED, DELIVERY_ENABLED, PRODUCTION_ENABLED y PRODUCTION_PREFLIGHT_ENABLED siguen false. Para el diagnóstico se habilitó únicamente una instancia aislada de lectura, con transporte restringido a un login y una consulta de versión por recorrido; no se cargó el backend completo. No se alteró .env.railway, Railway, migraciones, bases, SMTP o emisión.

Estado verificable: autenticación técnica de Cable Mágico y disponibilidad/versión PASS. La procedencia productiva está declarada por el operador; el login no certifica por sí solo identidad fiscal, habilitación DTE ni paso a producción. issuerIdentityVerified=false y productionReady=false. FACTURACION_CL_PROFILES no contiene perfil de Cable Mágico: falta confirmar y aprobar tipo de boleta, indicador de servicio, codificación y emisor. No se inventaron esos datos. Persisten la revisión/aplicación de esquema en el entorno final y coordinación G2; fuera del alcance actual de Railway.

Auditoría de cierre: Gitleaks PASS sobre el diff actual y la migración no versionada; cero coincidencias literales de las claves de los tres privados en los archivos versionados y la migración. Los privados siguen ignorados y no versionados, sin valores en la salida. Diff check PASS y nada staged. La comprobación no certifica todo el historial Git. No se crearon nuevos archivos de repositorio; la migración ya autorizada sigue siendo el único archivo untracked previo.

## Error de autenticación identificado, sin secretos — 2026-10-22

Al revisar el texto recibido del compañero se detectó que al diagnóstico anterior le faltaba el mensaje de error saneado. Se realizó una única consulta adicional de login por empresa, con los valores guardados, sin otras combinaciones y sin habilitar el emisor. La redacción se aplicó en memoria antes de cualquier salida: claves, usuarios, RUT, correos, URLs y posibles tokens no se muestran ni se guardan.

| Empresa | HTTP | Mensaje saneado del proveedor | Token | Emisiones |
| --- | --- | --- | --- | --- |
| FiNet | 200 | Clave de empresa no es valida. | No | 0 |
| Cable Mágico | 200 | Clave de empresa no es valida. | No | 0 |

Este mensaje concreta el fallo de autenticación que antes solo se había registrado como error:string. El proveedor informa una clave de empresa no válida para la solicitud enviada. Debe confirmarse el bloque API completo y, en particular, la clave de integración correspondiente a ese RUT. El resultado no demuestra que las cuentas sean DEMO ni que las credenciales REST deban ser distintas de SOAP. Tampoco señala un fallo SMTP, de base de datos o de Railway.

Siguiente paso: verificar en la cuenta autorizada de cada empresa su sección de integración/productivo o solicitar al proveedor que explique ese mensaje y confirme la correspondencia del bloque usuario/RUT/clave con el servicio REST. No cambiar contraseñas del portal o SMTP para resolver por suposición un error de API. No se repiten conexiones hasta contar con corrección o confirmación contractual. La consulta del SII es una verificación distinta y no sustituye el login del proveedor; no se consultaron aquí RUT empresariales en el SII.

Estos dos logins se añaden a los cuatro del diagnóstico anterior: seis en total desde la reafirmación del usuario, tres por empresa, todos con la misma combinación guardada y sin reintentos automáticos. Cero emisiones, correos, consultas de versión o bases. Los tres privados permanecieron byte a byte idénticos; sin archivos nuevos, cambios de código/políticas, commit/push/PR ni acciones en Railway. SMTP conserva sus dos verificaciones exitosas anteriores. El contenido de los apartados previos describe los resultados disponibles antes de este detalle adicional.

## Diagnóstico de accesos declarados productivos — 2026-10-22

El usuario reafirmó que los bloques guardados corresponden a producción. Se conserva esa procedencia como declaración del operador; no se concluye que sean DEMO únicamente por el usuario utilizado. La regla preventiva DEMOFE del verificador/emisor es local, no prueba del ambiente ni resultado de autenticación del proveedor. En particular, el bloqueo local registrado previamente para FiNet no fue un rechazo remoto de su contraseña.

Para distinguir ambos hechos se ejecutó un diagnóstico de autenticación independiente y otro de estructura de la respuesta, sin usar el emisor ni cambiar políticas. Se utilizaron exclusivamente los tres valores guardados de cada empresa; solo se normalizó en memoria el RUT de la misma forma que el runtime. No se alteraron archivos privados ni se ensayaron combinaciones distintas.

| Empresa | Respuesta del proveedor | Token esperado o alternativo | Versión | Resultado verificable |
| --- | --- | --- | --- | --- |
| FiNet | HTTP 200; objeto con error:string | Ausente | NOT_RUN | FAIL_NO_EXPECTED_TOKEN |
| Cable Mágico | HTTP 200; objeto con error:string | Ausente | NOT_RUN | FAIL_NO_EXPECTED_TOKEN |

El contenido del error no se imprimió ni se guardó. La forma de esa respuesta permite constatar que no se obtuvo una sesión API según el contrato documentado, pero no identifica por sí sola una contraseña incorrecta, una cuenta de prueba, falta de permisos, habilitación o una diferencia contractual. No se presenta ninguna de esas hipótesis como causa confirmada.

Fueron dos diagnósticos por empresa, cuatro solicitudes POST /login en total, sin reintentos automáticos ni otras claves/usuarios. Cero llamadas de emisión, consultas de versión posteriores, recuperación de PDF, correo o bases de datos. Los cuatro flags productivos siguen false. El proceso de diagnóstico se ejecutó por stdin en un contenedor existente, sin nuevos archivos, imágenes o contenedores y sin reiniciar servicios. Se detienen aquí las repeticiones hasta que haya una corrección confirmada o una explicación del proveedor.

**Bloqueo actual para la activación: autenticación API aún no acreditada con los accesos declarados productivos.** No se solicita cambiar las claves por su nombre ni se relajan controles para forzar un PASS. Corresponde confirmar con el administrador/proveedor la habilitación REST y el bloque API completo de cada emisor; no compartir valores por el chat/grupo. La consulta concreta y la secuencia de cierre están en [preparación de producción](i3-production-deployment-readiness.md).

Para el alcance inicial de boleta ya elegido, el perfil requiere confirmar el tipo 39/41, indicador de servicio y codificación; no hace falta inventar un rango de factura. SMTP de ambas empresas ya está verificado. Las migraciones del entorno final y la incorporación coordinada del contrato tributario G2 quedan para el flujo de entrega, con Railway intacto y sin commit/push autorizados.

Referencias de GitHub actualizadas solo para revisión: origin/develop 3ee25df1304edbda9225af4355d56a67126b5aff; HEAD local y remoto de SecurityRealiseMatrizQA continúan 3d2c2ed9. Hay tres commits exclusivos de nuestra rama y 32 de develop; no se hizo merge. Los módulos tributario/SMTP publicados contienen cambios propios y la ruta tributaria G2 de develop aún no está en esta rama. Los seis archivos con cambios en ambos lados incluyen ejemplos, pruebas de Billing/Prospects, Prospects y locks; cualquier integración debe revisarlos antes de un despliegue.

Los documentos existentes de preparación y manifiesto de variables se actualizaron en su alcance Facturación.cl/SMTP/G2, sin aplicar configuración a Railway. El código permanece igual al snapshot probado; no se vuelve a contar la regresión de 826 pruebas como una nueva ejecución ni se cuentan estos diagnósticos como emisiones o tests unitarios.

Auditoría de cierre de esta continuación: Gitleaks PASS sobre el diff local y la migración nueva, y PASS sobre los cambios nuevos de develop revisados; cero coincidencias literales de las claves privadas actuales en archivos versionados/migración o en ese diff remoto. Los tres privados siguen ignorados y no versionados. El código y las plantillas coinciden con los 26 archivos del snapshot ya probado; solo se actualizaron informes. Diff check PASS, nada staged y HEAD intacto. Estos controles no certifican todo el historial Git ni autorizan publicación.

## SMTP de ambas empresas: autenticación verificada — 2026-10-22

Registro: 2026-10-22 18:50 UTC (15:50 America/Santiago). El usuario confirmó la carga manual y guardado de los bloques por empresa en .env.smtp-private. Los usuarios, claves y remitentes estaban completos; únicamente faltaban los dos HOST. Tras confirmar en memoria que ambas cuentas eran Gmail y distintas, se completaron solo SMTP_FINET_HOST y SMTP_CABLE_MAGICO_HOST con smtp.gmail.com. El resto de valores privados, incluidas las claves, permaneció idéntico.

| Empresa | Conexión / autenticación | Seguridad | Mensajes enviados |
| --- | --- | --- | --- |
| FiNet, idEmpresa 1 | ready, authenticated=true | Puerto 587, STARTTLS obligatorio, certificado verificado, TLS mínimo 1.2 | 0 |
| Cable Mágico, idEmpresa 2 | ready, authenticated=true | Puerto 587, STARTTLS obligatorio, certificado verificado, TLS mínimo 1.2 | 0 |

Se utilizó MailService.verifyConnection y la configuración SMTP del código actual, compilados únicamente en memoria en un proceso separado de un contenedor existente. Dependencias: Node 22.23.3, TypeScript 5.9.3 y Nodemailer 10.0.14; las dos últimas coinciden con el lock de la rama. Se proporcionaron solo las variables SMTP necesarias por stdin, sin archivos nuevos, variables fiscales/de base, comandos con claves, logs de protocolo, reinicios o modificación del proceso del CRM. Dos verificaciones, cero llamadas sendMail; el arnés bloqueaba cualquier intento de envío.

Resultado: ambos bloques SMTP locales están listos para autenticar. Esto no prueba aceptación del remitente mediante DATA, recepción en bandeja ni entrega automática desde un backend desplegado. Las recepciones anteriores siguen siendo evidencias históricas separadas. No se emitieron documentos, consultaron bases o tocaron servicios/configuración Railway. No hubo stage, commit, push o PR.

Los pendientes actuales son cargar estos privados en el entorno de ejecución autorizado y resolver API/identidad/perfil fiscal del emisor de cada empresa. No se vuelven a pedir credenciales SMTP ya comprobadas. Los flags de integración y entrega tributaria siguen false; la comprobación SMTP no los modifica ni habilita producción fiscal. El siguiente apartado conserva las pruebas de código y migración, sin sumar estas comprobaciones externas al número de tests unitarios.

## Cierre de preparación productiva local — 2026-10-22

**Preparación local PASS; producción sin activar ni desplegar.** Alcance confirmado por el usuario: dejar preparado para producción sin usar datos reales. Base SecurityRealiseMatrizQA@3d2c2ed9e93ef77ce266633e8270aeeb1a738c4b más cambios locales sin publicar. Este apartado fija el estado vigente; las matrices y resultados fechados que siguen son históricos.

Código compatible con ambos ambientes, activación productiva explícita y aislamiento de credenciales, trabajos, intenciones, folios, recuperación y correo por empresa/ambiente. Cambiar de ambiente bloquea reprocesamiento; se conserva la lectura del historial. Los perfiles, datos fiscales y credenciales reales no se incorporaron al código ni a las pruebas. READY_PRODUCTION expresa controles locales de configuración/esquema, no certificación fiscal ni autenticación del proveedor.

### Validación final

| Control | Resultado |
| --- | --- |
| Regresión backend | 753 PASS, cero FAIL, nueve omitidas; 69 suites PASS y cinco omitidas |
| Herramientas globales / higiene / frontend estático / modelo frontend / prototipo DTE | 24 / 7 / 3 / 6 / 33 PASS |
| Total regresión local | 826 PASS, cero FAIL, nueve omitidas; QA_LOCAL_READY=true, RELEASE_READY=false |
| PostgreSQL temporal: pruebas dirigidas | 16 PASS, cero FAIL, cero omitidas; quince ya incluidas en la regresión y un caso integrado adicional |
| Build y lint backend; build frontend | PASS |
| Prisma validate y generate | PASS; configuración sintética |
| Compose local general y Facturación | PASS; plantilla pública y variables ficticias requeridas, sin cargar privados ni iniciar servicios |
| Diff check / Gitleaks diff + migración | PASS / PASS |
| Secretos privados actuales frente a archivos versionados + migración | Cero coincidencias; los tres privados ignorados y no versionados |
| Migraciones históricas / docker-compose.railway.yml | Sin cambios |
| Stage, commit, push, PR, merge en esta etapa | Ninguno |

Regresión ejecutada a las 2026-10-22T18:05:53.706Z (15:05 America/Santiago). Snapshot probado SHA-256: 87c7bc5126d6d9441c97adbbc2f5738aaa50370304186cdbef12d6fa4cb406d6. Comparación posterior de los 26 archivos modificados de código, plantillas, Compose y migración: idénticos a los del contenedor probado; huella del mapa ordenado ruta/SHA-256: 18ad98fb7f2cc48e5a5162a62d713ed76cdec92247482baa354fa49c636580aa. La actualización posterior de estos informes no altera el código probado.

No sumar 826 + 16: el caso PostgreSQL adicional sustituye uno de los omitidos de la regresión. Cobertura única de los dos recorridos: 827 PASS y ocho casos opt-in ajenos sin ejecutar. Las omisiones no se consideran aprobadas. El resultado de preparación local no se presenta como cierre del encargo externo ni como RELEASE_READY.

### Persistencia y ensayo sin datos reales

Nueva migración autorizada: backend/prisma/migrations/20261022010000_i3_tax_production_preparation/migration.sql. SHA-256 e06687281f0539207a2271b5351447764c9c84b08917232b6f446026dd74f6cf. Permite sandbox/production en tax_payment_job y añade ambiente a la clave de folio reservado. Conserva la unicidad de id_pago, la propiedad financiera y las filas sandbox; ninguna migración histórica fue alterada. Aplicada solo en la base temporal finet_tax_preproduction.

El fixture incorpora las migraciones tributarias históricas sobre tablas padre mínimas; no pretende reproducir todo el esquema compartido. Se verificó la fila sandbox anterior, rechazo del ambiente desconocido, folio compartido solo entre ambientes distintos y duplicado de pago rechazado incluso con distinto ambiente/folio. El ensayo integrado recorrió dos empresas ficticias, pagos concurrentes/repetidos, PDF y correo simulados, timeout incierto sin reintento y cambio de ambiente. Toda llamada fiscal fue interceptada por el transporte ficticio. El correo quedó SIMULADO; no se acredita bandeja externa.

Entorno: contenedor temporal Node 22 y PostgreSQL 16, sin privados, sin montajes del repositorio y sin puertos publicados. Dependencias instaladas antes del aislamiento; ejecución de pruebas en red Docker interna sin acceso externo. Los servicios habituales del CRM/HumWorld no se modificaron. Al cerrar se retiraron únicamente finet-prod-ready-20261022-qa, finet-prod-ready-db, su volumen anónimo y finet-prod-ready-net; se verificó la ausencia de esos recursos. No se eliminaron imágenes ni volúmenes de otros servicios.

### Configuración y pendientes de activación

.env.facturacion-production-private conserva los valores introducidos por el usuario y permanece ignorado. INTEGRATION_ENABLED, DELIVERY_ENABLED, PRODUCTION_ENABLED y PRODUCTION_PREFLIGHT_ENABLED están false; las dos empresas productivas están enabled:false y PROFILES vacío. El privado sandbox conserva sus entradas anteriores y sus flags globales false. No se autentica ni se emite usando los privados en esta etapa.

En .env.smtp-private se prepararon inicialmente campos vacíos por empresa donde faltaban, conservando la configuración global anterior y sin copiar contraseñas. El usuario los completó después; ambos bloques pasaron la comprobación SMTP sin mensaje registrada al inicio. El transporte por empresa conserva la ausencia de fallback global. No se enviaron nuevos correos externos.

Antes de activar fuera del laboratorio: confirmar API/ambiente y emisor propio; completar y aprobar perfil, DTE/folios y política fiscal; cargar los SMTP por empresa ya verificados en el entorno de ejecución acordado; revisar esquema/migraciones del entorno y coordinar G2. Personalización y muestras oficiales del proveedor siguen pendientes. Las credenciales DEMO anteriores no certifican las dos cuentas productivas.

La revisión automática rechazó modificar docker-compose.railway.yml para cargar privados por riesgo de exposición y falta de autorización específica; el archivo permanece intacto. La propuesta concreta y sus límites constan en el informe de integración. No se realizó conexión a Railway, despliegue ni modificación de su base. El usuario decidió después mantener Railway intacto y continuar únicamente con la preparación local. Esa modificación queda fuera del alcance actual: no hay aprobación pendiente que deba interpretarse como autorización futura.

## Continuación local: configuración manual pendiente — 2026-10-22

Decisión del usuario: mantener Railway intacto. Esta revisión no modifica docker-compose.railway.yml, .env.railway, su base, servicios o despliegues. Tampoco autoriza commit/push; los cambios siguen locales en SecurityRealiseMatrizQA con el mismo HEAD. No se crearon archivos, carpetas, ramas ni contenedores en esta continuación.

Se inspeccionaron únicamente presencia, formato y estado de campos de los tres privados en memoria, sin mostrar sus valores ni realizar nuevas autenticaciones, emisiones o envíos. Resultado actual:

| Parte | Estado local | Acción siguiente |
| --- | --- | --- |
| SMTP FiNet | Actualizado: bloque completo y autenticación ready | Ver la comprobación SMTP al inicio; sin nuevo envío |
| SMTP Cable Mágico | Actualizado: bloque completo y autenticación ready | Ver la comprobación SMTP al inicio; sin nuevo envío |
| API productiva FiNet | Usuario declara procedencia productiva; diagnóstico remoto sin token, error:string | Confirmar habilitación REST y bloque API completo con el administrador/proveedor; ver diagnóstico vigente al inicio |
| API productiva Cable Mágico | Usuario declara procedencia productiva; diagnóstico remoto sin token, error:string | Confirmar habilitación REST y bloque API completo con el administrador/proveedor; no repetir sin cambio o explicación contractual |
| Perfil fiscal productivo | PROFILES vacío y ambas empresas deshabilitadas | Confirmar perfil, tipos de documento y folios con el responsable antes de completar/activar |
| Integración y entrega | Flags persistentes false | Conservarlos así durante la preparación; ninguna acción de esta continuación los habilita |

El SMTP global anterior sigue conservado, pero no reemplaza los bloques por empresa: el código actual rechaza ese fallback. La recepción externa histórica no acreditaba los nuevos prefijos; la comprobación posterior sin mensaje, registrada al inicio, verifica ahora su autenticación. No se copiaron automáticamente las claves globales ni las compartidas por chat.

La siguiente comprobación SMTP prevista aquí se completó posteriormente tras el aviso del usuario: formato privado y TLS/autenticación de ambas empresas PASS, sin mensaje. La evidencia vigente está al inicio. Un nuevo correo de prueba requeriría destinatario y envío autorizados; la verificación sin DATA no prueba recepción en bandeja. No cargar el privado sandbox junto al productivo para intentar combinar identidades; se selecciona el ambiente y sus credenciales de forma explícita.

La evidencia técnica y los 826 resultados de regresión anteriores siguen vigentes para el código sin cambios; esta continuación de configuración/documentación no ejecuta de nuevo la suite ni añade resultados ficticios a la matriz.

## Preparación de privados y comprobación productiva — 2026-10-22

Base: SecurityRealiseMatrizQA@3d2c2ed9e93ef77ce266633e8270aeeb1a738c4b. El usuario autorizó preparar producción y crear los .env faltantes. Se creó únicamente .env.facturacion-production-private, con bloques API productivos vacíos de ambas empresas y los tres flags en false. Está ignorado y no versionado; los otros privados se conservaron sin cambios y el archivo nuevo está fuera de los contextos Docker actuales.

La herramienta existente de autenticación/versión incorpora un modo productivo independiente, sin emisión y sin acceso a base de datos. Se conservaron los bloqueos del CRM y todos los controles de sandbox. Los nombres vacíos se documentaron en .env.example; ningún secreto se copió desde el chat. No se crearon carpetas, scripts ni documentos adicionales.

Verificador: 19 pruebas PASS, cero FAIL, 14 nuevas. La selección por empresa no admite fallback a sandbox/global/otra empresa; DEMO no se reclasifica como producción; errores, cuerpos y tokens no se imprimen. El resultado de autenticación no certifica emisor, folios, DTE ni preparación productiva. Las credenciales productivas siguen pendientes de completar manualmente; no se ejecutaron llamadas productivas, emisiones ni correos nuevos.

Regresión ejecutada el 2026-10-22T16:19:47.150Z (13:19 America/Santiago): 807 PASS, cero FAIL y ocho omitidas. Backend 736; herramientas globales 22; higiene 7; frontend estático 3; modelo frontend 6; prototipo/verificador DTE 33. Backend build/lint y Prisma validate/generate PASS. Snapshot versionado probado SHA-256: 5c6892b65870fe4834c8db8b07be1a5959b34de680f75566ae4426cc2ba5d3cd; las actualizaciones posteriores de este informe no cambian el código probado. QA_LOCAL_READY=true y RELEASE_READY=false.

El contenedor temporal se preparó únicamente con los 611 archivos versionados, npm ci desde el lock actual y cero privados, montajes o puertos; se desconectó de la red antes de validar y probar. Cero accesos a Railway, base de datos o proveedores externos. Las ocho pruebas opt-in omitidas no se consideran aprobadas. El contenedor fue eliminado y se comprobó su ausencia; los servicios habituales no se modificaron.

La revisión previa a la carga del usuario confirmó que ambos bloques productivos estaban sin completar y los tres flags seguían false; en ese punto no se intentó autenticar con campos vacíos. La carga y comprobación posterior se documentan a continuación. Este apartado describe preparación y pruebas locales; no confirma despliegue. No se publicaron los cambios de esta etapa ni se efectuaron merges/PR.



### Carga manual y comprobación de accesos — 2026-10-22

El usuario confirmó haber guardado los accesos. En los dos bloques se habían reemplazado los nombres de las propiedades JSON por los datos, dejando valores vacíos. Se normalizó únicamente ese formato dentro del mismo privado, conservando exactamente usuario/RUT/clave introducidos; se añadieron comillas externas seguras para dotenv. No se copiaron secretos a otros archivos ni se crearon respaldos.

| Empresa | Resultado de la comprobación sin emisión |
| --- | --- |
| FiNet | DEMO_CREDENTIALS_NOT_PRODUCTION. La identidad introducida coincide con la cuenta DEMO conocida; se rechazó antes de conectar. Login y versión no ejecutados. |
| Cable Mágico | Login FAIL, HTTP 200, sin token válido según el contrato esperado; versión NOT_RUN. No se acredita autenticación ni ambiente fiscal a partir del estado HTTP. |

El preflight se habilitó solamente en el proceso hijo; los tres flags persistentes continúan false. Cero solicitudes de emisión, correos, conexiones a base de datos o Railway; no hubo reintentos ni pruebas con otras combinaciones. No se imprimieron cuerpos remotos, credenciales ni tokens.

Siguiente paso: sustituir manualmente el acceso DEMO de FiNet por el de API de Ambiente Producción y verificar/copiar nuevamente el acceso API de Cable Mágico desde su sección de credenciales. El resultado de Cable Mágico no permite afirmar por sí solo si la causa es la clave, el usuario/RUT, permisos o una discrepancia contractual. Mantener la emisión bloqueada hasta resolver la autenticación y el resto de requisitos productivos. No se desplegó, emitió, hizo commit/push ni creó PR en esta comprobación.



### Aclaración del DEMO y datos empresariales posteriores — 2026-10-22

El usuario reenvió los dos mensajes del proveedor: contienen el mismo acceso DEMO y el mismo portal de consulta. También aportó razón social, RUT y dirección de ambas empresas y un correo comercial de Cable Mágico. Se validó el dígito verificador de los dos RUT empresariales y se contrastaron en memoria con los campos introducidos; no se guardaron esos datos fiscales ni secretos nuevos en fuentes versionadas.

Se ejecutó una comprobación adicional estrictamente de autenticación/versión, sin emitir:
- DEMO compartido, usando el privado sandbox existente: login PASS, HTTP 200. Versión HTTP 200, UNEXPECTED_RESPONSE con forma version:array; se conserva la discrepancia contractual.
- FiNet empresarial: el usuario DEMO combinado con el RUT empresarial sigue rechazado localmente por DEMO_CREDENTIALS_NOT_PRODUCTION, antes de conectar. Este resultado no es un rechazo de contraseña por el proveedor.
- Cable Mágico empresarial: se descartó únicamente el formato con puntos del RUT, sin modificar el archivo ni la identidad; login FAIL HTTP 200, sin token, versión NOT_RUN. No se probaron otras contraseñas ni combinaciones.

Las credenciales DEMO sí autentican en el servicio. Eso no demuestra acceso productivo a los emisores reales, y reemplazar el RUT del acceso DEMO por el RUT fiscal de una empresa mezcla identidades. Los nombres, domicilios y RUT fiscales permiten preparar la identidad empresarial, pero no reemplazan las credenciales API entregadas para ella.

El manual oficial diferencia acceso API, acceso web y ambientes, y describe el campo Puerto de SOAP para impresión automática; el cliente actual usa REST. No se cambia el protocolo para eludir el resultado de autenticación. Pendiente confirmar con proveedor/administrador el bloque completo de API de Ambiente Producción de cada emisor y su habilitación. Los flags siguen false: cero nuevas emisiones, correos o conexiones a Railway; no se modificaron privados en esta comprobación.


## Publicación técnica autorizada — 2026-10-20

El usuario autorizó el commit y push del avance verificado a `SecurityRealiseMatrizQA`. Alcance: código SMTP por empresa, renovación de PDF, pruebas, ejemplos vacíos, compose locales, informes y las dos propuestas SVG autorizadas. No incluye privados, credenciales, cambios de esquema/migraciones, merge a develop/main ni creación de PR. El resultado de publicación se confirma con el SHA remoto en el cierre de la tarea; los apartados anteriores de preparación documentan el trabajo antes de publicar.

Validación técnica disponible: 793 pruebas PASS, cero FAIL, ocho omitidas; build/lint backend, Prisma validate/generate y configuración de los dos compose PASS. Compatibilidad en contenedor temporal con el módulo G2 del PR #51: 259 pruebas PASS y build/lint PASS. Los controles de secretos y diff se vuelven a comprobar sobre exactamente los 19 archivos a publicar (17 modificados y dos SVG nuevos). Las propuestas de identidad continúan pendientes de aprobación y no se han subido al proveedor.

**Para terminar el encargo externo faltan estas comprobaciones concretas:**

1. Configurar el mapa y las variables SMTP por empresa en el entorno privado de ejecución. El código y los compose ya lo admiten; el privado no se completó automáticamente. Un envío con empresa sin su propio mapa/host queda NO_CONFIGURADO.
2. Verificar la API y el ambiente autorizado de cada emisor empresarial. Los dos bloques reenviados son el mismo DEMO; el portal de Cable Mágico fue accesible y muestra secciones de pruebas/producción, pero eso no certifica autenticación API productiva ni la identidad fiscal de FiNet. No introducir credenciales productivas en perfiles SANDBOX.
3. Aprobar los diseños del equipo, confirmar el procedimiento de personalización del proveedor y obtener las dos muestras PDF con su identidad correcta. La pantalla de campos adicionales no acredita un editor completo de logos/plantillas. No alterar después un PDF oficial para aparentar esa configuración.
4. Ejecutar el ensayo integrado por empresa en el ambiente acordado: pago/abono, PDF, correo recibido y repetición sin nuevo pago/DTE/correo. Incorporar coordinadamente el PR #51 y comprobar el consumo desde G2. No se afirma que esas pruebas externas ya se hicieron con dos emisores propios.

La aprobación fiscal de PER_PAYMENT_V1, DTE/folios, revisión del esquema compartido y autorización productiva siguen siendo requisitos independientes antes de operar en producción. Publicar este avance técnico no habilita emisión productiva.

## Preparación del cierre de ambas empresas — 2026-10-20

**Resultado: preparación técnica local PASS; cierre completo del encargo BLOQUEADO por verificaciones externas; producción NO_GO.** Se trabajó sobre `SecurityRealiseMatrizQA@0ad059dc53ee13ebd6ada8fed81dde9aefb20b40`, conservando las modificaciones anteriores. En la preparación inicial no se crearon archivos/carpetas en la PC, ramas ni PR; posteriormente se autorizaron únicamente los dos SVG de propuesta. Esta etapa se preparó sin stage, commit o push; el usuario autorizó después publicar el avance, como se documenta al inicio.

### Matriz del nuevo encargo

| Requisito | Resultado | Evidencia / condición de cierre |
| --- | --- | --- |
| 1. Cuentas empresariales propias | BLOQUEADO | En el privado local solo está configurada FiNet en sandbox; Cable Mágico no tiene perfil ni credenciales API cargados. La afirmación del encargo sobre cuentas reales requiere confirmar ambiente y emisor; no se autenticó con nuevas cuentas. |
| 2. Personalización oficial del PDF | BLOQUEADO | Investigación del manual oficial realizada; no se acredita un procedimiento de logo/plantilla ni un endpoint de personalización. Falta acceso/confirmación del proveedor para cada cuenta. Ver procedimiento de comprobación en el informe de integración. |
| 3. Muestra corporativa FiNet | BLOQUEADO | Faltan logo oficial autorizado, datos fiscales aprobados, configuración del proveedor y autorización del ensayo. La muestra DEMO anterior no acredita el emisor propio. |
| 4. Muestra corporativa Cable Mágico | BLOQUEADO | Mismos requisitos, independientes de FiNet. No se fabricó una boleta oficial ni se alteró un PDF emitido. |
| 5. Constructor y recuperación | PASS_LOCAL | TXT 39/41 y XML 33/34 conservados; 16 pruebas del constructor. Renovación del enlace del mismo folio sin procesar otro DTE, con ocho pruebas adicionales ya incorporadas al spec del emisor. |
| 6. Política tributaria | BLOQUEADO | PER_PAYMENT_V1 implementada, pero falta aprobación fiscal/administrativa para uso real, DTE habilitados, identidad, IVA/redondeo y folios propios. |
| 7. Correcciones técnicas | PASS_LOCAL | Dos fallos de Cobranza resueltos controlando únicamente el reloj Jest. Regresión: 793 PASS, 0 FAIL, 8 omitidas. |
| 8a. SMTP por empresa | PASS_LOCAL | Selección por idEmpresa, credenciales separadas, sin respaldo global para correos con empresa, firma por remitente y PDF separado. 42 pruebas de MailService, incluidas 16 nuevas de aislamiento. |
| 8b. Compatibilidad con G2 | PASS_LOCAL | Overlay temporal del módulo G2 del PR #51 junto a nuestros cambios: 259 pruebas PASS, build/lint PASS. Sin merge ni cambios G2 en la PC. |
| 8c. Prueba externa completa por empresa | BLOQUEADO | FiNet cuenta DEMO con PDF/correo confirmado el 15-10; Cable Mágico envío simple confirmado el 19-10. No constituyen dos emisores empresariales propios con PDF corporativo. Falta configurar el nuevo mapa SMTP en el privado, coordinar Responsable 1 y probar el portal G2. |
| 9. Git y develop | BLOQUEADO | Revisión actualizada: origin/develop e56be1f1, dos commits propios y 24 remotos no incorporados; los módulos Mail publicados coinciden. No se fusionaron ni publicaron cambios antes de revisión. |
| 10. Informe y muestras | BLOQUEADO | Matriz y resultados consolidados en documentos existentes. Faltan las dos muestras oficiales y los respaldos externos para declarar cierre. |

### Verificaciones ejecutadas

Snapshot probado a las 13:27 America/Santiago (2026-10-20T16:27:28.706Z), base 0ad059dc más cambios locales de código y ejemplos. SHA-256 del árbol versionado en ese snapshot: `e354553aa8721e26684b1855927ba0e3ffd39e1f6849a90e90d920f2323fdd2a`. Las actualizaciones posteriores de informes y compose se verificaron por separado; el hash identifica el snapshot de pruebas, no un commit nuevo.

| Control | Resultado |
| --- | --- |
| Backend | 736 PASS, 0 FAIL, 8 omitidas; 69 suites PASS, cinco omitidas |
| Herramientas de esquema / higiene / frontend estático / modelo frontend / prototipo DTE | 22 / 7 / 3 / 6 / 19 PASS |
| Total local | 793 PASS, 0 FAIL, 8 omitidas; QA_LOCAL_READY=true, RELEASE_READY=false |
| MailService / BillingService / ProspectsService | 42 PASS / 24 PASS / 14 PASS |
| Prisma validate y generate | PASS con URL sintética de loopback no accesible |
| Backend build y lint completo | PASS |
| Compose local general y Facturación | PASS de configuración con dos credenciales sintéticas separadas; sin iniciar servicios ni leer privados |
| Conjunto temporal con PR G2 #51 | 259 PASS, 0 FAIL, 0 omitidas; 15 suites; build y lint completos PASS |
| Proveedor, correo externo, Railway y otras integraciones durante la regresión local | Cero accesos / emisiones / envíos nuevos; consulta web posterior descrita por separado |

Las ocho pruebas omitidas pertenecen a cinco suites opt-in de PostgreSQL/CRM; no se contaron como aprobadas. El entorno de pruebas fue un contenedor temporal Node 22 sin privados, montajes ni puertos, con la red desconectada después de instalar dependencias. Los servidores SMTP de las pruebas usan loopback, certificados efímeros y PDFs ficticios; no son evidencia fiscal ni de bandejas externas.

La compatibilidad G2 se probó aplicando únicamente `backend/src/g2-integration/` del PR [#51](https://github.com/FSM-Finet-y-Cable-Magico/Team_8---CRM/pull/51), cabeza `d2486b45171aac5d3bfe1930c60d2e7503577a17`, dentro del contenedor. Cubre contrato HTTP, autorización y exclusión de sandbox. El endpoint tributario sigue perteneciendo a ese PR: no se duplicó en esta rama ni se ejecutó su seed. No se acredita una prueba desde el portal real.

### Archivos para revisión

- Selección y servicio SMTP: backend/src/mail/smtp.config.ts, mail.service.ts y tax-document-delivery.port.ts; verificador backend/scripts/check-smtp.cjs.
- Contexto de empresa y recuperación: backend/src/tax-document-issuance/facturacion-cl.issuer.ts y backend/src/prospects/prospects.service.ts.
- Pruebas existentes ampliadas: MailService, FacturacionClIssuer, ProspectsService y reloj de BillingService. La prueba nueva de prospectos comprueba que un administrador de otra empresa conserva el idEmpresa del prospecto para el correo.
- Configuración sin claves: .env.example, backend/.env.example, docker-compose.yml y docker-compose.facturacion-local.yml.
- Informes existentes: este checkpoint, i3-facturacion-cl-integration.md e i3-smtp-automatic-email.md.

### Configuración y publicación pendientes

Completar manualmente el SMTP por empresa en `.env.smtp-private` (archivo ya existente e ignorado), siguiendo el informe SMTP. Mantener los flags fiscales persistentes en false. Las credenciales de emisores reales no se deben colocar en variables SANDBOX. Obtener ambiente y habilitación del proveedor antes de preparar un ensayo externo; no guardar identidad fiscal ni secretos en Git.

Revisión requerida antes de publicar: diff final, secretos, configuración privada excluida y alcance del PR. Auditoría final PASS: git diff --check y Gitleaks del diff sin hallazgos; dos claves comparadas en memoria sin coincidencias en los 609 archivos versionados ni en el diff. Los dos privados siguen ignorados y no versionados. Se comprobaron 17 archivos modificados, cero nuevos y cero staged; BillingService, esquema y migraciones permanecen sin cambios. Este control no certifica otras ramas ni todo el historial. Los resultados fechados del 19-10 y anteriores que siguen conservan su alcance histórico.

### Verificación web posterior de Cable Mágico — 2026-10-20

El usuario reenvió dos bloques de API idénticos a la cuenta DEMO ya utilizada, junto con un acceso web de Cable Mágico. No se agregaron ni modificaron privados, ejemplos o código con esos datos. Esta consulta web se realizó después de la regresión local: no debe confundirse con las cero llamadas externas de aquella ejecución.

| Comprobación posterior | Resultado |
| --- | --- |
| Acceso web a la cuenta Cable Mágico | PASS de autenticación y consulta del portal; no certifica por sí solo identidad fiscal ni habilitación de emisión |
| Administrador → Integración → Configuración → Credenciales | Existen secciones separadas de Ambiente Producción, Ambiente Prueba y acceso web de pruebas, con sus campos. No se exportaron ni guardaron sus valores. |
| Autenticación API empresarial Cable Mágico | BLOQUEADO / no ejecutada; los datos reenviados siguen siendo DEMO, no se certifica la API productiva por la existencia de campos en pantalla |
| Autenticación y portal empresarial FiNet | BLOQUEADO / no ejecutados; no se recibió un acceso empresarial distinto del DEMO repetido |
| Campos de Impreso Adicional | Ruta verificada: Administrador → Integración → Configuración → Campos de Impreso Adicional. Contiene formato de emisión, tipo y número de adicional, nombre, ubicación, visibilidad web y adjunto de ejemplo. Se consultó sin pulsar Modificar/Insertar ni subir archivos. |
| Logos/plantilla completa | No se identificó un editor de logos o de plantilla PDF en las opciones visibles de esta sesión. La búsqueda “logo” en el Centro de Ayuda devolvió “Video no encontrado”. Esto no demuestra que el producto carezca de otras opciones/permisos o gestión de soporte. |
| Nuevos logos | El usuario autorizó crear únicamente dos propuestas, ya generadas y revisadas visualmente: [FiNet](logo-propuesto-finet.svg) y [Cable Mágico Litoral](logo-propuesto-cable-magico.svg). Son SVG con fondo transparente, letras vectorizadas y marca visible de aprobación pendiente. No se subieron al proveedor ni constituyen identidad corporativa aprobada. |
| Datos tributarios, documentos, folios y configuración | Sin cambios. No se emitieron documentos, anularon folios, descargaron documentos de clientes ni probaron nuevas credenciales productivas. |
| Cierre de acceso | Salida confirmada al formulario de acceso y cierre de ambas pestañas temporales; sin guardar contraseña en navegador ni archivos |

La matriz de cierre sigue BLOQUEADA en los emisores independientes y la personalización oficial. La disponibilidad de un portal empresarial y la de una cuenta DEMO compartida son evidencias diferentes. Se requieren confirmación del ambiente/API por empresa, permisos/procedimiento de personalización y aprobación de la identidad visual antes del ensayo final.

## Revisión del encargo de ambas empresas — 2026-10-19

Base local `SecurityRealiseMatrizQA@0ad059dc53ee13ebd6ada8fed81dde9aefb20b40`; referencia `origin/develop@e56be1f1`. La rama tenía dos commits propios y develop 24 no incorporados. Esta revisión no fusionó esas diferencias. Se contrastó el PDF recibido y el PR G2 #51, abierto en la cabeza `d2486b45171aac5d3bfe1930c60d2e7503577a17`. El usuario confirmó que solo existe acceso DEMO por ahora.

| Caso del encargo | Evidencia y límite actual |
| --- | --- |
| F01 FiNet | Ensayo del 15-10: empresa FiNet del CRM con cuenta DEMO, abono, boleta 39, PDF y correo recibido. No certifica emisor propio ni producción. |
| F02 Cable Mágico | Ensayo histórico del 03-10: boleta 39, PDF y Mailpit local. No equivale a recepción externa por la casilla de esa empresa. |
| F03 pago parcial | Evidencia DEMO FiNet del 15-10 y pruebas locales; política fiscal real pendiente. |
| F04 pago duplicado | Replay DEMO del 15-10 y controles locales; no se produjo otro pago/documento. |
| F05 timeout posterior al envío | Cobertura local de resultado incierto; sin ensayo nuevo contra proveedor real. |
| F06 rechazo | Cobertura local preserva el pago; sin rechazo nuevo provocado contra proveedor real. |
| F07 fallo PDF/SMTP | Cobertura local; se añaden ocho pruebas de renovación explícita del PDF y no reemisión/reenvío. |
| F08 cruce de empresa | Cobertura local de alcance; falta ensayo coordinado con dos emisores propios habilitados. |
| F09 factura autorizada | PENDIENTE_EXTERNO: DTE/folios/identidad/reglas monetarias; no se certifica factura 33/34. |
| F10 conciliación incierta | Cobertura local y auditoría; falta ejercicio operativo aprobado con el proveedor. |
| F11 lectura G2 | Implementación en PR #51 ajena a esta rama, excluye sandbox; incorporación/revisión y prueba del portal pendientes. |

La recuperación `DATOS_REQUERIDOS` señalada en FIS-07 ya existe en develop y esta rama, incluidos los controles de autoridad y ausencia de intención previa. La brecha local corregida es FIS-08: recuperar un PDF explícitamente obtenía antes un enlace antiguo o terminaba pronto si el correo estaba enviado. Ahora renueva el enlace del mismo folio y valida el PDF sin emitir otro DTE. Se conserva la exclusión de envíos ya aceptados o inciertos y el claim de SMTP para correo pendiente.

| Verificación ejecutada el 19-10 | Resultado |
| --- | --- |
| Entorno | Contenedor temporal Node 22, snapshot de archivos versionados y dos cambios tributarios; sin privados, montajes, puertos ni red durante las pruebas |
| Código probado | HEAD base 0ad059dc y cambios locales de emisor/spec; fingerprint SHA-256 del snapshot: acc5aeded2fc6f7c881a46246d6a1c717a592f002bc6760e216f775698183772 |
| Nuevas pruebas PDF | 8 PASS: renovación tras cinco estados de correo, fallo al obtener enlace, descarga no PDF y dos recuperaciones con un único envío ficticio |
| Facturación.cl + SMTP | 158 PASS, 11 suites; proveedor simulado y transporte de correo local/ficticio según prueba; ninguna llamada externa |
| Regresión completa backend | 717 PASS, 2 FAIL, 8 omitidas; 68 suites PASS, una FAIL y cinco omitidas |
| Diagnóstico de los dos FAIL | Ambos reproducidos con el código original HEAD 0ad059dc, sin la corrección: “impide último aviso antes del vencimiento efectivo de una prórroga” y “no suspende mientras una prórroga aprobada mantiene la factura vigente”, en billing.service.spec.ts. Sus fixtures usan una prórroga al 10-10-2026 y dependen del reloj real; el 19-10 ya no es futura. Como diagnóstico adicional, con reloj fijo al 08-10-2026 y sin cambios en las fuentes pasan las 24 pruebas de esa suite. El resultado oficial conserva los dos FAIL con la fecha actual. No se modificó Cobranza ni se ocultó la regresión. |
| Herramientas de esquema global | 22 PASS locales; no es una lectura del catálogo de Railway |
| Higiene del repositorio | 7 PASS |
| Frontend estático/modelo | 3 + 6 PASS |
| Prototipo tributario | 19 PASS |
| Total de la aceptación local | 774 PASS, 2 FAIL y 8 omitidas; QA_LOCAL_READY=false y RELEASE_READY=false. Los estados derivados FAIL del informe no representan fallos adicionales de esas suites. |
| Prisma | validate y generate PASS; URL sintética de loopback sin base accesible |
| Backend build / ESLint de los dos archivos | PASS / PASS |
| Accesos externos | Railway 0; emisiones 0; correos externos 0; G1/G2/G3/Meta 0 |

Los ocho casos nuevos verifican el flujo del emisor con mocks; la validación de bytes/host/ruta sigue cubierta en las pruebas existentes de FacturacionClArtifactsClient. No se atribuye a estas pruebas un tiempo de caducidad real del enlace. Las ocho pruebas de integración con base omitidas no se cuentan como verificadas.

**Pendientes para liberar ambas empresas:** cuentas API propias y ambiente confirmado por Facturación.cl; perfiles fiscales/DTE/folios aprobados; validación del esquema compartido por su responsable; aprobación fiscal de PER_PAYMENT_V1; selección de remitente/SMTP por empresa coordinada con Responsable 1; revisión/incorporación del PR #51 y ensayo G2; resolver los dos fallos generales de Cobranza antes de una aceptación global. El segundo correo por sí solo no completa estos puntos. Producción sigue bloqueada en código y configuración.

No se crearon archivos/carpetas nuevos ni se publicó esta revisión con commit, push, PR o merge. Auditoría local: git diff --check PASS; Gitleaks del diff, cero hallazgos; dos claves tomadas en memoria de los privados no aparecen en el diff ni en los 609 archivos versionados. Ambos privados existen, están ignorados y no versionados. Esta comprobación no certifica todas las ramas ni el historial. Repetir el control antes de una publicación. Los apartados fechados que siguen conservan las evidencias históricas, con sus propios commits y ambientes.

### Prueba SMTP aislada de Cable Mágico — 2026-10-19

Posteriormente, el usuario proporcionó la configuración de correo de Cable Mágico (empresa 2) y autorizó un único mensaje a su destinatario de prueba. Las variables SMTP_COMPANIES y SMTP_CABLE_MAGICO_* aún no son consumidas por el MailService de esta rama. Para comprobar la cuenta, se tradujeron sus opciones a la configuración de una sola instancia del servicio, exclusivamente en memoria. Esto valida la cuenta SMTP, no implementa el enrutamiento multiempresa del CRM.

- Runtime temporal del servicio MailService real: imagen de pruebas basada en 2369db5; se comprobó que backend/src/mail no difiere respecto de ese commit. Sin montar repositorio/privados y con sistema de archivos de solo lectura; la entrada privada se transmitió por stdin, sin variables Docker persistentes ni contraseña en argumentos.
- Conexión Gmail, puerto 587, STARTTLS obligatorio, validación de certificado y autenticación: PASS.
- Un único sendTest: SENT, aceptado por Gmail. Asunto: “Prueba SMTP del CRM”. Remitente visible: Cable Magico Litoral. Sin adjuntos ni documento tributario.
- Message-ID del ensayo: bba0cdfa-30ee-c72d-7532-7826f3be2df3@gmail.com. Recepción en bandeja: confirmada por el usuario el 2026-10-19. Queda validado el envío y la recepción del único correo de esta prueba aislada; no acredita todavía el enrutamiento SMTP por empresa dentro del CRM.
- No se guardaron las nuevas credenciales ni se modificó el SMTP persistente de FiNet. No se emitieron documentos, no se accedió a Railway, no hubo reenvíos ni commit/push.

Pendiente: selección del SMTP por idEmpresa coordinada con Responsable 1 y pruebas de ese flujo integrado. Este ensayo aislado no habilita Facturación.cl productivo.

## Validación FiNet del 2026-10-15

Rama `SecurityRealiseMatrizQA`; código de ejecución `2369db556f4763df0c0469d688a93fe3b3c0ad06`. Ensayo registrado a las 13:13 America/Santiago (2026-10-15T16:13:46.526Z). Esta sección documenta FiNet; el checkpoint posterior del 2026-10-03 conserva sus resultados originales.

Se usaron los servicios reales BillingService, FacturacionClIssuer, PrismaTaxIntentStore, cliente REST y recuperador de PDF del commit indicado. No se inició AppModule ni se usó un endpoint del CRM desplegado. PostgreSQL se creó temporalmente como `fsm_finet_sandbox_qa`, con datos ficticios, sin puertos publicados ni volúmenes persistentes. Se cargó el DDL global y las cuatro migraciones tributarias/correo existentes únicamente en esa base. No se modificaron archivos de esquema, migraciones, servicios de negocio ni la integración de Cable Mágico.

| Comprobación actual | Resultado |
| --- | --- |
| Cuenta del proveedor | DEMO; no corresponde a certificación fiscal de FiNet |
| Autenticación REST con configuración privada de FiNet | PASS_SANDBOX; no se publicaron token, usuario ni clave |
| Método SOAP público Online | Disponible; sin autenticación ni emisión |
| Versión REST | CONTRACT_MISMATCH, version:array; discrepancia conocida, no ocultada |
| Empresa local | FiNet, idEmpresa 1; Cable Mágico sin configurar en este proceso |
| Registro del abono | BillingService.registerPayment; pago 1, cobro 1, abono 100 de 200, saldo 100 |
| Orden de ejecución | Pago confirmado en PostgreSQL antes de la solicitud al proveedor |
| Emisión autorizada en cuenta de pruebas | GENERADO, BOLETA tipo 39, folio 9300000141 |
| Replay del mismo pago | PASS_SANDBOX; duplicate=true, un pago, una intención y una única solicitud de procesamiento |
| PDF | DISPONIBLE; HTTPS, 1 página, 4719 bytes; texto confirma folio, receptor ficticio, total 100 y referencias al pago 1/cobro 1 |
| SHA256 del PDF | 2d5ac16fb0f72f69aa2c07a1c46c98d13a5eb6301d31be28987ace919f5830a1 |
| Trabajos tributarios de Cable Mágico | 0 |
| SMTP de este documento | ENVIADO; una aceptación Gmail con STARTTLS y autenticación; mismo PDF verificado |
| Replay de recuperación del correo | PASS_SANDBOX; un envío, un intento SMTP y cero solicitudes de emisión durante esta etapa |
| Recepción del correo externo | PASS_SANDBOX; el usuario confirmó el 2026-10-15 la recepción del único correo con el PDF adjunto |
| Higiene del repositorio | 7 pruebas PASS, 0 FAIL; configuración privada fuera de Git |
| Railway / base compartida / emisión productiva | No utilizados |
| Limpieza de QA | Contenedores y red temporales retirados; datos ficticios eliminados; servicios existentes conservados |

Durante la fase pago/replay/PDF: 2 logins, 1 solicitud de procesamiento, 1 obtención de link y 3 descargas PDF (incluida verificación explícita); el replay no generó otro DTE. La lectura previa de autenticación/versión se realizó por separado y tampoco emitió documentos.

La etapa de correo se completó a las 13:21 America/Santiago (2026-10-15T16:21:27.780Z), después de autorización expresa del destinatario de QA. Se recuperó la intención GENERADO existente, sin procesar otro DTE. El adjunto coincide byte a byte con el PDF comprobado anteriormente. El estado de correo quedó ENVIADO, con un intento; la segunda recuperación no llamó a SMTP. La aceptación del servidor y la recepción en buzón son comprobaciones separadas. El usuario confirmó el 2026-10-15 que recibió el correo con el PDF adjunto; queda validado el flujo demo de FiNet desde el abono hasta la recepción del documento.

La configuración privada de FiNet usa las variables existentes FACTURACION_CL_FINET_SANDBOX_CREDENTIALS, FACTURACION_CL_COMPANIES y FACTURACION_CL_PROFILES. El archivo `.env.facturacion-private` permanece ignorado; ambos flags persistentes de emisión/entrega están en false. No se copiaron valores a código, plantillas, documentación ni comandos. Las credenciales del portal web no se mezclan con las del WebService. Durante el ensayo no se creó otra carpeta o repositorio ni se hicieron commits, push, PR, merges o llamadas G1/G2/G3/Meta. Después de confirmar la recepción del PDF, el usuario autorizó el 2026-10-15 publicar estos dos informes en SecurityRealiseMatrizQA, tras revisar el diff y comprobar que las credenciales privadas queden excluidas. El SHA de ejecución indicado arriba identifica el código probado; la publicación posterior de documentación se comprueba en el historial de la rama.

La prueba valida una boleta demo para la empresa FiNet del CRM. Factura tipo 33/34, emisor fiscal productivo, datos fiscales definitivos, revisión del esquema compartido y despliegue permanecen fuera de esta validación.

## Histórico del 2026-10-03

2026-10-03. Rama feat/i3-facturacion-cl, base de continuación e2a7bbb54064e14c6d3c49cc264784b544a66a99. Se mantiene el merge de I3 1af19cc96e78ad1f4c3b12dc339f2d9332a82784. Sin PR, despliegue, Railway ni emisión productiva.

## Resultado comprobado

**Cable Mágico sandbox: PASS**, desde un pago del CRM hasta boleta, PDF y correo local. Política del usuario: por cada pago, incluidos abonos; primera prueba Boleta. El emisor real quedó registrado detrás de TaxDocumentIssuer y conectado a Billing después del commit. Este checkpoint sustituye el anterior de preparación sin conexión.

| Paso real | Resultado |
|---|---|
| Factura de QA local 4 / contrato 5 | Monto 200, cliente ficticio QA BOLETA SANDBOX - NO COBRAR |
| Abono por interfaz del CRM | Pago 1, 100 pesos, referencia QA-FACTCL-20261003-ONCE-100 |
| Proveedor API PRUEBAS | GENERADO, tipo 39, folio 9234371045, intentos 1 |
| Saldo después de emitir | 100 pendientes; cobro permanece parcial |
| Recuperación del PDF | HTTPS, una página, 4729 bytes; contenido confirma folio, pago 1, cobro 4 y total 100 |
| Correo | ENVIADO y recibido en Mailpit local con dte-39-9234371045.pdf adjunto; no prueba entrega a una casilla externa |
| Referencia de pago duplicada | HTTP 409, sin segundo pago/boleta |
| Recuperación repetida | Misma boleta, intentos 1, sin otro correo |

La recuperación inicial del PDF rechazó el enlace http /plano del sandbox. Se añadió la ruta exacta observada, convirtiéndola a HTTPS y conservando host fijo, límite, firma y prohibición de redirects. Se recuperó la boleta existente mediante /artifacts; no se repitió /procesar. El PDF descargado se inspeccionó visualmente y como texto; los datos son de prueba.

Durante este ensayo: una solicitud /wsds/procesar, cuatro /login y tres /obtenerlink (incluida una lectura diagnóstica), una descarga PDF por el backend. El adjunto se leyó posteriormente desde Mailpit local para QA. Cero llamadas productivas; ninguna contraseña se cambió. Las comprobaciones anteriores de login/versión del 2026-10-02 siguen como historial en tools/facturacion-cl-sandbox/AUDIT.md.

## Solicitud de instalación G3

Caso ficticio QA G8 G3 LOCAL 20261003 - NO INSTALAR, prospecto 4, contrato 6 (Firmado), empresa 2, plan 3. Ubicación y cobertura comercial sintéticas se prepararon exclusivamente en la base local; revisión técnica manual de QA, sin prueba técnica de G3.

La cotización se guardó y su correo fue recibido localmente. El navegador bloqueó su apertura de PDF por su política de seguridad; no se intentó eludirla ni repetir la generación. El selector del contrato quedó sin planes en esta versión de la UI. Se completó únicamente el contrato ficticio y su firma mediante endpoints locales existentes, sin modificar ese formulario.

POST /api/integrations/g3/installations respondió HTTP 201 por la creación del seguimiento **local**: integración 1, FALLIDA_REINTENTABLE, intentos 1, idOtG3=null. Mensaje exacto: “La integracion tecnica con G3 no esta configurada.” requestId fb2f4cd0-f6e6-4f21-934a-bb06d1b6813d, traceId 45434620-dec8-4403-b306-85f0981d604c.

**RECEPCION_G3_NO_VERIFICADA**: no hubo POST externo, despacho ni orden creada en G3. Faltan G3_API_URL y G3_API_KEY de pruebas, y habilitar ese ambiente. Una recepción válida requiere la referencia externa del POST a /api/integraciones/instalaciones y lectura posterior de /api/integraciones/ordenes/{id}?id_empresa=2, cotejando empresa/contrato/requestId. No se usan mocks como prueba de recepción. El código G3 no se modificó.

## Validación del código

- Jest: 24 suites / 264 tests PASS (tax, Billing, Mail, límites CU-86, G2 y G3). Los proveedores en Jest son ficticios.
- PostgreSQL real local: un dispatcher concurrente, replay después de reinicio, conflicto de fingerprint, constraint de GENERADO sin folio, reintento confirmado previo al envío y bloqueo de reenvío incierto PASS. Cero HTTP/SMTP en ese script.
- Compilación TypeScript backend/frontend y ESLint de archivos afectados PASS.
- Prisma validate/generate PASS; las dos migraciones se aplicaron solo a fsm_facturacion_local.
- git diff --check PASS.

[Capturas y salida saneada de pruebas](evidencias/facturacion-cl/2026-10-03/README.md). Los informes previos 234 tests corresponden a la preparación anterior; no son evidencia de esta emisión.

## Límites para operar

Producción sigue bloqueada, FiNet todavía sin credenciales/prueba propia, factura 33/34 sin ensayo real ni política de redondeo asumida. El subconjunto fiscal exige datos/folios explícitos y deja casos no soportados para revisión. Conciliación incierta es manual auditada; no se afirma una consulta automática por idempotencia del proveedor. Las migraciones del esquema compartido requieren revisión de su responsable. SMTP externo no se configuró. Ver [contrato y configuración](i3-facturacion-cl-integration.md).
