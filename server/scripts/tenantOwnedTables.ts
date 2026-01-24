/**
 * Single source of truth for tenant-owned tables.
 * Used by both API endpoints and CLI migration scripts.
 */
export const TENANT_OWNED_TABLES_LIST = [
  "workspaces",
  "teams",
  "clients",
  "projects",
  "tasks",
  "time_entries",
  "active_timers",
  "invitations",
  "personal_task_sections",
  "task_assignees",
  "task_watchers",
  "notifications",
  "notification_preferences",
  "client_divisions",
  "division_members",
  "chat_channels",
  "chat_channel_members",
  "chat_messages",
  "chat_reads",
  "client_contacts",
  "client_user_access",
  "client_invites",
  "project_members",
  "subtasks",
  "task_attachments",
  "task_comments",
  "task_custom_fields",
  "task_tags",
  "activity_logs",
] as const;

export const TENANT_OWNED_TABLES_SET = new Set(TENANT_OWNED_TABLES_LIST);

export function isValidTenantOwnedTable(tableName: string): boolean {
  return TENANT_OWNED_TABLES_SET.has(tableName as any);
}
