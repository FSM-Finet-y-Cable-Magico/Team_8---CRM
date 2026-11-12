-- Permisos del rol de la aplicación sobre g8_retiros. PENDIENTE DE APROBACIÓN; ejecutar después de 002.
-- Ejecutar como el propietario del esquema privado. Sin contraseñas, sin PUBLIC, sin cambio de propietario y sin DELETE:
-- la aplicación nunca borra vínculos, evidencias ni recepciones.
-- Uso: psql -v g8_runtime_role=<rol_de_la_aplicacion> -f 002_service_withdrawal.grants.sql
\if :{?g8_runtime_role}
SELECT format('GRANT USAGE ON SCHEMA g8_retiros TO %I', :'g8_runtime_role') \gexec
SELECT format('GRANT SELECT, INSERT ON g8_retiros.solicitud_ticket TO %I', :'g8_runtime_role') \gexec
SELECT format('GRANT SELECT, INSERT, UPDATE ON g8_retiros.solicitud_g3 TO %I', :'g8_runtime_role') \gexec
SELECT format('GRANT SELECT, INSERT ON g8_retiros.recepcion_g1 TO %I', :'g8_runtime_role') \gexec
\else
\echo 'G8_RUNTIME_ROLE_REQUIRED'
\quit 1
\endif
