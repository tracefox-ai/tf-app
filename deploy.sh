#!/bin/bash
# Quick deployment script for TraceFox
# Usage: ./deploy.sh
#
# This script automates the process of deploying your latest code changes:
# 1. Reads the version from .env file
# 2. Builds a new Docker image with your latest code
# 3. Tags it correctly so docker-compose can find it
# 4. Restarts the app container with the new image

# Exit immediately if any command fails (prevents continuing with errors)
set -e

echo "🚀 Starting deployment..."

# ============================================================================
# STEP 1: Read version information from .env file
# ============================================================================
# The .env file contains IMAGE_VERSION (e.g., "2.13.0") which docker-compose
# uses to find the right image. We need to read this to tag our built image correctly.

if [ ! -f .env ]; then
  echo "❌ Error: .env file not found"
  exit 1
fi

# Extract IMAGE_VERSION from .env file
# - grep "^IMAGE_VERSION=" finds the line starting with IMAGE_VERSION=
# - cut -d '=' -f2 gets everything after the = sign
# - tr -d removes quotes and apostrophes (handles both "2.13.0" and '2.13.0')
# - xargs trims whitespace
VERSION=$(grep "^IMAGE_VERSION=" .env | cut -d '=' -f2 | tr -d '"' | tr -d "'" | xargs)

# Extract IMAGE_VERSION_SUB_TAG if it exists (e.g., ".13.0")
# The || echo "" means if grep fails (no sub-tag), use empty string
SUB_TAG=$(grep "^IMAGE_VERSION_SUB_TAG=" .env | cut -d '=' -f2 | tr -d '"' | tr -d "'" | xargs || echo "")

# Validate that we found a version
if [ -z "$VERSION" ]; then
  echo "❌ Error: IMAGE_VERSION not found in .env"
  exit 1
fi

# ============================================================================
# STEP 2: Build the Docker image with your latest code
# ============================================================================
# This runs "make build-app" which:
# - Builds your API and frontend code
# - Creates a Docker image tagged as: hyperdx/hyperdx:VERSION+SUB_TAG
#   Example: hyperdx/hyperdx:2.13.0.13.0
#
# Why we need this: Your code changes are only in your local filesystem.
# Docker containers run from images, so we must build a new image containing
# your latest code changes.
echo "📦 Building image (version: ${VERSION}${SUB_TAG})..."
make build-app

# ============================================================================
# STEP 3: Tag the image for docker-compose
# ============================================================================
# Problem: make build-app creates: hyperdx/hyperdx:2.13.0.13.0
# But docker-compose.yml expects: docker.hyperdx.io/hyperdx/hyperdx:2.13.0
#
# Solution: We create a new tag (alias) pointing to the same image.
# Docker tags are just labels - they don't duplicate the image data.
#
# Why this is needed:
# - docker-compose.yml uses: ${HDX_IMAGE_REPO}/${IMAGE_NAME_DOCKERHUB}:${IMAGE_VERSION}
# - This resolves to: docker.hyperdx.io/hyperdx/hyperdx:2.13.0
# - But make build-app creates: hyperdx/hyperdx:2.13.0.13.0
# - So we tag the built image with the name docker-compose expects

echo "🏷️  Tagging image..."

# The tag that make build-app created (with sub-tag)
BUILT_TAG="hyperdx/hyperdx:${VERSION}${SUB_TAG}"

# The tag that docker-compose.yml is looking for (without sub-tag, with registry prefix)
TARGET_TAG="docker.hyperdx.io/hyperdx/hyperdx:${VERSION}"

# Check if the built image exists (sometimes sub-tag might not be used)
# This handles cases where the image was built without a sub-tag
if ! docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "^${BUILT_TAG}$"; then
  echo "⚠️  Warning: Built image ${BUILT_TAG} not found. Trying without sub-tag..."
  # Fallback: try the version without sub-tag
  BUILT_TAG="hyperdx/hyperdx:${VERSION}"
fi

# Create the tag that docker-compose expects
# This doesn't copy the image - it just creates a new name pointing to the same image
docker tag "${BUILT_TAG}" "${TARGET_TAG}"

# ============================================================================
# STEP 4: Restart the container with the new image
# ============================================================================
# --force-recreate: Forces Docker Compose to recreate the container even if
#                   the configuration hasn't changed. This ensures the new
#                   image is used.
# -d: Runs in detached mode (background)
#
# Why we need --force-recreate:
# - A simple "restart" would use the same old image
# - We need to recreate the container to pick up the newly tagged image
echo "🔄 Restarting container..."
docker compose up -d --force-recreate app

# Also start nginx if it's enabled in docker-compose.yml
if docker compose config --services | grep -q "^nginx$"; then
    echo "🌐 Starting nginx service..."
    docker compose up -d nginx
fi

# ============================================================================
# Done! Provide helpful next steps
# ============================================================================
echo "✅ Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "   - Check logs: docker compose logs -f app"
echo "   - Check status: docker compose ps app"
echo "   - View all logs: docker compose logs -f"

