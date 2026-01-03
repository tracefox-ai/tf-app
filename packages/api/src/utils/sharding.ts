import crypto from 'crypto';

import IngestionToken from '@/models/ingestionToken';
import logger from '@/utils/logger';

/**
 * Assigns a shard to a team using consistent hashing.
 * This is used for backward compatibility or when you want deterministic shard assignment.
 */
export function shardIdForTeam(teamId: string, shardCount: number) {
  const hash = crypto.createHash('sha256').update(teamId).digest();
  // Use first 4 bytes as uint32
  const n =
    (hash[0]! << 24) | (hash[1]! << 16) | (hash[2]! << 8) | (hash[3]! << 0);
  // Ensure non-negative
  const idx = (n >>> 0) % shardCount;
  return `shard-${idx}`;
}

/**
 * Finds the next available shard that has no active teams assigned.
 * This ensures 1 tenant per shard for isolation.
 * 
 * @param shardCount Total number of shards available
 * @param excludeTeamId Optional team ID to exclude from the check (useful when reassigning)
 * @returns The shard ID (e.g., 'shard-0') or null if all shards are full
 */
export async function findNextAvailableShard(
  shardCount: number,
  excludeTeamId?: string,
): Promise<string | null> {
  // Get all active tokens grouped by shard
  const activeTokens = await IngestionToken.find({
    status: 'active',
    ...(excludeTeamId
      ? { team: { $ne: excludeTeamId } }
      : {}),
  }).select('assignedShard team');

  // Count teams per shard (using Set to get unique teams per shard)
  const teamsPerShard = new Map<string, Set<string>>();
  for (const token of activeTokens) {
    if (!token.assignedShard) continue;
    const teamId = token.team.toString();
    if (!teamsPerShard.has(token.assignedShard)) {
      teamsPerShard.set(token.assignedShard, new Set());
    }
    teamsPerShard.get(token.assignedShard)!.add(teamId);
  }

  // Find the first shard with 0 teams
  for (let i = 0; i < shardCount; i++) {
    const shardId = `shard-${i}`;
    const teamsInShard = teamsPerShard.get(shardId);
    if (!teamsInShard || teamsInShard.size === 0) {
      logger.debug(
        { shardId, shardCount, availableShards: shardCount - teamsPerShard.size },
        'Found available shard',
      );
      return shardId;
    }
  }

  logger.warn(
    {
      shardCount,
      allShardsFull: true,
    },
    'All shards are full. Cannot assign new team.',
  );

  return null;
}
