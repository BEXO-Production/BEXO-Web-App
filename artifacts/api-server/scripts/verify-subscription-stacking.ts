/**
 * Local verification for subscription stacking / canBuy rules.
 * Usage: pnpm exec tsx scripts/verify-subscription-stacking.ts
 */
import {
  ANNUAL_STORAGE_BYTES,
  FREE_STORAGE_BYTES,
  LIFETIME_STORAGE_BYTES,
  effectiveQuota,
  getCanBuy,
  getRenewalMode,
  planBaseQuota,
} from "../src/lib/subscriptions";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`OK  ${msg}`);
}

function main() {
  assert(planBaseQuota("free") === FREE_STORAGE_BYTES, "free base = 10MB");
  assert(planBaseQuota("annual") === ANNUAL_STORAGE_BYTES, "annual base = 100MB");
  assert(planBaseQuota("lifetime") === LIFETIME_STORAGE_BYTES, "lifetime base = 50MB");

  assert(effectiveQuota("lifetime", 0) === LIFETIME_STORAGE_BYTES, "lifetime alone = 50MB");
  assert(effectiveQuota("lifetime", ANNUAL_STORAGE_BYTES) === LIFETIME_STORAGE_BYTES + ANNUAL_STORAGE_BYTES, "lifetime + yearly bonus = 150MB");
  assert(effectiveQuota("annual", 0) === ANNUAL_STORAGE_BYTES, "annual renew keeps 100MB");
  assert(effectiveQuota("free", ANNUAL_STORAGE_BYTES) === FREE_STORAGE_BYTES + ANNUAL_STORAGE_BYTES, "expired keeps bonus on free base");

  assert(getCanBuy(false, null).lifetime === true && getCanBuy(false, null).annual === true, "free can buy both");
  assert(getCanBuy(true, "annual").lifetime === false && getCanBuy(true, "annual").annual === true, "annual: yearly only");
  assert(getCanBuy(true, "lifetime").lifetime === false && getCanBuy(true, "lifetime").annual === true, "lifetime: yearly add-on only");

  assert(getRenewalMode(false, null) === "purchase", "free renewalMode=purchase");
  assert(getRenewalMode(true, "annual") === "renew", "annual renewalMode=renew");
  assert(getRenewalMode(true, "lifetime") === "addon", "lifetime renewalMode=addon");

  console.log("\nAll subscription stacking checks passed.");
}

main();
