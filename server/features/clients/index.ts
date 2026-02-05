import { Router } from "express";
import clientsRouter from "./router";
import divisionsRouter from "./divisions.router";
import portalRouter from "./portal.router";
import notesRouter from "./notes.router";
import documentsRouter from "./documents.router";

const router = Router();

router.use("/v1/clients", clientsRouter);
router.use("/clients", portalRouter);
router.use("/clients", notesRouter);
router.use("/clients", documentsRouter);
router.use("/v1", divisionsRouter);

export default router;
