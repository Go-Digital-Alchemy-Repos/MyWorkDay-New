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
  TIMER_EVENTS,
  TIME_ENTRY_EVENTS,
  MY_TASK_EVENTS,
  ProjectCreatedPayload,
  ProjectUpdatedPayload,
  ProjectDeletedPayload,
  ProjectClientAssignedPayload,
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
  TimerPayload,
  TimerStartedPayload,
  TimerPausedPayload,
  TimerResumedPayload,
  TimerStoppedPayload,
  TimerUpdatedPayload,
  TimeEntryPayload,
  TimeEntryCreatedPayload,
  TimeEntryUpdatedPayload,
  TimeEntryDeletedPayload,
  MyTaskPayload,
  MyTaskCreatedPayload,
  MyTaskUpdatedPayload,
  MyTaskDeletedPayload,
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

/**
 * Emit when a project's client assignment changes.
 * Emits to: project room, new client room (if any), and old client room (if any)
 */
export function emitProjectClientAssigned(
  project: ProjectClientAssignedPayload['project'],
  previousClientId: string | null
): void {
  const payload: ProjectClientAssignedPayload = {
    projectId: project.id,
    clientId: project.clientId,
    previousClientId,
    project,
  };
  
  // Emit to project room
  emitToProject(project.id, PROJECT_EVENTS.CLIENT_ASSIGNED, payload);
  
  // Emit to new client room if assigned
  if (project.clientId) {
    emitToClient(project.clientId, PROJECT_EVENTS.CLIENT_ASSIGNED, payload);
  }
  
  // Emit to old client room if unassigning or changing
  if (previousClientId && previousClientId !== project.clientId) {
    emitToClient(previousClientId, PROJECT_EVENTS.CLIENT_ASSIGNED, payload);
  }
  
  // Also emit project:updated for consistency
  emitProjectUpdated(project.id, { clientId: project.clientId } as any);
  
  log(`Emitted ${PROJECT_EVENTS.CLIENT_ASSIGNED} for project ${project.id} (client: ${project.clientId || 'unassigned'})`, 'events');
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

// =============================================================================
// TIME TRACKING EVENTS
// =============================================================================

/**
 * Emit when a timer is started.
 */
export function emitTimerStarted(timer: TimerPayload, workspaceId: string): void {
  const payload: TimerStartedPayload = { timer, userId: timer.userId };
  emitToWorkspace(workspaceId, TIMER_EVENTS.STARTED, payload);
  log(`Emitted ${TIMER_EVENTS.STARTED} for timer ${timer.id}`, 'events');
}

/**
 * Emit when a timer is paused.
 */
export function emitTimerPaused(timerId: string, userId: string, elapsedSeconds: number, workspaceId: string): void {
  const payload: TimerPausedPayload = { timerId, userId, elapsedSeconds };
  emitToWorkspace(workspaceId, TIMER_EVENTS.PAUSED, payload);
  log(`Emitted ${TIMER_EVENTS.PAUSED} for timer ${timerId}`, 'events');
}

/**
 * Emit when a timer is resumed.
 */
export function emitTimerResumed(timerId: string, userId: string, lastStartedAt: Date, workspaceId: string): void {
  const payload: TimerResumedPayload = { timerId, userId, lastStartedAt };
  emitToWorkspace(workspaceId, TIMER_EVENTS.RESUMED, payload);
  log(`Emitted ${TIMER_EVENTS.RESUMED} for timer ${timerId}`, 'events');
}

/**
 * Emit when a timer is stopped.
 */
export function emitTimerStopped(timerId: string, userId: string, timeEntryId: string | null, workspaceId: string): void {
  const payload: TimerStoppedPayload = { timerId, userId, timeEntryId };
  emitToWorkspace(workspaceId, TIMER_EVENTS.STOPPED, payload);
  log(`Emitted ${TIMER_EVENTS.STOPPED} for timer ${timerId}`, 'events');
}

/**
 * Emit when a timer is updated (description, client, project, task changed).
 */
export function emitTimerUpdated(timerId: string, userId: string, updates: Partial<TimerPayload>, workspaceId: string): void {
  const payload: TimerUpdatedPayload = { timerId, userId, updates };
  emitToWorkspace(workspaceId, TIMER_EVENTS.UPDATED, payload);
  log(`Emitted ${TIMER_EVENTS.UPDATED} for timer ${timerId}`, 'events');
}

/**
 * Emit when a time entry is created (from timer or manual entry).
 */
export function emitTimeEntryCreated(timeEntry: TimeEntryPayload, workspaceId: string): void {
  const payload: TimeEntryCreatedPayload = { timeEntry, workspaceId };
  emitToWorkspace(workspaceId, TIME_ENTRY_EVENTS.CREATED, payload);
  log(`Emitted ${TIME_ENTRY_EVENTS.CREATED} for time entry ${timeEntry.id}`, 'events');
}

/**
 * Emit when a time entry is updated.
 */
export function emitTimeEntryUpdated(timeEntryId: string, workspaceId: string, updates: Partial<TimeEntryPayload>): void {
  const payload: TimeEntryUpdatedPayload = { timeEntryId, workspaceId, updates };
  emitToWorkspace(workspaceId, TIME_ENTRY_EVENTS.UPDATED, payload);
  log(`Emitted ${TIME_ENTRY_EVENTS.UPDATED} for time entry ${timeEntryId}`, 'events');
}

/**
 * Emit when a time entry is deleted.
 */
export function emitTimeEntryDeleted(timeEntryId: string, workspaceId: string): void {
  const payload: TimeEntryDeletedPayload = { timeEntryId, workspaceId };
  emitToWorkspace(workspaceId, TIME_ENTRY_EVENTS.DELETED, payload);
  log(`Emitted ${TIME_ENTRY_EVENTS.DELETED} for time entry ${timeEntryId}`, 'events');
}

// =============================================================================
// PERSONAL TASK (MY TASK) EVENTS
// =============================================================================

/**
 * Emit when a personal task is created.
 */
export function emitMyTaskCreated(userId: string, task: MyTaskPayload, workspaceId: string): void {
  const payload: MyTaskCreatedPayload = { userId, task };
  emitToWorkspace(workspaceId, MY_TASK_EVENTS.CREATED, payload);
  log(`Emitted ${MY_TASK_EVENTS.CREATED} for personal task ${task.id}`, 'events');
}

/**
 * Emit when a personal task is updated.
 */
export function emitMyTaskUpdated(userId: string, taskId: string, updates: Partial<MyTaskPayload>, workspaceId: string): void {
  const payload: MyTaskUpdatedPayload = { userId, taskId, updates };
  emitToWorkspace(workspaceId, MY_TASK_EVENTS.UPDATED, payload);
  log(`Emitted ${MY_TASK_EVENTS.UPDATED} for personal task ${taskId}`, 'events');
}

/**
 * Emit when a personal task is deleted.
 */
export function emitMyTaskDeleted(userId: string, taskId: string, workspaceId: string): void {
  const payload: MyTaskDeletedPayload = { userId, taskId };
  emitToWorkspace(workspaceId, MY_TASK_EVENTS.DELETED, payload);
  log(`Emitted ${MY_TASK_EVENTS.DELETED} for personal task ${taskId}`, 'events');
}
