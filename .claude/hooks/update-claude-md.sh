#!/bin/bash
# Stop hook: remind Claude to update CLAUDE.md when source code changes
# Exit 0 = allow stop, Exit 2 = block stop with feedback

REPO="$CLAUDE_PROJECT_DIR"

# Get all uncommitted changes (staged + unstaged + untracked)
CHANGED=$(cd "$REPO" && {
  git diff --name-only 2>/dev/null
  git diff --name-only --cached 2>/dev/null
  git ls-files --others --exclude-standard 2>/dev/null
} | sort -u)

# Check if any meaningful code files changed
CODE_CHANGED=$(echo "$CHANGED" | grep -E '^(src/|build\.mjs|esbuild|package\.json|tsconfig)' | head -1)

# Check if CLAUDE.md was also changed
CLAUDE_CHANGED=$(echo "$CHANGED" | grep -q 'CLAUDE\.md' && echo "yes")

if [[ -n "$CODE_CHANGED" && -z "$CLAUDE_CHANGED" ]]; then
  echo "Source code was modified but CLAUDE.md was not updated. Review whether CLAUDE.md needs changes to reflect new/removed files, updated architecture, changed patterns, or modified configuration." >&2
  exit 2
fi

exit 0
