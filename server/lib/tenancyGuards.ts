/**
 * Tenancy Guardrails
 * 
 * Lightweight runtime guards and development-time warnings to prevent
 * common tenancy-related mistakes.
 * 
 * ARCHITECTURE INVARIANTS:
 * 1. Every tenant-owned entity MUST have tenant_id set on insert
 * 2. Every query MUST filter by tenant_id (never workspace_id for visibility)
 * 3. Storage operations MUST use the unified resolver
 * 4. Chat operations MUST validate tenant + membership
 * 
 * These guards do NOT change runtime behavior - they log warnings
 * in development and throw in test mode to catch issues early.
 */

const isDevelopment = process.env.NODE_ENV !== "production";
const isTest = process.env.NODE_ENV === "test";
const GUARD_MODE = process.env.TENANCY_GUARD_MODE || "warn"; // "warn" | "throw" | "off"

/**
 * Log a tenancy guard warning or throw based on configuration.
 */
function guardViolation(message: string, context?: Record<string, unknown>): void {
  const fullMessage = `[TenancyGuard] ${message}`;
  const contextStr = context ? ` Context: ${JSON.stringify(context)}` : "";
  
  if (GUARD_MODE === "off") {
    return;
  }
  
  if (GUARD_MODE === "throw" || isTest) {
    throw new Error(fullMessage + contextStr);
  }
  
  if (isDevelopment) {
    console.warn(fullMessage + contextStr);
  }
}

/**
 * Assert that tenant context is available.
 * Use this at the start of tenant-scoped route handlers.
 * 
 * @example
 * router.get("/projects", (req, res) => {
 *   const tenantId = requireTenantContext(req);
 *   // tenantId is guaranteed to be a string
 * });
 */
export function requireTenantContext(
  req: { user?: { tenantId?: string | null } },
  requestId?: string
): string {
  const tenantId = req.user?.tenantId;
  
  if (!tenantId) {
    guardViolation(
      "Tenant context required but not available",
      { requestId, hasUser: !!req.user }
    );
    throw new Error("Tenant context required");
  }
  
  return tenantId;
}

/**
 * Assert that tenant_id is present in an insert payload.
 * 
 * ARCHITECTURE NOTE:
 * Every insert to a tenant-owned table MUST include tenant_id.
 * This guard catches cases where tenant_id is missing.
 * Throws in test mode to catch regressions early.
 * 
 * @example
 * assertTenantIdOnInsert(projectData, "projects");
 * await db.insert(projects).values(projectData);
 */
export function assertTenantIdOnInsert(
  payload: Record<string, unknown>,
  tableName: string,
  requestId?: string
): void {
  if (!payload.tenantId) {
    const message = `Missing tenant_id in insert to ${tableName}`;
    guardViolation(message, { requestId, table: tableName });
    
    // Always throw in test mode to catch regressions early
    if (isTest) {
      throw new Error(`[TenancyGuard] ${message}`);
    }
  }
}

/**
 * Assert that tenantId is NOT coming from client-supplied request body/query.
 * Prevents accidental use of user-controlled tenantId which is a common isolation failure.
 * 
 * ARCHITECTURE NOTE:
 * TenantId should ALWAYS come from authenticated session context (effectiveTenantId),
 * never from req.body.tenantId or req.query.tenantId.
 * 
 * @example
 * // Call at the start of tenant-scoped routes to verify no client tenantId
 * assertNoClientTenantId(req.body, req.query, "POST /api/projects");
 */
export function assertNoClientTenantId(
  body: Record<string, unknown>,
  query: Record<string, unknown>,
  context: string,
  requestId?: string
): void {
  const hasBodyTenantId = body && "tenantId" in body;
  const hasQueryTenantId = query && "tenantId" in query;
  
  if (hasBodyTenantId || hasQueryTenantId) {
    const source = hasBodyTenantId ? "body" : "query";
    guardViolation(
      `Client-supplied tenantId detected in ${context}. Use effectiveTenantId from session instead.`,
      { requestId, context, source }
    );
    
    // In test mode, throw to catch this early
    if (isTest) {
      throw new Error(`[TenancyGuard] Client-supplied tenantId in ${context}`);
    }
  }
}

/**
 * Warn if workspace is being used as a visibility filter.
 * 
 * ARCHITECTURE NOTE:
 * Workspace is for ORGANIZATION, not VISIBILITY.
 * Data visibility should ALWAYS be based on tenant_id.
 * 
 * @example
 * // This will warn in development:
 * warnIfWorkspaceVisibility("clients list query");
 * const clients = await db.select().from(clients)
 *   .where(eq(clients.workspaceId, workspaceId)); // Wrong!
 */
export function warnIfWorkspaceVisibility(
  context: string,
  requestId?: string
): void {
  guardViolation(
    `Potential workspace-based visibility in: ${context}. Use tenant_id instead.`,
    { requestId, context }
  );
}

/**
 * Assert that an entity belongs to the expected tenant.
 * Use this before updates/deletes to prevent cross-tenant operations.
 * 
 * @example
 * const project = await getProject(projectId);
 * assertTenantOwnership(project.tenantId, effectiveTenantId, "project", projectId);
 * await updateProject(projectId, data);
 */
export function assertTenantOwnership(
  entityTenantId: string | null | undefined,
  expectedTenantId: string,
  entityType: string,
  entityId: string,
  requestId?: string
): void {
  if (entityTenantId !== expectedTenantId) {
    guardViolation(
      `Cross-tenant access attempt: ${entityType} ${entityId} belongs to tenant ${entityTenantId}, not ${expectedTenantId}`,
      { requestId, entityType, entityId, entityTenantId, expectedTenantId }
    );
    throw new Error("Forbidden: Cross-tenant access denied");
  }
}

/**
 * Log a storage operation for debugging.
 * Ensures storage operations are going through proper channels.
 */
export function logStorageOperation(
  operation: "upload" | "download" | "delete",
  path: string,
  tenantId: string | null,
  source: "resolver" | "direct"
): void {
  if (source === "direct" && isDevelopment) {
    guardViolation(
      `Direct storage operation detected. Use storage resolver instead.`,
      { operation, path, tenantId }
    );
  }
  
  if (process.env.STORAGE_DEBUG === "true") {
    console.log(`[Storage] ${operation} ${path} (tenant: ${tenantId}, via: ${source})`);
  }
}

/**
 * Assert chat membership before room operations.
 * 
 * ARCHITECTURE NOTE:
 * Chat rooms are tenant-scoped and membership-gated.
 * Never allow join/send without validation.
 */
export function assertChatMembership(
  isMember: boolean,
  userId: string,
  threadType: "channel" | "dm",
  threadId: string,
  requestId?: string
): void {
  if (!isMember) {
    guardViolation(
      `Chat membership required: user ${userId} is not a member of ${threadType} ${threadId}`,
      { requestId, userId, threadType, threadId }
    );
    throw new Error("Not a member of this chat");
  }
}

/**
 * Assert that Socket.IO room is tenant-namespaced.
 * 
 * ARCHITECTURE NOTE:
 * Socket rooms MUST include tenant ID to prevent cross-tenant visibility.
 * Pattern: `channel:${tenantId}:${channelId}` or `dm:${tenantId}:${dmId}`
 */
export function assertTenantScopedRoom(
  roomName: string,
  expectedTenantId: string,
  requestId?: string
): void {
  if (!roomName.includes(expectedTenantId)) {
    guardViolation(
      `Socket room not tenant-scoped: ${roomName} should include ${expectedTenantId}`,
      { requestId, roomName, expectedTenantId }
    );
  }
}

export default {
  requireTenantContext,
  assertTenantIdOnInsert,
  assertNoClientTenantId,
  warnIfWorkspaceVisibility,
  assertTenantOwnership,
  logStorageOperation,
  assertChatMembership,
  assertTenantScopedRoom,
};
