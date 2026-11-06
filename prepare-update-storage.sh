#!/usr/bin/env bash
set -euo pipefail

# Run on the Docker host, before replacing the existing container.
# Pause publishing APKs until migration and deployment have finished.
cd "$(dirname "$0")"
container="wps-backend"
target="$(pwd -P)/storage/wps_updates"
mkdir -p "$target"
docker info >/dev/null

if ! docker container inspect "$container" >/dev/null 2>&1; then
  echo "Tidak ada container lama; penyimpanan update siap di $target"
  exit 0
fi

if [ "$(docker inspect --format '{{.State.Running}}' "$container")" != "true" ]; then
  echo "ERROR: Container lama harus berjalan agar lokasi update dapat diperiksa. Jangan hapus container lama." >&2
  exit 1
fi

# Resolve using the container's OS and env, including legacy Windows-style paths.
old_dir=$(docker exec "$container" node -e 'const p=require("path"); console.log(p.resolve(process.env.UPDATES_DIR || "D:\\deploy\\wps_updates"));')
case "$old_dir" in
  ''|/|/app) echo "ERROR: Lokasi update lama tidak aman untuk disalin: $old_dir" >&2; exit 1 ;;
esac

# Already migrated: do not duplicate all APKs on every subsequent deployment.
if [ "$old_dir" = "/app/storage/wps_updates" ]; then
  mounted_storage=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app/storage"}}{{.Source}}{{end}}{{end}}' "$container")
  if [ "$mounted_storage" = "$(pwd -P)/storage" ]; then
    echo "Penyimpanan update sudah persisten di $target"
    exit 0
  fi
fi

if docker exec "$container" node -e 'const fs=require("fs"); const p=process.argv[1]; if(!fs.existsSync(p))process.exit(3); if(!fs.statSync(p).isDirectory())process.exit(4);' "$old_dir"; then
  :
else
  result=$?
  if [ "$result" -eq 3 ]; then
    echo "Lokasi update lama tidak ada: $old_dir. File yang sudah hilang tidak dapat dipulihkan lewat migrasi ini."
    exit 0
  fi
  echo "ERROR: Tidak dapat memeriksa lokasi update lama; deploy dibatalkan." >&2
  exit "$result"
fi

backup="$(pwd -P)/storage/update-migration-backups/$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -p "$backup"
echo "Backup update dari $container:$old_dir ke $backup"
docker cp "$container:$old_dir/." "$backup/"

# Check every conflict before copying anything into the active destination.
while IFS= read -r -d '' file; do
  relative="${file#"$backup/"}"
  destination="$target/$relative"
  if [ -e "$destination" ] && ! cmp -s "$file" "$destination"; then
    echo "ERROR: Isi file berbeda: $relative. Backup tetap tersedia di $backup. Deploy dibatalkan; pilih versi yang benar sebelum melanjutkan." >&2
    exit 1
  fi
done < <(find "$backup" -type f -print0)

cp -a -n "$backup/." "$target/"
while IFS= read -r -d '' file; do
  relative="${file#"$backup/"}"
  if ! cmp -s "$file" "$target/$relative"; then
    echo "ERROR: Verifikasi salinan gagal: $relative. Deploy dibatalkan." >&2
    exit 1
  fi
done < <(find "$backup" -type f -print0)
echo "Update lama tersalin dan terverifikasi di $target. Backup: $backup"
