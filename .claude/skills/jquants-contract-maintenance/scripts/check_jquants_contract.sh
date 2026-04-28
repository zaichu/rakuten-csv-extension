#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

echo "[1/3] backend jquants tests"
(cd backend && cargo test jquants)

echo "[2/3] openapi sync"
bash scripts/check-openapi.sh

echo "[3/3] frontend jquants tests"
(cd frontend && npm test -- --run \
  src/features/jquants/api/__tests__/client.test.ts \
  src/features/jquants/hooks/__tests__/useJQuantsDividend.test.ts \
  src/features/jquants/hooks/__tests__/useJQuantsDividendBatch.test.ts \
  src/features/jquants/hooks/__tests__/useDividendBatch.test.ts)
