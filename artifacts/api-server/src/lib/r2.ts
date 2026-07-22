import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { logger } from "./logger";

let s3Client: S3Client | null = null;

export function getR2Client() {
  if (s3Client) return s3Client;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  // If placeholders are present, treat as not configured
  if (
    !accountId || 
    !accessKeyId || 
    !secretAccessKey || 
    accountId.includes("your_") || 
    accessKeyId.includes("your_") || 
    secretAccessKey.includes("your_")
  ) {
    logger.warn("R2 credentials missing or placeholders not replaced, uploads will be simulated locally");
    return null;
  }

  s3Client = new S3Client({
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    region: "auto",
  });

  return s3Client;
}

export async function uploadToR2(
  fileBuffer: Buffer,
  fileName: string,
  contentType: string,
  options: { key?: string } = {}
): Promise<string> {
  const client = getR2Client();

  // Stable keys (e.g. generated resumes) are overwritten in place so shared
  // links never go stale; everything else gets a unique collision-safe key.
  const objectKey =
    options.key ||
    `${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${fileName.replace(/\s+/g, "_")}`;

  // If R2 is not fully configured, fallback to generating a dummy local/mock URL
  // so the app still functions normally for testing before credentials are added!
  if (!client) {
    logger.warn("Cloudflare R2 not configured. Simulating successful upload.");
    return `https://simulation.r2.dev/${objectKey}`;
  }

  const bucketName = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;

  if (!bucketName || !publicUrl) {
    throw new Error("R2 BUCKET_NAME or PUBLIC_URL is missing in environment variables");
  }

  await client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      Body: fileBuffer,
      ContentType: contentType,
    })
  );

  return `${publicUrl.replace(/\/$/, "")}/${objectKey}`;
}

/**
 * Delete an object previously uploaded via uploadToR2, given its public URL.
 * Never throws — cleanup is best-effort and must not break user flows.
 */
export async function deleteFromR2(fileUrl: string | null | undefined): Promise<boolean> {
  if (!fileUrl) return false;

  const client = getR2Client();
  const bucketName = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;

  if (!client || !bucketName || !publicUrl) {
    logger.warn({ fileUrl }, "R2 not configured — skipping object delete");
    return false;
  }

  const base = publicUrl.replace(/\/$/, "") + "/";
  if (!fileUrl.startsWith(base)) {
    // Not one of ours (simulation URL or external) — nothing to delete
    return false;
  }

  const key = decodeURIComponent(fileUrl.slice(base.length).split("?")[0]);
  if (!key) return false;

  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }));
    return true;
  } catch (err) {
    logger.warn({ err, key }, "Failed to delete R2 object");
    return false;
  }
}
