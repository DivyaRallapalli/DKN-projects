#!/usr/bin/env bash
set -euo pipefail

# Static site plus the enquiry API. Verify required assets exist.
test -f index.html
test -f server.js
test -f api/enquiry.js

echo "Site structure verified."
