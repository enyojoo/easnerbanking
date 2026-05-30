#!/usr/bin/env bash
# Automated invariant checks for instant transaction arrival + egress wins.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Shared: realtime prepend + list mappers"
(cd "$ROOT/packages/shared" && npx vitest run \
  src/query/realtime.test.ts \
  src/transactions/map-ledger-list-row.test.ts)

echo "==> Business: map-row-to-business shared helpers"
(cd "$ROOT/business" && npx vitest run lib/transactions/map-row-to-business.test.ts)

echo ""
echo "All automated checks passed."
echo "Complete manual staging checklist: docs/staging/instant-tx-arrival-acceptance.md"
