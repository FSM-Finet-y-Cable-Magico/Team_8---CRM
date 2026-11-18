-- Run as the private schema owner after 004. No PUBLIC grants, no DELETE.
\set ON_ERROR_STOP on
\if :{?g8_runtime_role}
SELECT format('GRANT UPDATE (termino_comercial_en, cierre_tecnico_en) ON g8_retiros.termino_servicio TO %I', :'g8_runtime_role') \gexec
\else
DO $$ BEGIN RAISE EXCEPTION 'G8_RUNTIME_ROLE_REQUIRED'; END $$;
\endif
