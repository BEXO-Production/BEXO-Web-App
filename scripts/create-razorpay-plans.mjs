// One-off: create the 4 Razorpay plans for the new catalog (run with test or live keys).
// Usage: node scripts/create-razorpay-plans.mjs
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const keyId = process.env.RAZORPAY_KEY_ID || env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET || env.RAZORPAY_KEY_SECRET;
if (!keyId || !keySecret) {
  console.error("Missing RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET");
  process.exit(1);
}

const auth = "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");

// Amounts are GST-inclusive paise, matching calculatePlanAmount() exactly.
const plans = [
  { id: "identity", period: "monthly", interval: 1, amount: 6962, name: "Bexo Identity Plan (Monthly)", description: "Identity Plan - Rs.59 + 18% GST per month" },
  { id: "essential", period: "monthly", interval: 1, amount: 23482, name: "Bexo Essential Plan (Monthly)", description: "Essential Plan - Rs.199 + 18% GST per month" },
  { id: "growth", period: "yearly", interval: 1, amount: 117882, name: "Bexo Growth Plan (Yearly)", description: "Growth Plan - Rs.999 + 18% GST per year" },
  { id: "storage_addon", period: "monthly", interval: 1, amount: 2950, name: "Bexo Storage Increase (50MB block)", description: "Storage add-on - Rs.25 + 18% GST per 50MB block per month" },
];

const results = {};
for (const p of plans) {
  const res = await fetch("https://api.razorpay.com/v1/plans", {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      period: p.period,
      interval: p.interval,
      item: { name: p.name, amount: p.amount, currency: "INR", description: p.description },
      notes: { bexo_plan: p.id },
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(`FAILED ${p.id}:`, JSON.stringify(data));
    process.exit(1);
  }
  results[p.id] = data.id;
  console.log(`${p.id} -> ${data.id} (${p.amount} paise, ${p.period})`);
}

console.log("\nSQL:");
for (const [planId, rzpId] of Object.entries(results)) {
  console.log(`UPDATE pricing_plans SET razorpay_plan_id = '${rzpId}', updated_at = now() WHERE id = '${planId}';`);
}
