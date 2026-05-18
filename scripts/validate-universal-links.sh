#!/usr/bin/env bash
# Validates AASA and assetlinks.json endpoints on pace5.com.br
# Run after each deploy to confirm Universal Links are properly configured.
#
# Usage (from monorepo root):
#   bash artifacts/pace5-mobile/scripts/validate-universal-links.sh [domain]
#
# Example (custom domain):
#   bash artifacts/pace5-mobile/scripts/validate-universal-links.sh staging.pace5.com.br
#
# Exit code 0 = all checks passed, non-zero = one or more checks failed.

set -euo pipefail

DOMAIN="${1:-pace5.com.br}"
AASA_URL="https://${DOMAIN}/.well-known/apple-app-site-association"
ASSETLINKS_URL="https://${DOMAIN}/.well-known/assetlinks.json"

PASS=0
FAIL=0

ok()   { echo "  [OK]  $*"; PASS=$((PASS+1)); }
fail() { echo "  [FAIL] $*"; FAIL=$((FAIL+1)); }
info() { echo "  [INFO] $*"; }

check_endpoint() {
  local label="$1"
  local url="$2"
  local placeholder_key="$3"
  local placeholder_val="$4"

  echo ""
  echo "=== $label ==="
  echo "  URL: $url"

  local http_code content_type num_redirects body
  body=$(curl -s -w "\n%{http_code}|%{content_type}|%{num_redirects}" -L --max-redirs 5 "$url" 2>/dev/null)

  local meta
  meta=$(echo "$body" | tail -1)
  local content
  content=$(echo "$body" | head -n -1)

  http_code=$(echo "$meta" | cut -d'|' -f1)
  content_type=$(echo "$meta" | cut -d'|' -f2)
  num_redirects=$(echo "$meta" | cut -d'|' -f3)

  if [ "$http_code" = "200" ]; then
    ok "HTTP status: $http_code"
  else
    fail "HTTP status: $http_code (expected 200)"
  fi

  if echo "$content_type" | grep -q "application/json"; then
    ok "Content-Type: $content_type"
  else
    fail "Content-Type: '$content_type' (expected application/json)"
  fi

  if [ "$num_redirects" = "0" ]; then
    ok "No redirects"
  else
    fail "Redirects found: $num_redirects (iOS requires zero redirects)"
  fi

  if echo "$content" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{JSON.parse(d);process.exit(0)}catch{process.exit(1)}})" 2>/dev/null; then
    ok "Valid JSON"
  else
    fail "Invalid JSON body"
  fi

  if echo "$content" | grep -q "$placeholder_val"; then
    fail "Placeholder value detected: '$placeholder_val' — set the real value in environment variables"
    info "Body: $content"
  else
    ok "No placeholder values found"
    info "Body: $content"
  fi
}

echo "============================================"
echo " Universal Links Validator — $DOMAIN"
echo "============================================"

check_endpoint \
  "iOS — Apple App Site Association (AASA)" \
  "$AASA_URL" \
  "APPLE_TEAM_ID" \
  "SEU_TEAM_ID"

check_endpoint \
  "Android — Asset Links" \
  "$ASSETLINKS_URL" \
  "ANDROID_SHA256_FINGERPRINT" \
  "SEU_SHA256_FINGERPRINT"

echo ""
echo "============================================"
echo " Results: $PASS passed, $FAIL failed"
echo "============================================"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "Next steps:"
  echo "  1. Set APPLE_TEAM_ID on the pace5.com.br server (real value: see Replit Secrets)"
  echo "     → Team ID format: 10 alphanumeric chars (e.g. N32B8VPXR4)"
  echo "  2. Set ANDROID_SHA256_FINGERPRINT on the pace5.com.br server"
  echo "     → expo.dev → project → Credentials → Android → Production Keystore"
  echo "  3. Restart/redeploy the pace5.com.br server and run this script again"
  echo "  4. Validate AASA online: https://branch.io/resources/aasa-validator/"
  echo "  5. See docs/aasa-validation-checklist.md for full step-by-step instructions"
  exit 1
fi

echo ""
echo "All checks passed. Run the branch.io AASA validator as a final confirmation:"
echo "  https://branch.io/resources/aasa-validator/"
