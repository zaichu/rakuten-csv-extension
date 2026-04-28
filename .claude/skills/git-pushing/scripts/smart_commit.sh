#!/bin/bash
# Smart Git Commit Script for git-pushing skill
# Commits only staged changes and pushes current branch.

set -euo pipefail

usage() {
    cat <<'USAGE'
Usage:
  bash .claude/skills/git-pushing/scripts/smart_commit.sh "type: summary"

Notes:
- Stage only intended files first (git add <path> or git add -p)
- This script does not run git add automatically
- Run on a task branch (not main)
USAGE
}

if [ $# -lt 1 ]; then
    echo "ERROR: commit message is required"
    usage
    exit 1
fi

COMMIT_MSG="$1"
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

echo "Current branch: $CURRENT_BRANCH"

if [ "$CURRENT_BRANCH" = "main" ]; then
    echo "ERROR: direct commits to main are not allowed"
    echo "Create a task branch from main and run this script there."
    echo "See .claude/rules/03-git.md"
    exit 1
fi

if git diff --cached --quiet; then
    echo "ERROR: no staged changes"
    echo "Stage files explicitly before running this script."
    exit 1
fi

if ! git diff --quiet; then
    echo "WARN: unstaged changes remain in working tree"
fi

git commit -m "$COMMIT_MSG"

if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
    git push
    echo "Pushed to upstream of $CURRENT_BRANCH"
else
    git push -u origin "$CURRENT_BRANCH"
    echo "Pushed new branch and set upstream: origin/$CURRENT_BRANCH"
fi
