import { serializeError } from 'serialize-error';

import * as config from '@/config';
import { connectDB } from '@/models';
import logger from '@/utils/logger';

import { startOtlpGateway } from './server';

process.on('uncaughtException', (err: Error) => {
  logger.error(
    { err: serializeError(err) },
    'Uncaught exception (otel gateway)',
  );
  if (config.IS_DEV) {
    process.exit(1);
  }
});

process.on('unhandledRejection', (err: any) => {
  logger.error(
    { err: serializeError(err) },
    'Unhandled rejection (otel gateway)',
  );
});

async function main() {
  await connectDB();
  await startOtlpGateway();
}

main().catch(e =>
  logger.error({ err: serializeError(e) }, 'OTLP gateway start failed'),
);
