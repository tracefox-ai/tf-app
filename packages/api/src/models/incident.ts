import mongoose, { Schema } from 'mongoose';

import type { ObjectId } from '.';
import Team from './team';

export enum IncidentStatus {
  OPEN = 'Open',
  INVESTIGATING = 'Investigating',
  IDENTIFIED = 'Identified',
  MONITORING = 'Monitoring',
  RESOLVED = 'Resolved',
}

export enum IncidentSeverity {
  CRITICAL = 'Critical',
  HIGH = 'High',
  MEDIUM = 'Medium',
  LOW = 'Low',
}

export enum TimelineEventType {
  STATUS_CHANGE = 'status_change',
  COMMENT = 'comment',
  ALERT = 'alert',
  DEPLOYMENT = 'deployment',
}

export interface ITimelineEvent {
  type: TimelineEventType;
  message: string;
  timestamp: Date;
  actor: ObjectId;
  metadata?: Record<string, any>;
}

export interface IIncident {
  title: string;
  description?: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  owner?: ObjectId;
  team: ObjectId;
  alerts: ObjectId[];
  startedAt: Date;
  resolvedAt?: Date;
  timeline: ITimelineEvent[];
  analysis?: string; // Markdown content from AI
  logData?: Array<Record<string, any>>; // Stored logs/traces from alerts for AI analysis
  logDataDateRange?: { startTime: Date; endTime: Date }; // Date range of the stored log data
}

export type IncidentDocument = mongoose.HydratedDocument<IIncident>;

const TimelineEventSchema = new Schema<ITimelineEvent>(
  {
    type: {
      type: String,
      enum: Object.values(TimelineEventType),
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      required: false,
    },
  },
  {
    _id: false,
  },
);

const IncidentSchema = new Schema<IIncident>(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: false,
    },
    status: {
      type: String,
      enum: Object.values(IncidentStatus),
      default: IncidentStatus.OPEN,
      required: true,
    },
    severity: {
      type: String,
      enum: Object.values(IncidentSeverity),
      required: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: Team.modelName,
      required: true,
    },
    alerts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Alert',
      },
    ],
    startedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    resolvedAt: {
      type: Date,
      required: false,
    },
    timeline: {
      type: [TimelineEventSchema],
      default: [],
    },
    analysis: {
      type: String,
      required: false,
    },
    logData: {
      type: [Schema.Types.Mixed],
      required: false,
    },
    logDataDateRange: {
      type: {
        startTime: {
          type: Date,
          required: true,
        },
        endTime: {
          type: Date,
          required: true,
        },
      },
      required: false,
      _id: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  },
);

// Index for efficient queries
IncidentSchema.index({ team: 1, status: 1 });
IncidentSchema.index({ team: 1, severity: 1 });
IncidentSchema.index({ team: 1, startedAt: -1 });

export default mongoose.model<IIncident>('Incident', IncidentSchema);
