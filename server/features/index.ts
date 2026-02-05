import { Router } from "express";
import clientsFeature from "./clients";
import { notificationsRouter } from "./notifications";
import clientPortalFeature from "./client-portal";
import templatesFeature from "./templates";

const router = Router();

router.use(clientsFeature);
router.use(notificationsRouter);
router.use(clientPortalFeature);
router.use(templatesFeature);

export default router;
