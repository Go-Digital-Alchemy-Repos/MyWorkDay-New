import "dotenv/config";
import express from "express";
import type { IncomingMessage } from "http";
import { registerRoutes } from "./routes";
import { createServer } from "http";
import { setupAuth, setupBootstrapEndpoints, setupPlatformInviteEndpoints, setupTenantInviteEndpoints, setupPasswordResetEndpoints, setupGoogleAuth } from "./auth";
import { tenantContextMiddleware } from "./middleware/tenantContext";
import { agreementEnforcementGuard } from "./middleware/agreementEnforcement";
import { requestIdMiddleware } from "./middleware/requestId";
import { errorHandler } from "./middleware/errorHandler";
import { errorLoggingMiddleware } from "./middleware/errorLogging";
import { apiJsonResponseGuard, apiNotFoundHandler } from "./middleware/apiJsonGuard";

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

let testAppInstance: express.Express | null = null;

export async function createTestApp(): Promise<express.Express> {
  if (testAppInstance) {
    return testAppInstance;
  }

  const app = express();
  const httpServer = createServer(app);

  app.set("trust proxy", 1);

  app.use(requestIdMiddleware);

  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false }));

  setupAuth(app);
  setupBootstrapEndpoints(app);
  setupPlatformInviteEndpoints(app);
  setupTenantInviteEndpoints(app);
  setupPasswordResetEndpoints(app);
  setupGoogleAuth(app);

  app.use(tenantContextMiddleware);
  app.use(agreementEnforcementGuard);
  app.use(apiJsonResponseGuard);

  await registerRoutes(httpServer, app);

  app.use(apiNotFoundHandler);
  app.use(errorLoggingMiddleware);
  app.use(errorHandler);

  testAppInstance = app;
  return app;
}
