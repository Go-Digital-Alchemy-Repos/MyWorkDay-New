import { Router } from "express";
import timerRoutes from "./timeTracking";
import superAdminRoutes from "./superAdmin";
import tenantOnboardingRoutes from "./tenantOnboarding";

const router = Router();

router.use("/timer", timerRoutes);
router.use("/v1/super", superAdminRoutes);
router.use("/v1/tenant", tenantOnboardingRoutes);

export default router;
