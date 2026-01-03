import mongoose, { Schema } from 'mongoose';

type ObjectId = mongoose.Types.ObjectId;

export type TeamRole = 'owner' | 'admin' | 'member';
export type TeamMembershipStatus = 'active' | 'invited' | 'disabled';

export interface ITeamMembership {
  _id: ObjectId;
  team: ObjectId;
  user: ObjectId;
  role: TeamRole;
  status: TeamMembershipStatus;
}

export type TeamMembershipDocument = mongoose.HydratedDocument<ITeamMembership>;

const TeamMembershipSchema = new Schema<ITeamMembership>(
  {
    team: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Team',
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'member'],
      required: true,
      default: 'member',
    },
    status: {
      type: String,
      enum: ['active', 'invited', 'disabled'],
      required: true,
      default: 'active',
    },
  },
  { timestamps: true },
);

TeamMembershipSchema.index({ team: 1, user: 1 }, { unique: true });

export default mongoose.model<ITeamMembership>(
  'TeamMembership',
  TeamMembershipSchema,
);
