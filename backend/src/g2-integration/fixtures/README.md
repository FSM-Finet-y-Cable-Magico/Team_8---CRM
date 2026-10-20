Mensajes de referencia del contrato G8 ↔ G2, usados por `g2-contract.spec.ts`.

Cada archivo copia un ejemplo de la respuesta complementaria de G8 del 02-10-2026
(`RESPUESTA_COMPLEMENTARIA_G8_A_G2_DUDAS_RECIENTES_2026-10-02.md`), que G2 ratificó ese mismo día.
Son los mismos cuerpos que G2 usa en su propio spec (`finet-clientes`, rama `dev`,
`apps/controller/src/common/g8/g8-integracion.service.spec.ts`).

| Archivo | Sección | Sentido |
|---|---|---|
| `invoices-response.json` | §2 | G8 → G2 |
| `wifi-result-request.json` | §12 | G2 → G8 |
| `payments-request.json` | §4 | G2 → G8 |
| `payments-response.json` | §4 | G8 → G2 |
| `tax-document-response.json` | §10 | G8 → G2 |

Los valores e identificadores son ilustrativos. No contienen datos de clientes ni credenciales.
Si un ejemplo del contrato cambia, se actualiza aquí y el spec indica qué dejó de cumplirse.
