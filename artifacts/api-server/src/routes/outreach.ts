import { Router } from "express";
import { previewActivationCodes } from "../lib/activationEngine";
import { validateCouponForPlan } from "../lib/pricingCatalog";
import { isPaidPlan, normalizePlanId } from "../lib/subscriptions";

const router = Router();

function assertOutreachSecret(req: { headers: Record<string, unknown> }, res: { status: (n: number) => { json: (b: unknown) => void } }) {
  const expected =
    process.env.OUTREACH_VERIFY_SECRET ||
    process.env.CRON_SECRET ||
    process.env.INTERNAL_JOB_SECRET ||
    "";
  if (!expected) {
    res.status(503).json({ error: "Outreach verify is not configured." });
    return false;
  }
  const provided = String(req.headers["x-outreach-key"] || req.headers["x-internal-key"] || "");
  if (!provided || provided !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

/**
 * College Connect / outreach tools: verify admin-created codes BEFORE emailing.
 * Does not redeem. Protected by OUTREACH_VERIFY_SECRET / CRON_SECRET.
 */
router.post("/verify-codes", async (req, res) => {
  if (!assertOutreachSecret(req as any, res as any)) return;

  const kind = String(req.body?.kind || "").trim().toLowerCase();
  const codesRaw = Array.isArray(req.body?.codes)
    ? req.body.codes
    : typeof req.body?.codes === "string"
      ? String(req.body.codes).split(/[,\n]+/)
      : [];
  const codes = codesRaw.map((c: unknown) => String(c || "").trim()).filter(Boolean);

  if (!codes.length) {
    res.status(400).json({ error: "Provide codes[]" });
    return;
  }
  if (codes.length > 200) {
    res.status(400).json({ error: "Max 200 codes per request" });
    return;
  }

  if (kind === "activation" || kind === "activation_key") {
    const results = await previewActivationCodes(codes);
    res.json({
      kind: "activation",
      ok: results.every((r) => r.ok),
      results,
    });
    return;
  }

  if (kind === "coupon" || kind === "coupon_id") {
    const planRaw = normalizePlanId(typeof req.body?.plan === "string" ? req.body.plan : "essential");
    const plan = planRaw && isPaidPlan(planRaw) ? planRaw : "essential";
    const results = [];
    for (const code of codes) {
      const check = await validateCouponForPlan(code, plan, null);
      results.push({
        code: code.trim().toUpperCase(),
        ok: check.valid,
        status: check.valid ? "active" : "invalid",
        message: check.valid
          ? `Coupon valid for ${plan}`
          : check.message || "Invalid coupon",
        plan,
        coupon: check.pricing?.coupon || null,
      });
    }
    res.json({
      kind: "coupon",
      ok: results.every((r) => r.ok),
      results,
    });
    return;
  }

  res.status(400).json({ error: "kind must be activation or coupon" });
});

export default router;
