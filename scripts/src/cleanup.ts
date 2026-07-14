import { db, users, profiles, profileSections, assets, portfolios, activationKeys, subscriptions, payments } from "../../lib/db/src/index";
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";

// Configure R2 Client using the same env loading as db index
const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

async function runCleanup() {
  console.log("=== STARTING DATABASE AND STORAGE CLEANUP ===");

  // 1. Clean Database Tables in correct constraint order
  try {
    console.log("Cleaning database tables...");

    // Delete child rows first
    await db.delete(payments);
    console.log("- Cleared payments table");

    await db.delete(subscriptions);
    console.log("- Cleared subscriptions table");

    await db.delete(activationKeys);
    console.log("- Cleared activation_keys table");

    await db.delete(portfolios);
    console.log("- Cleared portfolios table");

    await db.delete(assets);
    console.log("- Cleared assets table");

    await db.delete(profileSections);
    console.log("- Cleared profile_sections table");

    await db.delete(profiles);
    console.log("- Cleared profiles table");

    await db.delete(users);
    console.log("- Cleared users table");

    console.log("✔ Database tables cleared successfully!");
  } catch (dbErr) {
    console.error("❌ Failed to clear database:", dbErr);
  }

  // 2. Clean R2 Storage Bucket
  const bucketName = process.env.R2_BUCKET_NAME;
  if (!bucketName) {
    console.warn("⚠ R2_BUCKET_NAME not set in env. Skipping bucket cleanup.");
    return;
  }

  try {
    console.log(`Cleaning Cloudflare R2 bucket: "${bucketName}"...`);
    
    // List all objects
    const listCommand = new ListObjectsV2Command({ Bucket: bucketName });
    const listResult = await s3Client.send(listCommand);
    
    if (listResult.Contents && listResult.Contents.length > 0) {
      const keysToDelete = listResult.Contents.map(obj => ({ Key: obj.Key }));
      console.log(`Found ${keysToDelete.length} objects to delete...`);
      
      const deleteCommand = new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: { Objects: keysToDelete }
      });
      
      await s3Client.send(deleteCommand);
      console.log(`✔ Successfully deleted ${keysToDelete.length} objects from R2!`);
    } else {
      console.log("Bucket is already empty. No objects to delete.");
    }
  } catch (r2Err) {
    console.error("❌ Failed to clear R2 storage:", r2Err);
  }

  console.log("=== CLEANUP PROCESS COMPLETED ===");
  process.exit(0);
}

runCleanup().catch(err => {
  console.error("Fatal error during cleanup:", err);
  process.exit(1);
});
