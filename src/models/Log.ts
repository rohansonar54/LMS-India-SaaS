import mongoose, { Schema, Document, Model } from 'mongoose';
import { Setting } from './Setting';

export interface ILog extends Document {
  username: string;
  type: string;
  logs: string;
  locationId?: mongoose.Types.ObjectId;
  locationName?: string;
  createdAt: Date;
}

// 10 days retention policy in seconds: 10 * 24 * 60 * 60 = 864,000 seconds
export const LOG_RETENTION_DAYS = 10;
export const LOG_RETENTION_SECONDS = LOG_RETENTION_DAYS * 24 * 60 * 60; // 864,000s

const LogSchema = new Schema<ILog>({
  username: { type: String, required: true, default: 'System' },
  type: { type: String, required: true },
  logs: { type: String, required: true },
  locationId: { type: Schema.Types.ObjectId, ref: 'Location', default: null, index: true },
  locationName: { type: String, default: '' },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: LOG_RETENTION_SECONDS, // Native MongoDB TTL index: automatically deletes documents older than 10 days
  },
});

let cachedLoggingEnabled: boolean | null = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 8000; // 8-second memory cache to eliminate database overhead on high-frequency actions

/**
 * Returns whether system audit logging is currently enabled.
 * Defaults to true if no configuration record exists yet.
 */
export async function isLoggingActive(): Promise<boolean> {
  const now = Date.now();
  if (cachedLoggingEnabled !== null && now - lastCacheTime < CACHE_TTL_MS) {
    return cachedLoggingEnabled;
  }
  try {
    const doc = await Setting.findOne({ key: 'activity_logging_enabled' });
    if (!doc) {
      cachedLoggingEnabled = true;
    } else {
      cachedLoggingEnabled = doc.value !== false;
    }
  } catch {
    cachedLoggingEnabled = true;
  }
  lastCacheTime = now;
  return cachedLoggingEnabled;
}

/**
 * Updates the global activity logging state (ON/OFF).
 */
export async function setLoggingActive(enabled: boolean): Promise<boolean> {
  await Setting.findOneAndUpdate(
    { key: 'activity_logging_enabled' },
    { value: enabled, updatedAt: new Date() },
    { upsert: true, new: true }
  );
  cachedLoggingEnabled = enabled;
  lastCacheTime = Date.now();
  return enabled;
}

export const Log: Model<ILog> = mongoose.models.Log || mongoose.model<ILog>('Log', LogSchema);

// Dynamically intercept Log.create so all system activity respects the ON/OFF toggle
const originalCreate = Log.create.bind(Log);
// @ts-expect-error monkey-patching Mongoose create to respect runtime ON/OFF toggle
Log.create = async function (...args: unknown[]) {
  const active = await isLoggingActive();
  if (!active) {
    return null;
  }
  return originalCreate(...args);
};

/**
 * Automatically purges any logs older than 10 days from the database.
 * Returns the count of deleted old log records.
 */
export async function purgeOldLogs(): Promise<number> {
  const cutoffDate = new Date(Date.now() - LOG_RETENTION_SECONDS * 1000);
  const result = await Log.deleteMany({ createdAt: { $lt: cutoffDate } });
  return result.deletedCount || 0;
}
