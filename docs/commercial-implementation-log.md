# Bitácora de implementación comercial

## Fase Comercial 1 — Libro Control Comercial base

Objetivo implementado:

- Crear una primera versión funcional del Libro Control Comercial como vista calculada.
- Registrar gestiones comerciales históricas en una tabla persistente.
- Mantener la deuda financiera únicamente en `Factura` y `Pago`.
- No implementar todavía WhatsApp Business API ni Facturación.cl.

## Archivos modificados

Backend:

- `backend/prisma/schema.prisma`
- `backend/src/app.module.ts`
- `backend/src/commercial-control/commercial-control.module.ts`
- `backend/src/commercial-control/commercial-control.controller.ts`
- `backend/src/commercial-control/commercial-control.service.ts`
- `backend/src/commercial-control/commercial-control.types.ts`
- `backend/src/commercial-control/dto/commercial-control-query.dto.ts`
- `backend/src/commercial-control/dto/create-commercial-event.dto.ts`
- `backend/src/commercial-control/commercial-control.service.spec.ts`

Base de datos:

- `db/init/10_commercial_control.sql`

Frontend:

- `frontend/src/api.ts`
- `frontend/src/features/billing/BillingPanel.tsx`
- `frontend/src/features/billing/CommercialControlPanel.tsx`

Documentación:

- `docs/commercial-implementation-log.md`

## Endpoints creados

- `GET /api/commercial-control`
- `POST /api/commercial-control/events`

## Tabla creada

Tabla persistente:

- `evento_gestion_comercial`

Campos principales:

- `id_evento`
- `id_cliente`
- `id_contrato`
- `id_factura`
- `id_pago`
- `id_servicio`
- `id_usuario`
- `id_empresa`
- `tipo_evento`
- `canal`
- `estado`
- `mensaje_generado`
- `respuesta_cliente`
- `observacion`
- `monto_relacionado`
- `fecha_compromiso`
- `fecha_evento`
- `metadata_json`
- `created_at`

Índices:

- `id_cliente`
- `id_contrato`
- `id_factura`
- `id_servicio`
- `id_empresa`
- `tipo_evento`
- `fecha_evento`
- `id_usuario`

## Decisiones tomadas

- `gestion_comercial_mensual` no se creó como tabla persistente.
- El Libro Control Comercial se calcula desde `Factura`, `Pago`, `Contrato`, `Cliente`, `ServicioContratado`, `ZonaPago` y últimos eventos comerciales.
- Los tipos, canales y estados comerciales se mantienen como strings validados por DTO, siguiendo el estilo actual de estados en el proyecto.
- Registrar un evento comercial no modifica `Factura`, `Pago`, `Contrato` ni `ServicioContratado`.
- La auditoría se registra con acción `REGISTRAR_EVENTO_GESTION_COMERCIAL`.
- Los permisos iniciales reutilizan:
  - `VIEW_BILLING` para lectura.
  - `MANAGE_BILLING` para registrar eventos.

## Reglas de estado comercial iniciales

- Saldo pendiente menor o igual a cero: `REGULARIZADO` o `AL_DIA`.
- Factura no vencida con saldo: `POR_VENCER`.
- Factura vencida con saldo: `VENCIDO` o `MOROSO`, según días de atraso.
- Evento `AVISO_PAGO`: `AVISO_PAGO_ENVIADO`.
- Evento `AVISO_CORTE`: `AVISO_CORTE_ENVIADO`.
- Evento `CORTE_REGISTRADO`: `CORTADO`.
- Evento `AVISO_RETIRO` o `RETIRO_SOLICITADO`: `RETIRO_PROGRAMADO`.
- Evento `RETIRO_REGISTRADO`: `RETIRADO`.
- Evento `CONVENIO_REGISTRADO`: `CONVENIO`.
- Evento `PRORROGA_REGISTRADA`: `PRORROGA`.

## Pendiente para Fase Comercial 2

- Generar mensajes WhatsApp copiables con plantillas parametrizables.
- Registrar envío manual de mensaje y respuesta de cliente con mejor UX.
- Definir plantillas iniciales:
  - `AVISO_PAGO`
  - `AVISO_CORTE`
  - `AVISO_RETIRO`
- No integrar todavía WhatsApp Business API.
- No usar credenciales ni proveedor externo hasta definición formal con FiNet.

## Pendientes posteriores

- Validación reforzada de voucher único y clasificación de pagos parciales.
- Beneficios comerciales: abonos, convenios, prórrogas, descuentos y cambios de fecha.
- Cargos adicionales: reposición, reconexión y retiro/desconexión.
- Documento tributario externo para preparar Facturación.cl.
- Garantías comerciales/técnicas.
- Exportación específica del Libro Control Comercial.
- Permisos comerciales granulares cuando se definan roles finales.

