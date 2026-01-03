import mongoose from 'mongoose';

import TeamMembership, { TeamRole } from '@/models/teamMembership';

export async function ensureTeamMembership(params: {
  userId: string | mongoose.Types.ObjectId;
  teamId: string | mongoose.Types.ObjectId;
  roleIfCreate?: TeamRole;
}) {
  const user = new mongoose.Types.ObjectId(params.userId);
  const team = new mongoose.Types.ObjectId(params.teamId);
  const existing = await TeamMembership.findOne({ user, team });
  if (existing) return existing;

  return TeamMembership.create({
    user,
    team,
    role: params.roleIfCreate ?? 'member',
    status: 'active',
  });
}

export function getUserMemberships(userId: string | mongoose.Types.ObjectId) {
  return TeamMembership.find({
    user: new mongoose.Types.ObjectId(userId),
    status: 'active',
  }).populate('team');
}

export async function userHasMembership(params: {
  userId: string | mongoose.Types.ObjectId;
  teamId: string | mongoose.Types.ObjectId;
}) {
  const user = new mongoose.Types.ObjectId(params.userId);
  const team = new mongoose.Types.ObjectId(params.teamId);
  const membership = await TeamMembership.findOne({
    user,
    team,
    status: 'active',
  });
  return membership != null;
}
