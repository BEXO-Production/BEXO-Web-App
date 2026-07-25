import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import profileRouter from "./profile";
import paymentsRouter from "./payments";
import upiAutopayRouter from "./upiAutopay";
import pricingRouter from "./pricing";
import analyticsRouter from "./analytics";
import geoRouter from "./geo";
import adminRouter from "./admin";
import outreachRouter from "./outreach";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/profile", profileRouter);
// Auth is applied per-route inside paymentsRouter so /webhook can stay public
router.use("/payments", paymentsRouter);
router.use("/payments/upi-autopay", upiAutopayRouter);
router.use("/pricing", pricingRouter);
router.use("/analytics", analyticsRouter);
router.use("/geo", geoRouter);
router.use("/admin", adminRouter);
router.use("/outreach", outreachRouter);

export default router;
