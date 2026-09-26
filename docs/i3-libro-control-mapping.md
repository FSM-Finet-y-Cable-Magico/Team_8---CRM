# Mapping FINET_LIBRO_CONTROL_V1

## Alcance

Este documento mapea la estructura observada en `FORMATO PLANILLA TRABAJO (LIBRO CONTROL).xlsx` sin copiar datos personales. El archivo fue consultado en modo lectura y no fue movido, modificado, importado ni agregado al repositorio.

Hojas detectadas:

| Hoja | Dimensión observada | Uso en esta etapa | Regla |
| --- | ---: | --- | --- |
| `AGOSTO` | 662 filas, 138 columnas físicas | Operación vigente y referencia principal | Preview y mapping; sin persistencia |
| `clientes que se fueron` | 1.859 filas, 140 columnas físicas | Histórico/bajas | Se clasifica `HISTORICA_BAJAS`; nunca se activa un cliente desde preview |
| `datos` | 14 filas, 11 columnas | Catálogos auxiliares de Excel | No se convierten automáticamente en enums CRM |

La fila 1 de `AGOSTO` contiene información operacional en las columnas 1 a 73. Las columnas 74 a 138 están vacías en el encabezado salvo artefactos auxiliares en 79 (`8`), 80 (`2026`) y 97 (`<`); no se interpretan como campos del dominio.

## Matriz exhaustiva de AGOSTO

`[1]`, `[2]` y `[3]` distinguen encabezados duplicados por posición.

| Col. | Columna Excel | Significado interpretado | Entidad CRM | Campo CRM | Origen | Estado |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | FECHA DE PAGO | Fecha del pago asociado | `Pago` | `fechaPago` | EXTERNO/EDITABLE CONTROLADO | MIGRABLE con conciliación |
| 2 | *(sin encabezado; RUT)* | Identificador tributario del cliente | `Cliente` / `Prospecto` | `rut` | EXTERNO | MIGRABLE; mapping posicional explícito |
| 3 | NOMBRE | Nombre del titular | `Cliente` / `Prospecto` | `nombreCompleto` | EXTERNO | MIGRABLE con match por RUT |
| 4 | DEUDA PENDIENTE | Saldo exigible | `Factura` + `Pago` | cálculo de saldo | CALCULADO | DERIVADO; no importar como verdad |
| 5 | PRORROGA/CONVENIO | Existencia/tipo de acuerdo | `ProrrogaPago` / `ConvenioPago` | estado vigente | CALCULADO/ACCIÓN | DERIVADO; texto legacy requiere validación |
| 6 | CAMBIO FECHA | Modificación de condición de pago | `CambioCondicionPago` | `tipoCambio`, valores | ACCIÓN CONTROLADA | MIGRABLE solo con regla/fecha verificable |
| 7 | PLAN [1] | Referencia abreviada de plan | `Plan` / `Contrato` | `idPlan` | EXTERNO | REQUIERE MAPPING por duplicado |
| 8 | NOMBRE PLAN [1] | Nombre comercial | `Plan` | `nombreComercial` | EXTERNO | MIGRABLE por catálogo |
| 9 | PLAN [2] | Segunda referencia de plan | `Plan` / `Contrato` | `idPlan` | LEGACY | REQUIERE ACLARACIÓN |
| 10 | MONTO BOLETA/FACT [1] | Monto del documento | `Factura` | `monto` | EXTERNO | MIGRABLE con documento inequívoco |
| 11 | BOLETA O FACTURA [1] | Tipo de documento | `Factura` | `tipoDocumento` | EXTERNO | MIGRABLE con catálogo controlado |
| 12 | EMISION | Fecha de emisión | `Factura` | `fechaEmision` | EXTERNO | MIGRABLE |
| 13 | RESPONSABLE EMISION | Operador que emitió | `LogAuditoria` / integración futura | responsable | EXTERNO/LEGACY | REQUIERE ACLARACIÓN |
| 14 | FECHA SUBIDA AL DRIVE | Fecha documental | — | — | LEGACY | NO MIGRAR; referencia documental |
| 15 | SUBIDA AL DRIVE | Indicador documental | — | — | LEGACY | NO MIGRAR; sin integración Drive |
| 16 | RESPONSABLE SUBIR AL DRIVE | Operador documental | — | — | LEGACY | NO MIGRAR |
| 17 | BOLETA O FACTURA [2] | Segunda referencia documental | `Factura` | `tipoDocumento`/`folioExterno` | LEGACY | REQUIERE ACLARACIÓN por duplicado |
| 18 | ESTADO ENVIO | Estado de comunicación del documento | `EventoGestionComercial` | `estadoGestion` | EXTERNO/MANUAL | MIGRABLE mediante mapping explícito futuro |
| 19 | ESTADO ENVIO/RESPUESTA CLIENTE | Resultado de contacto | `EventoGestionComercial` | `estadoGestion`, `observacion` | EXTERNO/MANUAL | MIGRABLE con catálogo acordado |
| 20 | RESPONSABLE ENVIO BOLETA | Responsable de contacto | `EventoGestionComercial` | `idUsuarioResponsable` | EXTERNO | MIGRABLE solo con usuario resoluble |
| 21 | DIA PAGO | Día de vencimiento acordado | `Contrato` | `diaVencimiento` | EDITABLE CONTROLADO | MIGRABLE; rango 1-28 |
| 22 | CATEGORIA [1] | Clasificación operacional | — | — | LEGACY | REQUIERE ACLARACIÓN |
| 23 | ESTADO [1] | Estado libre del bloque | entidad según contexto | — | LEGACY | REQUIERE ACLARACIÓN |
| 24 | FECHA CORTE | Fecha de suspensión comercial | `Contrato` | `fechaSuspension` | CALCULADO/EXTERNO | MIGRABLE solo con trazabilidad |
| 25 | AVISO DE CORTE | Aviso previo/último aviso | `EventoGestionComercial` | `tipo` | ACCIÓN CONTROLADA | MIGRABLE como evento verificado |
| 26 | ESTADO AVISO DE CORTE | Resultado del aviso | `EventoGestionComercial` | `estadoGestion` | EXTERNO/MANUAL | MIGRABLE con mapping |
| 27 | RESPONSABLE AVISO DE CORTE | Responsable del aviso | `EventoGestionComercial` | `idUsuarioResponsable` | EXTERNO | MIGRABLE solo con usuario resoluble |
| 28 | MONTO BOLETA/FACT [2] | Monto repetido en bloque de corte | `Factura` | `monto` | LEGACY | DERIVADO de Factura; no duplicar |
| 29 | APLICACION IPTV | Dato de servicio IPTV | `ServicioContratado` / TVIP | consulta existente | TÉCNICO | NO MIGRAR en esta etapa |
| 30 | NOMBRE PLAN [2] | Nombre repetido en bloque | `Plan` | `nombreComercial` | LEGACY | DERIVADO; resolver contra columna canónica |
| 31 | ZONA | Zona comercial/de pago | `ZonaPago` | `idZonaPago`, `nombreZona` | EXTERNO | MIGRABLE por catálogo y empresa |
| 32 | CORTE | Indicador de corte | `Contrato` | `estado` | CALCULADO | DERIVADO; no ejecutar infraestructura |
| 33 | ESTADO [2] | Estado libre del corte | `Contrato` / evento | — | LEGACY | REQUIERE ACLARACIÓN |
| 34 | ESTADO CORTE | Resultado comercial del corte | `Contrato` | `estado` | CALCULADO | DERIVADO |
| 35 | FECHA REACTIV | Fecha de reactivación | lifecycle/auditoría | — | EXTERNO | REQUIERE FUENTE NORMALIZADA; no inferir |
| 36 | REACTIVACION POR CONVENIO O PRORROGA | Motivo comercial de reactivación | `ConvenioPago` / `ProrrogaPago` | relación vigente | CALCULADO | DERIVADO; no activar servicio aquí |
| 37 | RESPONSABLE CORTE | Responsable del proceso comercial | `LogAuditoria` | `idUsuario` | EXTERNO | REQUIERE ACLARACIÓN |
| 38 | FECHA INSTALACION | Fecha de instalación | `ServicioContratado` / OT | `fechaCreacion` o cierre OT | CALCULADO | DERIVADO; preferir cierre OT cuando exista |
| 39 | ESTADO DE PAGO | Situación financiera | `Factura` + `Pago` | estado/saldo | CALCULADO | DERIVADO |
| 40 | RETIRO | Indicador de retiro | `EventoGestionComercial` / solicitud futura | tipo/estado | ACCIÓN CONTROLADA | MIGRABLE como antecedente, no crear OT |
| 41 | ENVIO MENSAJE DE RETIRO | Aviso al cliente | `EventoGestionComercial` | `AVISO_PREVIO_RETIRO` | ACCIÓN CONTROLADA | MIGRABLE como evento manual |
| 42 | ESTADO RETIRO | Seguimiento del retiro | `EventoGestionComercial` | `estadoGestion` | EXTERNO/MANUAL | MIGRABLE con mapping futuro |
| 43 | RESPONSABLE RETIRO | Responsable del aviso | `EventoGestionComercial` | `idUsuarioResponsable` | EXTERNO | MIGRABLE solo con usuario resoluble |
| 44 | EMITIDA BOLETA SII REPOSICION | Documento de reposición | `CargoAdicional` + `Factura` | estado/folio | EXTERNO | REQUIERE Facturación.cl; no migrar ahora |
| 45 | PAGO $500 REPOSICION | Pago/cargo histórico de reposición | `CargoAdicional`, `Factura`, `Pago` | tipo/monto/pago | LEGACY | REQUIERE CONCILIACIÓN; no asumir monto/regla |
| 46 | EMITIDA BOLETA SII | Indicador de documento SII | `Factura` | metadata externa | EXTERNO | REQUIERE Facturación.cl |
| 47 | CARTOLA | Conciliación bancaria | conciliación futura | — | EXTERNO | NO MIGRAR en esta etapa |
| 48 | RESPONSABLE INGRESO VOUCHER | Operador del comprobante | `LogAuditoria` | `idUsuario` | EXTERNO | MIGRABLE solo con identidad resoluble |
| 49 | FECHA INGRESO | Fecha de registro del comprobante | `Pago` / auditoría | `fechaPago` o fecha log | EXTERNO | REQUIERE ACLARACIÓN |
| 50 | FECHA VOUCHER [1] | Fecha del comprobante | `Pago` | `fechaPago` | EXTERNO | MIGRABLE con conciliación |
| 51 | NUMERO VOUCHER | Código de comprobante | `Pago` | `codigoTransaccion` | EXTERNO | MIGRABLE; idempotencia obligatoria |
| 52 | FORMA DE PAGO | Medio de pago | `Pago` | `pasarela` | EXTERNO | MIGRABLE con mapping de catálogo |
| 53 | HORARIO AM/PM | Franja del registro/contacto | evento/pago | — | LEGACY | REQUIERE ACLARACIÓN |
| 54 | CATEGORIA [2] | Segunda clasificación operacional | — | — | LEGACY | REQUIERE ACLARACIÓN |
| 55 | ESTADO [3] | Estado libre del bloque de pago | `Pago` / evento | — | LEGACY | REQUIERE ACLARACIÓN |
| 56 | VALOR RECIBIDO | Monto pagado | `Pago` | `monto` | EXTERNO | MIGRABLE con factura y transacción |
| 57 | SALDO | Saldo resultante | `Factura` + `Pago` | cálculo | CALCULADO | DERIVADO |
| 58 | SALDO FAVOR/CONTRA | Diferencia a favor o pendiente | `Factura` + `Pago` | saldo/saldoFavor | CALCULADO | DERIVADO |
| 59 | PAGO SALDO PENDIENTE | Abono de saldo | `Pago` | `monto` | EXTERNO | MIGRABLE con conciliación |
| 60 | FECHA VOUCHER [2] | Fecha de comprobante de saldo | `Pago` | `fechaPago` | LEGACY | MIGRABLE si se identifica la transacción |
| 61 | TX SALDO | Transacción del abono | `Pago` | `codigoTransaccion` | EXTERNO | MIGRABLE; idempotencia obligatoria |
| 62 | EMITIDA BOLETA SII SALDOS | Documento por saldo | `Factura` | metadata externa | EXTERNO | REQUIERE Facturación.cl |
| 63 | SUBIDO AL DRIVE | Referencia documental de saldo | — | — | LEGACY | NO MIGRAR |
| 64 | RESPONSABLE SUBIR AL DRIVE | Operador documental de saldo | — | — | LEGACY | NO MIGRAR |
| 65 | PAGA GARANTIA | Garantía física/comercial | inventario G1 futuro | — | TÉCNICO/LEGACY | NO MIGRAR en esta etapa |
| 66 | ESTADO DE LA GARANTIA | Estado de garantía | inventario G1 futuro | — | TÉCNICO/LEGACY | NO MIGRAR en esta etapa |
| 67 | OBSERVACIONES | Contexto operacional | `ObservacionOperativa` | `observacion` | EDITABLE CONTROLADO | MIGRABLE con autor/fecha; no guardar fila completa |
| 68 | DIRECCIONES | Dirección del servicio | `DireccionServicio` / `Contrato` | `direccionCompleta`/`direccionInstalacion` | EXTERNO | MIGRABLE con match de cliente/servicio |
| 69 | TELEFONOS | Teléfono de contacto | `Cliente` / `Prospecto` | `telefono` | EXTERNO | MIGRABLE si E.164 inequívoco; si no, revisión |
| 70 | CORREO ELECTRONICO | Correo de contacto | `Cliente` / `Prospecto` | `email` | EXTERNO | MIGRABLE con validación |
| 71 | CORREO SUBIDO A FACTURACION | Sincronización con facturación | integración futura | — | EXTERNO | REQUIERE Facturación.cl |
| 72 | NAP / POS | Ubicación técnica de red | inventario/G3 futuro | — | TÉCNICO | NO MIGRAR ni editar desde Libro Control |
| 73 | MSJE ENVIADO POR SEGUNDA VEZ | Reintento de contacto | `EventoGestionComercial` | nuevo evento/observación | EXTERNO/MANUAL | MIGRABLE como evento, no como booleano fijo |
| 74-78 | *(encabezados vacíos)* | Sin campo operacional identificado | — | — | ARTEFACTO | NO MIGRAR |
| 79 | `8` | Valor auxiliar en zona sin encabezado | — | — | ARTEFACTO | NO MIGRAR |
| 80 | `2026` | Valor auxiliar en zona sin encabezado | — | — | ARTEFACTO | NO MIGRAR |
| 81-96 | *(encabezados vacíos)* | Sin campo operacional identificado | — | — | ARTEFACTO | NO MIGRAR |
| 97 | `<` | Artefacto/formato auxiliar | — | — | ARTEFACTO | NO MIGRAR |
| 98-138 | *(encabezados vacíos)* | Sin campo operacional identificado | — | — | ARTEFACTO | NO MIGRAR |

## Hoja `clientes que se fueron`

La hoja tiene una disposición histórica diferente. El preview busca el mejor encabezado dentro de las primeras 20 filas y la clasifica como `HISTORICA_BAJAS`. Sus filas no pueden convertirse en clientes activos. Antes de habilitar una confirmación deberá existir un mapping histórico versionado que resuelva, al menos, identidad, servicio anterior, fechas de baja, motivo/churn, deuda histórica y posible correspondencia con un cliente ya existente.

Estados futuros admisibles: antecedente comercial, churn o cliente dado de baja con correspondencia verificada. Nunca se debe inferir `Activo`.

## Hoja `datos`

Los valores auxiliares observados se clasifican antes de cualquier uso:

| Familia de valores | Clasificación | Decisión |
| --- | --- | --- |
| Transferencia, Webpay y medios equivalentes | REQUIERE MAPPING a medio de pago CRM | No crear enum desde el texto de Excel |
| Prepago | REQUIERE ACLARACIÓN contractual/comercial | No inferir estado financiero |
| Textos de ticket o confirmación | LEGACY/TEXTO LIBRE | No migrar como catálogo oficial |
| Sin contacto y respuestas similares | REQUIERE MAPPING a evento | Conservar como gestión manual validada |
| Convenio, Prórroga, Pagado, pendiente retiro, Cambio de ciclo | LEGACY con entidad destino conocida | Crear entidad estructurada solo si la fila puede validarse |

## Reglas del preview implementado

- versión explícita: `FINET_LIBRO_CONTROL_V1`;
- `AGOSTO`, columna 2, se reconoce como RUT aunque el encabezado esté vacío;
- el primer encabezado canónico gana frente a duplicados;
- RUT se normaliza como texto con guion y DV válido;
- serial Excel solo se acepta entre 20.000 y 80.000 y dentro de una columna de fecha conocida;
- montos pueden venir como texto, con separadores y símbolo monetario;
- teléfono inequívoco se acepta para una migración futura y el ambiguo se marca `TELEFONO_REQUIERE_REVISION`;
- `#REF!`, planes desconocidos y duplicados se informan;
- se consultan clientes/prospectos y planes dentro de una sola empresa;
- la salida contiene resumen e incidencias, nunca filas persistidas: `persisted=false`.

## Confirmación y datos reales

No existe confirmación activa en esta etapa. Antes de habilitarla se requiere un identificador de lote o hash de archivo, idempotencia, conciliación de factura/pago, transacción y revisión explícita de los campos `REQUIERE ACLARACIÓN`.

No se importaron clientes, prospectos, facturas, pagos, convenios ni eventos desde la planilla real. Los tests usan únicamente datos sintéticos.