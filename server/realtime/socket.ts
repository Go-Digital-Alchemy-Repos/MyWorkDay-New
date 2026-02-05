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
  PRESENCE_EVENTS,
  TYPING_EVENTS,
  CHAT_EVENTS,
  ConnectionConnectedPayload,
  ChatTypingUpdatePayload
} from '@shared/events';
import { randomUUID } from 'crypto';
import { log } from '../lib/log';
import { getSessionMiddleware } from '../auth';
import passport from 'passport';
import { chatDebugStore, isChatDebugEnabled } from './chatDebug';
import { 
  markConnected, 
  markDisconnected, 
  recordPing,
  setIdle,
  toPresencePayload,
  startPresenceCleanup,
  onUserOffline,
  getOnlineUsersForTenant
} from './presence';
import {
  registerTypingSocket,
  startTyping,
  stopTyping,
  cleanupSocketTyping,
  parseConversationId,
  startTypingCleanup,
  onTypingExpired
} from './typing';
import { storage } from '../storage';

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

    // Automatically join user's personal notification room and tenant room
    if (authSocket.userId) {
      const userRoom = `user:${authSocket.userId}`;
      socket.join(userRoom);
      log(`Client ${socket.id} joined personal room: ${userRoom}`, 'socket.io');
    }

    // Join tenant room for presence updates and tenant-wide broadcasts
    if (authSocket.tenantId) {
      const tenantRoom = `tenant:${authSocket.tenantId}`;
      socket.join(tenantRoom);
      log(`Client ${socket.id} joined tenant room: ${tenantRoom}`, 'socket.io');
    }

    // Track user presence on connection
    if (authSocket.userId && authSocket.tenantId) {
      const { info, statusChanged } = markConnected(authSocket.tenantId, authSocket.userId);
      if (statusChanged) {
        // Broadcast presence update to tenant room
        const tenantRoom = `tenant:${authSocket.tenantId}`;
        io?.to(tenantRoom).emit(PRESENCE_EVENTS.UPDATE, toPresencePayload(info));
      }
      
      // Send bulk presence update to the newly connected client
      // so they get current online status of all users in their tenant
      const onlineUsers = getOnlineUsersForTenant(authSocket.tenantId);
      if (onlineUsers.length > 0) {
        socket.emit(PRESENCE_EVENTS.BULK_UPDATE, {
          users: onlineUsers.map(toPresencePayload),
        });
      }
    }

    // Handle presence ping (heartbeat)
    socket.on(PRESENCE_EVENTS.PING, () => {
      if (authSocket.userId && authSocket.tenantId) {
        const { info, statusChanged } = recordPing(authSocket.tenantId, authSocket.userId);
        // Broadcast if status changed (e.g., idle -> online)
        if (statusChanged) {
          const tenantRoom = `tenant:${authSocket.tenantId}`;
          io?.to(tenantRoom).emit(PRESENCE_EVENTS.UPDATE, toPresencePayload(info));
        }
      }
    });

    // Handle presence idle toggle
    socket.on(PRESENCE_EVENTS.IDLE, ({ isIdle }: { isIdle: boolean }) => {
      if (authSocket.userId && authSocket.tenantId) {
        const { info, statusChanged } = setIdle(authSocket.tenantId, authSocket.userId, isIdle);
        if (statusChanged) {
          const tenantRoom = `tenant:${authSocket.tenantId}`;
          io?.to(tenantRoom).emit(PRESENCE_EVENTS.UPDATE, toPresencePayload(info));
        }
      }
    });

    // Register socket for typing tracking
    if (authSocket.userId && authSocket.tenantId) {
      registerTypingSocket(socket.id, authSocket.userId, authSocket.tenantId);
    }

    // Handle typing start
    socket.on(TYPING_EVENTS.START, async ({ conversationId }) => {
      if (!authSocket.userId || !authSocket.tenantId) return;
      
      const parsed = parseConversationId(conversationId);
      if (!parsed) return;

      // Validate membership
      let isMember = false;
      try {
        if (parsed.type === 'channel') {
          isMember = await storage.isUserInChatChannel(authSocket.userId, parsed.id);
        } else {
          const userDmThreads = await storage.getUserChatDmThreads(authSocket.tenantId, authSocket.userId);
          isMember = userDmThreads.some(t => t.id === parsed.id);
        }
      } catch {
        return;
      }

      if (!isMember) return;

      const { stateChanged } = startTyping(authSocket.tenantId, authSocket.userId, conversationId, socket.id);
      
      if (stateChanged) {
        // Broadcast typing update to conversation room
        const roomName = parsed.type === 'channel' ? `chat:channel:${parsed.id}` : `chat:dm:${parsed.id}`;
        const payload: ChatTypingUpdatePayload = {
          conversationId,
          userId: authSocket.userId,
          isTyping: true,
        };
        io?.to(roomName).emit(CHAT_EVENTS.TYPING_UPDATE, payload);
      }
    });

    // Handle typing stop
    socket.on(TYPING_EVENTS.STOP, ({ conversationId }) => {
      if (!authSocket.userId) return;

      const parsed = parseConversationId(conversationId);
      if (!parsed) return;

      const { stateChanged } = stopTyping(authSocket.userId, conversationId, socket.id);
      
      if (stateChanged) {
        const roomName = parsed.type === 'channel' ? `chat:channel:${parsed.id}` : `chat:dm:${parsed.id}`;
        const payload: ChatTypingUpdatePayload = {
          conversationId,
          userId: authSocket.userId,
          isTyping: false,
        };
        io?.to(roomName).emit(CHAT_EVENTS.TYPING_UPDATE, payload);
      }
    });

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
      
      // Require tenantId for chat room access (super_users without tenant context cannot access chat)
      if (!serverTenantId) {
        log(`Client ${socket.id} denied chat room join: no tenant context (user: ${serverUserId})`, 'socket.io');
        chatDebugStore.logEvent({
          eventType: 'room_access_denied',
          socketId: socket.id,
          userId: serverUserId,
          roomName,
          conversationId,
          errorCode: 'NO_TENANT_CONTEXT',
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
          serverTenantId
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

      // Clean up typing state for this socket
      const typingCleanup = cleanupSocketTyping(socket.id);
      for (const { conversationId, userId } of typingCleanup) {
        const parsed = parseConversationId(conversationId);
        if (parsed) {
          const roomName = parsed.type === 'channel' ? `chat:channel:${parsed.id}` : `chat:dm:${parsed.id}`;
          const payload: ChatTypingUpdatePayload = {
            conversationId,
            userId,
            isTyping: false,
          };
          io?.to(roomName).emit(CHAT_EVENTS.TYPING_UPDATE, payload);
        }
      }

      // Track user presence on disconnection
      if (authSocket.userId && authSocket.tenantId) {
        const { info, statusChanged } = markDisconnected(authSocket.tenantId, authSocket.userId);
        if (statusChanged) {
          // Broadcast presence update to tenant room
          const tenantRoom = `tenant:${authSocket.tenantId}`;
          io?.to(tenantRoom).emit(PRESENCE_EVENTS.UPDATE, toPresencePayload(info));
        }
      }
    });
  });

  // Start presence cleanup for stale sessions
  startPresenceCleanup();
  
  // Register callback to emit presence updates when users go offline due to stale sessions
  onUserOffline((tenantId, userId, info) => {
    const tenantRoom = `tenant:${tenantId}`;
    io?.to(tenantRoom).emit(PRESENCE_EVENTS.UPDATE, toPresencePayload(info));
  });

  // Start typing indicator cleanup for expired entries
  startTypingCleanup();
  
  // Register callback to emit typing updates when typing expires
  onTypingExpired((conversationId, userId, tenantId) => {
    const parsed = parseConversationId(conversationId);
    if (parsed) {
      const roomName = parsed.type === 'channel' ? `chat:channel:${parsed.id}` : `chat:dm:${parsed.id}`;
      const payload: ChatTypingUpdatePayload = {
        conversationId,
        userId,
        isTyping: false,
      };
      io?.to(roomName).emit(CHAT_EVENTS.TYPING_UPDATE, payload);
    }
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

export function emitToUser(
  userId: string,
  event: string,
  payload: unknown
): void {
  const roomName = `user:${userId}`;
  getIO().to(roomName).emit(event as any, payload);
}
