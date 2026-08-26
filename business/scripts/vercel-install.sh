#!/usr/bin/env bash
# Vercel install for the business app (Root Directory = business/).
# Kept in a script so vercel.json installCommand stays under the 256-char limit.
set -euo pipefail
cd "$(dirname "$0")/../.."
export NODE_OPTIONS="${NODE_OPTIONS:---no-deprecation}"
npm ci \
  --registry=https://registry.npmjs.org/ \
  --no-audit \
  --no-fund \
  --workspace=easner-business \
  --workspace=@easner/shared \
  --workspace=@easner/server \
  --workspace=@easner/rate-sync \
  --workspace=@easner/checkout \
  --include-workspace-root
