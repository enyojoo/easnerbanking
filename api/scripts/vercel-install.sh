#!/usr/bin/env bash
# Vercel install for the API app (Root Directory = api/).
set -euo pipefail
cd "$(dirname "$0")/../.."
export NODE_OPTIONS="${NODE_OPTIONS:---no-deprecation}"
npm ci \
  --registry=https://registry.npmjs.org/ \
  --no-audit \
  --no-fund \
  --workspace=easner-api \
  --workspace=@easner/shared \
  --workspace=@easner/server \
  --workspace=@easner/rate-sync \
  --workspace=@easner/checkout \
  --include-workspace-root
