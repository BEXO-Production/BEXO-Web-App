import jwt from "jsonwebtoken";
import { db, users, profiles } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

export interface SessionResult {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Shared tail of every phone-verification path: given a phone number already
 * confirmed to belong to the requester (by whatever OTP mechanism got us
 * here — the legacy custom-OTP flow, or the MSG91 widget), find-or-create
 * the BEXO user and issue our own session JWT.
 *
 * Split out of the old `/phone/otp/verify` handler so the new
 * `/phone/widget-verify` route reuses the exact same account logic —
 * duplicating this by hand would be exactly the kind of place a subtle
 * divergence (the 409-collision check, the unique-constraint race handling)
 * quietly breaks one path and not the other.
 */
export async function resolveUserSessionForPhone(
  phone: string,
  authHeader: string | undefined,
): Promise<SessionResult> {
  let user = (await db.select().from(users).where(eq(users.phone, phone)).limit(1))[0];
  let isNewUser = false;
  let hasCompletedOnboarding = false;

  // If an already-signed-in user verifies a phone that belongs to a
  // different account, refuse with a clear 409 instead of silently
  // switching sessions or colliding on the unique phone column.
  if (user && authHeader?.startsWith("Bearer ")) {
    try {
      const secretForCheck = process.env.JWT_SECRET;
      if (secretForCheck) {
        const decoded = jwt.verify(authHeader.slice(7), secretForCheck) as { id?: string };
        if (decoded?.id && decoded.id !== user.id) {
          return {
            status: 409,
            body: {
              error:
                "This number is already registered to another BEXO account. Log out and sign in with that number instead.",
              code: "PHONE_TAKEN",
            },
          };
        }
      }
    } catch {
      // Expired/invalid token — treat as a normal unauthenticated sign-in.
    }
  }

  if (!user) {
    isNewUser = true;
    try {
      const inserted = await db
        .insert(users)
        .values({ phone, phoneVerifiedAt: new Date() })
        .returning();
      user = inserted[0];
    } catch (error) {
      // Two verification requests can complete together. In that case, reuse
      // the account created by the other request instead of returning a 500.
      if ((error as { code?: string }).code !== "23505") throw error;
      user = (await db.select().from(users).where(eq(users.phone, phone)).limit(1))[0];
      if (!user) throw error;
      isNewUser = false;
    }
    logger.info({ userId: user.id, phone }, "Created new user on verification");
  } else {
    await db.update(users).set({ phoneVerifiedAt: new Date() }).where(eq(users.id, user.id));

    const userProfile = await db.select().from(profiles).where(eq(profiles.userId, user.id)).limit(1);
    if (userProfile.length > 0 && userProfile[0].handle) {
      hasCompletedOnboarding = true;
    }
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return { status: 500, body: { error: "Server auth is misconfigured." } };
  }
  const accessToken = jwt.sign({ id: user.id }, secret, { expiresIn: "7d" });

  return {
    status: 200,
    body: {
      accessToken,
      isNewUser,
      hasCompletedOnboarding,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        email: user.email,
      },
    },
  };
}
