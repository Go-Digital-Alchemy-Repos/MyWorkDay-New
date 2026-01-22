import { Router } from "express";
import clientsRouter from "./router";
import divisionsRouter from "./divisions.router";

const router = Router();

router.use("/clients", clientsRouter);
router.use("/v1", divisionsRouter);

export default router;
