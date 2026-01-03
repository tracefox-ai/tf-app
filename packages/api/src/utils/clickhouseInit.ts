import { createNativeClient } from '@hyperdx/common-utils/dist/clickhouse/node';
import ms from 'ms';

import * as config from '@/config';
import logger from '@/utils/logger';

let clickhouseClient: any;

const getClickhouseClient = async () => {
  if (!clickhouseClient) {
    clickhouseClient = createNativeClient({
      url: config.CLICKHOUSE_HOST,
      username: config.CLICKHOUSE_USER,
      password: config.CLICKHOUSE_PASSWORD,
      request_timeout: ms('1m'),
      compression: {
        request: false,
        response: false, // has to be off to enable streaming
      },
      clickhouse_settings: {
        connect_timeout: ms('1m') / 1000,
        date_time_output_format: 'iso',
        max_download_buffer_size: (10 * 1024 * 1024).toString(), // default
        max_download_threads: 32,
        max_execution_time: ms('2m') / 1000,
      },
    });
  }
  return clickhouseClient;
};

/**
 * Table schema definitions for ClickHouse
 * These match the schemas from init-db.sh and fixtures.ts
 */
const TABLE_SCHEMAS = {
  otel_logs: `
    CREATE TABLE IF NOT EXISTS {database}.otel_logs
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
      \`__hdx_materialized_k8s.cluster.name\` LowCardinality(String) MATERIALIZED ResourceAttributes['k8s.cluster.name'] CODEC(ZSTD(1)),
      \`__hdx_materialized_k8s.container.name\` LowCardinality(String) MATERIALIZED ResourceAttributes['k8s.container.name'] CODEC(ZSTD(1)),
      \`__hdx_materialized_k8s.deployment.name\` LowCardinality(String) MATERIALIZED ResourceAttributes['k8s.deployment.name'] CODEC(ZSTD(1)),
      \`__hdx_materialized_k8s.namespace.name\` LowCardinality(String) MATERIALIZED ResourceAttributes['k8s.namespace.name'] CODEC(ZSTD(1)),
      \`__hdx_materialized_k8s.node.name\` LowCardinality(String) MATERIALIZED ResourceAttributes['k8s.node.name'] CODEC(ZSTD(1)),
      \`__hdx_materialized_k8s.pod.name\` LowCardinality(String) MATERIALIZED ResourceAttributes['k8s.pod.name'] CODEC(ZSTD(1)),
      \`__hdx_materialized_k8s.pod.uid\` LowCardinality(String) MATERIALIZED ResourceAttributes['k8s.pod.uid'] CODEC(ZSTD(1)),
      \`__hdx_materialized_deployment.environment.name\` LowCardinality(String) MATERIALIZED ResourceAttributes['deployment.environment.name'] CODEC(ZSTD(1)),
      INDEX idx_trace_id TraceId TYPE bloom_filter(0.001) GRANULARITY 1,
      INDEX idx_res_attr_key mapKeys(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
      INDEX idx_res_attr_value mapValues(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
      INDEX idx_scope_attr_key mapKeys(ScopeAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
      INDEX idx_scope_attr_value mapValues(ScopeAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
      INDEX idx_log_attr_key mapKeys(LogAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
      INDEX idx_log_attr_value mapValues(LogAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
      INDEX idx_lower_body lower(Body) TYPE tokenbf_v1(32768, 3, 0) GRANULARITY 8
    )
    ENGINE = MergeTree
    PARTITION BY toDate(TimestampTime)
    PRIMARY KEY (ServiceName, TimestampTime)
    ORDER BY (ServiceName, TimestampTime, Timestamp)
    TTL TimestampTime + toIntervalDay(30)
    SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1
  `,

  otel_traces: `
    CREATE TABLE IF NOT EXISTS {database}.otel_traces
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
      \`__hdx_materialized_rum.sessionId\` String MATERIALIZED ResourceAttributes['rum.sessionId'] CODEC(ZSTD(1)),
      INDEX idx_trace_id TraceId TYPE bloom_filter(0.001) GRANULARITY 1,
      INDEX idx_rum_session_id __hdx_materialized_rum.sessionId TYPE bloom_filter(0.001) GRANULARITY 1,
      INDEX idx_res_attr_key mapKeys(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
      INDEX idx_res_attr_value mapValues(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
      INDEX idx_span_attr_key mapKeys(SpanAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
      INDEX idx_span_attr_value mapValues(SpanAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
      INDEX idx_duration Duration TYPE minmax GRANULARITY 1,
      INDEX idx_lower_span_name lower(SpanName) TYPE tokenbf_v1(32768, 3, 0) GRANULARITY 8
    )
    ENGINE = MergeTree
    PARTITION BY toDate(Timestamp)
    ORDER BY (ServiceName, SpanName, toDateTime(Timestamp))
    TTL toDate(Timestamp) + toIntervalDay(30)
    SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1
  `,

  hyperdx_sessions: `
    CREATE TABLE {database}.hyperdx_sessions
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
      \`__hdx_materialized_rum.sessionId\` String MATERIALIZED ResourceAttributes['rum.sessionId'] CODEC(ZSTD(1)),
      \`__hdx_materialized_type\` LowCardinality(String) MATERIALIZED toString(simpleJSONExtractInt(Body, 'type')) CODEC(ZSTD(1)),
      INDEX idx_trace_id TraceId TYPE bloom_filter(0.001) GRANULARITY 1,
      INDEX idx_rum_session_id __hdx_materialized_rum.sessionId TYPE bloom_filter(0.001) GRANULARITY 1,
      INDEX idx_res_attr_key mapKeys(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
      INDEX idx_res_attr_value mapValues(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
      INDEX idx_scope_attr_key mapKeys(ScopeAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
      INDEX idx_scope_attr_value mapValues(ScopeAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
      INDEX idx_log_attr_key mapKeys(LogAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
      INDEX idx_log_attr_value mapValues(LogAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
      INDEX idx_body Body TYPE tokenbf_v1(32768, 3, 0) GRANULARITY 8
    )
    ENGINE = MergeTree
    PARTITION BY toDate(TimestampTime)
    PRIMARY KEY (ServiceName, TimestampTime)
    ORDER BY (ServiceName, TimestampTime, Timestamp)
    TTL TimestampTime + toIntervalDay(30)
    SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1
  `,

  otel_metrics_gauge: `
    CREATE TABLE IF NOT EXISTS {database}.otel_metrics_gauge
    (
      ResourceAttributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
      ResourceSchemaUrl String CODEC(ZSTD(1)),
      ScopeName String CODEC(ZSTD(1)),
      ScopeVersion String CODEC(ZSTD(1)),
      ScopeAttributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
      ScopeDroppedAttrCount UInt32 CODEC(ZSTD(1)),
      ScopeSchemaUrl String CODEC(ZSTD(1)),
      ServiceName LowCardinality(String) CODEC(ZSTD(1)),
      MetricName String CODEC(ZSTD(1)),
      MetricDescription String CODEC(ZSTD(1)),
      MetricUnit String CODEC(ZSTD(1)),
      Attributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
      StartTimeUnix DateTime64(9) CODEC(Delta(8), ZSTD(1)),
      TimeUnix DateTime64(9) CODEC(Delta(8), ZSTD(1)),
      Value Float64 CODEC(ZSTD(1)),
      Flags UInt32 CODEC(ZSTD(1)),
      INDEX idx_res_attr_key mapKeys(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
      INDEX idx_res_attr_value mapValues(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
      INDEX idx_scope_attr_key mapKeys(ScopeAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
      INDEX idx_scope_attr_value mapValues(ScopeAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
      INDEX idx_attr_key mapKeys(Attributes) TYPE bloom_filter(0.01) GRANULARITY 1,
      INDEX idx_attr_value mapValues(Attributes) TYPE bloom_filter(0.01) GRANULARITY 1
    )
    ENGINE = MergeTree
    PARTITION BY toDate(TimeUnix)
    ORDER BY (ServiceName, MetricName, Attributes, toUnixTimestamp64Nano(TimeUnix))
    TTL toDateTime(TimeUnix) + toIntervalDay(3)
    SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1
  `,

  otel_metrics_sum: `
    CREATE TABLE IF NOT EXISTS {database}.otel_metrics_sum
    (
      ResourceAttributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
      ResourceSchemaUrl String CODEC(ZSTD(1)),
      ScopeName String CODEC(ZSTD(1)),
      ScopeVersion String CODEC(ZSTD(1)),
      ScopeAttributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
      ScopeDroppedAttrCount UInt32 CODEC(ZSTD(1)),
      ScopeSchemaUrl String CODEC(ZSTD(1)),
      ServiceName LowCardinality(String) CODEC(ZSTD(1)),
      MetricName String CODEC(ZSTD(1)),
      MetricDescription String CODEC(ZSTD(1)),
      MetricUnit String CODEC(ZSTD(1)),
      Attributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
      StartTimeUnix DateTime64(9) CODEC(Delta(8), ZSTD(1)),
      TimeUnix DateTime64(9) CODEC(Delta(8), ZSTD(1)),
      Value Float64 CODEC(ZSTD(1)),
      Flags UInt32 CODEC(ZSTD(1)),
      AggregationTemporality Int32 CODEC(ZSTD(1)),
      IsMonotonic Bool CODEC(Delta(1), ZSTD(1)),
      INDEX idx_res_attr_key mapKeys(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
      INDEX idx_res_attr_value mapValues(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
      INDEX idx_scope_attr_key mapKeys(ScopeAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
      INDEX idx_scope_attr_value mapValues(ScopeAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
      INDEX idx_attr_key mapKeys(Attributes) TYPE bloom_filter(0.01) GRANULARITY 1,
      INDEX idx_attr_value mapValues(Attributes) TYPE bloom_filter(0.01) GRANULARITY 1
    )
    ENGINE = MergeTree
    PARTITION BY toDate(TimeUnix)
    ORDER BY (ServiceName, MetricName, Attributes, toUnixTimestamp64Nano(TimeUnix))
    TTL toDateTime(TimeUnix) + toIntervalDay(15)
    SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1
  `,

  otel_metrics_histogram: `
    CREATE TABLE IF NOT EXISTS {database}.otel_metrics_histogram
    (
      ResourceAttributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
      ResourceSchemaUrl String CODEC(ZSTD(1)),
      ScopeName String CODEC(ZSTD(1)),
      ScopeVersion String CODEC(ZSTD(1)),
      ScopeAttributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
      ScopeDroppedAttrCount UInt32 CODEC(ZSTD(1)),
      ScopeSchemaUrl String CODEC(ZSTD(1)),
      ServiceName LowCardinality(String) CODEC(ZSTD(1)),
      MetricName String CODEC(ZSTD(1)),
      MetricDescription String CODEC(ZSTD(1)),
      MetricUnit String CODEC(ZSTD(1)),
      Attributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
      StartTimeUnix DateTime64(9) CODEC(Delta(8), ZSTD(1)),
      TimeUnix DateTime64(9) CODEC(Delta(8), ZSTD(1)),
      Count UInt64 CODEC(Delta(8), ZSTD(1)),
      Sum Float64 CODEC(ZSTD(1)),
      BucketCounts Array(UInt64) CODEC(ZSTD(1)),
      ExplicitBounds Array(Float64) CODEC(ZSTD(1)),
      Flags UInt32 CODEC(ZSTD(1)),
      Min Float64 CODEC(ZSTD(1)),
      Max Float64 CODEC(ZSTD(1)),
      AggregationTemporality Int32 CODEC(ZSTD(1)),
      INDEX idx_res_attr_key mapKeys(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
      INDEX idx_res_attr_value mapValues(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
      INDEX idx_scope_attr_key mapKeys(ScopeAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
      INDEX idx_scope_attr_value mapValues(ScopeAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
      INDEX idx_attr_key mapKeys(Attributes) TYPE bloom_filter(0.01) GRANULARITY 1,
      INDEX idx_attr_value mapValues(Attributes) TYPE bloom_filter(0.01) GRANULARITY 1
    )
    ENGINE = MergeTree
    PARTITION BY toDate(TimeUnix)
    ORDER BY (ServiceName, MetricName, Attributes, toUnixTimestamp64Nano(TimeUnix))
    TTL toDateTime(TimeUnix) + toIntervalDay(3)
    SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1
  `,
};

/**
 * Sanitizes a database name to be ClickHouse-compatible
 * ClickHouse identifiers can contain letters, digits, and underscores
 */
function sanitizeDatabaseName(name: string): string {
  // Replace any non-alphanumeric characters (except underscores) with underscores
  // Also ensure it doesn't start with a number
  let sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_');
  if (/^\d/.test(sanitized)) {
    sanitized = `db_${sanitized}`;
  }
  return sanitized;
}

/**
 * Creates a ClickHouse database and all required tables for a team
 * @param databaseName The name of the database to create
 * @throws Error if database creation fails
 */
export async function initializeTeamClickHouseDatabase(
  databaseName: string,
): Promise<void> {
  const client = await getClickhouseClient();

  const sanitizedDbName = sanitizeDatabaseName(databaseName);

  logger.info(
    { databaseName, sanitizedDbName },
    'Creating ClickHouse database for team',
  );

  try {
    // Create database
    await client.command({
      query: `CREATE DATABASE IF NOT EXISTS ${sanitizedDbName}`,
      clickhouse_settings: {
        wait_end_of_query: 1,
      },
    });

    logger.debug({ sanitizedDbName }, 'Created database');

    // Create all tables
    for (const [tableName, schema] of Object.entries(TABLE_SCHEMAS)) {
      const query = schema.replace(/{database}/g, sanitizedDbName);

      await client.command({
        query,
        clickhouse_settings: {
          wait_end_of_query: 1,
        },
      });

      logger.debug({ sanitizedDbName, tableName }, 'Created table');
    }

    logger.info(
      { databaseName: sanitizedDbName },
      'Successfully initialized ClickHouse database and tables',
    );
  } catch (error) {
    logger.error(
      { err: error, databaseName, sanitizedDbName },
      'Failed to initialize ClickHouse database for team',
    );
    throw error;
  }
}
