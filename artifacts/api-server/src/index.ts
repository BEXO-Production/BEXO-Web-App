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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
