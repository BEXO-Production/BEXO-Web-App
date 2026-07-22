import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import profileRouter from "./profile";
import paymentsRouter from "./payments";
import pricingRouter from "./pricing";
import analyticsRouter from "./analytics";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/profile", profileRouter);
// Auth is applied per-route inside paymentsRouter so /webhook can stay public
router.use("/payments", paymentsRouter);
router.use("/pricing", pricingRouter);
router.use("/analytics", analyticsRouter);

export default router;
