import { Router } from "express";
import templatesRouter from "./router";

const router = Router();

router.use("/project-templates", templatesRouter);

export default router;
