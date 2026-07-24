import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { collectEnvHealth } from "../lib/envHealth";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

/** Presence-only env audit — never returns secret values. */
router.get("/health/config", (_req, res) => {
  const health = collectEnvHealth();
  res.status(health.ok ? 200 : 503).json({
    status: health.ok ? "ok" : "misconfigured",
    criticalMissing: health.criticalMissing,
    recommendedMissing: health.recommendedMissing,
    checks: health.checks.map((c) => ({
      key: c.key,
      present: c.present,
      critical: c.critical,
      note: c.note || null,
    })),
  });
});

export default router;
