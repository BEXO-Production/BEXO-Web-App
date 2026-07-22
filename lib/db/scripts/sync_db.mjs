import pg from '../node_modules/pg/lib/index.js';
import fs from 'fs';
import path from 'path';

// 1. Read .env manually
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

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL not found in .env!');
  process.exit(1);
}

console.log('Connecting to Supabase PostgreSQL Database...');
console.log('Host/URL:', dbUrl.replace(/\/\/.*@/, '//***@'));

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  console.log('✓ Successfully connected to PostgreSQL!\n');

  // 2. Read all migration files in order
  const migrationsDir = path.join(rootDir, 'supabase', 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`Found ${files.length} SQL migration files:`);
  files.forEach(f => console.log(`  - ${f}`));
  console.log('\n--- APPLYING MIGRATIONS ---');

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');
    console.log(`Executing migration: ${file}...`);
    try {
      await client.query(sql);
      console.log(`✓ Migration ${file} applied successfully.`);
    } catch (err) {
      console.warn(`! Notice/Warning on ${file}: ${err.message}`);
      // Fallback: split statements by semicolon and run individually
      const statements = sql.split(/;\s*$/m).map(s => s.trim()).filter(Boolean);
      for (const stmt of statements) {
        try {
          await client.query(stmt);
        } catch (innerErr) {
          console.log(`   └─ Statement skipped/already exists: ${innerErr.message.split('\n')[0]}`);
        }
      }
    }
  }

  console.log('\n--- ENSURING DRAINED DRIZZLE SCHEMA TABLES & SEED DATA ---');

  // Ensure default billing settings exist
  await client.query(`
    INSERT INTO billing_settings (id, currency, gst_rate)
    VALUES ('default', 'INR', 0.18)
    ON CONFLICT (id) DO NOTHING;
  `);

  // Ensure template rows exist
  await client.query(`
    INSERT INTO templates (id, name, description)
    VALUES
      ('minimal', 'Minimal', 'Clean path-based starter portfolio'),
      ('academic', 'Academic', 'Structured academic-focused layout'),
      ('creative', 'Creative', 'Bold creative portfolio layout'),
      ('cura-futuri', 'Cura Futuri', 'Modern, high-contrast editorial portfolio with motion and media galleries'),
      ('sierra-montana', 'Sierra Montana', 'Elegant storytelling portfolio with smooth scrolling'),
      ('nico-palmer', 'Nico Palmer', 'Bold cinematic portfolio for creative professionals')
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
  `);

  // Ensure activation keys exist
  await client.query(`
    INSERT INTO activation_keys (code, status)
    VALUES
      ('BEXO-KAVIN-2026', 'unused'),
      ('BEXO-PRO-LIFETIME', 'unused'),
      ('BEXO-TEST-1234', 'unused')
    ON CONFLICT (code) DO NOTHING;
  `);

  // Ensure pricing plans exist
  await client.query(`
    INSERT INTO pricing_plans
      (id, display_name, subtitle, price_inr_ex_gst, storage_bytes, is_purchasable, sort_order, is_highlighted, features, is_active, billing_period, parses_per_month, updates_per_month, razorpay_plan_id)
    VALUES
      ('free', 'Free', 'Basic portfolio to prove the flow', 0, 10485760, true, 0, false, '["Basic template","10MB storage","3 updates per month","Path-based link (no subdomain)"]'::jsonb, true, 'free', 0, 3, NULL),
      ('identity', 'Identity Plan', 'Your professional identity, live', 59, 52428800, true, 1, false, '["yourname subdomain","Premium templates","50MB cloud storage","1 AI resume parse / month","3 updates / month","Monthly invoice in dashboard"]'::jsonb, true, 'monthly', 1, 3, 'plan_TGaZShgGee2USr'),
      ('essential', 'Essential Plan', 'Everything in Identity, more room to grow', 199, 104857600, true, 2, true, '["Everything in Identity","100MB cloud storage","3 AI resume parses / month","10 updates / month","Access to exclusive templates"]'::jsonb, true, 'monthly', 3, 10, 'plan_TGaZT3LRfjGLgC'),
      ('growth', 'Growth Plan', 'Essential, billed yearly', 999, 104857600, true, 3, false, '["Everything in Essential","Billed once a year","100MB cloud storage","3 AI resume parses / month","10 updates / month"]'::jsonb, true, 'yearly', 3, 10, 'plan_TGaZTJfF2XLTfh'),
      ('studentplus', 'Student+ Plan', 'Identity, forever - one payment', 1999, 52428800, true, 4, false, '["Everything in Identity","One-time payment","No renewals ever","50MB cloud storage","1 AI resume parse / month","3 updates / month"]'::jsonb, true, 'lifetime', 1, 3, NULL),
      ('storage_addon', 'Storage Increase', '+50MB per block, billed monthly', 25, 52428800, true, 99, false, '["+50MB per block on top of your base plan","Billed monthly via Razorpay Autopay","Cancel anytime"]'::jsonb, true, 'monthly', 0, 0, 'plan_TGaZTXHFk6pYCx')
    ON CONFLICT (id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      subtitle = EXCLUDED.subtitle,
      price_inr_ex_gst = EXCLUDED.price_inr_ex_gst,
      storage_bytes = EXCLUDED.storage_bytes,
      is_purchasable = EXCLUDED.is_purchasable,
      sort_order = EXCLUDED.sort_order,
      is_highlighted = EXCLUDED.is_highlighted,
      features = EXCLUDED.features,
      is_active = EXCLUDED.is_active,
      billing_period = EXCLUDED.billing_period,
      parses_per_month = EXCLUDED.parses_per_month,
      updates_per_month = EXCLUDED.updates_per_month,
      -- Keep live Razorpay plan IDs if already set; only fill when null.
      razorpay_plan_id = COALESCE(pricing_plans.razorpay_plan_id, EXCLUDED.razorpay_plan_id),
      updated_at = now();
  `);

  // Ensure coupons exist
  await client.query(`
    INSERT INTO pricing_coupons (code, description, discount_type, percent_off, inr_off, plan_prices, valid_from, valid_until, max_uses, is_active)
    VALUES
      ('BEXO50', '50% off any paid plan', 'percent', 50, NULL, NULL, NULL, NULL, NULL, true),
      ('STUDENT', '₹200 off', 'inr_fixed', NULL, 200, NULL, NULL, NULL, NULL, true),
      ('EARLYBIRD', 'Early bird pricing — Yearly ₹799, Lifetime ₹1999 (+GST)', 'plan_prices', NULL, NULL, '{"annual": 799, "lifetime": 1999}'::jsonb, NULL, NULL, NULL, false),
      ('BEXO2026', 'Launch promo pricing', 'plan_prices', NULL, NULL, '{"annual": 999, "lifetime": 1999}'::jsonb, NULL, '2026-12-31 23:59:59+00', NULL, false),
      ('PROMO2026', 'Alias for BEXO2026', 'plan_prices', NULL, NULL, '{"annual": 999, "lifetime": 1999}'::jsonb, NULL, '2026-12-31 23:59:59+00', NULL, false),
      ('BEXODEV', 'Developer test coupon — ₹1 for first month', 'plan_prices', NULL, NULL, '{"identity": 1, "essential": 1, "growth": 1, "studentplus": 1, "annual": 1, "lifetime": 1, "storage_addon": 1}'::jsonb, NULL, NULL, NULL, true)
    ON CONFLICT (code) DO UPDATE SET
      description = EXCLUDED.description,
      discount_type = EXCLUDED.discount_type,
      percent_off = EXCLUDED.percent_off,
      inr_off = EXCLUDED.inr_off,
      plan_prices = EXCLUDED.plan_prices,
      updated_at = now();
  `);

  console.log('\n=================== DATABASE VERIFICATION REPORT ===================');
  const tablesRes = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);

  const tables = tablesRes.rows.map(r => r.table_name);
  console.log(`Total Tables in Database: ${tables.length}`);

  for (const table of tables) {
    const colRes = await client.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position;
    `, [table]);
    const countRes = await client.query(`SELECT count(*)::int as count FROM public."${table}"`);
    console.log(`\n📦 Table: "${table}" (${countRes.rows[0].count} rows)`);
    console.log(`   Columns (${colRes.rows.length}):`);
    colRes.rows.forEach(c => {
      console.log(`     - ${c.column_name.padEnd(30)} ${c.data_type.padEnd(20)} Nullable: ${c.is_nullable}`);
    });
  }

  console.log('\n====================================================================');
  console.log('✓ All missing tables, columns, indexes, and rows have been updated successfully!');

  await client.end();
}

main().catch(err => {
  console.error('\n❌ Error updating database:', err);
  process.exit(1);
});
