#!/usr/bin/env bash
# Fails when the generated client is stale, or when the vendored spec has
# drifted from the server's.
#
# The vendored copy is what makes this repo buildable on its own. The cost of
# that is drift, so this is the thing that has to be noisy: a web client
# generated from last week's spec compiles perfectly and calls endpoints that
# no longer exist.
set -euo pipefail

SERVER_SPEC="${SERVER_SPEC:-../kolearn-server/api/openapi.yaml}"

if [ -f "$SERVER_SPEC" ]; then
  if ! diff -q "$SERVER_SPEC" api/openapi.yaml >/dev/null; then
    echo "The vendored spec differs from the server's:"
    echo ""
    diff -u api/openapi.yaml "$SERVER_SPEC" | head -60 || true
    echo ""
    echo "  cp $SERVER_SPEC api/openapi.yaml && npm run api:gen"
    exit 1
  fi
else
  # Not an error. CI checks out one repo at a time, and so might a contributor.
  echo "note: $SERVER_SPEC not found — skipping the drift check."
fi

npm run --silent api:gen

if ! git diff --quiet -- src/api/gen api/openapi.yaml; then
  echo ""
  echo "Generated API client is stale. Run 'npm run api:gen' and commit the result."
  git diff --stat -- src/api/gen api/openapi.yaml
  exit 1
fi

echo "API client is up to date."
