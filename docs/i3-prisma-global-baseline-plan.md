# Plan de baseline Prisma sobre la base global

Estado: PENDIENTE_RECONCILIACION_GLOBAL. Plan preparado, sin crear/aplicar una nueva migración activa, sin `migrate resolve` y sin alterar `_prisma_migrations`.

## Condición previa

El baseline físico conjunto es [init-global.sql](../db/global/init-global.sql), hash `af5892827b2e41ce15aec0d620cb10a2336d3236596f487af61cc6b41c2b87da`. Railway observado NO coincide. Un build correcto, una proyección Prisma alineada o marcar migraciones como aplicadas no arreglan ese drift.

Se requiere demostrar igualdad del esquema con el verificador global y revisar cualquier diferencia de expresión SQL conservadora antes del baseline. La propuesta `payload_snapshot` se gestiona después como una versión global coordinada; no se oculta como si perteneciera al contrato original.

## Historial G8 y cobertura física

Hay nueve migraciones locales. Sus tablas objetivo están en el init global, incluidas zonas, libro comercial, integración G3/G1, tributación y multiunidad. Esto demuestra cobertura de objetos, no equivalencia textual de SQL histórico: tipos, defaults y acciones FK antiguas pueden diferir. El catálogo global decide la definición final.

La migración de multiunidad además contiene un UPDATE histórico de datos desde `numero_serie`. Init global solo define el esquema y no hace ese backfill. Si existen registros históricos que lo necesiten, se debe evaluar por separado con evidencia y aprobación, sin inventar snapshots ni reejecutar ciegamente la migración.

|Migration|SHA-256 del archivo actual|Tablas afectadas cubiertas por global|
|---|---|---|
|20260912150000_crm_activation_flow|ebdc4b7fe5814602b82e0bc97ce51423566e79ce9feae8bf4d7fb0d863bcc745|contrato|
|20260916120000_installation_prospect_flow|4006da5039f2e8520edb16785d2705882cf091f16388f90fa8fdbd69c4d6f315|orden_trabajo|
|20260916170000_expand_plan_type_catalog|ea45673623e3536753c24be22b5baf9be74fda8450d0fd39ee5c06238b9ad2e9|plan|
|20260925120000_i3_geolocation_commercial_zones|f4370066c8f01670f4f02622b7c5d09b75e7bda05ec69d16c6b9642d5c7359e4|plan_zona_precio, prospecto, zona_pago|
|20260925180000_i3_commercial_control_book|cb577cb6fbd5a962317f761897399c42c248729422019ac62efb220148e3d368|cambio_condicion_pago, cargo_adicional, convenio_pago, cuota_convenio_pago, evento_gestion_comercial, factura, prorroga_pago, prospecto|
|20260926120000_i3_g3_fsm_integration|1cf9235434aa9005974a021db89c0017e88bbb6bd8b0e0a4b2e14a4905671ef0|integracion_evento_entrante, integracion_instalacion_g3, servicio_contratado, solicitud_retiro_servicio|
|20260926180000_i3_g1_inventory_integration|d0d605e843d067ee05bf74d1db80caafdaf0a1f9eb9198505bcf6b2b99d66f27|garantia_comercial, integracion_activacion_g1|
|20260927120000_i3_external_tax_documents|5c36fe746dc345bd1b3fe27fbcc9a07b6799ef732962b104ca938dcf470fe8e0|documento_tributario_externo|
|20260928120000_i3_g1_multiunit_api_key_readiness|c99e11469268e8a5c5c3ad775d8192485bc73dd95be6d75edf0d355fa3f4766b|integracion_activacion_g1|

## Historial observado Railway

Lectura READ ONLY de `2026-09-29T14:31:10.439Z`: 20 filas de migración, todas con fecha de finalización y ninguna revertida. El catálogo guarda nombres, checksum y fechas, sin logs ni credenciales. No hay nombres comunes con las nueve migraciones locales G8. `applied_steps_count=0` en alguna fila no demuestra por sí solo que el DDL esté ausente; manda el catálogo físico. No se atribuye automáticamente a G8 un historial compartido de otros grupos.

|Migration Railway|Checksum observado|Pasos registrados|
|---|---|---|
|20260526080449_init|3edf2d6739999d48788a4f7916a149eb8333bcd55384def72b442afc0d09cf91|0|
|20260526082620_add_es_password_temporal|36ff6e398d15a1a35a0d3990b68f5db3b7501ff42bb515b47513f9ec38923a4c|0|
|20260526083910_add_obs_conflictivo|54df662178b86ba8fde42b635870f26ab2d74fc0f2d9bd2691cf28a1e9a13c09|0|
|20260813173500_rf49_rf09_ot_extensions|c7e973b25ceb42edff90780d61ea32cd11a9770cb612ce07e646f0d3ee57c8d7|0|
|20260816212819_add_indices_rendimiento|58585071a5bfb6bd32b8acdb836fe37e1d833d9ca98735fe28c87235dbc1400b|1|
|20260901173852_add_registro_ont_monitoreo|d7a8b34b1d34f66535dba5f52b48c5f3b9b4bc1501a53a39ed3908f2b7e52b80|1|
|20260903163121_add_cierre_equipos_ot|78f913c63e5f43241d35c24246a077c147d6a8885a93c8a57aaffe02ba8aaa4a|1|
|20260905120000_add_alertas_monitoreo|c2cf85c85d017c28db0fdb2945715705f50489df4cdc27d485a9544452c27e8b|1|
|20260905130000_alerta_afectados|a6344beb444c7e7f19089b32101eb15d9da881a1468867232a78e33ed1bd9b6e|1|
|20260905140000_confirmacion_caja|30a4e7a55fa79d0f6038490d5687faf9793ad0ba64d33380799d24166177f601|1|
|20260905150000_alerta_ot_generada|4d69462ba6825af7d1935763c8adf5be2d23c6123ce137520bb8318a8d1e4f53|1|
|20260905160000_ot_caja_nap|111a3c16edd4863baed2f74b9214e3444cf98205d14dcd05b973e5ebea594745|1|
|20260905170000_renombrar_alerta_monitoreo|896629d3c1d2989fc740c4f7676bc127f169ac86b98b156f96b9b82abb139507|1|
|20260908033536_notificaciones_aislamiento_y_auditoria|e18d1aa8728199b7fa0c77f819f76dff98c9c0ba1197b8f4309da687ba5e3210|1|
|20260908154201_plantilla_tiempo_estimado|72122e8474b2769e524fe6740a034177b3bb64e791d978c004eb6a099ed07eb4|1|
|20260909001151_alerta_ot_detenida_descartada|0489d56fa96f8cd7eefa41171cd2ed3762b1c08061905d70ba4db14225a9bf3d|1|
|20260909013000_puerto_nap_estado_en_mantencion|f31ca7c18e801b4543d9c36d3c696023b50ff77ed4f984bfcf3151d729401a81|1|
|20260909020000_normalizar_estados_ot|be103d5ed953a28fb031e4b7e5c6f02dd535dd9a670441cba95dbdd096add692|1|
|20260911030000_ensanchar_rut_intentado|89fd0c966c59af1405831780fc53d7f7c57de74c59245ba55f57106af6ae452d|1|
|20260910212314_add_solicitud_contrasena_wifi|471a6489e4619ad5b20ae3af2428b36f3ff37ad968f550b2c26d5411970fa4d5|0|

## Secuencia propuesta para revisión de los grupos

1. Conservar historial, checksums y migraciones existentes. Acordar quién administra el DDL compartido y el mecanismo único de cambios; evitar que varios backends ejecuten automáticamente historias independientes sobre la misma tabla de metadatos.
2. Obtener respaldo/restauración verificables y un catálogo fresco. Regenerar y revisar la reconciliación, incluyendo NULL, duplicados, FK huérfanas, timezone de DATE/TIMESTAMP y bloqueos. No usar las migraciones G8 antiguas como sustituto.
3. Aplicación de SQL únicamente por operador autorizado en ventana coordinada. Ejecutar después el verificador READ ONLY; resolver diferencias físicas reales o demostrar equivalencias de expresiones. Conservar evidencia de igualdad.
4. Diseñar una línea base conjunta versionada que represente las 90 tablas, no solo las 58 de Prisma G8. Archivar de forma trazable las historias por grupo sin borrarlas ni cambiar checksums. Las nueve migraciones actuales no deben quedar como pendientes ejecutables en el flujo productivo nuevo si el contrato ya cubre sus objetos.
5. Solo con el esquema demostrado y el diseño de historial acordado, un operador podrá registrar el baseline correspondiente mediante el mecanismo Prisma aprobado. No se entrega un comando automático de `resolve` ni se marca cada migración antigua a ciegas. Un baseline físico no demuestra que todos los backfills históricos se hayan ejecutado.
6. En una base nueva futura, provisionar el contrato conjunto con el procedimiento de los grupos; en una existente, reconciliar. Ambas deben acabar en la misma línea de base y política de metadatos.
7. Migraciones futuras: SQL aditivo revisado por propietarios, contrato global versionado, revisión de incompatibilidades, coordinación del orden DB/backend y verificaciones de los cuatro dominios. Preservar checks/índices externos no representables en Prisma.
8. Revisar y, si procede, aprobar la extensión JSONB; actualizar contrato/hashes/verificadores después de versionarla. El backend nuevo no debe desplegarse antes de que su esquema requerido esté disponible.

No usar `prisma db push`, `migrate dev`, `migrate reset` ni `migrate deploy` sobre Railway durante esta tarea. No se recreó una base local ni se utilizó seed como evidencia.
