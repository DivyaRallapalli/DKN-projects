#!/usr/bin/env bash
set -euo pipefail

# Static site — no package dependencies. Verify required assets exist.
test -f index.html
test -d images
test "$(find images -type f | wc -l)" -gt 0

echo "Static site structure verified."
