#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/sihangwu"
IMAGE_NAME="smart-wardrobe"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-wardrobeadmin2026}"

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y git docker.io
systemctl enable --now docker

if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  rm -rf "$APP_DIR"
  git clone https://github.com/monica0622-cell/sihangwu.git "$APP_DIR"
fi

cd "$APP_DIR"
docker build -t "$IMAGE_NAME" .
docker rm -f smart-wardrobe >/dev/null 2>&1 || true
docker run -d \
  --name smart-wardrobe \
  --restart unless-stopped \
  -p 80:4176 \
  -e ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  -v wardrobe-data:/app/data \
  -v wardrobe-uploads:/app/uploads \
  "$IMAGE_NAME"

docker ps --filter name=smart-wardrobe
