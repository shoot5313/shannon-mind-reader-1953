#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repo_dir"

version=$(node -p "require('./package.json').version")
case "$version" in
  *[!0-9.]*|.*|*.) echo "Invalid package version: $version" >&2; exit 1 ;;
esac

archive="shannon-mind-reader-v${version}.zip"
stage_dir=$(mktemp -d)
trap 'rm -rf "$stage_dir"' EXIT

mkdir -p "$stage_dir/src" "$stage_dir/assets" "$repo_dir/dist"
cp index.html "$stage_dir/index.html"
cp two-mode-prototype.css unified-entry.css "$stage_dir/"
cp src/engine.js src/unified-entry.js src/two-mode-prototype.js "$stage_dir/src/"
cp assets/shannon-mind-reader.svg assets/icon-180.png assets/icon-192.png assets/icon-512.png assets/icon-1024.png "$stage_dir/assets/"

# Reproducible archive: identical sources must produce an identical ZIP, so the
# recorded SHA-256 identifies the content rather than the moment it was zipped.
# Without this the hash in XHS_VALIDATION.md changes on every rebuild and proves
# nothing when the reviewer asks whether the upload matches the repo.
(
  cd "$stage_dir"
  find . -exec touch -h -t 197001010000.00 {} +
  find . -type f | LC_ALL=C sort | sed 's|^\./||' \
    | zip -q -9 -X -o "$archive" -@
)

archive_path="$stage_dir/$archive"
archive_bytes=$(stat -c '%s' "$archive_path")
limit_bytes=$((10 * 1024 * 1024))
if (( archive_bytes > limit_bytes )); then
  echo "Release archive exceeds 10 MiB: $archive_bytes bytes" >&2
  exit 1
fi

index_count=0
while IFS= read -r entry; do
  case "$entry" in
    /*|../*|*/../*|*/..) echo "Unsafe zip path: $entry" >&2; exit 1 ;;
  esac
  case "$entry" in
    */) continue ;;
    index.html) index_count=$((index_count + 1)) ;;
    *.css|*.js|*.png|*.jpg|*.jpeg|*.gif|*.webp|*.svg|*.woff|*.woff2|*.json) ;;
    *.html) echo "Only root index.html is allowed: $entry" >&2; exit 1 ;;
    *) echo "Unsupported file type in release zip: $entry" >&2; exit 1 ;;
  esac
  case "$entry" in
    node_modules/*|*/node_modules/*|.git/*|*/.git/*|*.map|*.DS_Store)
      echo "Development artifact in release zip: $entry" >&2
      exit 1
      ;;
  esac
done < <(unzip -Z1 "$archive_path")

if (( index_count != 1 )); then
  echo "Release zip must contain exactly one root index.html; found $index_count" >&2
  exit 1
fi

install -m 0644 "$archive_path" "$repo_dir/dist/$archive"
install -m 0644 assets/icon-1024.png "$repo_dir/dist/shannon-mind-reader-icon-1024.png"

archive_sha=$(sha256sum "$repo_dir/dist/$archive" | cut -d' ' -f1)
icon_sha=$(sha256sum "$repo_dir/dist/shannon-mind-reader-icon-1024.png" | cut -d' ' -f1)
file_count=$(unzip -Z1 "$repo_dir/dist/$archive" | grep -cv '/$')

# The upload record is generated, never hand-typed. Hand-syncing these three
# numbers is exactly how a validation summary goes stale without anyone noticing.
node - "$version" "$archive" "$archive_bytes" "$archive_sha" "$icon_sha" "$file_count" <<'NODE'
const fs = require("fs");
const [version, archive, bytes, sha, iconSha, files] = process.argv.slice(2);
const mib = (Number(bytes) / 1024 / 1024).toFixed(2);
fs.writeFileSync("dist/artifact.json", `${JSON.stringify({
  version, archive, bytes: Number(bytes), mib, sha256: sha, iconSha256: iconSha, files: Number(files),
}, null, 2)}\n`);

const record = "XHS_VALIDATION.md";
const before = fs.readFileSync(record, "utf8");
const after = before
  .replace(/目标版本：香农读心机 `[^`]+`/, `目标版本：香农读心机 \`${version}\``)
  .replace(/- 上传 ZIP：`[^`]+`/, `- 上传 ZIP：\`dist/${archive}\``)
  .replace(/- ZIP 大小：`\d+` bytes（约 `[^`]+`）/, `- ZIP 大小：\`${bytes}\` bytes（约 \`${mib} MiB\`）`)
  .replace(/- ZIP SHA-256：`[0-9a-f]{64}`/, `- ZIP SHA-256：\`${sha}\``)
  .replace(/- 图标 SHA-256：`[0-9a-f]{64}`/, `- 图标 SHA-256：\`${iconSha}\``);
if (after !== before) fs.writeFileSync(record, after);
NODE

if [ -x "$(command -v python3)" ] && [ -f .codex/minitool-zip-builder/scripts/audit_artifact.py ]; then
  python3 .codex/minitool-zip-builder/scripts/audit_artifact.py "$repo_dir/dist/$archive"
else
  echo "NOTE: minitool-zip-builder not present (.codex is gitignored); artifact audit skipped."
fi

printf 'Built %s (%s bytes, %.2f MiB, %s files)\n' \
  "$repo_dir/dist/$archive" \
  "$archive_bytes" \
  "$(node -e "process.stdout.write((${archive_bytes}/1024/1024).toFixed(2))")" \
  "$file_count"
