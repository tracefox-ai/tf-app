import IngestionToken from '@/models/ingestionToken';
import { hashIngestionToken } from '@/utils/ingestionTokens';

export async function resolveIngestionToken(token: string) {
  const tokenHash = hashIngestionToken(token);
  const doc = await IngestionToken.findOne({ tokenHash, status: 'active' });
  if (!doc) return null;
  return {
    tokenId: doc._id.toString(),
    tokenHash,
    teamId: doc.team.toString(),
    assignedShard: doc.assignedShard,
  };
}

export async function markIngestionTokenUsed(tokenId: string) {
  await IngestionToken.updateOne(
    { _id: tokenId },
    { $set: { lastUsedAt: new Date() } },
  ).catch(() => {});
}
