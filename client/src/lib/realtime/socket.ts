import { io, Socket } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents, ConnectionConnectedPayload } from "@shared/events";
import { CONNECTION_EVENTS } from "@shared/events";

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: TypedSocket | null = null;
let isConnected = false;
let lastServerTime: string | null = null;
let lastRequestId: string | null = null;

// Track joined rooms for reconnect handling
const joinedChatRooms: Set<string> = new Set();

// Callbacks for connection state changes
type ConnectionCallback = (connected: boolean) => void;
const connectionCallbacks: Set<ConnectionCallback> = new Set();

// Callbacks for connected ack
type ConnectedAckCallback = (payload: ConnectionConnectedPayload) => void;
const connectedAckCallbacks: Set<ConnectedAckCallback> = new Set();

export function getSocket(): TypedSocket {
  if (!socket) {
    socket = io({
      path: "/socket.io",
      reconnection: true,
      reconnectionAttempts: Infinity, // Keep trying to reconnect
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      autoConnect: true,
      timeout: 20000,
    });

    socket.on("connect", () => {
      console.log("[Socket.IO] Connected:", socket?.id);
      isConnected = true;
      notifyConnectionChange(true);
      
      // Rejoin all chat rooms on reconnect
      rejoinChatRooms();
    });

    socket.on("disconnect", (reason) => {
      console.log("[Socket.IO] Disconnected:", reason);
      isConnected = false;
      notifyConnectionChange(false);
    });

    socket.on("connect_error", (error) => {
      console.error("[Socket.IO] Connection error:", error.message);
      isConnected = false;
      notifyConnectionChange(false);
    });

    // Heartbeat/ping handling - socket.io handles this automatically
    // but we can add explicit pong handling if needed
    socket.io.on("ping", () => {
      console.debug("[Socket.IO] Ping received");
    });

    // Handle server connected ack with serverTime and requestId
    socket.on(CONNECTION_EVENTS.CONNECTED, (payload: ConnectionConnectedPayload) => {
      console.log("[Socket.IO] Server ack received:", payload.requestId);
      lastServerTime = payload.serverTime;
      lastRequestId = payload.requestId;
      // Notify any listeners about the connected ack
      connectedAckCallbacks.forEach(cb => cb(payload));
    });
  }
  return socket;
}

function notifyConnectionChange(connected: boolean) {
  connectionCallbacks.forEach(cb => cb(connected));
}

export function onConnectionChange(callback: ConnectionCallback): () => void {
  connectionCallbacks.add(callback);
  // Return unsubscribe function
  return () => connectionCallbacks.delete(callback);
}

export function isSocketConnected(): boolean {
  return isConnected && socket?.connected === true;
}

// Chat room management with reconnect support
export function joinChatRoom(targetType: 'channel' | 'dm', targetId: string): void {
  const s = getSocket();
  const roomKey = `${targetType}:${targetId}`;
  
  // Prevent duplicate joins
  if (joinedChatRooms.has(roomKey)) {
    console.debug("[Socket.IO] Already in room:", roomKey);
    return;
  }
  
  s.emit("chat:join" as any, { targetType, targetId });
  joinedChatRooms.add(roomKey);
  console.log("[Socket.IO] Joining chat room:", roomKey);
}

export function leaveChatRoom(targetType: 'channel' | 'dm', targetId: string): void {
  const s = getSocket();
  const roomKey = `${targetType}:${targetId}`;
  
  if (!joinedChatRooms.has(roomKey)) {
    console.debug("[Socket.IO] Not in room:", roomKey);
    return;
  }
  
  s.emit("chat:leave" as any, { targetType, targetId });
  joinedChatRooms.delete(roomKey);
  console.log("[Socket.IO] Leaving chat room:", roomKey);
}

function rejoinChatRooms(): void {
  if (joinedChatRooms.size === 0) return;
  
  console.log("[Socket.IO] Rejoining", joinedChatRooms.size, "chat rooms after reconnect");
  const s = getSocket();
  
  joinedChatRooms.forEach(roomKey => {
    const [targetType, targetId] = roomKey.split(':') as ['channel' | 'dm', string];
    s.emit("chat:join" as any, { targetType, targetId });
    console.log("[Socket.IO] Rejoined chat room:", roomKey);
  });
}

export function clearChatRooms(): void {
  joinedChatRooms.clear();
}

export function joinProjectRoom(projectId: string): void {
  const s = getSocket();
  s.emit("room:join:project", { projectId });
  console.log("[Socket.IO] Joining project room:", projectId);
}

export function leaveProjectRoom(projectId: string): void {
  const s = getSocket();
  s.emit("room:leave:project", { projectId });
  console.log("[Socket.IO] Leaving project room:", projectId);
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
    isConnected = false;
    joinedChatRooms.clear();
    lastServerTime = null;
    lastRequestId = null;
  }
}

// Get the last server time from connected ack
export function getLastServerTime(): string | null {
  return lastServerTime;
}

// Get the last request ID from connected ack
export function getLastRequestId(): string | null {
  return lastRequestId;
}

// Subscribe to connected ack events
export function onConnectedAck(callback: ConnectedAckCallback): () => void {
  connectedAckCallbacks.add(callback);
  return () => connectedAckCallbacks.delete(callback);
}
