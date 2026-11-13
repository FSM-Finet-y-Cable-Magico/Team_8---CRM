-- Runtime role permissions on g8_retiros. PENDING APPROVAL; run after 002_service_withdrawal.sql.
-- Run as the owner of the private schema. No passwords, no PUBLIC, no owner change and NO DELETE:
-- the application never deletes links, dispatch evidence or receptions (receptions are insert-only).
-- Usage: psql -v g8_runtime_role=<application_role> -f 002_service_withdrawal.grants.sql
\if :{?g8_runtime_role}
SELECT format('GRANT USAGE ON SCHEMA g8_retiros TO %I', :'g8_runtime_role') \gexec
SELECT format('GRANT SELECT, INSERT ON g8_retiros.solicitud_ticket TO %I', :'g8_runtime_role') \gexec
SELECT format('GRANT SELECT, INSERT, UPDATE ON g8_retiros.solicitud_g3 TO %I', :'g8_runtime_role') \gexec
SELECT format('GRANT SELECT, INSERT ON g8_retiros.recepcion_g1 TO %I', :'g8_runtime_role') \gexec
\else
\echo 'G8_RUNTIME_ROLE_REQUIRED'
\quit 1
\endif
