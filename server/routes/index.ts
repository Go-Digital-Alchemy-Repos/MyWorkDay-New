import { Router } from "express";
import timerRoutes from "./timeTracking";

const router = Router();

router.use("/timer", timerRoutes);

export default router;
