#!/usr/bin/env bash
# Wrapper for the local Hasura CLI (via nhost) with connection flags pre-filled.
# Usage: ./scripts/hasura.sh migrate create <name> --database-name default
set -euo pipefail
cd "$(dirname "$0")/.."
nhost dev hasura "$@" \
  --endpoint https://local.hasura.local.nhost.run \
  --admin-secret nhost-admin-secret \
  --insecure-skip-tls-verify
