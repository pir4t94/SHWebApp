#!/usr/bin/env bash
# EntiaBot deploy script for Raspberry Pi / Ubuntu
#
# Usage (from your dev machine):
#   ./deploy/deploy.sh pi@raspberrypi.local:/home/pi/entiabot
#
# Or run on the Pi directly after pulling the latest code:
#   ./deploy/deploy.sh --local
#
set -euo pipefail

TARGET="${1:-}"

run_local() {
  echo "==> Installing dependencies"
  npm ci

  echo "==> Building Next.js"
  npm run build

  echo "==> Restarting service (requires sudo)"
  sudo systemctl restart entiabot.service
  sudo systemctl status entiabot.service --no-pager | head -n 10
}

run_remote() {
  local target="$1"
  local host="${target%%:*}"
  local path="${target#*:}"

  echo "==> Syncing code to ${target}"
  rsync -az --delete \
    --exclude node_modules \
    --exclude .next \
    --exclude .git \
    --exclude 'data/*.json' \
    ./ "$target/"

  echo "==> Building and restarting on $host"
  # shellcheck disable=SC2029
  ssh "$host" "cd '$path' && ./deploy/deploy.sh --local"
}

if [[ -z "$TARGET" ]]; then
  echo "Usage: $0 <host:path> | --local" >&2
  exit 1
fi

if [[ "$TARGET" == "--local" ]]; then
  run_local
else
  run_remote "$TARGET"
fi
