import { Router } from "express";
import timerRoutes from "./timeTracking";
import superAdminRoutes from "./superAdmin";
import tenantOnboardingRoutes from "./tenantOnboarding";
import tenancyHealthRoutes from "./tenancyHealth";
import projectsDashboardRoutes from "./projectsDashboard";

const router = Router();

router.use("/timer", timerRoutes);
router.use("/v1/super", superAdminRoutes);
router.use("/v1/tenant", tenantOnboardingRoutes);
router.use("/v1", projectsDashboardRoutes);
router.use(tenancyHealthRoutes);

export default router;
