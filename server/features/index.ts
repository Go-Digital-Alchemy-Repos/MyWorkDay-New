import { Router } from "express";
import clientsFeature from "./clients";

const router = Router();

router.use(clientsFeature);

export default router;
