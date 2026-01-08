# ✅ Docker Deployment Successful!

## Your TraceFox Application is Now Running

### 🌐 Access Points

- **Frontend (Web UI)**: http://localhost:8080
- **API**: http://localhost:8000
- **OTLP Collector (gRPC)**: localhost:4317
- **OTLP Collector (HTTP)**: localhost:4318

### 📦 Running Services

All 4 containers are up and running:

1. **hdx-oss-app-1** - Your custom built app (API + Frontend)
   - Image: `docker.hyperdx.io/hyperdx/hyperdx:2.11.0`
   - Ports: 8000 (API), 8080 (Frontend)

2. **hdx-oss-otel-collector-1** - OpenTelemetry Collector
   - Ports: 4317 (gRPC), 4318 (HTTP), 13133 (health), 24225 (fluentd)

3. **hdx-oss-ch-server-1** - ClickHouse Database
   - Internal only (not exposed)

4. **hdx-oss-db-1** - MongoDB
   - Internal only (not exposed)

### 🔧 Quick Commands

```bash
# View all services
docker compose ps

# View app logs
docker compose logs -f app

# View all logs
docker compose logs -f

# Restart a service
docker compose restart app

# Stop all services
docker compose down

# Stop and remove all data
docker compose down -v
```

### 📝 Notes

- The warnings about `HYPERDX_API_KEY` not being set are normal for local development
- The OpAMP errors about `hdx.shard_id` are expected in single-collector mode (non-SaaS deployment)
- Both frontend (200) and API (200) health checks are passing ✅

### 🔄 To Deploy Code Changes

1. Make your code changes
2. Rebuild: `make build-app`
3. Tag: `docker tag hyperdx/hyperdx:2.11.0 docker.hyperdx.io/hyperdx/hyperdx:2.11.0`
4. Restart: `docker compose up -d --force-recreate app`

### 📚 Full Documentation

See `DOCKER_DEPLOY.md` for complete deployment guide and troubleshooting.
