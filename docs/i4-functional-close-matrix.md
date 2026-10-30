# I4 — Candidato funcional previo al 04-11-2026

Auditoría y correcciones del 29-10-2026 en `integrate/i4-facturacion-smtp`, PR [#63](https://github.com/FSM-Finet-y-Cable-Magico/Team_8---CRM/pull/63), sobre `9576abf40a7708431e3ae7e5f7e3a0b2aefb930b`. El worktree original P0-07 no se modificó.

**Candidato local verificable; FUNCTIONAL_COMPLETE=false; RELEASE_READY=false.** Los bloqueos A/B de código están corregidos y ensayados localmente. El convenio conserva una inconsistencia funcional confirmada y pendiente de decisión comercial, por instrucción expresa del propietario. No se confunde QA con certificación productiva.

## Causa y corrección

El pago pertenece a la factura, esta al contrato, y el contrato identifica empresa e identidad del cliente. `Cliente.idEmpresa` es empresa principal, no exclusividad comercial. Cuatro lugares tributarios imponían esa exclusividad incorrecta: acceso al pago, preparación persistente de intención, reconstrucción de trabajo bloqueado y corrección de destinatario.

Ahora se valida la cadena de IDs pago/factura/contrato/cliente y empresa contractual. Administrador conserva consulta consolidada; Comercial/Soporte solo acceden a pagos de su empresa contractual. La recuperación que escribe conserva permisos de Administrador/Comercial, motivo y estado elegible. La corrección de destinatario vuelve a comprobar las relaciones dentro de la transacción Serializable. El store conserva upsert inmutable, fingerprint y claims: no fusiona identidades, no cambia empresa principal ni estados financieros. No se cambian endpoints/payloads S2S ni políticas G2/G3.

El canónico estaba atrasado respecto de la migración tributaria: CHECK solo sandbox e índice de folios sin ambiente. Se alinean exactamente esos objetos y metadata derivada, preservando la migración publicada y `schema.prisma`. [Plan y pruebas de migración](i4-tax-schema-migration-plan.md).

## Matriz final

PASS indica evidencia local ejecutada, con el alcance que detalla cada fila. P0: impide aceptar un flujo obligatorio; P1: requisito previo a entorno integrado/producción; P2: seguimiento sin bloqueo de código obligatorio.

| Funcionalidad / clase de problema | Estado | Evidencia / severidad | Responsable sugerido y acción concreta |
| --- | --- | --- | --- |
| Autorización tributaria de cliente compartido — código | PASS | Tests FiNet/Cable Mágico, Administrador/Comercial/Soporte, vínculos inconsistentes y PostgreSQL; P0 corregido | G8/revisor: revisar cambios de issuer/store en #63 |
| Recuperación tributaria y destinatario compartido — código | PASS | Repreparación y destinatario transaccionales, rechazo de relación alterada y Soporte escritor; P0 corregido | G8: conservar permisos y auditoría actuales |
| Canónico vs migración — código/esquema | PASS | Catálogo completo PASS en upgrade y fresh; rollback DDL y snapshots históricos; P0 corregido | DBA: revisar delta y plan; no aplicar automáticamente |
| Migración en entorno compartido — operación | PENDIENTE DE PRUEBA | Solo PostgreSQL desechable; no catálogo ni historial externo fresco; P1 | Propietario DB: backup restaurable, preflight, aprobación y ventana según plan |
| Unicidad fiscal/folios/idempotencia — código | PASS | Pago único entre ambientes; folio por empresa/ambiente; claims con dos conexiones y estado generado inmutable | G8/DBA: revisión de evidencia QA |
| Facturación.cl, artefactos y recuperación — código | PASS | Suites fiscales y pipeline con PostgreSQL, fetch simulado y mail sink; sin doble emisión | G8: conservar serialización y no reintentar resultado indeterminado |
| Emisión fiscal real — configuración/servicio externo | BLOQUEADO POR DEPENDENCIA EXTERNA | No se verificaron credenciales privadas, identidad emisor, perfiles/folios ni autorización fiscal; P1 | Responsable tributario por empresa: ratificar política, suministrar configuración privada y autorizar certificación independiente |
| SMTP por empresa — código | PASS | Servidores loopback TLS de la suite: remitentes y cuentas separados, sin fallback de otra empresa | G8: conservar mapeo explícito |
| Entrega real SMTP y recepción — configuración/servicio externo | BLOQUEADO POR DEPENDENCIA EXTERNA | No hubo envío externo ni comprobación de buzón; P1 | Dueño de correo FiNet/Cable: configurar cuenta propia, TLS/remitente, autorizar y verificar envío QA |
| Factura $7.000 / convenio 2×$3.500 — código/modelo/política | FAIL | PostgreSQL reproduce factura pagada con ambas cuotas pendientes; P0 comercial abierto | Responsable comercial G8/profesor: ratificar imputación; ver alternativas abajo. No reparación histórica |
| Pagos parciales/completos, replay y auditoría — código | PASS | Dos pagos reales en DB QA, replay G2, dos auditorías; factura ajena y estado global conservados | G8: continuar con política vigente; este PASS no cierra cuotas |
| Reactivación por pago con evidencia G3 — regresión | PASS | Suites billing/G3/P0-04 en regresión local; no se alteró política productiva | G8/G3: E2E real requiere aprobación separada, no reconciliar OT histórica como prueba |
| Contratación y estados protegidos — regresión | PASS | Pruebas prospects/contracts/services existentes; P0-07 se integra aparte | G8: tras integrar P0-07, repetir pruebas afectadas; no declarar su validación visual desde esta rama |
| Cobranza, clientes compartidos y G2 — regresión | PASS | Billing, customer lifecycle, G2 y commercial-control-book dirigidos; esquema/datos reales sin cambios | G8/G2: mantener contrato congelado |
| CSV/Excel y Libro Control — código | PASS | Suites, exportación XLSX/relectura, CSV y UUID 11.1.1 en raíz/backend; locks coherentes | G8: sin cambios de dependencia en esta intervención |
| Seguridad, roles y auditoría — código | PASS | Pruebas de alcance/relación, transacciones, diff checks y escaneo local sin nuevas credenciales detectadas | Propietario: los resultados no certifican todo el historial Git ni rotan secretos antiguos |
| E2E de G1/G2/G3 en entorno de entrega — contratos externos/aceptación | PENDIENTE DE PRUEBA | Regresión local aprobada; no hubo tráfico real en esta intervención; P1 | Coordinadores G1/G2/G3: acordar IDs QA, secuencia, evidencia y ventana; no modificar contratos sin ratificación |
| VPS G8 coexistente con G3 — infraestructura | PENDIENTE DE PRUEBA | VPS existente según propietario, no inspeccionada ni modificada; P1 | Operaciones G8/G3: inventario READ ONLY autorizado, reservar rutas/puertos/servicios de G8 y probar sin sobrescribir G3 |
| Pruebas optativas de DB de la suite histórica — evidencia | PENDIENTE DE PRUEBA | Nueve omitidas con flags deshabilitados; harness específico fiscal ejecutado por separado; P2 | QA G8: habilitar solo con aislamiento demostrado si el criterio exige esos casos |
| Evidencia visual/aceptación integral — documentación/negocio | PENDIENTE DE PRUEBA | No se ejecutó navegador ni se generaron capturas certificadas en esta tarea; P1 | Operador/profesor: ejecutar guion aprobado después de integrar ramas |
| WhatsApp Business — dependencia externa, fuera de aceptación obligatoria | BLOQUEADO POR DEPENDENCIA EXTERNA | Excluido expresamente por propietario conforme al acuerdo académico; P2 no bloqueante | Conservar código y `WHATSAPP_PROVIDER=disabled`; no activar hasta credenciales y autorización |

## Validación ejecutada

- Backend completo: **1.328 PASS, 0 FAIL, 9 omitidas**, 80 suites aprobadas.
- Dirigidas: **865 PASS, 0 FAIL, 1 omitida**, 39 suites. No sumar con el completo.
- Frontend: **44/44 PASS**; herramientas: **75/75 PASS**.
- Backend build, TypeScript/Vite frontend, Prisma generate/validate: PASS. Lint sin errores; 78 advertencias frontend y advertencia de tamaño de bundle preexistentes.
- Ensayo PostgreSQL 18.6: **17/17 comprobaciones aprobadas**; resultados completos en [evidencia](i4-tax-postgresql-qa.evidence.json). Dos clusters exclusivos; cleanup confirmado. Casos de convenio son reproducción diagnóstica, no aprobación funcional. El pipeline completo genera cuatro documentos y cuatro entregas simuladas por cluster (dos empresas × dos ambientes), sin duplicar al reintentar ni recuperar artefactos.
- `git diff --check`, `git diff --cached --check`, revisión de alcance y secretos locales: PASS antes del commit. Escaneo heurístico sin validador remoto ni certificación de todo el historial.
- Dependencias ya instaladas; manifiestos y locks consistentes, sin cambios. No se repitió instalación ni se descargaron dependencias.

Las nueve omitidas corresponden a commercial/CRM/coverage/local-bootstrap, cuatro de documentos externos y una prueba fiscal antigua ligada a un hostname Docker fijo. No se relajaron sus guardas. El harness nuevo cubre la migración fiscal en instancias comprobadas, sin conectarse a aquel hostname ni a una DB existente.

Primer ensayo QA: el fixture de replay omitía fecha/código de autorización exigidos por G2; el conflicto fue correcto. Se corrigió el fixture (no el contrato ni billing) y se repitió desde cluster vacío. El informe fallido y los posteriores permanecen en `.codex-review/`; se versiona la evidencia final sanitizada. No se borraron respaldos ni históricos.

Al ampliar el ensayo al pipeline fiscal completo se detectó un error del harness: el parámetro `global` (catálogo) ocultaba el objeto global de Node y el mock de fetch se instalaba en el objeto equivocado. La guarda loopback bloqueó la salida; no hubo conexión a proveedores. Se corrigió a `globalThis.fetch` y se retiró la instrumentación de diagnóstico antes de repetir. No se cambió el código fiscal para hacer pasar el simulador.

## Convenios: decisión explícita, sin ampliación de alcance

Se mantiene la política vigente por instrucción del propietario. [Alternativas y requisitos de decisión](i4-convenios-decision-comercial.md): aplicación explícita y auditada, automatización con convenio único o presentación informativa diferenciada. Falta ratificar prioridad, pagos elegibles, parciales, excedentes, reversas, permisos y regularización histórica. El modelo actual carece de vínculo pago→cuota y monto parcialmente aplicado; no se inventó un workaround ni se marcaron cuotas pagadas sin evidencia.

## Prioridad recomendada hasta el 04-11

1. **29–30 octubre:** revisar #63, aprobar plan de esquema y decidir criterio comercial del convenio. A/B listos para revisión; el convenio impide declarar cierre completo.
2. **30–31 octubre:** responsables entregan configuración privada por empresa y autorización de ensayos externos; operaciones prepara coexistencia G8/G3 con inventario aprobado, sin reconstruir VPS.
3. **1–2 noviembre:** tras autorizaciones y merge controlado por propietario, ejecutar migración/validaciones y E2E QA intergrupal. Integrar P0-07 por separado y repetir regresiones afectadas.
4. **3 noviembre:** operador valida pantallas, PDFs y correos con evidencia; profesor/comercial acepta alcance y pendientes. Ninguna fecha sustituye un gate fallido.

No hubo migraciones externas, seeds compartidos, pagos reales, emisión fiscal real, envíos externos, despliegues ni modificaciones de infraestructura. La única publicación autorizada es actualizar la rama de #63; no merge a develop.
