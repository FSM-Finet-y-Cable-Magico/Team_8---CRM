-- Run as the authorized private-schema owner. No role passwords, public grants or ownership changes.
\if :{?g8_runtime_role}
SELECT format('GRANT USAGE ON SCHEMA g8_contratos TO %I', :'g8_runtime_role') \gexec
SELECT format('GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA g8_contratos TO %I', :'g8_runtime_role') \gexec
\else
\echo 'G8_RUNTIME_ROLE_REQUIRED'
\quit 1
\endif
