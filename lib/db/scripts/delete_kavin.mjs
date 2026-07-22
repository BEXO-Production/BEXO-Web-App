import pg from '../node_modules/pg/lib/index.js';
import fs from 'fs';
import path from 'path';

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

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();

  console.log('Searching for user "Kavin"...');
  const searchRes = await client.query(`
    SELECT u.id, u.name, u.email, u.phone, p.handle
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.id
    WHERE lower(u.name) LIKE '%kavin%'
       OR lower(u.email) LIKE '%kavin%'
       OR lower(coalesce(p.handle, '')) LIKE '%kavin%';
  `);

  if (searchRes.rows.length === 0) {
    console.log('No user matching "Kavin" found in database.');
    await client.end();
    return;
  }

  console.log(`Found ${searchRes.rows.length} matching user(s):`);
  searchRes.rows.forEach(r => {
    console.log(` - ID: ${r.id} | Name: ${r.name} | Email: ${r.email} | Phone: ${r.phone} | Handle: ${r.handle}`);
  });

  for (const user of searchRes.rows) {
    const userId = user.id;
    console.log(`\nDeleting user ${userId} (${user.name || user.phone || user.email})...`);

    // Get profiles for this user
    const profRes = await client.query(`SELECT id FROM profiles WHERE user_id = $1`, [userId]);
    const profileIds = profRes.rows.map(p => p.id);

    if (profileIds.length > 0) {
      // Delete profile sections
      await client.query(`DELETE FROM profile_sections WHERE profile_id = ANY($1::uuid[])`, [profileIds]);
      // Delete contact submissions referencing profile
      await client.query(`DELETE FROM contact_submissions WHERE profile_id = ANY($1::uuid[])`, [profileIds]);
    }

    // Delete contact submissions by user_id
    await client.query(`DELETE FROM contact_submissions WHERE user_id = $1`, [userId]);

    // Delete email deliveries
    await client.query(`DELETE FROM email_deliveries WHERE user_id = $1`, [userId]);

    // Delete resume parse attempts
    await client.query(`DELETE FROM resume_parse_attempts WHERE user_id = $1`, [userId]);

    // Delete assets
    await client.query(`DELETE FROM assets WHERE user_id = $1`, [userId]);

    // Delete portfolios
    await client.query(`DELETE FROM portfolios WHERE user_id = $1`, [userId]);

    // Delete payments
    await client.query(`DELETE FROM payments WHERE user_id = $1`, [userId]);

    // Delete subscriptions
    await client.query(`DELETE FROM subscriptions WHERE user_id = $1`, [userId]);

    // Delete addon subscriptions
    await client.query(`DELETE FROM addon_subscriptions WHERE user_id = $1`, [userId]);

    // Unset activation keys redeemed by this user
    await client.query(`UPDATE activation_keys SET status = 'unused', redeemed_by = NULL, redeemed_at = NULL WHERE redeemed_by = $1`, [userId]);

    // Delete profiles
    await client.query(`DELETE FROM profiles WHERE user_id = $1`, [userId]);

    // Unset profile_photo_asset_id if needed
    await client.query(`UPDATE users SET profile_photo_asset_id = NULL WHERE id = $1`, [userId]);

    // Delete user
    await client.query(`DELETE FROM users WHERE id = $1`, [userId]);

    console.log(`✓ User ${userId} and all related records deleted successfully!`);
  }

  await client.end();
}

run().catch(err => {
  console.error('Error deleting user:', err);
  process.exit(1);
});
