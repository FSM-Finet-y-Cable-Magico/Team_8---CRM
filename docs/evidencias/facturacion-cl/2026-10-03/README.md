# Evidencias del 2026-10-03

- `resultados-locales.json`: resumen saneado del resultado Jest real sobre el
  código `9f5eb4e06c35a8b9c21959c3cf158edc6dc641c9`, 20 suites / 234 tests PASS.
  Los tests usan transporte de proveedor simulado. Incluye el hash de la salida
  original, nombres y estados; no contiene tokens ni credenciales.
- `index.html` y `protecciones.html`: informes derivados de esa salida.
- `01-resultados-locales.jpg` y `02-proteccion-duplicados.jpg`: capturas de esos
  informes locales. No son capturas de una emisión real.
- `03-crm-docker-local.jpg`: dashboard observado después de iniciar sesión en
  `http://localhost:5173`, con la base demo aislada del stack
  `finet-facturacion-local`. No acredita recepción de G3 ni generación tributaria.

Para repetir Jest, desde `backend`:

```powershell
node ../node_modules/jest/bin/jest.js --runInBand src/tax-document-issuance src/external-tax-documents/external-tax-documents.boundaries.spec.ts src/billing src/g2-integration src/g3-integration
```

No hubo emisión real de boleta, envío de correo, migración Railway ni PR.
