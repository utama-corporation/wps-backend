#!/usr/bin/env bash
set -euo pipefail
repo=$(cd "$(dirname "$0")/.." && pwd -P)
test_root=$(mktemp -d)
mkdir -p "$test_root/bin" "$test_root/project" "$test_root/source/tablet" "$test_root/source/mobile"
cp "$repo/prepare-update-storage.sh" "$repo/deploy.sh" "$test_root/project/"
cat > "$test_root/bin/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
case "$1" in
 info) exit 0 ;;
 container) [ "$MOCK_STATE" != fresh ]; exit $? ;;
 inspect) if [ "$MOCK_STATE" = stopped ]; then echo false; else echo true; fi ;;
 exec)
   if [[ "$*" = *console.log* ]]; then echo /app/D:/deploy/wps_update
   elif [ "$MOCK_STATE" = missing ]; then exit 3
   fi ;;
 cp) if [ "$MOCK_STATE" = copyfailed ]; then exit 1; fi; cp -a "$MOCK_SOURCE/." "$3/" ;;
 compose) echo compose >> "$MOCK_COMPOSE_LOG" ;;
 *) echo "Unexpected Docker command" >&2; exit 1 ;;
esac
EOF
cat > "$test_root/bin/git" <<'EOF'
#!/usr/bin/env bash
if [ "$1" = rev-parse ]; then echo main; fi
EOF
chmod +x "$test_root/bin/docker" "$test_root/bin/git"
export PATH="$test_root/bin:$PATH"
export MOCK_SOURCE="$test_root/source" MOCK_COMPOSE_LOG="$test_root/compose.log"
export MOCK_STATE=fresh
bash "$test_root/project/deploy.sh" > "$test_root/fresh.log"
test -f "$MOCK_COMPOSE_LOG"
printf 'tablet apk' > "$MOCK_SOURCE/tablet/test.apk"
printf '{"fileName":"test.apk"}' > "$MOCK_SOURCE/tablet/version.json"
printf 'mobile apk' > "$MOCK_SOURCE/mobile/app-release.apk"
export MOCK_STATE=running
bash "$test_root/project/deploy.sh" > "$test_root/migration.log"
cmp "$MOCK_SOURCE/tablet/test.apk" "$test_root/project/storage/wps_updates/tablet/test.apk"
cmp "$MOCK_SOURCE/tablet/version.json" "$test_root/project/storage/wps_updates/tablet/version.json"
cmp "$MOCK_SOURCE/mobile/app-release.apk" "$test_root/project/storage/wps_updates/mobile/app-release.apk"
bash "$test_root/project/deploy.sh" > "$test_root/repeat.log"
printf 'conflicting file' > "$test_root/project/storage/wps_updates/tablet/test.apk"
before=$(wc -l < "$MOCK_COMPOSE_LOG")
if bash "$test_root/project/deploy.sh" > "$test_root/conflict.log" 2>&1; then echo 'FAIL: conflict accepted'; exit 1; fi
test "$(wc -l < "$MOCK_COMPOSE_LOG")" = "$before"
grep -q 'conflicting file' "$test_root/project/storage/wps_updates/tablet/test.apk"
for MOCK_STATE in stopped copyfailed; do
  export MOCK_STATE
  if bash "$test_root/project/deploy.sh" > "$test_root/$MOCK_STATE.log" 2>&1; then echo "FAIL: $MOCK_STATE accepted"; exit 1; fi
  test "$(wc -l < "$MOCK_COMPOSE_LOG")" = "$before"
done
export MOCK_STATE=missing
bash "$test_root/project/deploy.sh" > "$test_root/missing.log"
echo 'PASS: fresh deploy, tablet/mobile migration + metadata, idempotency, conflict/stopped/copy-failure block recreation, missing-source handling'
