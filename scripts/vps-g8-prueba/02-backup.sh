#!/usr/bin/env bash
# Phase B: fresh, verified backups. Reads PostgreSQL (pg_dump), copies /app/generated,
# protects and exports the CURRENT images for rollback. No DB writes, no deletions.
source "$(dirname "$0")/00-common.sh"
exec > >(tee "$WORK/02-backup.txt") 2>&1
TS=$(date +%Y%m%d-%H%M%S)
BK="$WORK/backup"; mkdir -p "$BK" && chmod 700 "$BK"
fail() { echo "FAIL $*"; exit 1; }

echo "== 1. dump de $PG_DB (formato custom, solo lectura)"
pgdocker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" -d "$PG_DB" -Fc > "$BK/$PG_DB-$TS.dump"
test -s "$BK/$PG_DB-$TS.dump" || fail "dump vacío"
pgdocker exec -i "$PG_CONTAINER" pg_restore --list < "$BK/$PG_DB-$TS.dump" > "$BK/$PG_DB-$TS.toc" || fail "pg_restore --list no puede leer el dump"
echo "dump $(du -h "$BK/$PG_DB-$TS.dump" | cut -f1), objetos en TOC: $(grep -vc '^;' "$BK/$PG_DB-$TS.toc")"
echo "tablas con datos en TOC: $(grep -c 'TABLE DATA' "$BK/$PG_DB-$TS.toc")"
( cd "$BK" && sha256sum "$PG_DB-$TS.dump" ) | tee "$BK/$PG_DB-$TS.dump.sha256"

echo "== 2. PDF y constancias (/app/generated)"
d8 cp "$CB:/app/generated" "$BK/generated" || fail "no se pudo copiar /app/generated"
( cd "$BK/generated" && find . -type f -print0 | sort -z | xargs -0 -r sha256sum ) > "$BK/generated.sha256"
COUNT=$(wc -l < "$BK/generated.sha256"); LIVE=$(d8 exec "$CB" sh -c 'find /app/generated -type f | wc -l')
echo "archivos copiados=$COUNT en contenedor=$LIVE"; [ "$COUNT" = "$LIVE" ] || fail "la copia no coincide con el contenedor"
( cd "$BK" && tar -czf "generated-$TS.tar.gz" generated )
# Prueba de recuperación: extraer en un directorio temporal y verificar cada hash.
RT=$(mktemp -d "$WORK/restore-test.XXXX")
( cd "$RT" && gunzip -c "$BK/generated-$TS.tar.gz" | tar -xf - )
( cd "$RT/generated" && sha256sum --quiet -c "$BK/generated.sha256" ) && echo "OK recuperación de PDF verificada ($COUNT archivos)" || fail "la verificación de PDF falló"
rm -rf "$RT"
( cd "$BK" && sha256sum "generated-$TS.tar.gz" ) | tee "$BK/generated-$TS.tar.gz.sha256"

echo "== 3. imágenes actuales para rollback"
OLD_B=$(d8 inspect "$CB" --format '{{.Image}}'); OLD_F=$(d8 inspect "$CF" --format '{{.Image}}')
d8 tag "$OLD_B" "finet-g8-backend:rollback-$TS"; d8 tag "$OLD_F" "finet-g8-frontend:rollback-$TS"
[ "$(d8 image inspect finet-g8-backend:rollback-$TS --format '{{.Id}}')" = "$OLD_B" ] || fail "tag backend rollback no apunta al ID actual"
[ "$(d8 image inspect finet-g8-frontend:rollback-$TS --format '{{.Id}}')" = "$OLD_F" ] || fail "tag frontend rollback no apunta al ID actual"
d8 save "finet-g8-backend:rollback-$TS" "finet-g8-frontend:rollback-$TS" | gzip -6 > "$BK/g8-rollback-images-$TS.tar.gz"
gunzip -t "$BK/g8-rollback-images-$TS.tar.gz" || fail "archivo de imágenes de rollback corrupto"
( cd "$BK" && sha256sum "g8-rollback-images-$TS.tar.gz" ) | tee "$BK/g8-rollback-images-$TS.tar.gz.sha256"
gunzip -c "$BK/g8-rollback-images-$TS.tar.gz" | tar -xO manifest.json | python3 -c "import json,sys;[print('  en archivo:',m['RepoTags'],m['Config']) for m in json.load(sys.stdin)]"
printf 'ROLLBACK_TS=%s\nOLD_BACKEND_ID=%s\nOLD_FRONTEND_ID=%s\n' "$TS" "$OLD_B" "$OLD_F" > "$WORK/rollback.env"
echo "backend anterior  $OLD_B -> finet-g8-backend:rollback-$TS"
echo "frontend anterior $OLD_F -> finet-g8-frontend:rollback-$TS"
echo "== FIN fase B: respaldos en $BK (contienen datos reales; no copiar fuera del servidor sin autorización)"
