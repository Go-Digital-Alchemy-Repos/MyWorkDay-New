import { io, Socket } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents } from "@shared/events";

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: TypedSocket | null = null;

export function getSocket(): TypedSocket {
  if (!socket) {
    socket = io({
      path: "/socket.io",
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      autoConnect: true,
    });

    socket.on("connect", () => {
      console.log("[Socket.IO] Connected:", socket?.id);
    });

    socket.on("disconnect", (reason) => {
      console.log("[Socket.IO] Disconnected:", reason);
    });

    socket.on("connect_error", (error) => {
      console.error("[Socket.IO] Connection error:", error.message);
    });
  }
  return socket;
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
  }
}
