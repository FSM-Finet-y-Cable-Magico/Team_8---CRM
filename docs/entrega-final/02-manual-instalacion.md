# Instalación local y reproducción segura

> Consolidación 29-10-2026: este documento conserva resultados y sesiones históricas. El estado de publicación vigente está en [19](19-consolidacion-publicacion-p0-07.md). Las sesiones con TTL vencido no deben reutilizarse. Las referencias a `evidencias-qa/` corresponden a archivos locales preservados, excluidos de este PR; el resumen automatizado publicable está en [validación](p0-07-validacion-publicacion.json). La distribución académica y la certificación productiva siguen separadas de esta PR.

Este manual distingue una validación automatizada reproducible de una demo visual
todavía pendiente. No contiene credenciales ni instrucciones para usar Railway.

## 1. Requisitos y comprobaciones

- Checkout existente de `Team_8---CRM`, base P0-07 documentada en [01](01-estado-final.md).
- Node compatible con `package.json` (validado: v22.19.0), npm y Git.
- Dependencias del lockfile instaladas. Para una máquina nueva: `npm ci`; necesita
  acceso al registro de paquetes o caché. Esa instalación no se ejecutó en P0-07.
- OpenSSL: la prueba usa el binario incluido con Git en Windows, o `openssl` en PATH
  en otros sistemas. El fixture trae configuración temporal propia; no deshabilitar TLS.
- PostgreSQL 18 solo para el harness QA opcional; no es necesario para tests unitarios.

Antes de comenzar:

```powershell
git status --short
git branch --show-current
git rev-parse HEAD
node --version
npm.cmd --version
```

No hacer reset, clean, añadir `output/` ni reutilizar respaldos como fixtures.
No cargar `.env.railway` ni copiar un `.env` privado a este manual. La existencia de
una DB en localhost por sí sola no demuestra que sea desechable.

## 2. Validación automatizada sin DB

Desde la raíz del repositorio, con dependencias ya instaladas:

```powershell
$env:CRM_INTEGRATION_TESTS = '0'
$env:RUN_DB_INTEGRATION = '0'
$env:RUN_POSTGRES_INTEGRATION_TESTS = 'false'
$env:G1_INTEGRATION_ENABLED = 'false'
$env:G3_INTEGRATION_ENABLED = 'false'
$env:FACTURACION_CL_INTEGRATION_ENABLED = 'false'
$env:WHATSAPP_PROVIDER = 'disabled'
$env:MAIL_PROVIDER = 'disabled'
$env:GEOCODING_PROVIDER = 'MANUAL'
$env:VITE_API_URL = '/api'
$qaReport = Join-Path $env:TEMP ('finet-entrega-' + [guid]::NewGuid())
npm.cmd run test:i3-release -- --output-dir $qaReport
npm.cmd --prefix frontend test
npm.cmd run test:global-tools
node --test scripts/p0-05-qa-isolation.test.mjs
git diff --check
```

`test:i3-release` ejecuta toda la suite backend con opt-in DB deshabilitado, tests
globales, runtime estático y prototipo fiscal. Guarda el JSON fuera del repositorio;
no sobrescribe la evidencia de octubre. `16 PASS / 13 BLOCKED` significa que las
verificaciones locales aprobaron y que ese runner no ejecuta trece verificaciones
externas/operativas. No cambiar el reporte para forzar RELEASE_READY.

Build y lint, verificados previamente en P0-06:

```powershell
npm.cmd run build
npm.cmd run lint
```

No se repitieron en P0-07 porque únicamente se agregan documentos y los fuentes no
cambiaron desde PR #62. Si Windows bloquea esbuild por ACL del sandbox, ejecutar
el build con permisos locales revisados, no modificar código ni desactivar controles.
El warning del bundle y los 78 warnings de lint se conservan como deuda conocida.

## 3. PostgreSQL QA ya disponible para recuperación

Seguir [el manual P0-05](../i4-p0-05-postgresql-qa.md). El harness existente crea
un clúster exclusivo con `initdb`, verifica identidad/puerto/directorio/marcador,
materializa el canónico en la base vacía, usa datos sintéticos y destruye únicamente
su clúster. No usa db push ni migraciones compartidas.

```powershell
npm.cmd --prefix backend run build
node scripts/p0-05-postgresql-qa.cjs 'C:\Program Files\PostgreSQL\18\bin'
```

**No ejecutado de nuevo en P0-07.** Ese comando reemplaza su JSON de evidencia;
preservar la evidencia anterior mediante el procedimiento de versionamiento aprobado
antes de repetirlo. No pasarle una URL de DB ni alterar sus verificaciones.

Este harness prueba servicios y G1 HTTP local, termina al finalizar y no ofrece
un CRM navegable ni un servidor G3 HTTP general. No usarlo como si entregara usuarios
de login o un simulador permanente de inventario.

## 4. Preparación del entorno de demo visual — actualización P0-07A

P0-07A preparó el stack QA exclusivo y ejecutó el recorrido HTTP sobre PostgreSQL
nativo, con cuentas sintéticas y simuladores G1/G3. Los comandos reproducibles y
resultados están en [12-resultados-demo-qa.md](12-resultados-demo-qa.md).
El bloqueo restante es visual: el acceso a Opera no fue autorizado a tiempo;
no hay capturas ni validación del renderizado. Docker CLI no encuentra daemon local;
no se arrancó ni modificó otro servicio existente.

Responsables: G8/QA para datos y simuladores; administrador local para aislamiento.
Acta mínima antes de una escritura de demostración:

| Condición | Evidencia necesaria |
| --- | --- |
| DB exclusiva | Nombre único, clúster/directorio nuevo, owner y puerto loopback; catálogo inicial vacío y marcador propio |
| Esquema | Canónico SHA-256 `f42140bff257d8bcaf46d2f74d5c44fa6d304bd8f84e20085ba3bbf07bfeb2aa`; preparación solo en ese QA, sin migraciones compartidas |
| Entorno privado | Proceso iniciado sin heredar `.env`/keys reales; DATABASE_URL apunta exactamente al QA atestado |
| Usuarios | Administrador, Comercial FiNet, Comercial Cable Mágico y Soporte con identidades sintéticas; contraseñas por canal local privado |
| Proveedores | Salida de red denegada salvo loopback; SMTP/Meta/fiscal deshabilitados; G1/G3 solo contra servidores locales del escenario |
| Datos | Inventario de alias/IDs del [guion](03-guion-demostracion.md); no restaurar dumps históricos |
| Logs/capturas | Nunca JWT, API key, contraseña, RUT real ni cuerpos privados; solo IDs QA y estados |

No se habilitan seeds productivos. Las fixtures de `scripts/p0-07-qa-fixtures.cjs`
solo se cargan en una instancia nueva atestada por el harness QA; no aceptan una
URL de DB proporcionada por el operador. El ensayo HTTP ejecutado no acredita UI.

Una vez firmado el acta, el operador puede arrancar `backend/dist/main.js` desde
un directorio de ejecución limpio, sin `.env`, con el entorno QA explícito. El
backend tiene jobs de aplicación: asegurar aislamiento y proveedores deshabilitados
antes de iniciarlo. El frontend debe usar `/api` con proxy exclusivamente al backend
QA local. Verificar `/api/health` y `/api/ready` contra ese origen local y conservar
el resultado. Un ready positivo no certifica todos los constraints ni proveedores.

Para inspección estática del frontend ya compilado:

```powershell
npm.cmd --prefix frontend run preview -- --host 127.0.0.1
```

No se ejecutó aquí. Preview no es un proxy backend ni permite afirmar login válido.
No abrir una UI cuyo bundle o proxy apunte a una URL real. La ejecución integrada
solo se habilita después de la preparación anterior.

## 5. Finalización

Guardar resultados saneados y marcar cada paso como ejecutado/fallido/no ejecutado.
Detener únicamente los procesos QA iniciados por el operador. La limpieza manual
requiere verificar la propiedad del directorio/volumen; nunca `docker compose down
-v` sobre un stack preexistente ni borrado de respaldos. No se realiza ninguna
limpieza del repositorio o de infraestructura como parte de esta entrega documental.
