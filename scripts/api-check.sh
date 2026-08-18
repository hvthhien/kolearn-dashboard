#!/usr/bin/env bash
# Fails when the generated client is stale, or when the blocks this spec
# shares with kolearn-server have drifted from it.
#
# kolearn-web vendors the server's spec whole and diffs the whole file. This
# repo cannot: the /admin half does not exist upstream — authoring it here is
# the point. So the check narrows to the half the server does own. An admin
# signs in through the learner's own endpoints and carries the same
# CurrentUser, and a login client generated from last week's copy of somebody
# else's contract compiles perfectly and fails at runtime.
#
# When the server implements /admin, the direction reverses: this file becomes
# vendored like kolearn-web's, and this script becomes kolearn-web's.
set -euo pipefail

SERVER_SPEC="${SERVER_SPEC:-../kolearn-server/api/openapi.yaml}"

# path blocks at two-space indent, schema blocks at four.
SHARED_PATHS=(/auth/login /auth/refresh /auth/logout /me)
SHARED_SCHEMAS=(Problem LoginRequest AuthTokens CurrentUser ExamLevel SectionKind)

# Print the YAML block introduced by `key:` at indent `ind`, up to the next
# line at that same indent. Trailing blank lines are dropped so the comparison
# does not turn on how the two files happen to be spaced.
block() {
  awk -v pat="^$2$1:" -v ind="$2" '
    !inblk && $0 ~ pat { inblk = 1; print; next }
    inblk && $0 ~ ("^" ind "[^ ]") { exit }
    inblk { print }
  ' "$3" | awk 'BEGIN{n=0} {lines[n++]=$0} END{while(n>0 && lines[n-1] ~ /^[[:space:]]*$/) n--; for(i=0;i<n;i++) print lines[i]}'
}

if [ -f "$SERVER_SPEC" ]; then
  drifted=0
  for key in "${SHARED_PATHS[@]}"; do
    if ! diff -q <(block "$key" "  " "$SERVER_SPEC") <(block "$key" "  " api/openapi.yaml) >/dev/null; then
      echo "path $key has drifted from the server's spec:"
      diff -u <(block "$key" "  " api/openapi.yaml) <(block "$key" "  " "$SERVER_SPEC") | tail -n +3 || true
      drifted=1
    fi
  done
  for key in "${SHARED_SCHEMAS[@]}"; do
    if ! diff -q <(block "$key" "    " "$SERVER_SPEC") <(block "$key" "    " api/openapi.yaml) >/dev/null; then
      echo "schema $key has drifted from the server's spec:"
      diff -u <(block "$key" "    " api/openapi.yaml) <(block "$key" "    " "$SERVER_SPEC") | tail -n +3 || true
      drifted=1
    fi
  done
  if [ "$drifted" -ne 0 ]; then
    echo ""
    echo "Copy the block above from $SERVER_SPEC into api/openapi.yaml, then 'npm run api:gen'."
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
