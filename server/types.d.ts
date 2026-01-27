/**
 * Centralized Express Request Type Augmentation
 * 
 * This file provides TypeScript type definitions for properties attached
 * to Express Request objects by various middleware.
 * 
 * ARCHITECTURE NOTE:
 * - All middleware that attaches properties to req should have their types declared here
 * - This is a global augmentation file - do NOT import it as a module
 * - Express.User is declared in server/auth.ts (Omit<User, "passwordHash">)
 */

/**
 * Tenant context attached by tenantContextMiddleware
 */
interface TenantContext {
  tenantId: string | null;
  effectiveTenantId: string | null;
  isSuperUser: boolean;
}

/**
 * Client access info attached by requireClientAccess middleware
 */
interface ClientAccessContext {
  id: string;
  userId: string;
  clientId: string;
  workspaceId: string;
  accessLevel: string;
  createdAt: Date;
}

declare global {
  namespace Express {
    interface Request {
      /**
       * Tenant context from tenantContextMiddleware.
       * Contains effectiveTenantId for multi-tenancy scoping.
       */
      tenant?: TenantContext;
      
      /**
       * Request ID for correlation across logs.
       * Attached by requestIdMiddleware.
       */
      requestId?: string;
      
      /**
       * Client access context for client portal users.
       * Attached by requireClientAccess middleware.
       */
      clientAccess?: ClientAccessContext;
      
      /**
       * Workspace ID for demo/legacy routes.
       * @deprecated Use tenant.effectiveTenantId instead
       */
      workspaceId?: string;
    }
  }
}

export { TenantContext, ClientAccessContext };
