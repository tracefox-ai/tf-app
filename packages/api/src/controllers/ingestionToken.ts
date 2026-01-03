import mongoose from 'mongoose';

import * as config from '@/config';
import IngestionToken from '@/models/ingestionToken';
import logger from '@/utils/logger';
import {
  generateIngestionToken,
  hashIngestionToken,
  tokenPrefix,
} from '@/utils/ingestionTokens';
import { findNextAvailableShard } from '@/utils/sharding';

export async function createIngestionToken(params: {
  teamId: string | mongoose.Types.ObjectId;
  description?: string;
  assignedShard?: string;
}) {
  const token = generateIngestionToken();
  const tokenHash = hashIngestionToken(token);
  const teamIdStr =
    typeof params.teamId === 'string'
      ? params.teamId
      : params.teamId.toString();
  
  // If shard is explicitly provided, use it.
  // Otherwise, check if the team already has tokens and reuse that shard.
  // If the team has no tokens, find the next available shard to ensure 1 tenant per shard.
  let assignedShard = params.assignedShard;
  if (!assignedShard) {
    // Check if team already has active tokens (should use same shard)
    const existingToken = await IngestionToken.findOne({
      team: new mongoose.Types.ObjectId(params.teamId),
      status: 'active',
    }).select('assignedShard');

    if (existingToken?.assignedShard) {
      assignedShard = existingToken.assignedShard;
      logger.debug(
        { teamId: teamIdStr, assignedShard },
        'Reusing existing shard for team',
      );
    } else {
      // New team - find next available shard
      const nextShard = await findNextAvailableShard(config.INGESTION_SHARD_COUNT);
      assignedShard = nextShard ?? undefined;
      if (!assignedShard) {
        logger.error(
          { teamId: teamIdStr },
          'No available shards found.',
        );
        throw new Error('No available ingestion shards found for new team.');
      }
      logger.info(
        { teamId: teamIdStr, assignedShard },
        'Assigned new team to available shard',
      );
    }
  }

  const doc = await IngestionToken.create({
    team: new mongoose.Types.ObjectId(params.teamId),
    tokenHash,
    tokenPrefix: tokenPrefix(token),
    status: 'active',
    description: params.description,
    assignedShard,
  });

  return { token, tokenRecord: doc };
}

export function listIngestionTokens(teamId: string | mongoose.Types.ObjectId) {
  return IngestionToken.find({
    team: new mongoose.Types.ObjectId(teamId),
  }).sort({ createdAt: -1 });
}

export async function revokeIngestionToken(params: {
  teamId: string | mongoose.Types.ObjectId;
  tokenId: string | mongoose.Types.ObjectId;
}) {
  return IngestionToken.findOneAndUpdate(
    {
      _id: new mongoose.Types.ObjectId(params.tokenId),
      team: new mongoose.Types.ObjectId(params.teamId),
    },
    {
      status: 'revoked',
      revokedAt: new Date(),
    },
    { new: true },
  );
}

export async function rotateIngestionToken(params: {
  teamId: string | mongoose.Types.ObjectId;
  tokenId: string | mongoose.Types.ObjectId;
}) {
  await revokeIngestionToken(params);
  return createIngestionToken({ teamId: params.teamId });
}

export async function assignIngestionTokenShard(params: {
  teamId: string | mongoose.Types.ObjectId;
  tokenId: string | mongoose.Types.ObjectId;
  assignedShard: string;
}) {
  const teamIdStr =
    typeof params.teamId === 'string'
      ? params.teamId
      : params.teamId.toString();

  // Check if the target shard already has another team assigned
  const tokensInShard = await IngestionToken.find({
    assignedShard: params.assignedShard,
    status: 'active',
  }).select('team');

  const teamsInShard = new Set(
    tokensInShard.map(t => t.team.toString()),
  );
  teamsInShard.delete(teamIdStr); // Remove current team from check

  if (teamsInShard.size > 0) {
    logger.warn(
      {
        teamId: teamIdStr,
        assignedShard: params.assignedShard,
        existingTeams: Array.from(teamsInShard),
      },
      'Warning: Assigning team to shard that already has other teams. This violates 1 tenant per shard rule.',
    );
  }

  return IngestionToken.findOneAndUpdate(
    {
      _id: new mongoose.Types.ObjectId(params.tokenId),
      team: new mongoose.Types.ObjectId(params.teamId),
      status: 'active',
    },
    { assignedShard: params.assignedShard },
    { new: true },
  );
}
