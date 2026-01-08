    "app:dev:saas": "concurrently -k -n 'API,APP,OTLP-GATEWAY,ALERTS-TASK,BILLING-TASK,TELEMETRY-ANALYSIS,COMMON-UTILS' -c 'green.bold,purple.bold,blue.bold,white.bold,yellow.bold,cyan.bold,orange.bold,magenta' 'nx run @hyperdx/api:dev' 'nx run @hyperdx/app:dev' 'HYPERDX_LOG_LEVEL=error yarn workspace @hyperdx/api dev:gateway' 'nx run @hyperdx/api:dev-task check-alerts' 'nx run @hyperdx/api:dev-task calculate-data-ingestion' 'nx run @hyperdx/api:dev-task telemetry-analysis' 'nx run @hyperdx/common-utils:dev'",






in web directory
npx dotenv -e .env.demo -- yarn start


Option A: Build the main app (API + Frontend)
# Build the app image locally
make build-app

# Or use docker directly:
docker build . -f ./docker/hyperdx/Dockerfile \
  --build-context hyperdx=./docker/hyperdx \
  --build-context api=./packages/api \
  --build-context app=./packages/app \
  --build-arg CODE_VERSION=2.11.0 \
  -t hyperdx/hyperdx:2 \
  --target prod


Option B: Build all-in-one image (includes ClickHouse, MongoDB, OTel Collector)
# Build all-in-one image
make build-all-in-one

# Or use docker directly:
docker build . -f ./docker/hyperdx/Dockerfile \
  --build-context clickhouse=./docker/clickhouse \
  --build-context otel-collector=./docker/otel-collector \
  --build-context hyperdx=./docker/hyperdx \
  --build-context api=./packages/api \
  --build-context app=./packages/app \
  --build-arg CODE_VERSION=2.11.0 \
  -t hyperdx/hyperdx-all-in-one:2 \
  --target all-in-one-auth