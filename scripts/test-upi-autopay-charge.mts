/**
 * One-off: fire a ₹1 UPI Autopay recurring debit against a live mandate.
 * Run from api-server:
 *   pnpm exec tsx ../../scripts/test-upi-autopay-charge.mts [userId] [amountPaise]
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(resolve(root, ".env"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  if (process.env[m[1]] !== undefined) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  process.env[m[1]] = v;
}

const userId = process.argv[2] || "980de1ab-d86b-4176-a1b3-ba7e693379b7";
const amountPaise = Number(process.argv[3] || 100);

async function main() {
  const { runTestRecurringCharge } = await import("../artifacts/api-server/src/lib/upiAutopay.ts");
  console.log(`Charging ₹${(amountPaise / 100).toFixed(2)} via UPI Autopay token for ${userId}…`);
  const result = await runTestRecurringCharge({
    userId,
    amountPaise,
    note: "Manual ₹1 Autopay engine test (monthly renewal path)",
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
