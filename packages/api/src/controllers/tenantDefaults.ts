import {
  MetricsDataType,
  SourceKind,
} from '@hyperdx/common-utils/dist/types';
import mongoose from 'mongoose';

import * as config from '@/config';
import Connection from '@/models/connection';
import { Source } from '@/models/source';
import logger from '@/utils/logger';

import { provisionTenantClickhouse } from './clickhouseTenantProvisioning';

export async function ensureTenantClickhouseConnectionAndSources(
  teamId: string,
) {
  const teamObjectId = new mongoose.Types.ObjectId(teamId);

  // Create or reuse the managed ClickHouse connection for this tenant.
  let connection = await Connection.findOne({
    team: teamObjectId,
    isManaged: true,
  }).select('+password');

  let database: string | null = null;
  if (!connection) {
    const provisioned = await provisionTenantClickhouse(teamId);
    if (!provisioned) {
      logger.info(
        { teamId },
        'No managed tenant ClickHouse connection created (provisioning disabled or failed)',
      );
      return null;
    }

    const { username, password } = provisioned;
    database = provisioned.database;

    connection = await Connection.create({
      team: teamObjectId,
      name: 'Tenant ClickHouse',
      host: config.CLICKHOUSE_QUERY_HOST,
      username,
      password,
      isManaged: true,
    });
  } else {
    // Derive database from any existing source (best-effort).
    const existingSource = await Source.findOne({ team: teamObjectId });
    database = (existingSource as any)?.from?.databaseName ?? null;
  }

  // Create or reuse core sources pointing at the tenant database.
  // Note: the Source mongoose schema is permissive; we set common expressions used by the UI/query builders.
  const existingSources = await Source.find({ team: teamObjectId });
  const byKind = new Map(existingSources.map(s => [s.kind, s]));

  if (!database) {
    // If we have no known DB, we can't safely create sources.
    // This shouldn't happen when provisioning is enabled.
    logger.warn(
      { teamId },
      'No tenant ClickHouse database found; skipping source creation',
    );
    return { connectionId: connection._id.toString(), database: null };
  }

  const makeBase = (params: {
    name: string;
    kind: SourceKind;
    tableName: string;
    timestampValueExpression: string;
    displayedTimestampValueExpression?: string;
  }) => ({
    name: params.name,
    kind: params.kind,
    team: teamObjectId,
    connection: connection!._id,
    from: { databaseName: database, tableName: params.tableName },
    timestampValueExpression: params.timestampValueExpression,
    displayedTimestampValueExpression:
      params.displayedTimestampValueExpression ??
      params.timestampValueExpression,
    serviceNameExpression: 'ServiceName',
    bodyExpression: 'Body',
    // Only set severityTextExpression for logs and sessions, not traces
    // Traces use statusCodeExpression instead
    ...(params.kind !== SourceKind.Trace
      ? { severityTextExpression: 'SeverityText' }
      : {}),
    traceIdExpression: 'TraceId',
    spanIdExpression: 'SpanId',
  });

  let logSource;
  if (!byKind.has(SourceKind.Log)) {
    logSource = await Source.create({
      ...makeBase({
        name: 'Logs',
        kind: SourceKind.Log,
        tableName: 'otel_logs',
        timestampValueExpression: 'TimestampTime',
        displayedTimestampValueExpression: 'Timestamp',
      }),
      defaultTableSelectExpression: 'Timestamp,ServiceName,SeverityText,Body',
      implicitColumnExpression: 'Body',
      eventAttributesExpression: 'LogAttributes',
      resourceAttributesExpression: 'ResourceAttributes',
    } as any);
  } else {
    logSource = byKind.get(SourceKind.Log);
  }

  let traceSource;
  if (!byKind.has(SourceKind.Trace)) {
    traceSource = await Source.create({
      ...makeBase({
        name: 'Traces',
        kind: SourceKind.Trace,
        tableName: 'otel_traces',
        timestampValueExpression: 'Timestamp',
      }),
      defaultTableSelectExpression:
        'Timestamp,ServiceName,StatusCode,round(Duration/1e6),SpanName',
      implicitColumnExpression: 'SpanName',
      bodyExpression: 'SpanName',
      durationExpression: 'Duration',
      durationPrecision: 9,
      parentSpanIdExpression: 'ParentSpanId',
      spanNameExpression: 'SpanName',
      spanKindExpression: 'SpanKind',
      statusCodeExpression: 'StatusCode',
      statusMessageExpression: 'StatusMessage',
      eventAttributesExpression: 'SpanAttributes',
      resourceAttributesExpression: 'ResourceAttributes',
    } as any);
  } else {
    traceSource = byKind.get(SourceKind.Trace);
  }

  let sessionSource;
  if (!byKind.has(SourceKind.Session)) {
    sessionSource = await Source.create({
      ...makeBase({
        name: 'Sessions',
        kind: SourceKind.Session,
        tableName: 'hyperdx_sessions',
        timestampValueExpression: 'TimestampTime',
        displayedTimestampValueExpression: 'Timestamp',
      }),
      defaultTableSelectExpression: 'Timestamp,ServiceName,SeverityText,Body',
      implicitColumnExpression: 'Body',
      eventAttributesExpression: 'LogAttributes',
      resourceAttributesExpression: 'ResourceAttributes',
    } as any);
  } else {
    sessionSource = byKind.get(SourceKind.Session);
  }

  let metricSource;
  if (!byKind.has(SourceKind.Metric)) {
    metricSource = await Source.create({
      name: 'Metrics',
      kind: SourceKind.Metric,
      team: teamObjectId,
      connection: connection!._id,
      from: { databaseName: database, tableName: '' },
      timestampValueExpression: 'TimeUnix',
      resourceAttributesExpression: 'ResourceAttributes',
      metricTables: {
        [MetricsDataType.Gauge]: 'otel_metrics_gauge',
        [MetricsDataType.Histogram]: 'otel_metrics_histogram',
        [MetricsDataType.Sum]: 'otel_metrics_sum',
      },
    } as any);
  } else {
    metricSource = byKind.get(SourceKind.Metric);
  }

  // Set cross-reference IDs to match example.json structure
  if (logSource) {
    const logUpdates: Record<string, string> = {};
    if (traceSource) logUpdates.traceSourceId = traceSource._id.toString();
    if (metricSource) logUpdates.metricSourceId = metricSource._id.toString();
    if (sessionSource) logUpdates.sessionSourceId = sessionSource._id.toString();
    if (Object.keys(logUpdates).length > 0) {
      await Source.updateOne({ _id: logSource._id }, { $set: logUpdates });
    }
  }

  if (traceSource) {
    const traceUpdates: Record<string, string> = {};
    if (logSource) traceUpdates.logSourceId = logSource._id.toString();
    if (metricSource) traceUpdates.metricSourceId = metricSource._id.toString();
    if (sessionSource)
      traceUpdates.sessionSourceId = sessionSource._id.toString();
    if (Object.keys(traceUpdates).length > 0) {
      await Source.updateOne({ _id: traceSource._id }, { $set: traceUpdates });
    }
  }

  if (metricSource) {
    const metricUpdates: Record<string, string> = {};
    if (logSource) metricUpdates.logSourceId = logSource._id.toString();
    if (traceSource) metricUpdates.traceSourceId = traceSource._id.toString();
    if (sessionSource)
      metricUpdates.sessionSourceId = sessionSource._id.toString();
    if (Object.keys(metricUpdates).length > 0) {
      await Source.updateOne({ _id: metricSource._id }, { $set: metricUpdates });
    }
  }

  if (sessionSource) {
    const sessionUpdates: Record<string, string> = {};
    if (logSource) sessionUpdates.logSourceId = logSource._id.toString();
    if (traceSource) sessionUpdates.traceSourceId = traceSource._id.toString();
    if (metricSource)
      sessionUpdates.metricSourceId = metricSource._id.toString();
    if (Object.keys(sessionUpdates).length > 0) {
      await Source.updateOne({ _id: sessionSource._id }, { $set: sessionUpdates });
    }
  }

  logger.info(
    {
      teamId,
      connectionId: connection._id.toString(),
      database,
    },
    'Ensured tenant ClickHouse connection and core sources',
  );

  return { connectionId: connection._id.toString(), database };
}
