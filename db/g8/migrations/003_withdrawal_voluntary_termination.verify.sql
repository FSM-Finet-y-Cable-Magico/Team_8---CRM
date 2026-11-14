-- Pre/post verification of 003_withdrawal_voluntary_termination.sql. READ ONLY (ends in ROLLBACK); no RUT, names or amounts.
-- Run together with 002_service_withdrawal.verify.sql (public fingerprints V6 must be identical before and after).
-- Requires 002 applied (it reads g8_retiros.solicitud_ticket); 003 is never applied without 002.
BEGIN TRANSACTION READ ONLY;

-- W1. Target identity.
SELECT current_database() AS base, current_user AS rol, inet_server_addr() AS servidor, inet_server_port() AS puerto;

-- W2. 003 applied? (before: false; after: true)
SELECT to_regclass('g8_retiros.termino_servicio') IS NOT NULL AS termino_servicio_existe,
       EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('g8_retiros.solicitud_ticket') AND attname = 'causa' AND NOT attisdropped) AS causa_existe;

-- W3. The applied check no longer mentions the G1 reception (after: false).
SELECT pg_get_constraintdef(oid) LIKE '%recepcion_clave_evento%' AS aplicado_exige_recepcion_g1
FROM pg_constraint WHERE conname = 'solicitud_g3_aplicado_check' AND connamespace = to_regnamespace('g8_retiros');

-- W4. Constraints of the private schema (no foreign keys).
SELECT conrelid::regclass AS tabla, conname, contype FROM pg_constraint WHERE connamespace = to_regnamespace('g8_retiros') ORDER BY 1, 2;
SELECT count(*) AS claves_foraneas FROM pg_constraint WHERE connamespace = to_regnamespace('g8_retiros') AND contype = 'f';

-- W5. Existing links keep a valid cause (after: 0 rows violating it; all historical links are MOROSIDAD with a notice).
SELECT count(*) AS vinculos_sin_aviso_morosidad FROM g8_retiros.solicitud_ticket WHERE to_regclass('g8_retiros.termino_servicio') IS NOT NULL AND id_aviso IS NULL;

-- W6. Nothing granted to PUBLIC.
SELECT table_name, privilege_type FROM information_schema.role_table_grants WHERE table_schema = 'g8_retiros' AND grantee = 'PUBLIC';

ROLLBACK;
