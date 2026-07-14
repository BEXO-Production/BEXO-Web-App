import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Load .env manually from root to support execution in different directories
try {
  const possiblePaths = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../.env"),
    path.resolve(process.cwd(), "../../.env"),
    path.resolve(process.cwd(), "../../../.env"),
  ];

  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    possiblePaths.push(
      path.resolve(__dirname, "../.env"),
      path.resolve(__dirname, "../../.env"),
      path.resolve(__dirname, "../../../.env")
    );
  } catch (e) {}

  for (const envPath of possiblePaths) {
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
      break;
    }
  }
} catch (err) {
  console.warn("Failed to load .env file:", err);
}

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Surface connection-pool errors immediately (DNS typos, credential issues, etc.)
pool.on("error", (err) => {
  console.error("[DB POOL ERROR] Unexpected error on idle client:", err.message);
});

export const db = drizzle(pool, { schema });

/**
 * Validate database connectivity at startup.  Call this once from your server
 * entry-point so a misconfigured DATABASE_URL fails fast instead of silently
 * returning 500s on every request.
 */
export async function checkDatabaseConnection(): Promise<void> {
  let client;
  try {
    client = await pool.connect();
    await client.query("SELECT 1");
    console.log("[DB] Database connection verified successfully.");
  } catch (err: any) {
    console.error(
      "[DB] *** DATABASE CONNECTION FAILED ***",
      "\n  URL host:",
      process.env.DATABASE_URL?.replace(/\/\/.*@/, "//***@"),
      "\n  Error:",
      err.message,
    );
    throw new Error(`Database connection failed: ${err.message}`);
  } finally {
    client?.release();
  }
}

export * from "./schema";
