import { Router } from "express";
import clientsFeature from "./clients";
import { notificationsRouter } from "./notifications";

const router = Router();

router.use(clientsFeature);
router.use(notificationsRouter);

export default router;
