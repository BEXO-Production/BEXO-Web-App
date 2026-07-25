import { db, profiles } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Fetch the user's profile row, creating an empty one on first use.
 * Shared by the profile routes and the background resume parse worker.
 */
export async function getOrCreateProfile(userId: string): Promise<typeof profiles.$inferSelect> {
  let profileList = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  let profile = profileList[0];

  if (!profile) {
    try {
      const inserted = await db.insert(profiles).values({
        userId,
        headline: "",
        careerGoal: "",
        bio: "",
        completionPct: 0,
      }).returning();
      profile = inserted[0];
      logger.info({ userId, profileId: profile.id }, "Created new empty profile");
    } catch (err: any) {
      // Concurrent create — re-read the winner.
      profileList = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
      if (profileList[0]) {
        profile = profileList[0];
      } else {
        throw err;
      }
    }
  }
  return profile;
}
