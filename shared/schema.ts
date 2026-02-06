import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums as const objects
export const TaskStatus = {
  TODO: "todo",
  IN_PROGRESS: "in_progress",
  BLOCKED: "blocked",
  DONE: "done",
} as const;

export const TaskPriority = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  URGENT: "urgent",
} as const;

export const WorkspaceMemberRole = {
  OWNER: "owner",
  ADMIN: "admin",
  MEMBER: "member",
  GUEST: "guest",
} as const;

export const WorkspaceMemberStatus = {
  ACTIVE: "active",
  INVITED: "invited",
} as const;

export const ProjectVisibility = {
  PRIVATE: "private",
  WORKSPACE: "workspace",
} as const;

export const ProjectStatus = {
  ACTIVE: "active",
  ARCHIVED: "archived",
} as const;

// Client-related enums
export const ClientStatus = {
  ACTIVE: "active",
  PROSPECT: "prospect",
  INACTIVE: "inactive",
} as const;

export const ClientInviteStatus = {
  DRAFT: "draft",
  SENT: "sent",
  REVOKED: "revoked",
  ACCEPTED: "accepted",
} as const;

// Time Tracking enums
export const TimeEntryScope = {
  IN_SCOPE: "in_scope",
  OUT_OF_SCOPE: "out_of_scope",
} as const;

export const TimerStatus = {
  RUNNING: "running",
  PAUSED: "paused",
} as const;

// User role enum (Admin, Employee, Client, Super User)
export const UserRole = {
  SUPER_USER: "super_user",
  ADMIN: "admin",
  EMPLOYEE: "employee",
  CLIENT: "client",
} as const;

// Tenant status enum
export const TenantStatus = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  SUSPENDED: "suspended",
} as const;

// Invitation status enum
export const InvitationStatus = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  EXPIRED: "expired",
  REVOKED: "revoked",
} as const;

// Client access level enum (for client portal users)
export const ClientAccessLevel = {
  VIEWER: "viewer",
  COLLABORATOR: "collaborator",
} as const;

// =============================================================================
// MULTI-TENANCY TABLES
// =============================================================================

/**
 * Tenants table - top-level organizational unit for multi-tenancy
 * Each tenant represents a separate organization/company using the platform
 */
export const tenants = pgTable("tenants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: text("status").notNull().default("inactive"),
  onboardedAt: timestamp("onboarded_at"),
  ownerUserId: varchar("owner_user_id"),
  activatedBySuperUserAt: timestamp("activated_by_super_user_at"), // Set when super user activates tenant without requiring onboarding
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  // Billing fields (Stripe integration)
  stripeCustomerId: text("stripe_customer_id"),
  stripeDefaultPaymentMethodId: text("stripe_default_payment_method_id"),
  billingEmail: text("billing_email"),
  billingStatus: text("billing_status").default("none"), // "none" | "active" | "past_due" | "canceled"
  // CRM Fields
  legalName: text("legal_name"),
  industry: text("industry"),
  companySize: text("company_size"),
  website: text("website"),
  taxId: text("tax_id"),
  foundedDate: text("founded_date"),
  description: text("description"),
  // Address fields
  addressLine1: text("address_line_1"),
  addressLine2: text("address_line_2"),
  city: text("city"),
  state: text("state"),
  postalCode: text("postal_code"),
  country: text("country"),
  // Contact fields
  phoneNumber: text("phone_number"),
  primaryContactName: text("primary_contact_name"),
  primaryContactEmail: text("primary_contact_email"),
  primaryContactPhone: text("primary_contact_phone"),
}, (table) => [
  index("tenants_slug_idx").on(table.slug),
  index("tenants_status_idx").on(table.status),
]);

/**
 * Tenant Settings table - stores per-tenant configuration including white-label branding
 * One-to-one relationship with tenants
 */
export const tenantSettings = pgTable("tenant_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull().unique(),
  // Branding fields
  displayName: text("display_name").notNull(), // Also serves as brandName
  appName: text("app_name"), // Optional custom app name shown in UI
  logoUrl: text("logo_url"),
  iconUrl: text("icon_url"), // Square icon for app shortcuts/PWA
  faviconUrl: text("favicon_url"),
  primaryColor: text("primary_color"), // Hex color
  secondaryColor: text("secondary_color"), // Hex color
  accentColor: text("accent_color"), // Hex color
  loginMessage: text("login_message"), // Optional message on login/onboarding
  supportEmail: text("support_email"),
  // White label toggles
  whiteLabelEnabled: boolean("white_label_enabled").notNull().default(false),
  hideVendorBranding: boolean("hide_vendor_branding").notNull().default(false),
  // Theme defaults (preset name, null = use system default "blue")
  defaultThemeAccent: text("default_theme_accent"),
  // Chat retention settings (tenant-specific override, null = use system default)
  chatRetentionDays: integer("chat_retention_days"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("tenant_settings_tenant_idx").on(table.tenantId),
]);

/**
 * Integration status enum
 */
export const IntegrationStatus = {
  NOT_CONFIGURED: "not_configured",
  CONFIGURED: "configured",
  ERROR: "error",
} as const;

/**
 * Tenant Integrations table - stores per-tenant AND system-level integration configurations
 * Supports multiple providers (mailgun, s3, stripe, etc.) with encrypted secrets
 * 
 * HIERARCHY:
 * - tenantId = NULL → System-level (default for all tenants)
 * - tenantId = X → Tenant-specific override (takes priority over system-level)
 */
export const tenantIntegrations = pgTable("tenant_integrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id), // NULL = system-level integration
  provider: text("provider").notNull(), // "mailgun", "s3", "stripe", etc.
  configEncrypted: text("config_encrypted"), // Encrypted JSON blob for secrets
  configPublic: jsonb("config_public"), // Non-secret fields (domain, region, etc.)
  status: text("status").notNull().default("not_configured"),
  lastTestedAt: timestamp("last_tested_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("tenant_integrations_tenant_idx").on(table.tenantId),
  index("tenant_integrations_provider_idx").on(table.provider),
  uniqueIndex("tenant_integrations_tenant_provider_unique").on(table.tenantId, table.provider),
]);

// Email outbox status enum
export const EmailOutboxStatus = {
  QUEUED: "queued",
  SENT: "sent",
  FAILED: "failed",
} as const;

// Email message type enum
export const EmailMessageType = {
  INVITATION: "invitation",
  MENTION_NOTIFICATION: "mention_notification",
  FORGOT_PASSWORD: "forgot_password",
  TEST_EMAIL: "test_email",
  SYSTEM_NOTIFICATION: "system_notification",
} as const;

/**
 * Email Outbox table - tracks all outgoing emails with status and error information
 * Enables observability, debugging, and resend functionality
 */
export const emailOutbox = pgTable("email_outbox", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id), // Nullable for global/system emails
  messageType: text("message_type").notNull(), // invitation, mention_notification, forgot_password, test_email
  toEmail: text("to_email").notNull(),
  subject: text("subject").notNull(),
  status: text("status").notNull().default("queued"), // queued, sent, failed
  providerMessageId: text("provider_message_id"), // Mailgun message ID for tracking
  lastError: text("last_error"), // Error message if failed
  requestId: text("request_id"), // Correlation ID for debugging
  resendCount: integer("resend_count").default(0),
  lastResendAt: timestamp("last_resend_at"),
  metadata: jsonb("metadata"), // Additional context (userId, inviteId, etc.)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("email_outbox_tenant_idx").on(table.tenantId),
  index("email_outbox_status_idx").on(table.status),
  index("email_outbox_type_idx").on(table.messageType),
  index("email_outbox_created_idx").on(table.createdAt),
]);

// Agreement status enum
export const AgreementStatus = {
  DRAFT: "draft",
  ACTIVE: "active",
  ARCHIVED: "archived",
} as const;

/**
 * Tenant Agreements table - stores SaaS agreement/terms versions per tenant
 * Only ONE active agreement per tenant at a time (or one global default for all tenants)
 * 
 * SCOPE BEHAVIOR:
 * - tenantId = NULL: Global default agreement (applies to all tenants without override)
 * - tenantId = <uuid>: Tenant-specific override agreement
 * 
 * RESOLUTION: Tenant-specific active agreement takes precedence, else global default.
 */
export const tenantAgreements = pgTable("tenant_agreements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id), // NULL = global/All Tenants
  title: text("title").notNull(),
  body: text("body").notNull(), // Markdown or HTML content
  version: integer("version").notNull().default(1),
  status: text("status").notNull().default(AgreementStatus.DRAFT),
  effectiveAt: timestamp("effective_at"), // When active version became effective
  createdByUserId: varchar("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("tenant_agreements_tenant_idx").on(table.tenantId),
  index("tenant_agreements_status_idx").on(table.status),
]);

/**
 * Tenant Agreement Acceptances table - tracks user acceptance of agreements
 * Each record represents a user accepting a specific version of an agreement
 */
export const tenantAgreementAcceptances = pgTable("tenant_agreement_acceptances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  agreementId: varchar("agreement_id").references(() => tenantAgreements.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  version: integer("version").notNull(), // The version that was accepted
  acceptedAt: timestamp("accepted_at").defaultNow().notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
}, (table) => [
  index("tenant_agreement_acceptances_tenant_idx").on(table.tenantId),
  index("tenant_agreement_acceptances_user_idx").on(table.userId),
  index("tenant_agreement_acceptances_agreement_idx").on(table.agreementId),
  uniqueIndex("tenant_agreement_acceptances_unique").on(table.tenantId, table.userId, table.agreementId, table.version),
]);

// Tenancy warning type enum
export const TenancyWarnType = {
  MISMATCH: "mismatch",
  MISSING_TENANT_ID: "missing-tenantId",
} as const;

/**
 * Tenancy Warnings table - stores warnings for tenancy enforcement monitoring
 * Used when TENANCY_WARN_PERSIST=true to track tenant isolation issues
 */
export const tenancyWarnings = pgTable("tenancy_warnings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  route: text("route").notNull(),
  method: text("method").notNull(),
  warnType: text("warn_type").notNull(),
  actorUserId: varchar("actor_user_id"),
  effectiveTenantId: varchar("effective_tenant_id"),
  resourceId: text("resource_id"),
  notes: text("notes"),
}, (table) => [
  index("tenancy_warnings_occurred_at_idx").on(table.occurredAt),
  index("tenancy_warnings_warn_type_idx").on(table.warnType),
  index("tenancy_warnings_tenant_idx").on(table.effectiveTenantId),
]);

/**
 * Error Logs table - centralized error logging for Super Admin monitoring
 * Records 500 errors and explicit error captures with requestId correlation
 */
export const errorLogs = pgTable("error_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requestId: varchar("request_id").notNull(),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  userId: varchar("user_id").references(() => users.id),
  method: text("method").notNull(),
  path: text("path").notNull(),
  status: integer("status").notNull(),
  errorName: text("error_name"),
  message: text("message").notNull(),
  stack: text("stack"),
  dbCode: text("db_code"),
  dbConstraint: text("db_constraint"),
  meta: jsonb("meta"),
  environment: text("environment").default("development"),
  resolved: boolean("resolved").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("error_logs_created_at_idx").on(table.createdAt),
  index("error_logs_request_id_idx").on(table.requestId),
  index("error_logs_tenant_idx").on(table.tenantId),
  index("error_logs_status_idx").on(table.status),
]);

// Note category enum for tenant notes
export const NoteCategory = {
  ONBOARDING: "onboarding",
  SUPPORT: "support",
  BILLING: "billing",
  TECHNICAL: "technical",
  GENERAL: "general",
} as const;

/**
 * Tenant Notes table - chronological notes attached to tenants (super admin only)
 * Used for tracking onboarding work, support actions, and internal communication
 */
export const tenantNotes = pgTable("tenant_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  authorUserId: varchar("author_user_id").notNull(), // User who created the note
  lastEditedByUserId: varchar("last_edited_by_user_id"), // User who last edited the note
  body: text("body").notNull(),
  category: text("category").default("general"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("tenant_notes_tenant_idx").on(table.tenantId),
  index("tenant_notes_created_at_idx").on(table.createdAt),
]);

/**
 * Tenant Note Versions table - stores historical versions of notes
 * Each time a note is edited, the previous version is saved here
 */
export const tenantNoteVersions = pgTable("tenant_note_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  noteId: varchar("note_id").references(() => tenantNotes.id).notNull(),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  editorUserId: varchar("editor_user_id").notNull(), // User who made this edit
  body: text("body").notNull(), // The content at this version
  category: text("category").default("general"),
  versionNumber: integer("version_number").notNull(), // Sequential version number
  createdAt: timestamp("created_at").defaultNow().notNull(), // When this version was created
}, (table) => [
  index("tenant_note_versions_note_idx").on(table.noteId),
  index("tenant_note_versions_tenant_idx").on(table.tenantId),
  index("tenant_note_versions_created_at_idx").on(table.createdAt),
]);

/**
 * Tenant Audit Events table - chronological event log for tenant lifecycle
 * Records important changes like tenant creation, status changes, invites, etc.
 */
export const tenantAuditEvents = pgTable("tenant_audit_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  actorUserId: varchar("actor_user_id"), // User who triggered the event (nullable for system events)
  eventType: text("event_type").notNull(),
  message: text("message").notNull(),
  metadata: jsonb("metadata"), // Optional additional structured data
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("tenant_audit_events_tenant_idx").on(table.tenantId),
  index("tenant_audit_events_created_at_idx").on(table.createdAt),
  index("tenant_audit_events_type_idx").on(table.eventType),
]);

// Insert schemas and types for tenant notes and audit events
export const insertTenantNoteSchema = createInsertSchema(tenantNotes).omit({
  id: true,
  createdAt: true,
});
export type InsertTenantNote = z.infer<typeof insertTenantNoteSchema>;
export type TenantNote = typeof tenantNotes.$inferSelect;

export const insertTenantAuditEventSchema = createInsertSchema(tenantAuditEvents).omit({
  id: true,
  createdAt: true,
});
export type InsertTenantAuditEvent = z.infer<typeof insertTenantAuditEventSchema>;
export type TenantAuditEvent = typeof tenantAuditEvents.$inferSelect;

// Users table
// Note: tenantId is nullable for backward compatibility during migration
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  passwordHash: text("password_hash"),
  avatarUrl: text("avatar_url"),
  role: text("role").notNull().default("employee"),
  isActive: boolean("is_active").notNull().default(true),
  googleId: text("google_id").unique(),
  mustChangePasswordOnNextLogin: boolean("must_change_password_on_next_login").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("users_role_idx").on(table.role),
  index("users_active_idx").on(table.isActive),
  index("users_tenant_idx").on(table.tenantId),
  index("users_google_id_idx").on(table.googleId),
]);

// Workspaces table
// Note: tenantId and isPrimary are nullable for backward compatibility during migration
export const workspaces = pgTable("workspaces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  isPrimary: boolean("is_primary").default(false),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("workspaces_tenant_idx").on(table.tenantId),
]);

// Workspace Members table
export const workspaceMembers = pgTable("workspace_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").references(() => workspaces.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  role: text("role").notNull().default("member"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("workspace_members_unique").on(table.workspaceId, table.userId),
]);

// Teams table
// Note: tenantId is nullable for backward compatibility during migration
export const teams = pgTable("teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  workspaceId: varchar("workspace_id").references(() => workspaces.id).notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("teams_tenant_idx").on(table.tenantId),
]);

// Team Members table
export const teamMembers = pgTable("team_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").references(() => teams.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("team_members_unique").on(table.teamId, table.userId),
]);

// =============================================================================
// CLIENT MANAGEMENT TABLES
// =============================================================================

/**
 * Clients table - represents companies/organizations that are clients
 * This is the core of the CRM module
 * Note: tenantId is nullable for backward compatibility during migration
 */
export const clients = pgTable("clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  workspaceId: varchar("workspace_id").references(() => workspaces.id).notNull(),
  parentClientId: varchar("parent_client_id"), // Self-referential: null = top-level client, set = child/sub-client
  companyName: text("company_name").notNull(),
  displayName: text("display_name"),
  legalName: text("legal_name"),
  website: text("website"),
  industry: text("industry"),
  companySize: text("company_size"),
  taxId: text("tax_id"),
  foundedDate: text("founded_date"),
  description: text("description"),
  phone: text("phone"),
  email: text("email"),
  addressLine1: text("address_line_1"),
  addressLine2: text("address_line_2"),
  city: text("city"),
  state: text("state"),
  postalCode: text("postal_code"),
  country: text("country"),
  primaryContactName: text("primary_contact_name"),
  primaryContactEmail: text("primary_contact_email"),
  primaryContactPhone: text("primary_contact_phone"),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("clients_workspace_idx").on(table.workspaceId),
  index("clients_status_idx").on(table.status),
  index("clients_tenant_idx").on(table.tenantId),
  index("clients_parent_idx").on(table.parentClientId),
]);

/**
 * Client Contacts table - represents people at client companies
 */
export const clientContacts = pgTable("client_contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  clientId: varchar("client_id").references(() => clients.id).notNull(),
  workspaceId: varchar("workspace_id").references(() => workspaces.id).notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  title: text("title"),
  email: text("email"),
  phone: text("phone"),
  isPrimary: boolean("is_primary").default(false).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("client_contacts_client_idx").on(table.clientId),
  index("client_contacts_tenant_client_idx").on(table.tenantId, table.clientId),
  index("client_contacts_tenant_email_idx").on(table.tenantId, table.email),
]);

// =============================================================================
// CRM PIPELINE TABLE
// =============================================================================

export const CrmClientStatus = {
  LEAD: "lead",
  PROSPECT: "prospect",
  ACTIVE: "active",
  PAST: "past",
  ON_HOLD: "on_hold",
} as const;

export const clientCrm = pgTable("client_crm", {
  clientId: varchar("client_id").primaryKey().references(() => clients.id, { onDelete: "cascade" }),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  status: text("status").default(CrmClientStatus.ACTIVE),
  ownerUserId: varchar("owner_user_id").references(() => users.id),
  tags: text("tags").array(),
  lastContactAt: timestamp("last_contact_at"),
  nextFollowUpAt: timestamp("next_follow_up_at"),
  followUpNotes: text("follow_up_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("client_crm_tenant_status_idx").on(table.tenantId, table.status),
  index("client_crm_tenant_followup_idx").on(table.tenantId, table.nextFollowUpAt),
]);

/**
 * Client Invites table - PLACEHOLDER for future Better Auth integration
 * Tracks invitation intent for client portal access
 * Note: tokenPlaceholder is a placeholder field - real token generation 
 * will be implemented when Better Auth is integrated
 */
export const clientInvites = pgTable("client_invites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").references(() => clients.id).notNull(),
  contactId: varchar("contact_id").references(() => clientContacts.id).notNull(),
  email: text("email").notNull(),
  roleHint: text("role_hint").default("client"),
  status: text("status").notNull().default("draft"),
  tokenPlaceholder: text("token_placeholder"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("client_invites_client_idx").on(table.clientId),
  index("client_invites_contact_idx").on(table.contactId),
]);

// =============================================================================
// CLIENT FILES TABLE
// =============================================================================

export const ClientFileVisibility = {
  INTERNAL: "internal",
  CLIENT: "client",
} as const;

export const clientFiles = pgTable("client_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  clientId: varchar("client_id").references(() => clients.id, { onDelete: "cascade" }).notNull(),
  uploadedByUserId: varchar("uploaded_by_user_id").references(() => users.id).notNull(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type"),
  size: integer("size"),
  storageKey: text("storage_key").notNull(),
  url: text("url"),
  visibility: text("visibility").default(ClientFileVisibility.INTERNAL).notNull(),
  linkedEntityType: text("linked_entity_type"),
  linkedEntityId: varchar("linked_entity_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("client_files_tenant_idx").on(table.tenantId),
  index("client_files_client_idx").on(table.clientId),
  index("client_files_visibility_idx").on(table.clientId, table.visibility),
]);

// =============================================================================
// USER CLIENT ACCESS TABLE (Portal permissions)
// =============================================================================

export const userClientAccess = pgTable("user_client_access", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  clientId: varchar("client_id").references(() => clients.id, { onDelete: "cascade" }).notNull(),
  permissions: jsonb("permissions"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("user_client_access_user_idx").on(table.userId),
  index("user_client_access_client_idx").on(table.clientId),
  uniqueIndex("user_client_access_unique_idx").on(table.userId, table.clientId),
]);

// =============================================================================
// CLIENT DIVISIONS TABLES
// =============================================================================

/**
 * Division Member Role enum
 */
export const DivisionMemberRole = {
  ADMIN: "admin",
  MEMBER: "member",
} as const;

/**
 * Client Divisions table - represents organizational divisions/departments within a client
 * Divisions are OPTIONAL - clients without divisions continue working as-is
 */
export const clientDivisions = pgTable("client_divisions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  clientId: varchar("client_id").references(() => clients.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("client_divisions_tenant_idx").on(table.tenantId),
  index("client_divisions_client_idx").on(table.clientId),
  index("client_divisions_active_idx").on(table.isActive),
]);

/**
 * Division Members table - tracks which users belong to which divisions
 * Used for scoping visibility: employees see only projects in their divisions
 */
export const divisionMembers = pgTable("division_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  divisionId: varchar("division_id").references(() => clientDivisions.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  role: text("role").default("member"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("division_members_unique").on(table.divisionId, table.userId),
  index("division_members_tenant_idx").on(table.tenantId),
  index("division_members_user_idx").on(table.userId),
]);

// =============================================================================
// CLIENT NOTES & DOCUMENT LIBRARY TABLES
// =============================================================================

/**
 * Client Note Categories table - user-definable categories for client notes
 * Comes with predefined categories but allows custom additions
 */
export const ClientNoteCategory = {
  PROJECT: "project",
  FEEDBACK: "feedback",
  MEETING: "meeting",
  REQUIREMENT: "requirement",
  GENERAL: "general",
} as const;

export const clientNoteCategories = pgTable("client_note_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  name: text("name").notNull(),
  color: text("color"),
  isSystem: boolean("is_system").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("client_note_categories_tenant_idx").on(table.tenantId),
  uniqueIndex("client_note_categories_name_tenant_idx").on(table.tenantId, table.name),
]);

/**
 * Client Notes table - chronological notes attached to clients
 * Used for tracking project details, feedback, requirements, etc.
 * Tenant admins and employees can create, read, update, delete
 */
export const clientNotes = pgTable("client_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  clientId: varchar("client_id").references(() => clients.id).notNull(),
  authorUserId: varchar("author_user_id").references(() => users.id).notNull(),
  lastEditedByUserId: varchar("last_edited_by_user_id").references(() => users.id),
  body: jsonb("body").notNull(), // Rich text JSON format (TipTap)
  categoryId: varchar("category_id").references(() => clientNoteCategories.id),
  category: text("category").default("general"), // Fallback text category
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("client_notes_tenant_idx").on(table.tenantId),
  index("client_notes_client_idx").on(table.clientId),
  index("client_notes_created_at_idx").on(table.createdAt),
  index("client_notes_category_idx").on(table.categoryId),
]);

/**
 * Client Note Versions table - stores historical versions of notes
 * Each time a note is edited, the previous version is saved here
 */
export const clientNoteVersions = pgTable("client_note_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  noteId: varchar("note_id").references(() => clientNotes.id, { onDelete: "cascade" }).notNull(),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  editorUserId: varchar("editor_user_id").references(() => users.id).notNull(),
  body: jsonb("body").notNull(), // Rich text JSON format
  category: text("category"),
  categoryId: varchar("category_id").references(() => clientNoteCategories.id),
  versionNumber: integer("version_number").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("client_note_versions_note_idx").on(table.noteId),
  index("client_note_versions_tenant_idx").on(table.tenantId),
  index("client_note_versions_created_at_idx").on(table.createdAt),
]);

/**
 * Client Note Attachments table - file attachments for client notes
 */
export const clientNoteAttachments = pgTable("client_note_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  noteId: varchar("note_id").references(() => clientNotes.id, { onDelete: "cascade" }).notNull(),
  uploadedByUserId: varchar("uploaded_by_user_id").references(() => users.id).notNull(),
  originalFileName: text("original_file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSizeBytes: integer("file_size_bytes").notNull(),
  storageKey: text("storage_key").notNull(),
  uploadStatus: text("upload_status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("client_note_attachments_note_idx").on(table.noteId),
  index("client_note_attachments_tenant_idx").on(table.tenantId),
]);

/**
 * Client Document Categories table - user-definable categories for organizing documents
 */
export const clientDocumentCategories = pgTable("client_document_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  clientId: varchar("client_id").references(() => clients.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("client_doc_categories_tenant_idx").on(table.tenantId),
  index("client_doc_categories_client_idx").on(table.clientId),
  uniqueIndex("client_doc_categories_name_client_idx").on(table.clientId, table.name),
]);

/**
 * Client Documents table - document library for each client
 * Accepts all major file types, organized by categories
 * Tenant admins/employees and future client users can access
 */
export const clientDocuments = pgTable("client_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  clientId: varchar("client_id").references(() => clients.id).notNull(),
  categoryId: varchar("category_id").references(() => clientDocumentCategories.id),
  uploadedByUserId: varchar("uploaded_by_user_id").references(() => users.id).notNull(),
  originalFileName: text("original_file_name").notNull(),
  displayName: text("display_name"),
  description: text("description"),
  mimeType: text("mime_type").notNull(),
  fileSizeBytes: integer("file_size_bytes").notNull(),
  storageKey: text("storage_key").notNull(),
  uploadStatus: text("upload_status").notNull().default("pending"),
  isClientUploaded: boolean("is_client_uploaded").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("client_documents_tenant_idx").on(table.tenantId),
  index("client_documents_client_idx").on(table.clientId),
  index("client_documents_category_idx").on(table.categoryId),
  index("client_documents_created_at_idx").on(table.createdAt),
]);

// =============================================================================
// TIME TRACKING TABLES
// =============================================================================

/**
 * Time Entries table - records of time spent on tasks
 * Supports both timer-based and manual entries
 */
// Note: tenantId is nullable for backward compatibility during migration
export const timeEntries = pgTable("time_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  workspaceId: varchar("workspace_id").references(() => workspaces.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  clientId: varchar("client_id").references(() => clients.id),
  projectId: varchar("project_id").references(() => projects.id),
  taskId: varchar("task_id").references(() => tasks.id),
  subtaskId: varchar("subtask_id").references(() => subtasks.id),
  title: text("title"),
  description: text("description"),
  scope: text("scope").notNull().default("in_scope"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
  durationSeconds: integer("duration_seconds").notNull().default(0),
  isManual: boolean("is_manual").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("time_entries_user_idx").on(table.userId),
  index("time_entries_client_idx").on(table.clientId),
  index("time_entries_project_idx").on(table.projectId),
  index("time_entries_task_idx").on(table.taskId),
  index("time_entries_subtask_idx").on(table.subtaskId),
  index("time_entries_date_idx").on(table.startTime),
  index("time_entries_tenant_idx").on(table.tenantId),
]);

/**
 * Active Timers table - tracks currently running timers
 * Each user can have only one active timer at a time
 * Note: tenantId is nullable for backward compatibility during migration
 */
export const activeTimers = pgTable("active_timers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  workspaceId: varchar("workspace_id").references(() => workspaces.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  clientId: varchar("client_id").references(() => clients.id),
  projectId: varchar("project_id").references(() => projects.id),
  taskId: varchar("task_id").references(() => tasks.id),
  title: text("title"),
  description: text("description"),
  status: text("status").notNull().default("running"),
  elapsedSeconds: integer("elapsed_seconds").notNull().default(0),
  lastStartedAt: timestamp("last_started_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("active_timers_user_unique").on(table.userId),
  index("active_timers_tenant_idx").on(table.tenantId),
]);

// Projects table
// Note: clientId and tenantId are nullable for backward compatibility
export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  workspaceId: varchar("workspace_id").references(() => workspaces.id).notNull(),
  teamId: varchar("team_id").references(() => teams.id),
  clientId: varchar("client_id").references(() => clients.id),
  divisionId: varchar("division_id").references(() => clientDivisions.id), // Optional: project belongs to a client division
  name: text("name").notNull(),
  description: text("description"),
  visibility: text("visibility").notNull().default("workspace"),
  status: text("status").notNull().default("active"),
  color: text("color").default("#3B82F6"),
  budgetMinutes: integer("budget_minutes"), // Optional project budget in minutes for workload forecasting
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("projects_client_idx").on(table.clientId),
  index("projects_tenant_idx").on(table.tenantId),
  index("projects_division_idx").on(table.divisionId),
]);

// Project Members table
export const projectMembers = pgTable("project_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  role: text("role").default("member"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("project_members_unique").on(table.projectId, table.userId),
]);

// Hidden Projects table - tracks which users have hidden which projects from their view
export const hiddenProjects = pgTable("hidden_projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("hidden_projects_unique").on(table.projectId, table.userId),
]);

// Project Templates table - tenant-managed templates for creating projects with predefined sections/tasks
export const projectTemplates = pgTable("project_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").default("general"), // e.g., 'client_onboarding', 'website_build', 'general'
  isDefault: boolean("is_default").default(false), // Whether this is a default template
  content: jsonb("content").notNull(), // JSON structure with sections and tasks
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("project_templates_tenant_idx").on(table.tenantId),
]);

// Sections table
export const sections = pgTable("sections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id).notNull(),
  name: text("name").notNull(),
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("sections_project_order_idx").on(table.projectId, table.orderIndex),
]);

// Tasks table
// Note: projectId is nullable to support personal tasks (isPersonal=true)
// Note: tenantId is nullable for backward compatibility during migration
export const tasks = pgTable("tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  projectId: varchar("project_id").references(() => projects.id),
  sectionId: varchar("section_id").references(() => sections.id),
  parentTaskId: varchar("parent_task_id"),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("todo"),
  priority: text("priority").notNull().default("medium"),
  startDate: timestamp("start_date"),
  dueDate: timestamp("due_date"),
  estimateMinutes: integer("estimate_minutes"), // Optional task estimate in minutes for workload forecasting
  isPersonal: boolean("is_personal").notNull().default(false),
  createdBy: varchar("created_by").references(() => users.id),
  orderIndex: integer("order_index").notNull().default(0),
  // Personal task organization fields (only used when isPersonal=true)
  personalSectionId: varchar("personal_section_id"),
  personalSortOrder: integer("personal_sort_order"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("tasks_project_section_order").on(table.projectId, table.sectionId, table.orderIndex),
  index("tasks_due_date").on(table.dueDate),
  index("tasks_parent_order").on(table.parentTaskId, table.orderIndex),
  index("tasks_personal_user").on(table.isPersonal, table.createdBy),
  index("tasks_tenant_idx").on(table.tenantId),
  index("tasks_personal_section_idx").on(table.personalSectionId, table.personalSortOrder),
]);

// Task Assignees table (for multiple assignees)
export const taskAssignees = pgTable("task_assignees", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  taskId: varchar("task_id").references(() => tasks.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("task_assignees_unique").on(table.taskId, table.userId),
  index("task_assignees_user").on(table.userId),
  index("task_assignees_tenant_idx").on(table.tenantId),
]);

// Task Watchers table (users who want to be notified about task changes but aren't assigned)
export const taskWatchers = pgTable("task_watchers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  taskId: varchar("task_id").references(() => tasks.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("task_watchers_unique").on(table.taskId, table.userId),
  index("task_watchers_user").on(table.userId),
  index("task_watchers_tenant_idx").on(table.tenantId),
]);

// Personal Task Sections table - user-defined sections for organizing personal tasks in My Tasks view
export const personalTaskSections = pgTable("personal_task_sections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  userId: varchar("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("personal_task_sections_user_idx").on(table.userId),
  index("personal_task_sections_tenant_idx").on(table.tenantId),
]);

// Subtasks table
export const subtasks = pgTable("subtasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").references(() => tasks.id).notNull(),
  title: text("title").notNull(),
  description: jsonb("description"),
  completed: boolean("completed").default(false).notNull(),
  status: text("status").default("todo").notNull(),
  priority: text("priority").default("medium").notNull(),
  assigneeId: varchar("assignee_id").references(() => users.id),
  dueDate: timestamp("due_date"),
  estimateMinutes: integer("estimate_minutes"),
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("subtasks_task_order").on(table.taskId, table.orderIndex),
]);

// Subtask Assignees junction table (for multiple assignees)
export const subtaskAssignees = pgTable("subtask_assignees", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  subtaskId: varchar("subtask_id").references(() => subtasks.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("subtask_assignees_unique").on(table.subtaskId, table.userId),
  index("subtask_assignees_user").on(table.userId),
  index("subtask_assignees_tenant_idx").on(table.tenantId),
]);

// Subtask Tags junction table
export const subtaskTags = pgTable("subtask_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  subtaskId: varchar("subtask_id").references(() => subtasks.id).notNull(),
  tagId: varchar("tag_id").references(() => tags.id).notNull(),
}, (table) => [
  uniqueIndex("subtask_tags_unique").on(table.subtaskId, table.tagId),
  index("subtask_tags_tag").on(table.tagId),
]);

// Tags table
export const tags = pgTable("tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").references(() => workspaces.id).notNull(),
  name: text("name").notNull(),
  color: text("color").default("#6B7280"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("tags_workspace_name_unique").on(table.workspaceId, table.name),
]);

// Task Tags junction table
export const taskTags = pgTable("task_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").references(() => tasks.id).notNull(),
  tagId: varchar("tag_id").references(() => tags.id).notNull(),
}, (table) => [
  uniqueIndex("task_tags_unique").on(table.taskId, table.tagId),
  index("task_tags_tag").on(table.tagId),
]);

// Comments table - supports comments on both tasks and subtasks
export const comments = pgTable("comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").references(() => tasks.id),
  subtaskId: varchar("subtask_id").references(() => subtasks.id),
  userId: varchar("user_id").references(() => users.id).notNull(),
  body: text("body").notNull(),
  isResolved: boolean("is_resolved").default(false).notNull(),
  resolvedAt: timestamp("resolved_at"),
  resolvedByUserId: varchar("resolved_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("comments_task_created").on(table.taskId, table.createdAt),
  index("comments_subtask_created").on(table.subtaskId, table.createdAt),
]);

// Activity Log table
export const activityLog = pgTable("activity_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").references(() => workspaces.id).notNull(),
  actorUserId: varchar("actor_user_id").references(() => users.id).notNull(),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id").notNull(),
  action: text("action").notNull(),
  diffJson: jsonb("diff_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("activity_log_entity_idx").on(table.entityType, table.entityId),
  index("activity_log_workspace_idx").on(table.workspaceId),
  index("activity_log_created_idx").on(table.createdAt),
]);

// Notification type enum
export const NotificationType = {
  TASK_DEADLINE: "task_deadline",
  TASK_ASSIGNED: "task_assigned",
  TASK_COMPLETED: "task_completed",
  COMMENT_ADDED: "comment_added",
  COMMENT_MENTION: "comment_mention",
  PROJECT_UPDATE: "project_update",
  PROJECT_MEMBER_ADDED: "project_member_added",
  TASK_STATUS_CHANGED: "task_status_changed",
} as const;

// Notifications table
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  userId: varchar("user_id").references(() => users.id).notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message"),
  payloadJson: jsonb("payload_json"),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("notifications_user_idx").on(table.userId),
  index("notifications_tenant_idx").on(table.tenantId),
  index("notifications_created_idx").on(table.createdAt),
]);

// Notification preferences table
export const notificationPreferences = pgTable("notification_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  userId: varchar("user_id").references(() => users.id).notNull(),
  taskDeadline: boolean("task_deadline").default(true).notNull(),
  taskAssigned: boolean("task_assigned").default(true).notNull(),
  taskCompleted: boolean("task_completed").default(true).notNull(),
  commentAdded: boolean("comment_added").default(true).notNull(),
  commentMention: boolean("comment_mention").default(true).notNull(),
  projectUpdate: boolean("project_update").default(true).notNull(),
  projectMemberAdded: boolean("project_member_added").default(true).notNull(),
  taskStatusChanged: boolean("task_status_changed").default(false).notNull(),
  emailEnabled: boolean("email_enabled").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("notification_preferences_user_idx").on(table.userId),
]);

// Upload Status enum
export const UploadStatus = {
  PENDING: "pending",
  COMPLETE: "complete",
  FAILED: "failed",
} as const;

// Task Attachments table
export const taskAttachments = pgTable("task_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").references(() => tasks.id).notNull(),
  projectId: varchar("project_id").references(() => projects.id).notNull(),
  uploadedByUserId: varchar("uploaded_by_user_id").references(() => users.id).notNull(),
  originalFileName: text("original_file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSizeBytes: integer("file_size_bytes").notNull(),
  storageKey: text("storage_key").notNull(),
  uploadStatus: text("upload_status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("task_attachments_task").on(table.taskId),
  index("task_attachments_project").on(table.projectId),
]);

// =============================================================================
// USER MANAGEMENT & AUTH TABLES
// =============================================================================

/**
 * Invitations table - for inviting admin/employee/client users
 * Tokens are hashed before storage for security
 */
// Note: tenantId is optional to maintain backward compatibility
export const invitations = pgTable("invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  workspaceId: varchar("workspace_id").references(() => workspaces.id).notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("employee"),
  clientId: varchar("client_id").references(() => clients.id),
  tokenHash: text("token_hash").notNull(),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdByUserId: varchar("created_by_user_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("invitations_email_idx").on(table.email),
  index("invitations_workspace_idx").on(table.workspaceId),
  index("invitations_status_idx").on(table.status),
  index("invitations_tenant_idx").on(table.tenantId),
]);

/**
 * Platform Invitations table - for inviting platform administrators (super_user)
 * Separate from tenant invitations as these have no tenantId/workspaceId
 * Tokens are hashed before storage for security
 */
export const platformInvitations = pgTable("platform_invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull(),
  status: text("status").notNull().default("pending"), // pending, accepted, expired, revoked
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  revokedAt: timestamp("revoked_at"),
  targetUserId: varchar("target_user_id").references(() => users.id), // The user this invite is for
  createdByUserId: varchar("created_by_user_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("platform_invitations_email_idx").on(table.email),
  index("platform_invitations_status_idx").on(table.status),
  index("platform_invitations_target_user_idx").on(table.targetUserId),
]);

/**
 * Password Reset Tokens table - for password reset flow
 * Tokens are hashed before storage for security
 * createdByUserId is nullable - null means user-initiated, set means admin-initiated
 */
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdByUserId: varchar("created_by_user_id").references(() => users.id), // null = user-initiated, set = admin-initiated
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("password_reset_tokens_user_idx").on(table.userId),
  index("password_reset_tokens_expires_idx").on(table.expiresAt),
]);

/**
 * Platform Audit Events table - for auditing platform admin actions
 * Separate from tenant audit events as these are platform-level
 */
export const platformAuditEvents = pgTable("platform_audit_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  actorUserId: varchar("actor_user_id").references(() => users.id),
  targetUserId: varchar("target_user_id").references(() => users.id),
  eventType: text("event_type").notNull(),
  message: text("message").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("platform_audit_events_actor_idx").on(table.actorUserId),
  index("platform_audit_events_target_idx").on(table.targetUserId),
  index("platform_audit_events_type_idx").on(table.eventType),
  index("platform_audit_events_created_at_idx").on(table.createdAt),
]);

/**
 * Client User Access table - grants client portal users access to specific clients
 * Only users with role='client' should have records here
 */
export const clientUserAccess = pgTable("client_user_access", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").references(() => workspaces.id).notNull(),
  clientId: varchar("client_id").references(() => clients.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  accessLevel: text("access_level").notNull().default("viewer"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("client_user_access_unique").on(table.clientId, table.userId),
  index("client_user_access_user_idx").on(table.userId),
]);

/**
 * App Settings table - stores encrypted global settings (e.g., Mailgun config)
 * Values are encrypted server-side using APP_ENCRYPTION_KEY
 */
// Note: tenantId is nullable for backward compatibility during migration
export const appSettings = pgTable("app_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  workspaceId: varchar("workspace_id").references(() => workspaces.id).notNull(),
  key: varchar("key", { length: 255 }).notNull(),
  valueEncrypted: text("value_encrypted").notNull(),
  updatedByUserId: varchar("updated_by_user_id").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("app_settings_workspace_key_unique").on(table.workspaceId, table.key),
  index("app_settings_tenant_idx").on(table.tenantId),
]);

/**
 * System Settings table - platform-wide configuration (single-row)
 * Stores global defaults used when tenants haven't configured their own settings
 * Also stores global Mailgun and S3 integration configuration
 */
export const systemSettings = pgTable("system_settings", {
  id: integer("id").primaryKey().default(1), // Single-row table, id always 1
  defaultAppName: text("default_app_name"),
  defaultLogoUrl: text("default_logo_url"),
  defaultIconUrl: text("default_icon_url"),
  defaultFaviconUrl: text("default_favicon_url"),
  defaultPrimaryColor: text("default_primary_color"),
  defaultSecondaryColor: text("default_secondary_color"),
  supportEmail: text("support_email"),
  platformVersion: text("platform_version"),
  maintenanceMode: boolean("maintenance_mode").default(false),
  maintenanceMessage: text("maintenance_message"),
  // Global Mailgun Integration (platform-wide)
  mailgunDomain: text("mailgun_domain"),
  mailgunFromEmail: text("mailgun_from_email"),
  mailgunRegion: text("mailgun_region"), // "US" or "EU"
  mailgunApiKeyEncrypted: text("mailgun_api_key_encrypted"),
  mailgunSigningKeyEncrypted: text("mailgun_signing_key_encrypted"),
  mailgunLastTestedAt: timestamp("mailgun_last_tested_at"),
  // Global S3 Integration (platform-wide)
  s3Region: text("s3_region"),
  s3BucketName: text("s3_bucket_name"),
  s3PublicBaseUrl: text("s3_public_base_url"),
  s3CloudfrontUrl: text("s3_cloudfront_url"),
  s3AccessKeyIdEncrypted: text("s3_access_key_id_encrypted"),
  s3SecretAccessKeyEncrypted: text("s3_secret_access_key_encrypted"),
  s3LastTestedAt: timestamp("s3_last_tested_at"),
  // Global Stripe Integration (platform-wide billing)
  stripePublishableKey: text("stripe_publishable_key"),
  stripeSecretKeyEncrypted: text("stripe_secret_key_encrypted"),
  stripeWebhookSecretEncrypted: text("stripe_webhook_secret_encrypted"),
  stripeDefaultCurrency: text("stripe_default_currency").default("usd"),
  stripeLastTestedAt: timestamp("stripe_last_tested_at"),
  // Chat retention settings (platform default)
  chatRetentionDays: integer("chat_retention_days").default(365), // Default 365 days
  // AI Integration (OpenAI/ChatGPT) - Platform-wide for all tenants
  aiEnabled: boolean("ai_enabled").default(false),
  aiProvider: text("ai_provider").default("openai"), // "openai" for now, extensible later
  aiModel: text("ai_model").default("gpt-4o-mini"), // Default to cost-effective model
  aiApiKeyEncrypted: text("ai_api_key_encrypted"),
  aiMaxTokens: integer("ai_max_tokens").default(2000),
  aiTemperature: text("ai_temperature").default("0.7"), // Stored as text for precision
  aiLastTestedAt: timestamp("ai_last_tested_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Comment Mentions table - tracks @mentions in task comments
 * Links mentioned users to comments for notifications
 */
export const commentMentions = pgTable("comment_mentions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  commentId: varchar("comment_id").references(() => comments.id).notNull(),
  mentionedUserId: varchar("mentioned_user_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("comment_mentions_comment_idx").on(table.commentId),
  index("comment_mentions_user_idx").on(table.mentionedUserId, table.createdAt),
]);

// =============================================================================
// CHAT TABLES (Slack-like messaging)
// =============================================================================

/**
 * Chat channel member role enum
 */
export const ChatChannelMemberRole = {
  OWNER: "owner",
  ADMIN: "admin",
  MEMBER: "member",
} as const;

/**
 * Chat Channels table - public or private channels for team communication
 */
export const chatChannels = pgTable("chat_channels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  name: text("name").notNull(),
  isPrivate: boolean("is_private").notNull().default(false),
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("chat_channels_tenant_idx").on(table.tenantId),
  index("chat_channels_created_by_idx").on(table.createdBy),
  uniqueIndex("chat_channels_tenant_name_unique").on(table.tenantId, sql`lower(${table.name})`),
]);

/**
 * Chat Channel Members table - users who belong to a channel
 */
export const chatChannelMembers = pgTable("chat_channel_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  channelId: varchar("channel_id").references(() => chatChannels.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  role: text("role").notNull().default("member"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("chat_channel_members_tenant_idx").on(table.tenantId),
  index("chat_channel_members_channel_idx").on(table.channelId),
  index("chat_channel_members_user_idx").on(table.userId),
  uniqueIndex("chat_channel_members_channel_user_unique").on(table.channelId, table.userId),
]);

/**
 * Chat DM Threads table - direct message conversations between users
 */
export const chatDmThreads = pgTable("chat_dm_threads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("chat_dm_threads_tenant_idx").on(table.tenantId),
]);

/**
 * Chat DM Members table - users participating in a DM thread
 */
export const chatDmMembers = pgTable("chat_dm_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  dmThreadId: varchar("dm_thread_id").references(() => chatDmThreads.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("chat_dm_members_tenant_idx").on(table.tenantId),
  index("chat_dm_members_thread_idx").on(table.dmThreadId),
  index("chat_dm_members_user_idx").on(table.userId),
  uniqueIndex("chat_dm_members_thread_user_unique").on(table.dmThreadId, table.userId),
]);

/**
 * Chat Messages table - messages in channels or DM threads
 * Constraint: Either channelId OR dmThreadId must be set, but not both
 */
export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  channelId: varchar("channel_id").references(() => chatChannels.id),
  dmThreadId: varchar("dm_thread_id").references(() => chatDmThreads.id),
  authorUserId: varchar("author_user_id").references(() => users.id).notNull(),
  body: text("body").notNull(),
  parentMessageId: varchar("parent_message_id"), // For threaded replies - nullable, self-referencing (one level only)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  editedAt: timestamp("edited_at"),
  deletedAt: timestamp("deleted_at"),
  archivedAt: timestamp("archived_at"), // Soft archive for retention policy
}, (table) => [
  index("chat_messages_tenant_idx").on(table.tenantId),
  index("chat_messages_channel_idx").on(table.channelId),
  index("chat_messages_dm_thread_idx").on(table.dmThreadId),
  index("chat_messages_author_idx").on(table.authorUserId),
  index("chat_messages_created_idx").on(table.createdAt),
  index("chat_messages_archived_idx").on(table.archivedAt),
  index("chat_messages_tenant_channel_created_idx").on(table.tenantId, table.channelId, table.createdAt),
  index("chat_messages_tenant_dm_created_idx").on(table.tenantId, table.dmThreadId, table.createdAt),
  index("chat_messages_parent_idx").on(table.parentMessageId), // For thread replies lookup
]);

/**
 * Chat Attachments table - file attachments for chat messages
 * Files are stored in S3 using the hierarchical storage resolver
 */
export const chatAttachments = pgTable("chat_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  messageId: varchar("message_id").references(() => chatMessages.id), // Nullable until linked to a message
  s3Key: text("s3_key").notNull(),
  url: text("url").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("chat_attachments_tenant_idx").on(table.tenantId),
  index("chat_attachments_message_idx").on(table.messageId),
]);

/**
 * Tracks last read message per user per channel/DM thread for unread badge counts
 */
export const chatReads = pgTable("chat_reads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  channelId: varchar("channel_id").references(() => chatChannels.id),
  dmThreadId: varchar("dm_thread_id").references(() => chatDmThreads.id),
  lastReadMessageId: varchar("last_read_message_id").references(() => chatMessages.id),
  lastReadAt: timestamp("last_read_at").defaultNow().notNull(),
}, (table) => [
  index("chat_reads_tenant_idx").on(table.tenantId),
  index("chat_reads_user_idx").on(table.userId),
  index("chat_reads_channel_idx").on(table.channelId),
  index("chat_reads_dm_thread_idx").on(table.dmThreadId),
  uniqueIndex("chat_reads_user_channel_unique").on(table.userId, table.channelId),
  uniqueIndex("chat_reads_user_dm_unique").on(table.userId, table.dmThreadId),
]);

/**
 * Chat Mentions table - tracks @mentions in chat messages
 * Used for highlighting mentions and optional notification
 */
export const chatMentions = pgTable("chat_mentions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  messageId: varchar("message_id").references(() => chatMessages.id).notNull(),
  mentionedUserId: varchar("mentioned_user_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("chat_mentions_tenant_idx").on(table.tenantId),
  index("chat_mentions_message_idx").on(table.messageId),
  index("chat_mentions_user_idx").on(table.mentionedUserId),
]);

/**
 * Chat Export Jobs - Tracks background export jobs for chat data backup
 * Super Admin only feature for exporting chat data before purge
 */
export const chatExportJobs = pgTable("chat_export_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requestedByUserId: varchar("requested_by_user_id").references(() => users.id).notNull(),
  scopeType: varchar("scope_type", { length: 20 }).notNull(), // "tenant" | "all"
  tenantId: varchar("tenant_id").references(() => tenants.id), // Nullable for "all" scope
  cutoffType: varchar("cutoff_type", { length: 20 }).notNull(), // "date" | "retention"
  cutoffDate: timestamp("cutoff_date"), // Used when cutoffType is "date"
  retainDays: integer("retain_days"), // Used when cutoffType is "retention"
  includeAttachmentFiles: boolean("include_attachment_files").default(false).notNull(),
  format: varchar("format", { length: 10 }).default("jsonl").notNull(), // "jsonl" | "json" | "csv"
  status: varchar("status", { length: 20 }).default("queued").notNull(), // "queued" | "processing" | "completed" | "failed"
  progress: jsonb("progress"), // { phase, processedMessages, totalMessages, processedChannels, totalChannels, processedDms, totalDms }
  outputLocation: jsonb("output_location"), // { bucket, key, size }
  error: text("error"),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("chat_export_jobs_user_idx").on(table.requestedByUserId),
  index("chat_export_jobs_tenant_idx").on(table.tenantId),
  index("chat_export_jobs_status_idx").on(table.status),
  index("chat_export_jobs_created_idx").on(table.createdAt),
]);

// =============================================================================
// RELATIONS
// =============================================================================

// Tenant Relations
export const tenantsRelations = relations(tenants, ({ one, many }) => ({
  settings: one(tenantSettings, {
    fields: [tenants.id],
    references: [tenantSettings.tenantId],
  }),
  integrations: many(tenantIntegrations),
  users: many(users),
  teams: many(teams),
  clients: many(clients),
  projects: many(projects),
  tasks: many(tasks),
  timeEntries: many(timeEntries),
  activeTimers: many(activeTimers),
  invitations: many(invitations),
  appSettings: many(appSettings),
}));

export const tenantSettingsRelations = relations(tenantSettings, ({ one }) => ({
  tenant: one(tenants, {
    fields: [tenantSettings.tenantId],
    references: [tenants.id],
  }),
}));

export const tenantIntegrationsRelations = relations(tenantIntegrations, ({ one }) => ({
  tenant: one(tenants, {
    fields: [tenantIntegrations.tenantId],
    references: [tenants.id],
  }),
}));

// User Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [users.tenantId],
    references: [tenants.id],
  }),
  workspaceMembers: many(workspaceMembers),
  teamMembers: many(teamMembers),
  projectMembers: many(projectMembers),
  taskAssignees: many(taskAssignees),
  comments: many(comments),
  clientUserAccess: many(clientUserAccess),
  invitationsCreated: many(invitations),
  commentMentions: many(commentMentions),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  createdByUser: one(users, {
    fields: [workspaces.createdBy],
    references: [users.id],
  }),
  members: many(workspaceMembers),
  teams: many(teams),
  projects: many(projects),
  tags: many(tags),
}));

export const workspaceMembersRelations = relations(workspaceMembers, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceMembers.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, {
    fields: [workspaceMembers.userId],
    references: [users.id],
  }),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [teams.workspaceId],
    references: [workspaces.id],
  }),
  members: many(teamMembers),
  projects: many(projects),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id],
  }),
  user: one(users, {
    fields: [teamMembers.userId],
    references: [users.id],
  }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [projects.workspaceId],
    references: [workspaces.id],
  }),
  team: one(teams, {
    fields: [projects.teamId],
    references: [teams.id],
  }),
  client: one(clients, {
    fields: [projects.clientId],
    references: [clients.id],
  }),
  division: one(clientDivisions, {
    fields: [projects.divisionId],
    references: [clientDivisions.id],
  }),
  createdByUser: one(users, {
    fields: [projects.createdBy],
    references: [users.id],
  }),
  members: many(projectMembers),
  sections: many(sections),
  tasks: many(tasks),
}));

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, {
    fields: [projectMembers.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [projectMembers.userId],
    references: [users.id],
  }),
}));

export const hiddenProjectsRelations = relations(hiddenProjects, ({ one }) => ({
  project: one(projects, {
    fields: [hiddenProjects.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [hiddenProjects.userId],
    references: [users.id],
  }),
}));

export const sectionsRelations = relations(sections, ({ one, many }) => ({
  project: one(projects, {
    fields: [sections.projectId],
    references: [projects.id],
  }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  section: one(sections, {
    fields: [tasks.sectionId],
    references: [sections.id],
  }),
  createdByUser: one(users, {
    fields: [tasks.createdBy],
    references: [users.id],
  }),
  parentTask: one(tasks, {
    fields: [tasks.parentTaskId],
    references: [tasks.id],
    relationName: "parentChild",
  }),
  childTasks: many(tasks, {
    relationName: "parentChild",
  }),
  assignees: many(taskAssignees),
  watchers: many(taskWatchers),
  subtasks: many(subtasks),
  tags: many(taskTags),
  comments: many(comments),
  attachments: many(taskAttachments),
}));

export const taskAttachmentsRelations = relations(taskAttachments, ({ one }) => ({
  task: one(tasks, {
    fields: [taskAttachments.taskId],
    references: [tasks.id],
  }),
  project: one(projects, {
    fields: [taskAttachments.projectId],
    references: [projects.id],
  }),
  uploadedByUser: one(users, {
    fields: [taskAttachments.uploadedByUserId],
    references: [users.id],
  }),
}));

export const taskAssigneesRelations = relations(taskAssignees, ({ one }) => ({
  task: one(tasks, {
    fields: [taskAssignees.taskId],
    references: [tasks.id],
  }),
  user: one(users, {
    fields: [taskAssignees.userId],
    references: [users.id],
  }),
  tenant: one(tenants, {
    fields: [taskAssignees.tenantId],
    references: [tenants.id],
  }),
}));

export const taskWatchersRelations = relations(taskWatchers, ({ one }) => ({
  task: one(tasks, {
    fields: [taskWatchers.taskId],
    references: [tasks.id],
  }),
  user: one(users, {
    fields: [taskWatchers.userId],
    references: [users.id],
  }),
  tenant: one(tenants, {
    fields: [taskWatchers.tenantId],
    references: [tenants.id],
  }),
}));

export const personalTaskSectionsRelations = relations(personalTaskSections, ({ one, many }) => ({
  user: one(users, {
    fields: [personalTaskSections.userId],
    references: [users.id],
  }),
  tenant: one(tenants, {
    fields: [personalTaskSections.tenantId],
    references: [tenants.id],
  }),
}));

export const subtasksRelations = relations(subtasks, ({ one, many }) => ({
  task: one(tasks, {
    fields: [subtasks.taskId],
    references: [tasks.id],
  }),
  assignee: one(users, {
    fields: [subtasks.assigneeId],
    references: [users.id],
  }),
  assignees: many(subtaskAssignees),
  tags: many(subtaskTags),
}));

export const subtaskAssigneesRelations = relations(subtaskAssignees, ({ one }) => ({
  subtask: one(subtasks, {
    fields: [subtaskAssignees.subtaskId],
    references: [subtasks.id],
  }),
  user: one(users, {
    fields: [subtaskAssignees.userId],
    references: [users.id],
  }),
  tenant: one(tenants, {
    fields: [subtaskAssignees.tenantId],
    references: [tenants.id],
  }),
}));

export const subtaskTagsRelations = relations(subtaskTags, ({ one }) => ({
  subtask: one(subtasks, {
    fields: [subtaskTags.subtaskId],
    references: [subtasks.id],
  }),
  tag: one(tags, {
    fields: [subtaskTags.tagId],
    references: [tags.id],
  }),
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [tags.workspaceId],
    references: [workspaces.id],
  }),
  taskTags: many(taskTags),
  subtaskTags: many(subtaskTags),
}));

export const taskTagsRelations = relations(taskTags, ({ one }) => ({
  task: one(tasks, {
    fields: [taskTags.taskId],
    references: [tasks.id],
  }),
  tag: one(tags, {
    fields: [taskTags.tagId],
    references: [tags.id],
  }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  task: one(tasks, {
    fields: [comments.taskId],
    references: [tasks.id],
  }),
  user: one(users, {
    fields: [comments.userId],
    references: [users.id],
  }),
}));

// =============================================================================
// CLIENT MANAGEMENT RELATIONS
// =============================================================================

export const clientsRelations = relations(clients, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [clients.workspaceId],
    references: [workspaces.id],
  }),
  contacts: many(clientContacts),
  invites: many(clientInvites),
  projects: many(projects),
  divisions: many(clientDivisions),
}));

export const clientContactsRelations = relations(clientContacts, ({ one, many }) => ({
  client: one(clients, {
    fields: [clientContacts.clientId],
    references: [clients.id],
  }),
  workspace: one(workspaces, {
    fields: [clientContacts.workspaceId],
    references: [workspaces.id],
  }),
  invites: many(clientInvites),
}));

export const clientInvitesRelations = relations(clientInvites, ({ one }) => ({
  client: one(clients, {
    fields: [clientInvites.clientId],
    references: [clients.id],
  }),
  contact: one(clientContacts, {
    fields: [clientInvites.contactId],
    references: [clientContacts.id],
  }),
}));

// =============================================================================
// CLIENT DIVISIONS RELATIONS
// =============================================================================

export const clientDivisionsRelations = relations(clientDivisions, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [clientDivisions.tenantId],
    references: [tenants.id],
  }),
  client: one(clients, {
    fields: [clientDivisions.clientId],
    references: [clients.id],
  }),
  members: many(divisionMembers),
  projects: many(projects),
}));

export const divisionMembersRelations = relations(divisionMembers, ({ one }) => ({
  tenant: one(tenants, {
    fields: [divisionMembers.tenantId],
    references: [tenants.id],
  }),
  division: one(clientDivisions, {
    fields: [divisionMembers.divisionId],
    references: [clientDivisions.id],
  }),
  user: one(users, {
    fields: [divisionMembers.userId],
    references: [users.id],
  }),
}));

// Time Tracking Relations
export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [timeEntries.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, {
    fields: [timeEntries.userId],
    references: [users.id],
  }),
  client: one(clients, {
    fields: [timeEntries.clientId],
    references: [clients.id],
  }),
  project: one(projects, {
    fields: [timeEntries.projectId],
    references: [projects.id],
  }),
  task: one(tasks, {
    fields: [timeEntries.taskId],
    references: [tasks.id],
  }),
  subtask: one(subtasks, {
    fields: [timeEntries.subtaskId],
    references: [subtasks.id],
  }),
}));

export const activeTimersRelations = relations(activeTimers, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [activeTimers.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, {
    fields: [activeTimers.userId],
    references: [users.id],
  }),
  client: one(clients, {
    fields: [activeTimers.clientId],
    references: [clients.id],
  }),
  project: one(projects, {
    fields: [activeTimers.projectId],
    references: [projects.id],
  }),
  task: one(tasks, {
    fields: [activeTimers.taskId],
    references: [tasks.id],
  }),
}));

// =============================================================================
// USER MANAGEMENT & AUTH RELATIONS
// =============================================================================

export const invitationsRelations = relations(invitations, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [invitations.workspaceId],
    references: [workspaces.id],
  }),
  client: one(clients, {
    fields: [invitations.clientId],
    references: [clients.id],
  }),
  createdBy: one(users, {
    fields: [invitations.createdByUserId],
    references: [users.id],
  }),
}));

export const clientUserAccessRelations = relations(clientUserAccess, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [clientUserAccess.workspaceId],
    references: [workspaces.id],
  }),
  client: one(clients, {
    fields: [clientUserAccess.clientId],
    references: [clients.id],
  }),
  user: one(users, {
    fields: [clientUserAccess.userId],
    references: [users.id],
  }),
}));

export const appSettingsRelations = relations(appSettings, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [appSettings.workspaceId],
    references: [workspaces.id],
  }),
  updatedBy: one(users, {
    fields: [appSettings.updatedByUserId],
    references: [users.id],
  }),
}));

export const commentMentionsRelations = relations(commentMentions, ({ one }) => ({
  comment: one(comments, {
    fields: [commentMentions.commentId],
    references: [comments.id],
  }),
  mentionedUser: one(users, {
    fields: [commentMentions.mentionedUserId],
    references: [users.id],
  }),
}));

// Insert Schemas
export const insertTenantSchema = createInsertSchema(tenants).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTenantSettingsSchema = createInsertSchema(tenantSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTenantIntegrationSchema = createInsertSchema(tenantIntegrations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEmailOutboxSchema = createInsertSchema(emailOutbox).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertErrorLogSchema = createInsertSchema(errorLogs).omit({
  id: true,
  createdAt: true,
});

export const insertTenancyWarningSchema = createInsertSchema(tenancyWarnings).omit({
  id: true,
  occurredAt: true,
});

export const insertTenantAgreementSchema = createInsertSchema(tenantAgreements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTenantAgreementAcceptanceSchema = createInsertSchema(tenantAgreementAcceptances).omit({
  id: true,
  acceptedAt: true,
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWorkspaceSchema = createInsertSchema(workspaces).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWorkspaceMemberSchema = createInsertSchema(workspaceMembers).omit({
  id: true,
  createdAt: true,
});

export const insertTeamSchema = createInsertSchema(teams).omit({
  id: true,
  createdAt: true,
});

export const insertTeamMemberSchema = createInsertSchema(teamMembers).omit({
  id: true,
  createdAt: true,
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProjectMemberSchema = createInsertSchema(projectMembers).omit({
  id: true,
  createdAt: true,
});

export const insertProjectTemplateSchema = createInsertSchema(projectTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSectionSchema = createInsertSchema(sections).omit({
  id: true,
  createdAt: true,
});

// Helper to coerce date strings to Date objects (for JSON API compatibility)
const coercedDate = z.preprocess(
  (val) => (typeof val === 'string' ? new Date(val) : val),
  z.date().nullable().optional()
);

export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  // Override date fields to accept ISO strings from JSON
  startDate: coercedDate,
  dueDate: coercedDate,
});

export const insertTaskAssigneeSchema = createInsertSchema(taskAssignees).omit({
  id: true,
  createdAt: true,
});

export const insertTaskWatcherSchema = createInsertSchema(taskWatchers).omit({
  id: true,
  createdAt: true,
});

export const insertPersonalTaskSectionSchema = createInsertSchema(personalTaskSections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSubtaskSchema = createInsertSchema(subtasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  // Override date field to accept ISO strings from JSON
  dueDate: coercedDate,
});

export const insertTagSchema = createInsertSchema(tags).omit({
  id: true,
  createdAt: true,
});

export const insertTaskTagSchema = createInsertSchema(taskTags).omit({
  id: true,
});

export const insertSubtaskAssigneeSchema = createInsertSchema(subtaskAssignees).omit({
  id: true,
  createdAt: true,
});

export const insertSubtaskTagSchema = createInsertSchema(subtaskTags).omit({
  id: true,
});

export const insertCommentSchema = createInsertSchema(comments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertActivityLogSchema = createInsertSchema(activityLog).omit({
  id: true,
  createdAt: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

export const insertNotificationPreferencesSchema = createInsertSchema(notificationPreferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTaskAttachmentSchema = createInsertSchema(taskAttachments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Client Insert Schemas
export const insertClientSchema = createInsertSchema(clients).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertClientContactSchema = createInsertSchema(clientContacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertClientCrmSchema = createInsertSchema(clientCrm).omit({
  createdAt: true,
  updatedAt: true,
});

export const updateClientCrmSchema = z.object({
  status: z.enum(["lead", "prospect", "active", "past", "on_hold"]).optional(),
  ownerUserId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  lastContactAt: z.string().datetime().nullable().optional(),
  nextFollowUpAt: z.string().datetime().nullable().optional(),
  followUpNotes: z.string().nullable().optional(),
});

export const insertClientInviteSchema = createInsertSchema(clientInvites).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Client Divisions Insert Schemas
export const insertClientDivisionSchema = createInsertSchema(clientDivisions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDivisionMemberSchema = createInsertSchema(divisionMembers).omit({
  id: true,
  createdAt: true,
});

// Client Notes & Document Library Insert Schemas
export const insertClientNoteCategorySchema = createInsertSchema(clientNoteCategories).omit({
  id: true,
  createdAt: true,
});

export const insertClientNoteSchema = createInsertSchema(clientNotes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertClientNoteVersionSchema = createInsertSchema(clientNoteVersions).omit({
  id: true,
  createdAt: true,
});

export const insertClientNoteAttachmentSchema = createInsertSchema(clientNoteAttachments).omit({
  id: true,
  createdAt: true,
});

export const insertClientDocumentCategorySchema = createInsertSchema(clientDocumentCategories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertClientDocumentSchema = createInsertSchema(clientDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Time Tracking Insert Schemas
export const insertTimeEntrySchema = createInsertSchema(timeEntries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertActiveTimerSchema = createInsertSchema(activeTimers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// User Management & Auth Insert Schemas
export const insertInvitationSchema = createInsertSchema(invitations).omit({
  id: true,
  createdAt: true,
}).extend({
  role: z.enum([UserRole.ADMIN, UserRole.EMPLOYEE, UserRole.CLIENT]).default(UserRole.EMPLOYEE),
  status: z.enum([InvitationStatus.PENDING, InvitationStatus.ACCEPTED, InvitationStatus.EXPIRED, InvitationStatus.REVOKED]).default(InvitationStatus.PENDING),
});

export const insertPlatformInvitationSchema = createInsertSchema(platformInvitations).omit({
  id: true,
  createdAt: true,
  usedAt: true,
  revokedAt: true,
});

export const insertPlatformAuditEventSchema = createInsertSchema(platformAuditEvents).omit({
  id: true,
  createdAt: true,
});

export const insertClientUserAccessSchema = createInsertSchema(clientUserAccess).omit({
  id: true,
  createdAt: true,
}).extend({
  accessLevel: z.enum([ClientAccessLevel.VIEWER, ClientAccessLevel.COLLABORATOR]).default(ClientAccessLevel.VIEWER),
});

export const insertAppSettingSchema = createInsertSchema(appSettings).omit({
  id: true,
  updatedAt: true,
});

export const insertSystemSettingsSchema = createInsertSchema(systemSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateSystemSettingsSchema = z.object({
  defaultAppName: z.string().optional(),
  defaultLogoUrl: z.string().nullable().optional(),
  defaultIconUrl: z.string().nullable().optional(),
  defaultFaviconUrl: z.string().nullable().optional(),
  defaultPrimaryColor: z.string().optional(),
  defaultSecondaryColor: z.string().nullable().optional(),
  supportEmail: z.string().email().nullable().optional(),
  platformVersion: z.string().optional(),
  maintenanceMode: z.boolean().optional(),
  maintenanceMessage: z.string().nullable().optional(),
});

export const insertCommentMentionSchema = createInsertSchema(commentMentions).omit({
  id: true,
  createdAt: true,
});

// Chat Insert Schemas
export const insertChatChannelSchema = createInsertSchema(chatChannels).omit({
  id: true,
  createdAt: true,
});

export const insertChatChannelMemberSchema = createInsertSchema(chatChannelMembers).omit({
  id: true,
  createdAt: true,
});

export const insertChatDmThreadSchema = createInsertSchema(chatDmThreads).omit({
  id: true,
  createdAt: true,
});

export const insertChatDmMemberSchema = createInsertSchema(chatDmMembers).omit({
  id: true,
  createdAt: true,
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  createdAt: true,
  editedAt: true,
  deletedAt: true,
  archivedAt: true,
});

export const insertChatAttachmentSchema = createInsertSchema(chatAttachments).omit({
  id: true,
  createdAt: true,
});

export const insertChatMentionSchema = createInsertSchema(chatMentions).omit({
  id: true,
  createdAt: true,
});

export const insertChatExportJobSchema = createInsertSchema(chatExportJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Enhanced user insert schema with role validation
export const insertUserWithRoleSchema = insertUserSchema.extend({
  role: z.enum([UserRole.ADMIN, UserRole.EMPLOYEE, UserRole.CLIENT]).default(UserRole.EMPLOYEE),
});

// Types
export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = z.infer<typeof insertTenantSchema>;

export type TenantSettings = typeof tenantSettings.$inferSelect;
export type InsertTenantSettings = z.infer<typeof insertTenantSettingsSchema>;

export type TenantIntegration = typeof tenantIntegrations.$inferSelect;
export type InsertTenantIntegration = z.infer<typeof insertTenantIntegrationSchema>;

export type EmailOutbox = typeof emailOutbox.$inferSelect;
export type InsertEmailOutbox = z.infer<typeof insertEmailOutboxSchema>;

export type TenancyWarning = typeof tenancyWarnings.$inferSelect;
export type InsertTenancyWarning = z.infer<typeof insertTenancyWarningSchema>;

export type ErrorLog = typeof errorLogs.$inferSelect;
export type InsertErrorLog = z.infer<typeof insertErrorLogSchema>;

export type TenantAgreement = typeof tenantAgreements.$inferSelect;
export type InsertTenantAgreement = z.infer<typeof insertTenantAgreementSchema>;

export type TenantAgreementAcceptance = typeof tenantAgreementAcceptances.$inferSelect;
export type InsertTenantAgreementAcceptance = z.infer<typeof insertTenantAgreementAcceptanceSchema>;

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Workspace = typeof workspaces.$inferSelect;
export type InsertWorkspace = z.infer<typeof insertWorkspaceSchema>;

export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type InsertWorkspaceMember = z.infer<typeof insertWorkspaceMemberSchema>;

export type Team = typeof teams.$inferSelect;
export type InsertTeam = z.infer<typeof insertTeamSchema>;

export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;

export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;

export type ProjectMember = typeof projectMembers.$inferSelect;
export type InsertProjectMember = z.infer<typeof insertProjectMemberSchema>;

export type ProjectTemplate = typeof projectTemplates.$inferSelect;
export type InsertProjectTemplate = z.infer<typeof insertProjectTemplateSchema>;

// Template content structure type
export interface ProjectTemplateContent {
  sections: Array<{
    name: string;
    tasks: Array<{
      title: string;
      description?: string;
      subtasks?: string[];
    }>;
  }>;
}

export type HiddenProject = typeof hiddenProjects.$inferSelect;

export type Section = typeof sections.$inferSelect;
export type InsertSection = z.infer<typeof insertSectionSchema>;

export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;

export type TaskAssignee = typeof taskAssignees.$inferSelect;
export type InsertTaskAssignee = z.infer<typeof insertTaskAssigneeSchema>;

export type TaskWatcher = typeof taskWatchers.$inferSelect;
export type InsertTaskWatcher = z.infer<typeof insertTaskWatcherSchema>;

export type PersonalTaskSection = typeof personalTaskSections.$inferSelect;
export type InsertPersonalTaskSection = z.infer<typeof insertPersonalTaskSectionSchema>;

export type Subtask = typeof subtasks.$inferSelect;
export type InsertSubtask = z.infer<typeof insertSubtaskSchema>;

export type Tag = typeof tags.$inferSelect;
export type InsertTag = z.infer<typeof insertTagSchema>;

export type TaskTag = typeof taskTags.$inferSelect;
export type InsertTaskTag = z.infer<typeof insertTaskTagSchema>;

export type SubtaskAssignee = typeof subtaskAssignees.$inferSelect;
export type InsertSubtaskAssignee = z.infer<typeof insertSubtaskAssigneeSchema>;

export type SubtaskTag = typeof subtaskTags.$inferSelect;
export type InsertSubtaskTag = z.infer<typeof insertSubtaskTagSchema>;

export type Comment = typeof comments.$inferSelect;
export type InsertComment = z.infer<typeof insertCommentSchema>;

export type ActivityLog = typeof activityLog.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type NotificationPreferences = typeof notificationPreferences.$inferSelect;
export type InsertNotificationPreferences = z.infer<typeof insertNotificationPreferencesSchema>;

export type TaskAttachment = typeof taskAttachments.$inferSelect;
export type InsertTaskAttachment = z.infer<typeof insertTaskAttachmentSchema>;

// Client Types
export type Client = typeof clients.$inferSelect;
export type InsertClient = z.infer<typeof insertClientSchema>;

export type ClientContact = typeof clientContacts.$inferSelect;
export type InsertClientContact = z.infer<typeof insertClientContactSchema>;

export type ClientCrm = typeof clientCrm.$inferSelect;
export type InsertClientCrm = z.infer<typeof insertClientCrmSchema>;
export type UpdateClientCrm = z.infer<typeof updateClientCrmSchema>;

export type ClientInvite = typeof clientInvites.$inferSelect;
export type InsertClientInvite = z.infer<typeof insertClientInviteSchema>;

// Client Division Types
export type ClientDivision = typeof clientDivisions.$inferSelect;
export type InsertClientDivision = z.infer<typeof insertClientDivisionSchema>;

export type DivisionMember = typeof divisionMembers.$inferSelect;
export type InsertDivisionMember = z.infer<typeof insertDivisionMemberSchema>;

// Client Notes & Document Library Types
export type ClientNoteCategory = typeof clientNoteCategories.$inferSelect;
export type InsertClientNoteCategory = z.infer<typeof insertClientNoteCategorySchema>;

export type ClientNote = typeof clientNotes.$inferSelect;
export type InsertClientNote = z.infer<typeof insertClientNoteSchema>;

export type ClientNoteVersion = typeof clientNoteVersions.$inferSelect;
export type InsertClientNoteVersion = z.infer<typeof insertClientNoteVersionSchema>;

export type ClientNoteAttachment = typeof clientNoteAttachments.$inferSelect;
export type InsertClientNoteAttachment = z.infer<typeof insertClientNoteAttachmentSchema>;

export type ClientDocumentCategory = typeof clientDocumentCategories.$inferSelect;
export type InsertClientDocumentCategory = z.infer<typeof insertClientDocumentCategorySchema>;

export type ClientDocument = typeof clientDocuments.$inferSelect;
export type InsertClientDocument = z.infer<typeof insertClientDocumentSchema>;

// Extended types for client notes
export type ClientNoteWithAuthor = ClientNote & {
  author?: User;
  lastEditedBy?: User;
  categoryObj?: ClientNoteCategory;
  attachments?: ClientNoteAttachment[];
};

export type ClientDocumentWithUser = ClientDocument & {
  uploadedBy?: User;
  categoryObj?: ClientDocumentCategory;
};

// Time Tracking Types
export type TimeEntry = typeof timeEntries.$inferSelect;
export type InsertTimeEntry = z.infer<typeof insertTimeEntrySchema>;

export type ActiveTimer = typeof activeTimers.$inferSelect;
export type InsertActiveTimer = z.infer<typeof insertActiveTimerSchema>;

// Extended types for frontend use
export type TaskAttachmentWithUser = TaskAttachment & {
  uploadedByUser?: User;
};

export type TaskWithRelations = Task & {
  assignees?: (TaskAssignee & { user?: User })[];
  watchers?: (TaskWatcher & { user?: User })[];
  tags?: (TaskTag & { tag?: Tag })[];
  subtasks?: Subtask[];
  childTasks?: TaskWithRelations[];
  parentTask?: Task;
  section?: Section;
  project?: Project;
  attachments?: TaskAttachmentWithUser[];
};

export type ProjectWithRelations = Project & {
  sections?: Section[];
  members?: (ProjectMember & { user?: User })[];
  team?: Team;
  client?: Client;
};

export type SectionWithTasks = Section & {
  tasks?: TaskWithRelations[];
};

export type ClientWithContacts = Client & {
  contacts?: ClientContact[];
  projects?: Project[];
};

// Client extended types
export type ClientWithRelations = Client & {
  contacts?: ClientContact[];
  projects?: Project[];
  invites?: ClientInvite[];
};

export type ClientContactWithRelations = ClientContact & {
  client?: Client;
  invites?: ClientInvite[];
};

// Time Tracking extended types
export type TimeEntryWithRelations = TimeEntry & {
  user?: User;
  client?: Client;
  project?: Project;
  task?: Task;
};

export type ActiveTimerWithRelations = ActiveTimer & {
  user?: User;
  client?: Client;
  project?: Project;
  task?: Task;
};

// User Management & Auth Types
export type Invitation = typeof invitations.$inferSelect;
export type InsertInvitation = z.infer<typeof insertInvitationSchema>;

export type PlatformInvitation = typeof platformInvitations.$inferSelect;
export type InsertPlatformInvitation = z.infer<typeof insertPlatformInvitationSchema>;

export type PlatformAuditEvent = typeof platformAuditEvents.$inferSelect;
export type InsertPlatformAuditEvent = z.infer<typeof insertPlatformAuditEventSchema>;

export type ClientUserAccess = typeof clientUserAccess.$inferSelect;
export type InsertClientUserAccess = z.infer<typeof insertClientUserAccessSchema>;

export type AppSetting = typeof appSettings.$inferSelect;
export type InsertAppSetting = z.infer<typeof insertAppSettingSchema>;

export type SystemSettings = typeof systemSettings.$inferSelect;
export type InsertSystemSettings = z.infer<typeof insertSystemSettingsSchema>;

export type CommentMention = typeof commentMentions.$inferSelect;
export type InsertCommentMention = z.infer<typeof insertCommentMentionSchema>;

// User Management extended types
export type InvitationWithRelations = Invitation & {
  workspace?: Workspace;
  client?: Client;
  createdBy?: User;
};

export type UserWithAccess = User & {
  clientAccess?: (ClientUserAccess & { client?: Client })[];
  workspaceMemberships?: WorkspaceMember[];
};

export type CommentWithMentions = Comment & {
  user?: User;
  mentions?: (CommentMention & { mentionedUser?: User })[];
};

// Chat Types
export type ChatChannel = typeof chatChannels.$inferSelect;
export type InsertChatChannel = z.infer<typeof insertChatChannelSchema>;

export type ChatChannelMember = typeof chatChannelMembers.$inferSelect;
export type InsertChatChannelMember = z.infer<typeof insertChatChannelMemberSchema>;

export type ChatDmThread = typeof chatDmThreads.$inferSelect;
export type InsertChatDmThread = z.infer<typeof insertChatDmThreadSchema>;

export type ChatDmMember = typeof chatDmMembers.$inferSelect;
export type InsertChatDmMember = z.infer<typeof insertChatDmMemberSchema>;

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;

export type ChatAttachment = typeof chatAttachments.$inferSelect;
export type InsertChatAttachment = z.infer<typeof insertChatAttachmentSchema>;

// Chat extended types
export type ChatChannelWithMembers = ChatChannel & {
  members?: (ChatChannelMember & { user?: User })[];
  creator?: User;
};

export type ChatDmThreadWithMembers = ChatDmThread & {
  members?: (ChatDmMember & { user?: User })[];
};

export type ChatMessageWithAuthor = ChatMessage & {
  author?: User;
};

export type ChatMention = typeof chatMentions.$inferSelect;
export type InsertChatMention = z.infer<typeof insertChatMentionSchema>;

export type ChatExportJob = typeof chatExportJobs.$inferSelect;
export type InsertChatExportJob = z.infer<typeof insertChatExportJobSchema>;

// Chat Export Job progress and output location types
export interface ChatExportProgress {
  conversations?: number;
  messages?: number;
  attachments?: number;
  bytesWritten?: number;
  elapsedMs?: number;
  cursor?: string; // For resume capability
}

export interface ChatExportOutputLocation {
  provider: "r2" | "local";
  bucket?: string;
  key?: string;
  path?: string;
  downloadUrl?: string;
  expiresAt?: string;
}

// ============================================================================
// UPDATE SCHEMAS (for PATCH endpoints - all fields optional)
// ============================================================================

export const updateWorkspaceSchema = insertWorkspaceSchema.partial();
export const updateTeamSchema = insertTeamSchema.partial();
export const updateProjectSchema = insertProjectSchema.partial();
export const updateSectionSchema = insertSectionSchema.partial();
export const updateTaskSchema = insertTaskSchema.partial();
export const updateSubtaskSchema = insertSubtaskSchema.partial();
export const updateTagSchema = insertTagSchema.partial();
export const updateCommentSchema = z.object({
  content: z.string().optional(),
  contentJson: z.unknown().optional(),
});
export const updateClientSchema = insertClientSchema.partial();
export const updateClientContactSchema = insertClientContactSchema.partial();
export const updatePersonalTaskSectionSchema = insertPersonalTaskSectionSchema.pick({
  name: true,
  sortOrder: true,
}).partial();

// Move task/subtask schemas
export const moveTaskSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  sectionId: z.string().uuid().nullable().optional(),
  newIndex: z.number().int().min(0).optional(),
});

export const moveSubtaskSchema = z.object({
  parentTaskId: z.string().uuid().optional(),
  newIndex: z.number().int().min(0).optional(),
});

// Task reorder schema
export const reorderTasksSchema = z.object({
  moves: z.array(z.object({
    taskId: z.string().uuid(),
    sectionId: z.string().uuid().nullable(),
    sortOrder: z.number().int(),
  })),
});

// Assignee/watcher add schema
export const addAssigneeSchema = z.object({
  userId: z.string().uuid(),
});

export const addTagToTaskSchema = z.object({
  tagId: z.string().uuid(),
});

// Personal task move schema
export const movePersonalTaskSchema = z.object({
  personalSectionId: z.string().uuid().nullable().optional(),
  newIndex: z.number().int().min(0).optional(),
});

export const userUiPreferences = pgTable("user_ui_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  userId: varchar("user_id").references(() => users.id).notNull(),
  themeMode: text("theme_mode"),
  themeAccent: text("theme_accent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("user_ui_preferences_user_idx").on(table.userId),
]);

export const insertUserUiPreferencesSchema = createInsertSchema(userUiPreferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type UserUiPreferences = typeof userUiPreferences.$inferSelect;
export type InsertUserUiPreferences = z.infer<typeof insertUserUiPreferencesSchema>;

// Client assignment schema
export const assignClientSchema = z.object({
  clientId: z.string().uuid().nullable(),
});

// Project member add schema
export const addProjectMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["owner", "editor", "viewer"]).optional(),
});

// Division member add schema
export const addDivisionMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["member", "manager"]).optional(),
});

// Note category schema
export const createNoteCategorySchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().optional(),
});

// Client Files Insert/Update Schemas
export const insertClientFileSchema = createInsertSchema(clientFiles).omit({
  id: true,
  createdAt: true,
});

export const updateClientFileSchema = z.object({
  filename: z.string().min(1).optional(),
  visibility: z.enum(["internal", "client"]).optional(),
});

// User Client Access Insert Schema
export const insertUserClientAccessSchema = createInsertSchema(userClientAccess).omit({
  id: true,
  createdAt: true,
});

// Client Files Types
export type ClientFile = typeof clientFiles.$inferSelect;
export type InsertClientFile = z.infer<typeof insertClientFileSchema>;
export type UpdateClientFile = z.infer<typeof updateClientFileSchema>;

// User Client Access Types
export type UserClientAccess = typeof userClientAccess.$inferSelect;
export type InsertUserClientAccess = z.infer<typeof insertUserClientAccessSchema>;
