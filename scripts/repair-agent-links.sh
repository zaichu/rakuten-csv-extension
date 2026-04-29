#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

for name in .agents .codex; do
  if [ -e "$name" ] && [ ! -L "$name" ]; then
    echo "$name exists and is not a symlink. Refusing to replace it." >&2
    echo "Move or remove $name first, then rerun this script." >&2
    exit 1
  fi

  ln -sfn .claude "$name"
done

echo "Repaired symlinks:"
ls -lad .claude .agents .codex
