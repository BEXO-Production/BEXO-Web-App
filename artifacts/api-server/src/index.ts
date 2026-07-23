import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Load .env manually from root to support execution in this directory
try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const envPath = path.resolve(__dirname, "../../../.env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    envContent.split("\n").forEach((line) => {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith("#")) return;
      const index = trimmedLine.indexOf("=");
      if (index > 0) {
        const key = trimmedLine.substring(0, index).trim();
        let value = trimmedLine.substring(index + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.substring(1, value.length - 1);
        }
        process.env[key] = value;
      }
    });
  }
} catch (err) {
  console.warn("Failed to load .env file:", err);
}

import app from "./app";
import { logger } from "./lib/logger";
import { checkDatabaseConnection } from "@workspace/db";
import { verifyMailer } from "./lib/mailer";
import { startEmailOutboxWorker, processEmailOutbox } from "./lib/emailOutbox";
import { scheduleLifecycleEmails } from "./lib/lifecycleEmails";
import { runDailyBillingAndAnalyticsJob } from "./lib/dailyJobs";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Validate database connectivity before accepting traffic.  A misconfigured
// DATABASE_URL (e.g. DNS typo) will crash the process immediately with a
// clear error instead of silently returning 500s on every request.
try {
  await checkDatabaseConnection();
} catch (err) {
  logger.fatal({ err }, "Cannot start server – database connection failed");
  process.exit(1);
}

if (!process.env.JWT_SECRET || process.env.JWT_SECRET === "super_secret_jwt_key") {
  if (process.env.NODE_ENV === "production") {
    logger.fatal("JWT_SECRET must be set to a strong value in production");
    process.exit(1);
  }
  logger.warn("JWT_SECRET is missing or using the insecure default. Set JWT_SECRET before production.");
}

if (!process.env.REDIS_URL) {
  // Multi-instance OTP limits need Redis in true production. ALLOW_INMEMORY_OTP=1 is a
  // single-instance emergency escape hatch only.
  const allowInMemoryOtp =
    process.env.ALLOW_INMEMORY_OTP === "1" || process.env.ALLOW_INMEMORY_OTP === "true";
  const requireRedis =
    process.env.REQUIRE_REDIS === "1" ||
    process.env.REQUIRE_REDIS === "true" ||
    (process.env.NODE_ENV === "production" && !allowInMemoryOtp);
  if (requireRedis) {
    logger.fatal("REDIS_URL is required in production for OTP rate limits across Cloud Run instances");
    process.exit(1);
  }
  logger.warn("REDIS_URL is not set — OTP limits are in-memory only (unsafe for multi-instance).");
}

await verifyMailer().catch(() => false);
startEmailOutboxWorker();
setInterval(() => {
  scheduleLifecycleEmails().catch((err) => logger.error({ err }, "Lifecycle email scheduler failed"));
}, 60 * 60 * 1000);
scheduleLifecycleEmails().catch(() => undefined);
processEmailOutbox().catch(() => undefined);

// Daily billing/dunning/analytics — always pass Razorpay hooks so mandate TTL
// refunds/cancels are real. Set DISABLE_INPROCESS_DAILY_JOB=1 when Cloud Scheduler
// hits POST /api/payments/jobs/daily to avoid multi-instance duplicate sweeps.
const DAY_MS = 24 * 60 * 60 * 1000;
const buildDailyHooks = async () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const razorpay =
    keyId && keySecret && !keyId.includes("your_")
      ? new (await import("razorpay")).default({ key_id: keyId, key_secret: keySecret })
      : null;
  return {
    cancelSubscription: async (subscriptionId: string) => {
      if (!razorpay || subscriptionId.startsWith("mock_")) return;
      await razorpay.subscriptions.cancel(subscriptionId, false);
    },
    refundPayment: async (paymentId: string, amountPaise: number) => {
      if (!razorpay || paymentId.startsWith("mock_")) return null;
      const refund: any = await razorpay.payments.refund(paymentId, {
        amount: amountPaise,
        notes: { reason: "awaiting_mandate_ttl" },
      } as any);
      return refund?.id ? { id: refund.id as string } : null;
    },
  };
};

const runDaily = () =>
  buildDailyHooks()
    .then((hooks) => runDailyBillingAndAnalyticsJob(hooks))
    .catch((err) => logger.error({ err }, "In-process daily billing job failed"));

if (process.env.DISABLE_INPROCESS_DAILY_JOB === "1" || process.env.DISABLE_INPROCESS_DAILY_JOB === "true") {
  logger.info("DISABLE_INPROCESS_DAILY_JOB set — use POST /api/payments/jobs/daily via external cron");
} else {
  void runDaily();
  setInterval(runDaily, DAY_MS);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception");
  process.exit(1);
});
