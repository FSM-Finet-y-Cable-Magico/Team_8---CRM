# Integración y depuración de ramas — 2026-10-06

## Resultado preparado

La integración parte de `develop` (`a3d90c4b2564`) y conserva el rediseño UX/UI aprobado (`af51cae02809`). Incluye el cierre global I3 y Facturacion.cl del estado final de `feat/i3-facturacion-cl` (`5fd580a0c852`), que ya contiene `feature/incremento3` (`1af19cc96e78`).

Facturación se incorporó mediante un commit nuevo sobre `develop`, sin trasladar los 14 commits exclusivos de la rama original. No se mezclan cambios antiguos que puedan revertir el flujo actual de clientes, prospectos o permisos.

## Clave de localhost

Se encontró una clave privada PEM en `backend/src/mail/fixtures/localhost-test-key.pem`, incorporada originalmente por `50801ff`, antes de los commits de Felipe Levi `4b128ff` y `5fd580a`. Era una fixture de pruebas SMTP, no una credencial de servicio según su README y su uso en las pruebas.

- Se retiraron la clave y el certificado versionados.
- Las pruebas generan un certificado y una clave nuevos con OpenSSL en un directorio temporal, leen sus buffers y eliminan inmediatamente ese directorio.
- Se conserva la verificación de certificado, nombre del servidor y TLS; no se deshabilitan las protecciones para hacer pasar las pruebas.
- El auditor ahora examina también archivos `.pem`, `.key` y `.sample`.
- Las pruebas de higiene impiden agregar claves privadas PEM completas y credenciales de proveedores a las plantillas.
- La revisión de las tres plantillas de entorno encontró placeholders o credenciales vacías; no se copiaron archivos de entorno reales ni se publicaron valores sensibles.

El commit original con la clave no es ancestro de la integración nueva. Eliminar una rama no garantiza la purga física de objetos o cachés antiguos en GitHub; esta operación sanea la nueva línea de desarrollo y retira la referencia de facturación una vez incorporado su código.

## Ramas remotas que se pueden retirar

| Rama | Revisión previa | Motivo |
| --- | --- | --- |
| `feat/arreglos-ui-incremento-2` | `6a444bca593c` | Ancestro de develop |
| `feat/i3-commercial-control-book` | `69c6857a31a5` | Ancestro de develop |
| `feat/i3-external-tax-documents` | `3dc25223527a` | Ancestro de develop |
| `feat/i3-g1-inventory-integration` | `447a977613ed` | Ancestro de develop |
| `feat/i3-g3-fsm-integration` | `ed0a22037c76` | Ancestro de develop |
| `feat/i3-geolocation-commercial-zones` | `fb221ebfabba` | Ancestro de develop |
| `feat/zonas-incremento-3` | `0e028bdc8903` | Ancestro de develop |
| `fix/i3-baseline-blockers` | `801b394b1f4a` | Ancestro de develop |
| `feat/cambios-ux-ui-incremento-3` | `af51cae02809` | Integrada conservando su commit |
| `feature/incremento3` | `1af19cc96e78` | Contenida en el estado de facturación incorporado |
| `feat/i3-facturacion-cl` | `5fd580a0c852` | Código incorporado con saneamiento de las pruebas TLS |

La rama temporal `codex/integracion-i3-depuracion` también se retira una vez integrada. Las eliminaciones se condicionan a que las referencias sigan apuntando a las revisiones auditadas.

## Ramas que se conservan

`main` y `develop` permanecen. Estas tres ramas remotas tienen commits propios que no están integrados y se conservan para no perder trabajo:

| Rama | Revisión | Pendiente respecto de develop |
| --- | --- | --- |
| `feat/Comercial-Incremento2` | `9e57b27db306` | 6 commits; libro comercial antiguo, documentación y estabilización de servicios/clientes |
| `fix/crm-activation-flow` | `0dad19d7eb20` | 1 commit; cambios de pruebas de activación y lockfile del portal |
| `fix/operational-endpoints-pre-commercial` | `f87764f1b2a4` | 1 commit; direcciones de servicios, estado de instalación y vista de clientes |

La copia local `feat/role-permission-matrix` (`0f2c8f3c3120`) también se conserva: tiene un commit propio aunque su rama remota ya había sido eliminada. Se retiran solamente las demás ramas locales que sean ancestros de la integración final.

## Validación

- Generación del cliente Prisma y validación del esquema: PASS.
- Build de backend y frontend: PASS; permanece el aviso de tamaño del bundle frontend.
- Backend: 69 suites, 711 pruebas PASS; 5 suites y 8 pruebas ya configuradas como omitidas.
- Herramientas globales: 22 pruebas PASS; higiene de repositorio: 2 pruebas PASS.
- Runtime frontend: 3 pruebas PASS; Libro de control: 6 pruebas PASS.
- Prototipo y cliente fiscal simulado: 19 pruebas PASS.
- Lint completo: 0 errores, 78 advertencias existentes.
- Auditoría Prisma/global regenerada: refleja las nuevas extensiones propuestas; no prueba que estén desplegadas en una base de datos.

No se ejecutaron migraciones, pagos, emisiones fiscales, mensajes, pruebas de escritura en Railway ni llamadas a proveedores externos. Los archivos SQL canónicos conservan sus bytes y checksums.
