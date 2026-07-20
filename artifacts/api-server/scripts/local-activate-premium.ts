/**
 * Local-only helper: activate Pro for a handle and set a premium template.
 * Usage: pnpm exec tsx scripts/local-activate-premium.ts kavin nico-palmer
 */
import { db, profiles, users, subscriptions } from "@workspace/db";
import { eq, or } from "drizzle-orm";

const PREMIUM = new Set(["cura-futuri", "sierra-montana", "nico-palmer"]);

async function main() {
  const handle = (process.argv[2] || "kavin").toLowerCase();
  const templateId = (process.argv[3] || "nico-palmer").toLowerCase();

  if (!PREMIUM.has(templateId) && templateId !== "minimal") {
    console.error(`Unknown template "${templateId}". Use: minimal | ${[...PREMIUM].join(" | ")}`);
    process.exit(1);
  }

  const [profile] = await db
    .select()
    .from(profiles)
    .where(or(eq(profiles.handle, handle), eq(profiles.subdomain, handle)))
    .limit(1);

  if (!profile) {
    console.error(`No profile for handle "${handle}"`);
    process.exit(1);
  }

  await db
    .update(users)
    .set({
      templateId,
      storageQuotaBytes: 100 * 1024 * 1024,
      storageBonusBytes: 0,
    })
    .where(eq(users.id, profile.userId));

  await db
    .update(profiles)
    .set({
      templateId,
      isPremium: templateId !== "minimal",
      subdomain: handle,
    })
    .where(eq(profiles.id, profile.id));

  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, profile.userId))
    .limit(1);

  if (templateId === "minimal") {
    if (existing) {
      await db
        .update(subscriptions)
        .set({ status: "expired", plan: "annual" })
        .where(eq(subscriptions.userId, profile.userId));
    }
    console.log(`OK ${handle} → free / minimal`);
    return;
  }

  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  if (existing) {
    await db
      .update(subscriptions)
      .set({ plan: "annual", status: "active", expiresAt })
      .where(eq(subscriptions.userId, profile.userId));
  } else {
    await db.insert(subscriptions).values({
      userId: profile.userId,
      plan: "annual",
      status: "active",
      expiresAt,
    });
  }

  console.log(`OK ${handle} → Pro / ${templateId}`);
  console.log(`  Live:  http://${handle}.localhost:5001/`);
  console.log(`  Web:   http://localhost:5173/dashboard`);
  console.log(`  Render http://127.0.0.1:5001/api/render/${handle}/${templateId}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
