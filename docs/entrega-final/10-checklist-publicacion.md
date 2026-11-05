# Control de distribución académica — P0-07B

> Consolidación 29-10-2026: este documento conserva resultados y sesiones históricas. El estado de publicación vigente está en [19](19-consolidacion-publicacion-p0-07.md). Las sesiones con TTL vencido no deben reutilizarse. Las referencias a `evidencias-qa/` corresponden a archivos locales preservados, excluidos de este PR; el resumen automatizado publicable está en [validación](p0-07-validacion-publicacion.json). La distribución académica y la certificación productiva siguen separadas de esta PR.

**Estado: BORRADOR INTERNO / SIN AUTORIZACIÓN PARA DISTRIBUIR.** No es un examen de secretos exhaustivo.

## 1. Clasificar material

| Material | Tratamiento mínimo |
| --- | --- |
| Código actual | Revisión del propietario; no publicar el repo o ZIP íntegro automáticamente |
| Historia `.git` | NO INCLUIR en paquete académico mientras permanezca exposición histórica no resuelta |
| Dumps, `output/`, respaldos, `.env`, logs, tokens, certificados, capturas con PII | NO INCLUIR |
| `06-riesgos-y-criterios-go-no-go.md` original | Documento de gestión **interno**, no distribuir sin revisión específica |
| `11-resumen-publicable-borrador.md` | Texto de propósito académico sujeto a aprobación del propietario y evaluador |
| Capturas nuevas QA sintéticas | Solo tras revisión visual de redacción y hashes de evidencias |
| Contraseñas/keys locales QA | Distribución mediante canal privado al operador; no en documentos, Git o videos |

## 2. Aprobaciones pendientes

- [ ] Propietario y seguridad revisan exposición histórica y alcances; secretos potencialmente activos requieren tratamiento autorizado.
- [ ] Se acuerda qué código, capturas, informes y datos sintéticos pueden compartirse.
- [ ] Se confirma que ninguna copia de `.git`, respaldos, `output/`, `.env` o logs sensibles integra el ZIP final.
- [ ] El evaluador acepta las funcionalidades bloqueadas por proveedores y las simulaciones identificadas como tales.
- [ ] Se incorpora acta real de demo y se valida que ninguna captura muestra datos reales ni credenciales.
- [ ] Se verifica integridad de los materiales finales y hash de cada evidencia.

**Importante:** no limpiar ni reescribir Git, revocar sesiones o eliminar respaldos sin autorización. Si el paquete requiere exposición del historial inseguro, detener la publicación.
