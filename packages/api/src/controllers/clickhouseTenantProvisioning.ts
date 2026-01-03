import crypto from 'crypto';

import * as config from '@/config';
import logger from '@/utils/logger';

type ProvisionedTenantClickhouse = {
  database: string;
  username: string;
  password: string;
};

function quoteIdent(name: string) {
  // ClickHouse identifiers can be backticked; we also strip backticks defensively.
  const safe = name.replace(/`/g, '');
  return `\`${safe}\``;
}

function quoteStr(value: string) {
  // Simple SQL string quoting for ClickHouse; escape single quotes.
  return `'${value.replace(/'/g, "\\'")}'`;
}

async function clickhouseAdminQuery(sql: string) {
  if (!config.CLICKHOUSE_ADMIN_HOST) {
    throw new Error('CLICKHOUSE_ADMIN_HOST is not set');
  }
  const url = `${config.CLICKHOUSE_ADMIN_HOST.replace(/\/$/, '')}/?query=${encodeURIComponent(
    sql,
  )}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-ClickHouse-User': config.CLICKHOUSE_ADMIN_USER || '',
      'X-ClickHouse-Key': config.CLICKHOUSE_ADMIN_PASSWORD || '',
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ClickHouse admin query failed: ${res.status} ${body}`);
  }
}

function getTenantDbName(teamId: string) {
  return `tenant_${teamId}`;
}

function getTenantDbUser(teamId: string) {
  return `tenant_${teamId}`;
}

export async function provisionTenantClickhouse(
  teamId: string,
): Promise<ProvisionedTenantClickhouse | null> {
  if (!config.CLICKHOUSE_TENANT_PROVISIONING_ENABLED) {
    logger.info(
      { teamId },
      'Tenant ClickHouse provisioning disabled (CLICKHOUSE_TENANT_PROVISIONING_ENABLED=false); skipping',
    );
    return null;
  }

  const database = getTenantDbName(teamId);
  const username = getTenantDbUser(teamId);
  const password = crypto.randomBytes(24).toString('hex');

  logger.info(
    { teamId, database, username },
    'Provisioning tenant ClickHouse DB/user',
  );

  // 1) Database
  await clickhouseAdminQuery(
    `CREATE DATABASE IF NOT EXISTS ${quoteIdent(database)}`,
  );

  // 2) User + grants (idempotent)
  await clickhouseAdminQuery(
    `CREATE USER IF NOT EXISTS ${quoteIdent(username)} IDENTIFIED WITH plaintext_password BY ${quoteStr(password)}`,
  );
  await clickhouseAdminQuery(
    `GRANT SELECT, INSERT, ALTER, CREATE, DROP, TRUNCATE ON ${quoteIdent(database)}.* TO ${quoteIdent(username)}`,
  );

  // 3) Tables (minimal set based on docker/clickhouse/local/init-db.sh)
  await clickhouseAdminQuery(`
CREATE TABLE IF NOT EXISTS ${quoteIdent(database)}.otel_logs
(
  \`Timestamp\` DateTime64(9) CODEC(Delta(8), ZSTD(1)),
  \`TimestampTime\` DateTime DEFAULT toDateTime(Timestamp),
  \`TraceId\` String CODEC(ZSTD(1)),
  \`SpanId\` String CODEC(ZSTD(1)),
  \`TraceFlags\` UInt8,
  \`SeverityText\` LowCardinality(String) CODEC(ZSTD(1)),
  \`SeverityNumber\` UInt8,
  \`ServiceName\` LowCardinality(String) CODEC(ZSTD(1)),
  \`Body\` String CODEC(ZSTD(1)),
  \`ResourceSchemaUrl\` LowCardinality(String) CODEC(ZSTD(1)),
  \`ResourceAttributes\` Map(LowCardinality(String), String) CODEC(ZSTD(1)),
  \`ScopeSchemaUrl\` LowCardinality(String) CODEC(ZSTD(1)),
  \`ScopeName\` String CODEC(ZSTD(1)),
  \`ScopeVersion\` LowCardinality(String) CODEC(ZSTD(1)),
  \`ScopeAttributes\` Map(LowCardinality(String), String) CODEC(ZSTD(1)),
  \`LogAttributes\` Map(LowCardinality(String), String) CODEC(ZSTD(1)),
  INDEX idx_trace_id TraceId TYPE bloom_filter(0.001) GRANULARITY 1,
  INDEX idx_res_attr_key mapKeys(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
  INDEX idx_res_attr_value mapValues(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
  INDEX idx_scope_attr_key mapKeys(ScopeAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
  INDEX idx_scope_attr_value mapValues(ScopeAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
  INDEX idx_log_attr_key mapKeys(LogAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
  INDEX idx_log_attr_value mapValues(LogAttributes) TYPE bloom_filter(0.01) GRANULARITY 1
)
ENGINE = MergeTree
PARTITION BY toDate(TimestampTime)
PRIMARY KEY (ServiceName, TimestampTime)
ORDER BY (ServiceName, TimestampTime, Timestamp)
TTL TimestampTime + toIntervalDay(30)
SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1;
  `);

  await clickhouseAdminQuery(`
CREATE TABLE IF NOT EXISTS ${quoteIdent(database)}.otel_traces
(
  \`Timestamp\` DateTime64(9) CODEC(Delta(8), ZSTD(1)),
  \`TraceId\` String CODEC(ZSTD(1)),
  \`SpanId\` String CODEC(ZSTD(1)),
  \`ParentSpanId\` String CODEC(ZSTD(1)),
  \`TraceState\` String CODEC(ZSTD(1)),
  \`SpanName\` LowCardinality(String) CODEC(ZSTD(1)),
  \`SpanKind\` LowCardinality(String) CODEC(ZSTD(1)),
  \`ServiceName\` LowCardinality(String) CODEC(ZSTD(1)),
  \`ResourceAttributes\` Map(LowCardinality(String), String) CODEC(ZSTD(1)),
  \`ScopeName\` String CODEC(ZSTD(1)),
  \`ScopeVersion\` String CODEC(ZSTD(1)),
  \`SpanAttributes\` Map(LowCardinality(String), String) CODEC(ZSTD(1)),
  \`Duration\` UInt64 CODEC(ZSTD(1)),
  \`StatusCode\` LowCardinality(String) CODEC(ZSTD(1)),
  \`StatusMessage\` String CODEC(ZSTD(1)),
  \`Events.Timestamp\` Array(DateTime64(9)) CODEC(ZSTD(1)),
  \`Events.Name\` Array(LowCardinality(String)) CODEC(ZSTD(1)),
  \`Events.Attributes\` Array(Map(LowCardinality(String), String)) CODEC(ZSTD(1)),
  \`Links.TraceId\` Array(String) CODEC(ZSTD(1)),
  \`Links.SpanId\` Array(String) CODEC(ZSTD(1)),
  \`Links.TraceState\` Array(String) CODEC(ZSTD(1)),
  \`Links.Attributes\` Array(Map(LowCardinality(String), String)) CODEC(ZSTD(1)),
  INDEX idx_trace_id TraceId TYPE bloom_filter(0.001) GRANULARITY 1,
  INDEX idx_res_attr_key mapKeys(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
  INDEX idx_res_attr_value mapValues(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
  INDEX idx_span_attr_key mapKeys(SpanAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
  INDEX idx_span_attr_value mapValues(SpanAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
  INDEX idx_duration Duration TYPE minmax GRANULARITY 1
)
ENGINE = MergeTree
PARTITION BY toDate(Timestamp)
ORDER BY (ServiceName, SpanName, toDateTime(Timestamp))
TTL toDate(Timestamp) + toIntervalDay(30)
SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1;
  `);

  await clickhouseAdminQuery(`
CREATE TABLE IF NOT EXISTS ${quoteIdent(database)}.hyperdx_sessions
(
  \`Timestamp\` DateTime64(9) CODEC(Delta(8), ZSTD(1)),
  \`TimestampTime\` DateTime DEFAULT toDateTime(Timestamp),
  \`TraceId\` String CODEC(ZSTD(1)),
  \`SpanId\` String CODEC(ZSTD(1)),
  \`TraceFlags\` UInt8,
  \`SeverityText\` LowCardinality(String) CODEC(ZSTD(1)),
  \`SeverityNumber\` UInt8,
  \`ServiceName\` LowCardinality(String) CODEC(ZSTD(1)),
  \`Body\` String CODEC(ZSTD(1)),
  \`ResourceSchemaUrl\` LowCardinality(String) CODEC(ZSTD(1)),
  \`ResourceAttributes\` Map(LowCardinality(String), String) CODEC(ZSTD(1)),
  \`ScopeSchemaUrl\` LowCardinality(String) CODEC(ZSTD(1)),
  \`ScopeName\` String CODEC(ZSTD(1)),
  \`ScopeVersion\` LowCardinality(String) CODEC(ZSTD(1)),
  \`ScopeAttributes\` Map(LowCardinality(String), String) CODEC(ZSTD(1)),
  \`LogAttributes\` Map(LowCardinality(String), String) CODEC(ZSTD(1)),
  INDEX idx_trace_id TraceId TYPE bloom_filter(0.001) GRANULARITY 1,
  INDEX idx_res_attr_key mapKeys(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
  INDEX idx_res_attr_value mapValues(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
  INDEX idx_scope_attr_key mapKeys(ScopeAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
  INDEX idx_scope_attr_value mapValues(ScopeAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
  INDEX idx_log_attr_key mapKeys(LogAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
  INDEX idx_log_attr_value mapValues(LogAttributes) TYPE bloom_filter(0.01) GRANULARITY 1
)
ENGINE = MergeTree
PARTITION BY toDate(TimestampTime)
PRIMARY KEY (ServiceName, TimestampTime)
ORDER BY (ServiceName, TimestampTime, Timestamp)
TTL TimestampTime + toIntervalDay(30)
SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1;
  `);

  return { database, username, password };
}
