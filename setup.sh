#!/usr/bin/env bash
# setup.sh — wire up agent-starter-kit for this repo.
# Run once after cloning or incorporating these files.
# Safe to re-run: all operations are idempotent.

set -euo pipefail

# --- Resolve REPO_NAME ---
if git remote get-url origin &>/dev/null; then
  REMOTE=$(git remote get-url origin)
  REPO_NAME=$(basename "$REMOTE" .git)
else
  REPO_NAME=$(basename "$(pwd)")
fi

echo "Repo name: $REPO_NAME"

# --- Replace template placeholder ---
echo "Replacing template repo placeholders with '$REPO_NAME'..."

find . \
  \( -name '*.md' -o -name '*.yml' -o -name '*.yaml' -o -name '*.sh' -o -name '*.ts' \) \
  -not -path './.git/*' \
  -not -path './node_modules/*' \
  -not -path './setup.sh' | while read -r file; do
    PLACEHOLDER='{{REPO_NAME}}'
    if grep -q "$PLACEHOLDER" "$file" 2>/dev/null; then
      sed -i '' "s/$PLACEHOLDER/$REPO_NAME/g" "$file"
      echo "  updated: $file"
    fi
  done

# --- Install git hooks ---
echo "Installing git hooks..."
git config core.hooksPath .githooks
echo "  core.hooksPath = .githooks"

# --- Done ---
echo ""
echo "Setup complete. Remaining manual steps:"
echo ""
echo "  GitHub repo settings (Settings → General):"
echo "    [ ] Enable 'Automatically delete head branches'"
echo ""
echo "  Branch protection on master (Settings → Branches → Add rule):"
echo "    [ ] Require a pull request before merging"
echo "    [ ] Require status checks: pr-metadata, quality-checks"
echo ""
echo "  1Password secrets (once .env.local is populated):"
echo "    [ ] npx tsx scripts/publish-1password-secrets.ts"
echo ""
echo "  Review .agent/PLANS.md whenever validation commands change."
echo "  Keep CLAUDE.md aligned with project architecture and commands."
echo ""
