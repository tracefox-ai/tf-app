import { Request, Response } from 'express';

import * as config from '@/config';
import Connection from '@/models/connection';
import IngestionToken from '@/models/ingestionToken';
import logger from '@/utils/logger';

import { agentService } from '../services/agentService';
import {
  createRemoteConfig,
  decodeAgentToServer,
  encodeServerToAgent,
  serverCapabilities,
} from '../utils/protobuf';

type CollectorConfig = {
  extensions: Record<string, any>;
  receivers: {
    'otlp/hyperdx'?: {
      protocols: {
        grpc: {
          endpoint: string;
          include_metadata: boolean;
          auth?: {
            authenticator: string;
          };
        };
        http: {
          endpoint: string;
          cors: {
            allowed_origins: string[];
            allowed_headers: string[];
          };
          include_metadata: boolean;
          auth?: {
            authenticator: string;
          };
        };
      };
    };
    prometheus?: {
      config: {
        scrape_configs: Array<{
          job_name: string;
          scrape_interval: string;
          static_configs: Array<{
            targets: string[];
          }>;
        }>;
      };
    };
    fluentforward?: {
      endpoint: string;
    };
    nop?: null;
    'routing/logs'?: string[];
  };
  connectors?: {
    'routing/logs'?: {
      default_pipelines: string[];
      error_mode: string;
      table: Array<{
        context: string;
        statement: string;
        pipelines: string[];
      }>;
    };
  };
  exporters?: {
    nop?: null;
    debug?: {
      verbosity: string;
      sampling_initial: number;
      sampling_thereafter: number;
    };
    'clickhouse/rrweb'?: {
      endpoint: string;
      database: string;
      username: string;
      password: string;
      ttl: string;
      logs_table_name: string;
      timeout: string;
      retry_on_failure: {
        enabled: boolean;
        initial_interval: string;
        max_interval: string;
        max_elapsed_time: string;
      };
    };
    clickhouse?: {
      endpoint: string;
      database: string;
      username: string;
      password: string;
      ttl: string;
      timeout: string;
      retry_on_failure: {
        enabled: boolean;
        initial_interval: string;
        max_interval: string;
        max_elapsed_time: string;
      };
    };
  };
  service: {
    extensions: string[];
    pipelines: {
      [key: string]: {
        receivers: string[];
        processors?: string[];
        exporters: string[];
      };
    };
  };
};

function getStringAttr(
  attrs: Array<{ key: string; value: any }> | undefined,
  key: string,
): string | null {
  const attr = attrs?.find(a => a.key === key);
  const v = attr?.value;
  return v?.stringValue ?? null;
}

async function buildShardCollectorConfig(
  shardId: string,
): Promise<CollectorConfig> {
  // Find teams assigned to this shard via active ingestion tokens.
  const tokens = await IngestionToken.find({
    status: 'active',
    assignedShard: shardId,
  });
  const teamIds = Array.from(new Set(tokens.map(t => t.team.toString()))).sort();

  // Simplified: 1 shard = 1 tenant. Take the first teamId if multiple exist.
  // This eliminates the need for complex filtering and prevents data leakage.
  const teamId = teamIds[0];

  // If no teams assigned to this shard, return nop config to keep collector alive.
  if (!teamId) {
    return {
      extensions: {
        health_check: { endpoint: ':13133' },
      },
      receivers: {
        nop: null,
        'otlp/hyperdx': {
          protocols: {
            grpc: { endpoint: '0.0.0.0:4317', include_metadata: true },
            http: {
              endpoint: '0.0.0.0:4318',
              include_metadata: true,
              cors: { allowed_origins: ['*'], allowed_headers: ['*'] },
            },
          },
        },
      },
      connectors: {},
      exporters: {
        nop: null,
      },
      service: {
        extensions: ['health_check'],
        pipelines: {
          'logs/nop': {
            receivers: ['otlp/hyperdx'],
            processors: ['batch'],
            exporters: ['nop'],
          },
          'traces/nop': {
            receivers: ['otlp/hyperdx'],
            processors: ['batch'],
            exporters: ['nop'],
          },
          'metrics/nop': {
            receivers: ['otlp/hyperdx'],
            processors: ['batch'],
            exporters: ['nop'],
          },
        },
      },
    };
  }

  // Warn if multiple teams are assigned to the same shard (shouldn't happen with 1:1 mapping).
  if (teamIds.length > 1) {
    logger.warn(
      {
        shardId,
        teamIds,
        selectedTeamId: teamId,
      },
      'Multiple teams assigned to same shard. Using first team only. Consider reassigning teams to separate shards.',
    );
  }

  const teamUser = `tenant_${teamId}`;
  const database = `tenant_${teamId}`;

  const conn = await Connection.findOne({
    team: teamId,
    isManaged: true,
  }).select('+password');

  if (!conn?.password) {
    logger.error(
      { shardId, teamId },
      'No managed connection found for team. Returning nop config.',
    );
    return {
      extensions: {
        health_check: { endpoint: ':13133' },
      },
      receivers: {
        nop: null,
        'otlp/hyperdx': {
          protocols: {
            grpc: { endpoint: '0.0.0.0:4317', include_metadata: true },
            http: {
              endpoint: '0.0.0.0:4318',
              include_metadata: true,
              cors: { allowed_origins: ['*'], allowed_headers: ['*'] },
            },
          },
        },
      },
      connectors: {},
      exporters: {
        nop: null,
      },
      service: {
        extensions: ['health_check'],
        pipelines: {
          'logs/nop': {
            receivers: ['otlp/hyperdx'],
            processors: ['batch'],
            exporters: ['nop'],
          },
          'traces/nop': {
            receivers: ['otlp/hyperdx'],
            processors: ['batch'],
            exporters: ['nop'],
          },
          'metrics/nop': {
            receivers: ['otlp/hyperdx'],
            processors: ['batch'],
            exporters: ['nop'],
          },
        },
      },
    };
  }

  // Simplified config: no filtering needed since 1 shard = 1 tenant.
  // All data received by this shard goes to the single tenant's database.
  const otelCollectorConfig: CollectorConfig = {
    extensions: {
      health_check: { endpoint: ':13133' },
    },
    receivers: {
      nop: null,
      'otlp/hyperdx': {
        protocols: {
          grpc: { endpoint: '0.0.0.0:4317', include_metadata: true },
          http: {
            endpoint: '0.0.0.0:4318',
            include_metadata: true,
            cors: { allowed_origins: ['*'], allowed_headers: ['*'] },
          },
        },
      },
    },
    connectors: {},
    exporters: {
      nop: null,
      clickhouse: {
        endpoint: '${env:CLICKHOUSE_ENDPOINT}',
        database,
        username: teamUser,
        password: conn.password,
        ttl: '720h',
        timeout: '5s',
        retry_on_failure: {
          enabled: true,
          initial_interval: '5s',
          max_interval: '30s',
          max_elapsed_time: '300s',
        },
      },
    },
    service: {
      extensions: ['health_check'],
      pipelines: {
        logs: {
          receivers: ['otlp/hyperdx'],
          processors: ['memory_limiter', 'batch'],
          exporters: ['clickhouse'],
        },
        traces: {
          receivers: ['otlp/hyperdx'],
          processors: ['memory_limiter', 'batch'],
          exporters: ['clickhouse'],
        },
        metrics: {
          receivers: ['otlp/hyperdx'],
          processors: ['memory_limiter', 'batch'],
          exporters: ['clickhouse'],
        },
      },
    },
  };

  return otelCollectorConfig;
}

export class OpampController {
  /**
   * Handle an OpAMP message from an agent
   */
  public async handleOpampMessage(req: Request, res: Response): Promise<void> {
    try {
      // Check content type
      const contentType = req.get('Content-Type');
      if (contentType !== 'application/x-protobuf') {
        res
          .status(415)
          .send(
            'Unsupported Media Type: Content-Type must be application/x-protobuf',
          );
        return;
      }

      // Decode the AgentToServer message
      const agentToServer = decodeAgentToServer(req.body);
      logger.debug({ agentToServer }, 'agentToServer');
      logger.debug(
        // @ts-ignore
        `Received message from agent: ${agentToServer.instanceUid?.toString(
          'hex',
        )}`,
      );

      // Process the agent status
      const agent = agentService.processAgentStatus(agentToServer);

      // Prepare the response
      const serverToAgent: any = {
        instanceUid: agent.instanceUid,
        capabilities: serverCapabilities,
      };

      // Check if we should send a remote configuration
      if (agentService.agentAcceptsRemoteConfig(agent)) {
        const shardId = getStringAttr(
          agent.agentDescription?.identifyingAttributes as any,
          'hdx.shard_id',
        );
        
        logger.info(
          {
            instanceUid: agent.instanceUid.toString('hex'),
            identifyingAttributes: agent.agentDescription?.identifyingAttributes,
            detectedShardId: shardId,
          },
          'Determining shard ID for agent',
        );

        if (!shardId) {
          logger.error(
            {
              instanceUid: agent.instanceUid.toString('hex'),
              identifyingAttributes: agent.agentDescription?.identifyingAttributes,
            },
            'hdx.shard_id attribute is missing from agent identifying attributes',
          );
          throw new Error('OTEL_RESOURCE_ATTRIBUTES hdx.shard_id is not set');
        }

        const finalShardId = shardId;

        const otelCollectorConfig = await buildShardCollectorConfig(finalShardId);

        if (config.IS_DEV) {
          logger.debug(JSON.stringify(otelCollectorConfig, null, 2));
        }

        const remoteConfig = createRemoteConfig(
          new Map([
            ['config.json', Buffer.from(JSON.stringify(otelCollectorConfig))],
          ]),
          'application/json',
        );

        serverToAgent.remoteConfig = remoteConfig;
        logger.debug(
          `Sending remote config to agent: ${agent.instanceUid.toString(
            'hex',
          )}`,
        );
      }

      // Encode and send the response
      const encodedResponse = encodeServerToAgent(serverToAgent);

      res.setHeader('Content-Type', 'application/x-protobuf');
      res.send(encodedResponse);
    } catch (error) {
      logger.error({ err: error }, 'Error handling OpAMP message');
      res.status(500).send('Internal Server Error');
    }
  }
}

// Create a singleton instance
export const opampController = new OpampController();
