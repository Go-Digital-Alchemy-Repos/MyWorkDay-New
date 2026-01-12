/**
 * Centralized Socket.IO Event Emitters
 * 
 * IMPORTANT: ALL socket event emissions MUST go through this module.
 * Do NOT emit events directly from route handlers.
 * 
 * This ensures:
 * - Consistent event naming and payloads
 * - Single point of control for real-time updates
 * - Easy debugging and logging
 * - Type safety with shared event contracts
 */

import { emitToProject, emitToClient, emitToWorkspace } from './socket';
import {
  PROJECT_EVENTS,
  SECTION_EVENTS,
  TASK_EVENTS,
  SUBTASK_EVENTS,
  ATTACHMENT_EVENTS,
  CLIENT_EVENTS,
  CLIENT_CONTACT_EVENTS,
  CLIENT_INVITE_EVENTS,
  ProjectCreatedPayload,
  ProjectUpdatedPayload,
  ProjectDeletedPayload,
  SectionCreatedPayload,
  SectionUpdatedPayload,
  SectionDeletedPayload,
  SectionReorderedPayload,
  TaskCreatedPayload,
  TaskUpdatedPayload,
  TaskDeletedPayload,
  TaskMovedPayload,
  TaskReorderedPayload,
  SubtaskCreatedPayload,
  SubtaskUpdatedPayload,
  SubtaskDeletedPayload,
  SubtaskReorderedPayload,
  AttachmentAddedPayload,
  AttachmentDeletedPayload,
  ClientCreatedPayload,
  ClientUpdatedPayload,
  ClientDeletedPayload,
  ClientContactCreatedPayload,
  ClientContactUpdatedPayload,
  ClientContactDeletedPayload,
  ClientInviteSentPayload,
  ClientInviteRevokedPayload,
} from '@shared/events';
import { log } from '../index';

// =============================================================================
// PROJECT EVENTS
// =============================================================================

/**
 * Emit when a new project is created.
 * Note: Projects are workspace-level, so we emit to all connected clients.
 */
export function emitProjectCreated(project: ProjectCreatedPayload['project']): void {
  const payload: ProjectCreatedPayload = { project };
  // For project creation, we emit to the project's own room (clients may join after)
  emitToProject(project.id, PROJECT_EVENTS.CREATED, payload);
  log(`Emitted ${PROJECT_EVENTS.CREATED} for project ${project.id}`, 'events');
}

/**
 * Emit when a project is updated.
 */
export function emitProjectUpdated(projectId: string, updates: ProjectUpdatedPayload['updates']): void {
  const payload: ProjectUpdatedPayload = { projectId, updates };
  emitToProject(projectId, PROJECT_EVENTS.UPDATED, payload);
  log(`Emitted ${PROJECT_EVENTS.UPDATED} for project ${projectId}`, 'events');
}

/**
 * Emit when a project is deleted.
 */
export function emitProjectDeleted(projectId: string): void {
  const payload: ProjectDeletedPayload = { projectId };
  emitToProject(projectId, PROJECT_EVENTS.DELETED, payload);
  log(`Emitted ${PROJECT_EVENTS.DELETED} for project ${projectId}`, 'events');
}

// =============================================================================
// SECTION EVENTS
// =============================================================================

/**
 * Emit when a new section is created.
 */
export function emitSectionCreated(section: SectionCreatedPayload['section']): void {
  const payload: SectionCreatedPayload = { section };
  emitToProject(section.projectId, SECTION_EVENTS.CREATED, payload);
  log(`Emitted ${SECTION_EVENTS.CREATED} for section ${section.id} in project ${section.projectId}`, 'events');
}

/**
 * Emit when a section is updated.
 */
export function emitSectionUpdated(sectionId: string, projectId: string, updates: SectionUpdatedPayload['updates']): void {
  const payload: SectionUpdatedPayload = { sectionId, projectId, updates };
  emitToProject(projectId, SECTION_EVENTS.UPDATED, payload);
  log(`Emitted ${SECTION_EVENTS.UPDATED} for section ${sectionId}`, 'events');
}

/**
 * Emit when a section is deleted.
 */
export function emitSectionDeleted(sectionId: string, projectId: string): void {
  const payload: SectionDeletedPayload = { sectionId, projectId };
  emitToProject(projectId, SECTION_EVENTS.DELETED, payload);
  log(`Emitted ${SECTION_EVENTS.DELETED} for section ${sectionId}`, 'events');
}

/**
 * Emit when sections are reordered.
 */
export function emitSectionReordered(projectId: string, sections: SectionReorderedPayload['sections']): void {
  const payload: SectionReorderedPayload = { projectId, sections };
  emitToProject(projectId, SECTION_EVENTS.REORDERED, payload);
  log(`Emitted ${SECTION_EVENTS.REORDERED} for project ${projectId}`, 'events');
}

// =============================================================================
// TASK EVENTS
// =============================================================================

/**
 * Emit when a new task is created.
 */
export function emitTaskCreated(projectId: string, task: TaskCreatedPayload['task']): void {
  const payload: TaskCreatedPayload = { task, projectId };
  emitToProject(projectId, TASK_EVENTS.CREATED, payload);
  log(`Emitted ${TASK_EVENTS.CREATED} for task ${task.id} in project ${projectId}`, 'events');
}

/**
 * Emit when a task is updated.
 */
export function emitTaskUpdated(
  taskId: string, 
  projectId: string, 
  parentTaskId: string | null,
  updates: TaskUpdatedPayload['updates']
): void {
  const payload: TaskUpdatedPayload = { taskId, projectId, parentTaskId, updates };
  emitToProject(projectId, TASK_EVENTS.UPDATED, payload);
  log(`Emitted ${TASK_EVENTS.UPDATED} for task ${taskId}`, 'events');
}

/**
 * Emit when a task is deleted.
 */
export function emitTaskDeleted(
  taskId: string, 
  projectId: string, 
  sectionId: string | null,
  parentTaskId: string | null
): void {
  const payload: TaskDeletedPayload = { taskId, projectId, sectionId, parentTaskId };
  emitToProject(projectId, TASK_EVENTS.DELETED, payload);
  log(`Emitted ${TASK_EVENTS.DELETED} for task ${taskId}`, 'events');
}

/**
 * Emit when a task is moved to a different section.
 */
export function emitTaskMoved(
  taskId: string,
  projectId: string,
  fromSectionId: string | null,
  toSectionId: string | null,
  newPosition: number
): void {
  const payload: TaskMovedPayload = { taskId, projectId, fromSectionId, toSectionId, newPosition };
  emitToProject(projectId, TASK_EVENTS.MOVED, payload);
  log(`Emitted ${TASK_EVENTS.MOVED} for task ${taskId}`, 'events');
}

/**
 * Emit when tasks are reordered within a section or parent.
 */
export function emitTaskReordered(
  projectId: string,
  sectionId: string | null,
  parentTaskId: string | null,
  tasks: TaskReorderedPayload['tasks']
): void {
  const payload: TaskReorderedPayload = { projectId, sectionId, parentTaskId, tasks };
  emitToProject(projectId, TASK_EVENTS.REORDERED, payload);
  log(`Emitted ${TASK_EVENTS.REORDERED} for project ${projectId}`, 'events');
}

// =============================================================================
// SUBTASK EVENTS (checklist items)
// =============================================================================

/**
 * Emit when a new subtask is created.
 */
export function emitSubtaskCreated(subtask: SubtaskCreatedPayload['subtask'], taskId: string, projectId: string): void {
  const payload: SubtaskCreatedPayload = { subtask, taskId, projectId };
  emitToProject(projectId, SUBTASK_EVENTS.CREATED, payload);
  log(`Emitted ${SUBTASK_EVENTS.CREATED} for subtask ${subtask.id}`, 'events');
}

/**
 * Emit when a subtask is updated.
 */
export function emitSubtaskUpdated(
  subtaskId: string,
  taskId: string,
  projectId: string,
  updates: SubtaskUpdatedPayload['updates']
): void {
  const payload: SubtaskUpdatedPayload = { subtaskId, taskId, projectId, updates };
  emitToProject(projectId, SUBTASK_EVENTS.UPDATED, payload);
  log(`Emitted ${SUBTASK_EVENTS.UPDATED} for subtask ${subtaskId}`, 'events');
}

/**
 * Emit when a subtask is deleted.
 */
export function emitSubtaskDeleted(subtaskId: string, taskId: string, projectId: string): void {
  const payload: SubtaskDeletedPayload = { subtaskId, taskId, projectId };
  emitToProject(projectId, SUBTASK_EVENTS.DELETED, payload);
  log(`Emitted ${SUBTASK_EVENTS.DELETED} for subtask ${subtaskId}`, 'events');
}

/**
 * Emit when subtasks are reordered.
 */
export function emitSubtaskReordered(
  taskId: string,
  projectId: string,
  subtasks: SubtaskReorderedPayload['subtasks']
): void {
  const payload: SubtaskReorderedPayload = { taskId, projectId, subtasks };
  emitToProject(projectId, SUBTASK_EVENTS.REORDERED, payload);
  log(`Emitted ${SUBTASK_EVENTS.REORDERED} for task ${taskId}`, 'events');
}

// =============================================================================
// ATTACHMENT EVENTS
// =============================================================================

/**
 * Emit when an attachment is added.
 */
export function emitAttachmentAdded(
  attachment: AttachmentAddedPayload['attachment'],
  taskId: string | null,
  subtaskId: string | null,
  projectId: string
): void {
  const payload: AttachmentAddedPayload = { attachment, taskId, subtaskId, projectId };
  emitToProject(projectId, ATTACHMENT_EVENTS.ADDED, payload);
  log(`Emitted ${ATTACHMENT_EVENTS.ADDED} for attachment ${attachment.id}`, 'events');
}

/**
 * Emit when an attachment is deleted.
 */
export function emitAttachmentDeleted(
  attachmentId: string,
  taskId: string | null,
  subtaskId: string | null,
  projectId: string
): void {
  const payload: AttachmentDeletedPayload = { attachmentId, taskId, subtaskId, projectId };
  emitToProject(projectId, ATTACHMENT_EVENTS.DELETED, payload);
  log(`Emitted ${ATTACHMENT_EVENTS.DELETED} for attachment ${attachmentId}`, 'events');
}

// =============================================================================
// CLIENT EVENTS (CRM Module)
// =============================================================================

/**
 * Emit when a new client is created.
 */
export function emitClientCreated(client: ClientCreatedPayload['client'], workspaceId: string): void {
  const payload: ClientCreatedPayload = { client, workspaceId };
  emitToWorkspace(workspaceId, CLIENT_EVENTS.CREATED, payload);
  log(`Emitted ${CLIENT_EVENTS.CREATED} for client ${client.id}`, 'events');
}

/**
 * Emit when a client is updated.
 */
export function emitClientUpdated(clientId: string, workspaceId: string, updates: ClientUpdatedPayload['updates']): void {
  const payload: ClientUpdatedPayload = { clientId, workspaceId, updates };
  emitToWorkspace(workspaceId, CLIENT_EVENTS.UPDATED, payload);
  emitToClient(clientId, CLIENT_EVENTS.UPDATED, payload);
  log(`Emitted ${CLIENT_EVENTS.UPDATED} for client ${clientId}`, 'events');
}

/**
 * Emit when a client is deleted.
 */
export function emitClientDeleted(clientId: string, workspaceId: string): void {
  const payload: ClientDeletedPayload = { clientId, workspaceId };
  emitToWorkspace(workspaceId, CLIENT_EVENTS.DELETED, payload);
  emitToClient(clientId, CLIENT_EVENTS.DELETED, payload);
  log(`Emitted ${CLIENT_EVENTS.DELETED} for client ${clientId}`, 'events');
}

// =============================================================================
// CLIENT CONTACT EVENTS
// =============================================================================

/**
 * Emit when a new client contact is created.
 */
export function emitClientContactCreated(
  contact: ClientContactCreatedPayload['contact'],
  clientId: string,
  workspaceId: string
): void {
  const payload: ClientContactCreatedPayload = { contact, clientId, workspaceId };
  emitToClient(clientId, CLIENT_CONTACT_EVENTS.CREATED, payload);
  log(`Emitted ${CLIENT_CONTACT_EVENTS.CREATED} for contact ${contact.id}`, 'events');
}

/**
 * Emit when a client contact is updated.
 */
export function emitClientContactUpdated(
  contactId: string,
  clientId: string,
  workspaceId: string,
  updates: ClientContactUpdatedPayload['updates']
): void {
  const payload: ClientContactUpdatedPayload = { contactId, clientId, workspaceId, updates };
  emitToClient(clientId, CLIENT_CONTACT_EVENTS.UPDATED, payload);
  log(`Emitted ${CLIENT_CONTACT_EVENTS.UPDATED} for contact ${contactId}`, 'events');
}

/**
 * Emit when a client contact is deleted.
 */
export function emitClientContactDeleted(contactId: string, clientId: string, workspaceId: string): void {
  const payload: ClientContactDeletedPayload = { contactId, clientId, workspaceId };
  emitToClient(clientId, CLIENT_CONTACT_EVENTS.DELETED, payload);
  log(`Emitted ${CLIENT_CONTACT_EVENTS.DELETED} for contact ${contactId}`, 'events');
}

// =============================================================================
// CLIENT INVITE EVENTS (Placeholder for future auth integration)
// =============================================================================

/**
 * Emit when a client invite is sent.
 */
export function emitClientInviteSent(
  invite: ClientInviteSentPayload['invite'],
  clientId: string,
  workspaceId: string
): void {
  const payload: ClientInviteSentPayload = { invite, clientId, workspaceId };
  emitToClient(clientId, CLIENT_INVITE_EVENTS.SENT, payload);
  log(`Emitted ${CLIENT_INVITE_EVENTS.SENT} for invite ${invite.id}`, 'events');
}

/**
 * Emit when a client invite is revoked.
 */
export function emitClientInviteRevoked(inviteId: string, clientId: string, workspaceId: string): void {
  const payload: ClientInviteRevokedPayload = { inviteId, clientId, workspaceId };
  emitToClient(clientId, CLIENT_INVITE_EVENTS.REVOKED, payload);
  log(`Emitted ${CLIENT_INVITE_EVENTS.REVOKED} for invite ${inviteId}`, 'events');
}
