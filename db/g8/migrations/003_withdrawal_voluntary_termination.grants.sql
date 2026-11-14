-- Runtime role permissions for 003 (PENDING APPROVAL; run after 003_withdrawal_voluntary_termination.sql, as the owner).
-- No passwords, no PUBLIC, NO DELETE. The termination is insert-only except for the technical closure timestamp.
-- solicitud_ticket and solicitud_g3 keep the grants of 002 (new columns are covered by the table grants).
-- Usage: psql -v g8_runtime_role=<application_role> -f 003_withdrawal_voluntary_termination.grants.sql
\if :{?g8_runtime_role}
SELECT format('GRANT SELECT, INSERT ON g8_retiros.termino_servicio TO %I', :'g8_runtime_role') \gexec
SELECT format('GRANT UPDATE (cierre_tecnico_en) ON g8_retiros.termino_servicio TO %I', :'g8_runtime_role') \gexec
\else
\echo 'G8_RUNTIME_ROLE_REQUIRED'
\set ON_ERROR_STOP on
DO $$ BEGIN RAISE EXCEPTION 'G8_RUNTIME_ROLE_REQUIRED'; END $$;
\endif
