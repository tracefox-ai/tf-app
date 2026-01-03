import mongoose, { Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

type ObjectId = mongoose.Types.ObjectId;

export interface IConnection {
  _id: ObjectId;
  id: string;
  host: string;
  name: string;
  password: string;
  username: string;
  team: ObjectId;
  // SaaS: internal/managed connection (not user-configured)
  isManaged?: boolean;
}

export default mongoose.model<IConnection>(
  'Connection',
  new Schema<IConnection>(
    {
      team: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'Team',
      },
      name: String,
      host: String,
      username: String,
      isManaged: {
        type: Boolean,
        default: false,
      },
      password: {
        type: String,
        select: false,
      },
    },
    {
      timestamps: true,
      toJSON: { virtuals: true },
    },
  ),
);