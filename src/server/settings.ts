import "server-only";
import { db } from "@/server/db";

/** Platform-wide settings (single row, created with defaults if missing). */
export async function getPlatformSettings() {
  return db.platformSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}
