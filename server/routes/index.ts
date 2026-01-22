import { Router } from "express";
import timerRoutes from "./timeTracking";
import superAdminRoutes from "./superAdmin";
import superDebugRoutes from "./superDebug";
import superChatRoutes from "./superChat";
import tenantOnboardingRoutes from "./tenantOnboarding";
import tenantBillingRoutes from "./tenantBilling";
import tenancyHealthRoutes from "./tenancyHealth";
import projectsDashboardRoutes from "./projectsDashboard";
import workloadReportsRoutes from "./workloadReports";
import uploadRoutes from "./uploads";
import emailOutboxRoutes from "./emailOutbox";
import systemStatusRoutes from "./systemStatus";
import systemIntegrationsRoutes from "./systemIntegrations";
import chatRoutes from "./chat";

const router = Router();

router.use("/timer", timerRoutes);
router.use("/v1/super", superAdminRoutes);
router.use("/v1/super/debug", superDebugRoutes);
router.use("/v1/super/chat", superChatRoutes);
router.use("/v1/super/status", systemStatusRoutes);
router.use("/v1/system", systemIntegrationsRoutes);
router.use("/v1/tenant", tenantOnboardingRoutes);
router.use("/v1/tenant", tenantBillingRoutes);
router.use("/v1", projectsDashboardRoutes);
router.use("/v1", workloadReportsRoutes);
router.use("/v1/uploads", uploadRoutes);
router.use("/v1", emailOutboxRoutes);
router.use("/v1/chat", chatRoutes);
router.use(tenancyHealthRoutes);

export default router;
