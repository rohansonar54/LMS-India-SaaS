import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ICampaignRecipient {
  customerId?: mongoose.Types.ObjectId | null;
  customerName: string;
  contact: string;
  status: 'pending' | 'sent' | 'failed';
  sentAt?: Date;
  error?: string;
}

export interface ICampaign extends Document {
  title: string;
  message: string;
  imageUrl?: string;
  targetLocationId: string; // 'all' or locationId string
  targetLocationName: string;
  batchSize: number;
  delaySeconds: number;
  cooldownMinutes: number;
  status: 'draft' | 'running' | 'cooldown' | 'paused' | 'completed' | 'cancelled';
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  currentIndex: number;
  currentBatch: number;
  totalBatches: number;
  nextBatchAt?: Date | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  recipients: ICampaignRecipient[];
  createdAt: Date;
  updatedAt: Date;
}

const CampaignRecipientSchema = new Schema<ICampaignRecipient>(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: false, default: null },
    customerName: { type: String, required: true },
    contact: { type: String, required: true },
    status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
    sentAt: { type: Date },
    error: { type: String },
  },
  { _id: false }
);

const CampaignSchema = new Schema<ICampaign>(
  {
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true },
    imageUrl: { type: String, default: '' },
    targetLocationId: { type: String, default: 'all' },
    targetLocationName: { type: String, default: 'All Branches' },
    batchSize: { type: Number, default: 100, min: 5, max: 500 },
    delaySeconds: { type: Number, default: 10, min: 5, max: 60 },
    cooldownMinutes: { type: Number, default: 60, min: 1, max: 1440 },
    status: {
      type: String,
      enum: ['draft', 'running', 'cooldown', 'paused', 'completed', 'cancelled'],
      default: 'draft',
      index: true,
    },
    totalRecipients: { type: Number, default: 0 },
    sentCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    currentIndex: { type: Number, default: 0 },
    currentBatch: { type: Number, default: 1 },
    totalBatches: { type: Number, default: 1 },
    nextBatchAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    recipients: [CampaignRecipientSchema],
  },
  { timestamps: true }
);

export const Campaign: Model<ICampaign> =
  mongoose.models.Campaign || mongoose.model<ICampaign>('Campaign', CampaignSchema);
