import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';

// Read .env manually
const rootDir = '/Users/kavin/Documents/BEXO/Bexo-Onboarding-Flow';
const envPath = path.join(rootDir, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx > 0) {
      const key = trimmed.substring(0, idx).trim();
      let val = trimmed.substring(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.substring(1, val.length - 1);
      }
      process.env[key] = val;
    }
  });
}

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME || 'bexo';
const publicUrl = process.env.R2_PUBLIC_URL || 'https://pub-dea3489e0d644467a9a61d41406280f0.r2.dev';

if (!accountId || !accessKeyId || !secretAccessKey) {
  console.error('❌ Cloudflare R2 credentials missing in .env');
  process.exit(1);
}

const s3Client = new S3Client({
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
  region: 'auto',
});

async function uploadVideo() {
  const videoPath = '/Users/kavin/Documents/BEXO/Bexo-Onboarding-Flow/artifacts/bexo-web/public/assets/auth-background.mp4';
  if (!fs.existsSync(videoPath)) {
    console.error('❌ Video file not found at:', videoPath);
    process.exit(1);
  }

  const fileStats = fs.statSync(videoPath);
  console.log(`Uploading auth-background.mp4 (${(fileStats.size / (1024 * 1024)).toFixed(2)} MB) to Cloudflare R2...`);

  const fileBuffer = fs.readFileSync(videoPath);
  const objectKey = 'assets/auth-background.mp4';

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      Body: fileBuffer,
      ContentType: 'video/mp4',
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );

  const finalUrl = `${publicUrl.replace(/\/$/, '')}/${objectKey}`;
  console.log('✓ Successfully uploaded video to Cloudflare R2!');
  console.log('Public CDN URL:', finalUrl);
}

uploadVideo().catch(err => {
  console.error('❌ Upload failed:', err);
  process.exit(1);
});
