#!/usr/bin/env bash
#
# Prune the local Turborepo cache so it doesn't grow unbounded.
#
# Strategy:
#   1. Delete any cache archive older than MAX_AGE_DAYS.
#   2. If the cache is still larger than MAX_SIZE_GB, delete the oldest
#      archives (by modification time) until it fits under the cap.
#
# Safe to run anytime: .turbo/cache only holds compressed copies of past
# build outputs. Turbo transparently re-creates entries on the next build.
#
# Run manually:   scripts/prune-turbo-cache.sh
# Runs weekly via ~/Library/LaunchAgents/com.easner.turbo-cache-prune.plist

set -euo pipefail

MAX_AGE_DAYS="${TURBO_CACHE_MAX_AGE_DAYS:-14}"
MAX_SIZE_GB="${TURBO_CACHE_MAX_SIZE_GB:-20}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CACHE_DIR="$REPO_ROOT/.turbo/cache"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

if [[ ! -d "$CACHE_DIR" ]]; then
  log "No cache dir at $CACHE_DIR – nothing to prune."
  exit 0
fi

size_before="$(du -sh "$CACHE_DIR" 2>/dev/null | cut -f1)"
log "Pruning $CACHE_DIR (current size: ${size_before:-unknown})"

# 1) Age-based prune.
log "Deleting entries older than ${MAX_AGE_DAYS} days..."
find "$CACHE_DIR" -type f -mtime "+${MAX_AGE_DAYS}" -delete 2>/dev/null || true

# 2) Size-cap prune: remove oldest files until under MAX_SIZE_GB.
max_bytes=$(( MAX_SIZE_GB * 1024 * 1024 * 1024 ))
current_bytes="$(du -sk "$CACHE_DIR" 2>/dev/null | cut -f1)"
current_bytes=$(( ${current_bytes:-0} * 1024 ))

if (( current_bytes > max_bytes )); then
  log "Cache still over ${MAX_SIZE_GB}GB – removing oldest archives to fit cap..."
  # Oldest first (sorted by mtime ascending).
  while IFS= read -r line; do
    (( current_bytes <= max_bytes )) && break
    file="${line#* }"
    fbytes=$(stat -f%z "$file" 2>/dev/null || echo 0)
    rm -f "$file" 2>/dev/null || true
    current_bytes=$(( current_bytes - fbytes ))
  done < <(find "$CACHE_DIR" -type f -print0 \
            | xargs -0 stat -f '%m %N' 2>/dev/null \
            | sort -n)
fi

size_after="$(du -sh "$CACHE_DIR" 2>/dev/null | cut -f1)"
log "Done. Cache size now: ${size_after:-unknown}"
