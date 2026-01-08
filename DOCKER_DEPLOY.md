# Docker Deployment Guide for TraceFox

## Quick Start - Deploy Your Built Image

After building your custom image with `make build-app`, follow these steps:

### 1. Stop Any Running Development Services

```bash
# Stop any local dev processes (if running)
# Press Ctrl+C in terminals running yarn dev or yarn dev:saas

# Stop any existing Docker Compose stacks
docker compose -f docker-compose.saas-dev.yml down
docker compose -f docker-compose.dev.yml down
docker compose down
```

### 2. Tag Your Local Image

Your built image needs to match the naming convention in docker-compose.yml:

```bash
docker tag hyperdx/hyperdx:2.11.0 docker.hyperdx.io/hyperdx/hyperdx:2.11.0
```

### 3. Start the Docker Stack

```bash
docker compose up -d
```

### 4. Check Status

```bash
# View running containers
docker compose ps

# View logs
docker compose logs -f app

# Check all services
docker compose logs -f
```

### 5. Access the Application

- **Frontend**: http://localhost:8080
- **API**: http://localhost:8000
- **OTLP Collector (gRPC)**: localhost:4317
- **OTLP Collector (HTTP)**: localhost:4318

---

## Build Commands Reference

### Build App Only (API + Frontend)

```bash
make build-app
```

### Build All-in-One (includes ClickHouse, MongoDB, OTel Collector)

```bash
make build-all-in-one
```

### Build OTel Collector Only

```bash
make build-otel-collector
```

---

## Troubleshooting

### Port Conflicts

If you get "address already in use" errors:

```bash
# Check what's using the ports
lsof -i :4317  # OTLP gRPC
lsof -i :4318  # OTLP HTTP
lsof -i :8080  # Frontend
lsof -i :8000  # API

# Kill processes if needed
kill -9 <PID>

# Or stop all Docker containers
docker compose down
docker compose -f docker-compose.saas-dev.yml down
docker compose -f docker-compose.dev.yml down
```

### Image Not Found

If Docker can't find your image:

```bash
# List available images
docker images | grep hyperdx

# Retag if needed
docker tag hyperdx/hyperdx:2.11.0 docker.hyperdx.io/hyperdx/hyperdx:2.11.0
```

### View Container Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f app
docker compose logs -f otel-collector
docker compose logs -f ch-server
docker compose logs -f db
```

### Restart Services

```bash
# Restart all
docker compose restart

# Restart specific service
docker compose restart app

# Rebuild and restart
docker compose up -d --build app
```

### ClickHouse Database Not Created on User Signup

If new user signups don't create tenant databases in ClickHouse, follow these
debugging steps:

**Step 1: Verify Environment Variables**

Check if the environment variables are actually set in the running container:

```bash
# Check all ClickHouse-related env vars in the app container
docker compose exec app env | grep CLICKHOUSE
```

You should see:

```
CLICKHOUSE_TENANT_PROVISIONING_ENABLED=true
CLICKHOUSE_ADMIN_HOST=http://ch-server:8123
CLICKHOUSE_ADMIN_USER=default
CLICKHOUSE_ADMIN_PASSWORD=
```

**Step 2: Verify docker-compose.yml Configuration**

The `app` service should have these environment variables configured:

```yaml
CLICKHOUSE_TENANT_PROVISIONING_ENABLED: 'true'
CLICKHOUSE_ADMIN_HOST: 'http://ch-server:8123'
CLICKHOUSE_ADMIN_USER: 'default'
CLICKHOUSE_ADMIN_PASSWORD: ''
```

**Step 3: Restart the Container**

After adding/modifying environment variables, you must recreate the container
(not just restart):

```bash
# Stop and remove the container
docker compose stop app
docker compose rm -f app

# Start it again (this will pick up the new env vars)
docker compose up -d app
```

**Step 4: Check App Logs**

Look for ClickHouse-related log messages during signup:

```bash
# Watch logs in real-time
docker compose logs -f app

# Or search for ClickHouse messages
docker compose logs app | grep -i clickhouse

# Look for provisioning messages
docker compose logs app | grep -i "tenant.*clickhouse\|provisioning"
```

**Step 5: Test ClickHouse Connection**

Test if the app can connect to ClickHouse:

```bash
# Test from inside the app container
docker compose exec app sh -c 'wget -O- "http://ch-server:8123/?query=SELECT 1"'
```

**Step 6: Check for Errors**

Look for specific error messages:

```bash
# Check for "CLICKHOUSE_ADMIN_HOST is not set" errors
docker compose logs app | grep -i "CLICKHOUSE_ADMIN_HOST"

# Check for permission errors
docker compose logs app | grep -i "permission\|access denied\|unauthorized"

# Check for connection errors
docker compose logs app | grep -i "connection\|failed\|error"
```

**Common Issues:**

1. **Container not recreated**: If you only ran `docker compose restart`, the
   old environment variables are still in use. Use
   `docker compose up -d --force-recreate app` instead.

2. **Image version doesn't matter**: The environment variables are passed at
   runtime, so you don't need to rebuild the image. However, make sure the code
   in your image supports tenant provisioning (should be in version 2.11.0+).

3. **ClickHouse permissions**: The default user needs admin privileges. With
   `CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT: 1`, the default user should have all
   privileges, but if you see permission errors, you may need to grant
   privileges manually.

4. **Network connectivity**: Ensure the app container can reach
   `ch-server:8123`. Test with:
   ```bash
   docker compose exec app ping -c 1 ch-server
   ```

**Why this is needed:**

- When a user signs up, the app needs to create a new ClickHouse database for
  that tenant
- The app requires admin credentials to execute `CREATE DATABASE` and
  `CREATE USER` commands
- These environment variables enable the tenant provisioning feature and provide
  the admin connection details

---

## Clean Up

### Stop Services (Keep Data)

```bash
docker compose down
```

### Stop Services and Remove Volumes (Delete All Data)

```bash
docker compose down -v
```

### Remove Images

```bash
docker rmi hyperdx/hyperdx:2.11.0
docker rmi docker.hyperdx.io/hyperdx/hyperdx:2.11.0
```

---

## Development Workflow

### Deploy Your Latest Code

When you've made code changes and want to deploy them:

1. **Check your current version** (in `.env` file):
   ```bash
   grep IMAGE_VERSION .env
   ```
   Note the version number (e.g., `2.13.0`)

2. **Build the image with your latest code**:
   ```bash
   make build-app
   ```
   This builds the image as `hyperdx/hyperdx:${IMAGE_VERSION}${IMAGE_VERSION_SUB_TAG}` (e.g., `hyperdx/hyperdx:2.13.0.13.0`)

3. **Tag the image for docker-compose**:
   ```bash
   # First, find the exact tag that was built
   docker images | grep "hyperdx/hyperdx" | grep "$(grep IMAGE_VERSION .env | cut -d '=' -f2)"
   
   # Then tag it (replace 2.13.0.13.0 with your actual built tag, and 2.13.0 with IMAGE_VERSION)
   docker tag hyperdx/hyperdx:2.13.0.13.0 docker.hyperdx.io/hyperdx/hyperdx:2.13.0
   ```
   
   **Note:** The tag needs to match `${HDX_IMAGE_REPO}/${IMAGE_NAME_DOCKERHUB}:${IMAGE_VERSION}` format from docker-compose.yml

4. **Restart the app container**:
   ```bash
   docker compose up -d --force-recreate app
   ```
   This will stop the old container and start a new one with your updated image.

5. **Verify the deployment**:
   ```bash
   # Check container is running
   docker compose ps app
   
   # Watch logs for any errors
   docker compose logs -f app
   ```

### Quick Deploy Script

You can create a helper script to automate this:

```bash
#!/bin/bash
# Save as deploy.sh

# Get version from .env
VERSION=$(grep IMAGE_VERSION .env | cut -d '=' -f2 | tr -d '"' | tr -d "'")
SUB_TAG=$(grep IMAGE_VERSION_SUB_TAG .env | cut -d '=' -f2 | tr -d '"' | tr -d "'" || echo "")

echo "Building image..."
make build-app

echo "Tagging image..."
if [ -n "$SUB_TAG" ]; then
  docker tag hyperdx/hyperdx:${VERSION}${SUB_TAG} docker.hyperdx.io/hyperdx/hyperdx:${VERSION}
else
  docker tag hyperdx/hyperdx:${VERSION} docker.hyperdx.io/hyperdx/hyperdx:${VERSION}
fi

echo "Restarting container..."
docker compose up -d --force-recreate app

echo "Deployment complete! Check logs with: docker compose logs -f app"
```

Make it executable and run:
```bash
chmod +x deploy.sh
./deploy.sh
```

---

## Environment Variables

Key variables in `.env`:

- `HYPERDX_API_PORT=8000` - API port
- `HYPERDX_APP_PORT=8080` - Frontend port
- `HYPERDX_APP_URL=http://localhost` - Base URL
- `IMAGE_VERSION=2.11.0` - Docker image version

For production deployments, also set:

- `EXPRESS_SESSION_SECRET` - Random string for session security
- `FRONTEND_URL` - Your production domain
- `HYPERDX_API_KEY` - API key for authentication

### ClickHouse Configuration (in docker-compose.yml)

The following environment variables are configured in `docker-compose.yml` for
the `app` service to enable tenant database provisioning:

- `CLICKHOUSE_TENANT_PROVISIONING_ENABLED: "true"` - Enables automatic database
  creation for new teams
- `CLICKHOUSE_ADMIN_HOST: "http://ch-server:8123"` - ClickHouse HTTP API
  endpoint
- `CLICKHOUSE_ADMIN_USER: "default"` - Admin username for ClickHouse operations
- `CLICKHOUSE_ADMIN_PASSWORD: ""` - Admin password (empty for default user)

These are required for the app to create tenant-specific databases when users
sign up. Without these, signups will succeed but no ClickHouse database will be
created for the new team.
