#!/usr/bin/env bash
# Phase B: fresh, verified backups. Reads PostgreSQL (pg_dump), copies /app/generated,
# protects and exports the CURRENT images for rollback. No DB writes, no deletions.
source "$(dirname "$0")/00-common.sh"
exec > >(tee "$WORK/02-backup.txt") 2>&1
TS=$(date +%Y%m%d-%H%M%S)
BK="$WORK/backup"; mkdir -p "$BK" && chmod 700 "$BK"
fail() { echo "FAIL $*"; rm -f "$WORK/B_PASS"; exit 1; }
[ "$(cat "$WORK/A_PASS" 2>/dev/null)" = "$SHA" ] || fail "ejecute antes 01-preflight-readonly.sh hasta PASS"

echo "== 0. la base a respaldar es la del backend (re-verificado ahora)"
verify_pg_target || fail "la base indicada no es la del backend G8; no se respalda otra base"
[ "$(cat "$WORK/pg-identity.txt")" = "$(backend_pg_identity)" ] || fail "la identidad de la base cambió"

echo "== 1. dump de $PG_DB (formato custom, solo lectura)"
pgd exec "$PG_CONTAINER" pg_dump -U "$PG_USER" -d "$PG_DB" -Fc > "$BK/$PG_DB-$TS.dump" || fail "pg_dump"
test -s "$BK/$PG_DB-$TS.dump" || fail "dump vacío"
pgd exec -i "$PG_CONTAINER" pg_restore --list < "$BK/$PG_DB-$TS.dump" > "$BK/$PG_DB-$TS.toc" || fail "pg_restore --list no puede leer el dump"
TABLES=$(grep -c 'TABLE DATA' "$BK/$PG_DB-$TS.toc" || true)
[ "$TABLES" -gt 0 ] || fail "el dump no contiene datos de tablas"
echo "dump $(du -h "$BK/$PG_DB-$TS.dump" | cut -f1), objetos en TOC: $(grep -vc '^;' "$BK/$PG_DB-$TS.toc"), tablas con datos: $TABLES"
for t in prospecto cliente contrato servicio_contratado cotizacion; do
  grep -qE "TABLE DATA public $t " "$BK/$PG_DB-$TS.toc" || fail "el dump no incluye datos de public.$t"
done
( cd "$BK" && sha256sum "$PG_DB-$TS.dump" ) | tee "$BK/$PG_DB-$TS.dump.sha256"

echo "== 2. PDF y constancias (/app/generated)"
d8 cp "$CB:/app/generated" "$BK/generated" || fail "no se pudo copiar /app/generated"
( cd "$BK/generated" && find . -type f -print0 | sort -z | xargs -0 -r sha256sum ) > "$BK/generated.sha256"
COUNT=$(wc -l < "$BK/generated.sha256"); LIVE=$(d8 exec "$CB" sh -c 'find /app/generated -type f | wc -l')
echo "archivos copiados=$COUNT en contenedor=$LIVE"; [ "$COUNT" = "$LIVE" ] || fail "la copia no coincide con el contenedor"
( cd "$BK" && tar -czf "generated-$TS.tar.gz" generated )
# Recovery test: extract into a temporary directory and verify every hash.
RT=$(mktemp -d "$WORK/restore-test.XXXX")
( cd "$RT" && gunzip -c "$BK/generated-$TS.tar.gz" | tar -xf - )
( cd "$RT/generated" && sha256sum --quiet -c "$BK/generated.sha256" ) && echo "OK recuperación de PDF verificada ($COUNT archivos)" || fail "la verificación de PDF falló"
rm -rf "$RT"
( cd "$BK" && sha256sum "generated-$TS.tar.gz" ) | tee "$BK/generated-$TS.tar.gz.sha256"

echo "== 3. imágenes actuales para rollback"
OLD_B=$(d8 inspect "$CB" --format '{{.Image}}'); OLD_F=$(d8 inspect "$CF" --format '{{.Image}}')
d8 tag "$OLD_B" "finet-g8-backend:rollback-$TS"; d8 tag "$OLD_F" "finet-g8-frontend:rollback-$TS"
[ "$(d8 image inspect "finet-g8-backend:rollback-$TS" --format '{{.Id}}')" = "$OLD_B" ] || fail "tag backend rollback no apunta al ID actual"
[ "$(d8 image inspect "finet-g8-frontend:rollback-$TS" --format '{{.Id}}')" = "$OLD_F" ] || fail "tag frontend rollback no apunta al ID actual"
d8 save "finet-g8-backend:rollback-$TS" "finet-g8-frontend:rollback-$TS" | gzip -6 > "$BK/g8-rollback-images-$TS.tar.gz"
gunzip -t "$BK/g8-rollback-images-$TS.tar.gz" || fail "archivo de imágenes de rollback corrupto"
( cd "$BK" && sha256sum "g8-rollback-images-$TS.tar.gz" ) | tee "$BK/g8-rollback-images-$TS.tar.gz.sha256"
gunzip -c "$BK/g8-rollback-images-$TS.tar.gz" | tar -xO manifest.json | python3 -c "import json,sys;[print('  en archivo:',m['RepoTags'],m['Config']) for m in json.load(sys.stdin)]"
printf 'ROLLBACK_TS=%s\nOLD_BACKEND_ID=%s\nOLD_FRONTEND_ID=%s\n' "$TS" "$OLD_B" "$OLD_F" > "$WORK/rollback.env"
echo "backend anterior  $OLD_B -> finet-g8-backend:rollback-$TS"
echo "frontend anterior $OLD_F -> finet-g8-frontend:rollback-$TS"
echo "$SHA" > "$WORK/B_PASS"
echo "== FIN fase B: PASS; respaldos en $BK (contienen datos reales; no copiar fuera del servidor sin autorización)"
