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
 * 
 * Security:
 * - Chat room joins are validated using authenticated session data
 * - User identity is extracted from session cookies, not client-supplied
 */

import { Server as HttpServer, IncomingMessage } from 'http';
import { Server, Socket } from 'socket.io';
import { 
  ServerToClientEvents, 
  ClientToServerEvents,
  ROOM_EVENTS,
  CHAT_ROOM_EVENTS,
  CONNECTION_EVENTS,
  ConnectionConnectedPayload
} from '@shared/events';
import { randomUUID } from 'crypto';
import { log } from '../index';
import { getSessionMiddleware } from '../auth';
import passport from 'passport';
import { chatDebugStore, isChatDebugEnabled } from './chatDebug';

// Extended socket interface with authenticated user data
interface AuthenticatedSocket extends Socket<ClientToServerEvents, ServerToClientEvents> {
  userId?: string;
  tenantId?: string | null;
}

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
      credentials: true, // Enable credentials for session cookies
    },
    // Enable connection state recovery for brief disconnections
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
      skipMiddlewares: true,
    },
  });

  // Add session middleware to Socket.IO for authentication
  const sessionMiddleware = getSessionMiddleware();
  io.use((socket, next) => {
    // Wrap express session middleware for Socket.IO
    const req = socket.request as any;
    const res = { on: () => {}, end: () => {} } as any;
    sessionMiddleware(req, res, (err?: any) => {
      if (err) {
        log(`Session middleware error: ${err}`, 'socket.io');
        return next(new Error('Session error'));
      }
      // Initialize passport for this request
      passport.initialize()(req, res, () => {
        passport.session()(req, res, () => {
          // Attach user data to socket for use in handlers
          const authSocket = socket as AuthenticatedSocket;
          if (req.user) {
            authSocket.userId = req.user.id;
            authSocket.tenantId = req.user.tenantId;
            log(`Socket authenticated: ${socket.id} -> user: ${req.user.id}`, 'socket.io');
          }
          next();
        });
      });
    });
  });

  // Handle new client connections
  io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
    const authSocket = socket as AuthenticatedSocket;
    log(`Client connected: ${socket.id} (userId: ${authSocket.userId || 'anonymous'})`, 'socket.io');
    
    chatDebugStore.logEvent({
      eventType: authSocket.userId ? 'socket_connected' : 'auth_session_missing',
      socketId: socket.id,
      userId: authSocket.userId,
      tenantId: authSocket.tenantId || undefined,
    });
    
    // Send connected ack with server time and request ID
    const connectedPayload: ConnectionConnectedPayload = {
      serverTime: new Date().toISOString(),
      requestId: randomUUID(),
      userId: authSocket.userId || null,
      tenantId: authSocket.tenantId || null,
    };
    socket.emit(CONNECTION_EVENTS.CONNECTED, connectedPayload);

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

    // Handle joining/leaving chat rooms (channels and DMs)
    // Authorization: Uses server-derived userId/tenantId from authenticated session (ignores client-supplied IDs)
    socket.on(CHAT_ROOM_EVENTS.JOIN, async ({ targetType, targetId }) => {
      const roomName = `chat:${targetType}:${targetId}`;
      const conversationId = `${targetType}:${targetId}`;
      
      // Use authenticated user data from socket, not client-supplied
      const serverUserId = authSocket.userId;
      const serverTenantId = authSocket.tenantId;
      
      if (!serverUserId) {
        log(`Client ${socket.id} denied chat room join: not authenticated`, 'socket.io');
        chatDebugStore.logEvent({
          eventType: 'room_access_denied',
          socketId: socket.id,
          roomName,
          conversationId,
          errorCode: 'NOT_AUTHENTICATED',
        });
        return;
      }
      
      // Validate chat room access using server-derived identity
      try {
        const { storage } = await import('../storage');
        const hasAccess = await storage.validateChatRoomAccess(
          targetType, 
          targetId, 
          serverUserId, 
          serverTenantId || ''
        );
        
        if (!hasAccess) {
          log(`Client ${socket.id} denied access to chat room: ${roomName} (user: ${serverUserId}, tenant: ${serverTenantId})`, 'socket.io');
          chatDebugStore.logEvent({
            eventType: 'room_access_denied',
            socketId: socket.id,
            userId: serverUserId,
            tenantId: serverTenantId || undefined,
            roomName,
            conversationId,
            errorCode: 'ACCESS_DENIED',
          });
          return;
        }
        
        socket.join(roomName);
        log(`Client ${socket.id} joined chat room: ${roomName}`, 'socket.io');
        chatDebugStore.logEvent({
          eventType: 'room_joined',
          socketId: socket.id,
          userId: serverUserId,
          tenantId: serverTenantId || undefined,
          roomName,
          conversationId,
        });
      } catch (error) {
        log(`Error validating chat room access for ${socket.id}: ${error}`, 'socket.io');
        chatDebugStore.logEvent({
          eventType: 'error',
          socketId: socket.id,
          userId: serverUserId,
          tenantId: serverTenantId || undefined,
          roomName,
          errorCode: 'VALIDATION_ERROR',
        });
      }
    });

    socket.on(CHAT_ROOM_EVENTS.LEAVE, ({ targetType, targetId }) => {
      const roomName = `chat:${targetType}:${targetId}`;
      socket.leave(roomName);
      log(`Client ${socket.id} left chat room: ${roomName}`, 'socket.io');
      chatDebugStore.logEvent({
        eventType: 'room_left',
        socketId: socket.id,
        userId: authSocket.userId,
        tenantId: authSocket.tenantId || undefined,
        roomName,
        conversationId: `${targetType}:${targetId}`,
      });
    });

    // Handle client disconnection
    socket.on('disconnect', (reason) => {
      log(`Client disconnected: ${socket.id} (${reason})`, 'socket.io');
      chatDebugStore.logEvent({
        eventType: 'socket_disconnected',
        socketId: socket.id,
        userId: authSocket.userId,
        tenantId: authSocket.tenantId || undefined,
        disconnectReason: reason,
      });
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

export function emitToTenant(
  tenantId: string,
  event: string,
  payload: unknown
): void {
  const roomName = `tenant:${tenantId}`;
  getIO().to(roomName).emit(event as any, payload);
}

export function emitToChatChannel(
  channelId: string,
  event: string,
  payload: unknown
): void {
  const roomName = `chat:channel:${channelId}`;
  getIO().to(roomName).emit(event as any, payload);
}

export function emitToChatDm(
  dmThreadId: string,
  event: string,
  payload: unknown
): void {
  const roomName = `chat:dm:${dmThreadId}`;
  getIO().to(roomName).emit(event as any, payload);
}
