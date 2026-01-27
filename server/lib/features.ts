/**
 * Feature Flag System
 * 
 * Provides runtime feature availability based on database schema presence.
 * Features can be disabled if their required tables are missing.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

export interface FeatureStatus {
  enabled: boolean;
  reason?: string;
  checkedAt: string;
}

export interface FeatureFlags {
  chat: FeatureStatus;
  notifications: FeatureStatus;
  errorLogging: FeatureStatus;
  timeTracking: FeatureStatus;
  clientNotes: FeatureStatus;
  clientDocuments: FeatureStatus;
}

const FEATURE_TABLE_REQUIREMENTS: Record<keyof FeatureFlags, string[]> = {
  chat: ["chat_channels", "chat_messages", "chat_dm_members"],
  notifications: ["notification_preferences", "notifications"],
  errorLogging: ["error_logs"],
  timeTracking: ["time_entries", "active_timers"],
  clientNotes: ["client_notes"],
  clientDocuments: ["client_documents"],
};

let cachedFeatures: FeatureFlags | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 60000;

async function checkTableExists(tableName: string): Promise<boolean> {
  try {
    const result = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = ${tableName}
      ) as exists
    `);
    return (result.rows[0] as any)?.exists === true;
  } catch {
    return false;
  }
}

async function checkFeatureAvailable(featureKey: keyof FeatureFlags): Promise<FeatureStatus> {
  const requiredTables = FEATURE_TABLE_REQUIREMENTS[featureKey];
  const missingTables: string[] = [];

  for (const table of requiredTables) {
    const exists = await checkTableExists(table);
    if (!exists) {
      missingTables.push(table);
    }
  }

  if (missingTables.length === 0) {
    return {
      enabled: true,
      checkedAt: new Date().toISOString(),
    };
  }

  return {
    enabled: false,
    reason: `Missing tables: ${missingTables.join(", ")}`,
    checkedAt: new Date().toISOString(),
  };
}

export async function getFeatureFlags(forceRefresh = false): Promise<FeatureFlags> {
  const now = Date.now();
  
  if (!forceRefresh && cachedFeatures && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedFeatures;
  }

  const [chat, notifications, errorLogging, timeTracking, clientNotes, clientDocuments] = 
    await Promise.all([
      checkFeatureAvailable("chat"),
      checkFeatureAvailable("notifications"),
      checkFeatureAvailable("errorLogging"),
      checkFeatureAvailable("timeTracking"),
      checkFeatureAvailable("clientNotes"),
      checkFeatureAvailable("clientDocuments"),
    ]);

  cachedFeatures = {
    chat,
    notifications,
    errorLogging,
    timeTracking,
    clientNotes,
    clientDocuments,
  };
  cacheTimestamp = now;

  return cachedFeatures;
}

export function getCachedFeatures(): FeatureFlags | null {
  return cachedFeatures;
}

export function isFeatureEnabled(feature: keyof FeatureFlags): boolean {
  if (!cachedFeatures) return true;
  return cachedFeatures[feature]?.enabled ?? true;
}

export function getRecommendations(features: FeatureFlags): string[] {
  const recommendations: string[] = [];

  if (!features.chat.enabled) {
    recommendations.push("Run migrations to enable chat feature: npx drizzle-kit migrate");
  }
  if (!features.notifications.enabled) {
    recommendations.push("Run migrations to enable notifications: npx drizzle-kit migrate");
  }
  if (!features.errorLogging.enabled) {
    recommendations.push("Error logging is disabled - errors will be logged to console only");
  }
  if (!features.timeTracking.enabled) {
    recommendations.push("Run migrations to enable time tracking: npx drizzle-kit migrate");
  }
  if (!features.clientNotes.enabled) {
    recommendations.push("Run migrations to enable client notes: npx drizzle-kit migrate");
  }
  if (!features.clientDocuments.enabled) {
    recommendations.push("Run migrations to enable client documents: npx drizzle-kit migrate");
  }

  return recommendations;
}

export function featureUnavailableResponse(feature: string) {
  return {
    error: `${feature} feature is currently unavailable`,
    reason: "Database tables not initialized",
    contact: "Please contact administrator or run database migrations",
  };
}
