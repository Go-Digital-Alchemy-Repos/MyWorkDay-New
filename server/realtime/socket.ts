/**
 * Socket.IO Server Initialization
 * 
 * This module initializes and exports the Socket.IO server instance.
 * It attaches to the existing HTTP server and handles room management.
 * 
 * Room Strategy:
 * - Clients join project rooms using 'room:join:project' event
 * - Room name format: 'project:{projectId}'
 * - All entity updates are broadcast to the relevant project room
 */

import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { 
  ServerToClientEvents, 
  ClientToServerEvents,
  ROOM_EVENTS 
} from '@shared/events';
import { log } from '../index';

// Type-safe Socket.IO server instance
let io: Server<ClientToServerEvents, ServerToClientEvents> | null = null;

/**
 * Initialize Socket.IO server and attach to HTTP server.
 * This should be called once during server startup.
 * 
 * @param httpServer - The HTTP server to attach Socket.IO to
 * @returns The initialized Socket.IO server instance
 */
export function initializeSocketIO(httpServer: HttpServer): Server<ClientToServerEvents, ServerToClientEvents> {
  io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: '*', // In production, restrict to specific origins
      methods: ['GET', 'POST'],
    },
    // Enable connection state recovery for brief disconnections
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
      skipMiddlewares: true,
    },
  });

  // Handle new client connections
  io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
    log(`Client connected: ${socket.id}`, 'socket.io');

    // Handle joining a project room
    socket.on(ROOM_EVENTS.JOIN_PROJECT, ({ projectId }) => {
      const roomName = `project:${projectId}`;
      socket.join(roomName);
      log(`Client ${socket.id} joined room: ${roomName}`, 'socket.io');
    });

    // Handle leaving a project room
    socket.on(ROOM_EVENTS.LEAVE_PROJECT, ({ projectId }) => {
      const roomName = `project:${projectId}`;
      socket.leave(roomName);
      log(`Client ${socket.id} left room: ${roomName}`, 'socket.io');
    });

    // Handle joining a client room (for CRM features)
    socket.on(ROOM_EVENTS.JOIN_CLIENT, ({ clientId }) => {
      const roomName = `client:${clientId}`;
      socket.join(roomName);
      log(`Client ${socket.id} joined room: ${roomName}`, 'socket.io');
    });

    // Handle leaving a client room
    socket.on(ROOM_EVENTS.LEAVE_CLIENT, ({ clientId }) => {
      const roomName = `client:${clientId}`;
      socket.leave(roomName);
      log(`Client ${socket.id} left room: ${roomName}`, 'socket.io');
    });

    // Handle joining a workspace room (for workspace-wide updates)
    socket.on(ROOM_EVENTS.JOIN_WORKSPACE, ({ workspaceId }) => {
      const roomName = `workspace:${workspaceId}`;
      socket.join(roomName);
      log(`Client ${socket.id} joined room: ${roomName}`, 'socket.io');
    });

    // Handle leaving a workspace room
    socket.on(ROOM_EVENTS.LEAVE_WORKSPACE, ({ workspaceId }) => {
      const roomName = `workspace:${workspaceId}`;
      socket.leave(roomName);
      log(`Client ${socket.id} left room: ${roomName}`, 'socket.io');
    });

    // Handle client disconnection
    socket.on('disconnect', (reason) => {
      log(`Client disconnected: ${socket.id} (${reason})`, 'socket.io');
    });
  });

  log('Socket.IO server initialized', 'socket.io');
  return io;
}

/**
 * Get the Socket.IO server instance.
 * Throws an error if called before initialization.
 * 
 * @returns The Socket.IO server instance
 */
export function getIO(): Server<ClientToServerEvents, ServerToClientEvents> {
  if (!io) {
    throw new Error('Socket.IO server not initialized. Call initializeSocketIO first.');
  }
  return io;
}

/**
 * Emit an event to a specific project room.
 * This is a low-level helper used by the events module.
 * 
 * @param projectId - The project ID to emit to
 * @param event - The event name
 * @param payload - The event payload
 */
export function emitToProject(
  projectId: string,
  event: string,
  payload: unknown
): void {
  const roomName = `project:${projectId}`;
  getIO().to(roomName).emit(event as any, payload);
}

export function emitToClient(
  clientId: string,
  event: string,
  payload: unknown
): void {
  const roomName = `client:${clientId}`;
  getIO().to(roomName).emit(event as any, payload);
}

export function emitToWorkspace(
  workspaceId: string,
  event: string,
  payload: unknown
): void {
  const roomName = `workspace:${workspaceId}`;
  getIO().to(roomName).emit(event as any, payload);
}
