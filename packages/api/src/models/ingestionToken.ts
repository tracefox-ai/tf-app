import mongoose, { Schema } from 'mongoose';

type ObjectId = mongoose.Types.ObjectId;

export type IngestionTokenStatus = 'active' | 'revoked';

export interface IIngestionToken {
  _id: ObjectId;
  team: ObjectId;
  tokenHash: string; // sha256 hex
  tokenPrefix: string; // for display/debug (non-secret)
  status: IngestionTokenStatus;
  assignedShard?: string;
  description?: string;
  lastUsedAt?: Date;
  revokedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type IngestionTokenDocument = mongoose.HydratedDocument<IIngestionToken>;

const IngestionTokenSchema = new Schema<IIngestionToken>(
  {
    team: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Team',
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    tokenPrefix: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'revoked'],
      required: true,
      default: 'active',
      index: true,
    },
    assignedShard: {
      type: String,
    },
    description: {
      type: String,
    },
    lastUsedAt: {
      type: Date,
    },
    revokedAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

IngestionTokenSchema.index({ team: 1, status: 1, createdAt: -1 });

export default mongoose.model<IIngestionToken>(
  'IngestionToken',
  IngestionTokenSchema,
);
