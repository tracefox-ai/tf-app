const env = process.env;

// DEFAULTS
const DEFAULT_APP_TYPE = 'api';
const DEFAULT_EXPRESS_SESSION = 'hyperdx is cool 👋';
const DEFAULT_FRONTEND_URL = `http://localhost:${env.HYPERDX_APP_PORT}`;

export const NODE_ENV = env.NODE_ENV as string;

export const APP_TYPE = (env.APP_TYPE || DEFAULT_APP_TYPE) as
  | 'api'
  | 'scheduled-task';
export const CODE_VERSION = env.CODE_VERSION ?? '';
export const EXPRESS_SESSION_SECRET = (env.EXPRESS_SESSION_SECRET ||
  DEFAULT_EXPRESS_SESSION) as string;
export const FRONTEND_URL = (env.FRONTEND_URL ||
  DEFAULT_FRONTEND_URL) as string;
const HYPERDX_IMAGE = env.HYPERDX_IMAGE;
export const IS_APP_IMAGE = HYPERDX_IMAGE === 'hyperdx';
export const IS_ALL_IN_ONE_IMAGE = HYPERDX_IMAGE === 'all-in-one-auth';
export const IS_LOCAL_IMAGE = HYPERDX_IMAGE === 'all-in-one-noauth';
export const INGESTION_API_KEY = env.INGESTION_API_KEY ?? '';
export const HYPERDX_API_KEY = env.HYPERDX_API_KEY as string;
export const HYPERDX_LOG_LEVEL = env.HYPERDX_LOG_LEVEL as string;
export const IS_CI = NODE_ENV === 'test';
export const IS_DEV = NODE_ENV === 'development';
export const IS_PROD = NODE_ENV === 'production';
export const MINER_API_URL = env.MINER_API_URL as string;
export const MONGO_URI = env.MONGO_URI;
export const OTEL_SERVICE_NAME = env.OTEL_SERVICE_NAME as string;
export const PORT = Number.parseInt(env.PORT as string);
export const OPAMP_PORT = Number.parseInt(env.OPAMP_PORT as string);
export const USAGE_STATS_ENABLED = env.USAGE_STATS_ENABLED !== 'false';
export const RUN_SCHEDULED_TASKS_EXTERNALLY =
  env.RUN_SCHEDULED_TASKS_EXTERNALLY === 'true';

// Only for single container local deployments, disable authentication
export const IS_LOCAL_APP_MODE =
  env.IS_LOCAL_APP_MODE === 'DANGEROUSLY_is_local_app_mode💀';

// Only used to bootstrap empty instances
export const DEFAULT_CONNECTIONS = env.DEFAULT_CONNECTIONS;
export const DEFAULT_SOURCES = env.DEFAULT_SOURCES;

// FOR CI ONLY
export const CLICKHOUSE_HOST = env.CLICKHOUSE_HOST as string;
export const CLICKHOUSE_USER = env.CLICKHOUSE_USER as string;
export const CLICKHOUSE_PASSWORD = env.CLICKHOUSE_PASSWORD as string;

// SaaS provisioning (optional; required if you want the API to create per-tenant DB/users)
export const CLICKHOUSE_ADMIN_HOST = (env.CLICKHOUSE_ADMIN_HOST ||
  env.CLICKHOUSE_HOST) as string;
export const CLICKHOUSE_ADMIN_USER = (env.CLICKHOUSE_ADMIN_USER ||
  env.CLICKHOUSE_USER) as string;
export const CLICKHOUSE_ADMIN_PASSWORD = (env.CLICKHOUSE_ADMIN_PASSWORD ||
  env.CLICKHOUSE_PASSWORD) as string;
export const CLICKHOUSE_QUERY_HOST = (env.CLICKHOUSE_QUERY_HOST ||
  env.CLICKHOUSE_ADMIN_HOST ||
  env.CLICKHOUSE_HOST) as string;
export const CLICKHOUSE_TENANT_PROVISIONING_ENABLED =
  env.CLICKHOUSE_TENANT_PROVISIONING_ENABLED === 'true';

// Ingestion sharding (gateway routes a team/token to a shard)
export const INGESTION_SHARD_COUNT = Number.parseInt(
  env.INGESTION_SHARD_COUNT || '1',
);

// OTLP gateway (data plane)
export const OTLP_GATEWAY_GRPC_PORT = Number.parseInt(
  env.OTLP_GATEWAY_GRPC_PORT || '4317',
);
export const OTLP_GATEWAY_HTTP_PORT = Number.parseInt(
  env.OTLP_GATEWAY_HTTP_PORT || '4318',
);
// Comma-separated lists of shard endpoints by index:
// e.g. INGESTION_SHARD_GRPC_ENDPOINTS="http://collector-shard-0:4317,http://collector-shard-1:4317"
export const INGESTION_SHARD_GRPC_ENDPOINTS = (
  env.INGESTION_SHARD_GRPC_ENDPOINTS || ''
)
  .split(',')
  .filter(Boolean);
export const INGESTION_SHARD_HTTP_ENDPOINTS = (
  env.INGESTION_SHARD_HTTP_ENDPOINTS || ''
)
  .split(',')
  .filter(Boolean);

// AI Assistant
export const ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY as string;

// HTTP request logging
// Set to 'false' to disable HTTP request logging entirely
export const HTTP_LOG_ENABLED = env.HTTP_LOG_ENABLED !== 'false';
// Comma-separated list of route prefixes to exclude from HTTP request logging
// e.g. HTTP_LOG_IGNORE_ROUTES="/clickhouse-proxy,/health"
export const HTTP_LOG_IGNORE_ROUTES = (env.HTTP_LOG_IGNORE_ROUTES || '')
  .split(',')
  .filter(Boolean);
