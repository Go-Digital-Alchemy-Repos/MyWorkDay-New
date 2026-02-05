/**
 * Chat Typing Indicators Hook
 * 
 * Manages typing indicator state for chat conversations.
 * - Subscribes to typing update events from server
 * - Provides methods to emit typing start/stop events
 * - Throttles typing start events (max once per second)
 * - Auto-stops typing after 1200ms inactivity
 */

import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo, ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { getSocket, isSocketConnected, onConnectionChange } from '@/lib/realtime/socket';
import { TYPING_EVENTS, CHAT_EVENTS, ChatTypingUpdatePayload } from '@shared/events';

interface TypingContextType {
  getTypingUsers: (conversationId: string) => string[];
  startTyping: (conversationId: string) => void;
  stopTyping: (conversationId: string) => void;
}

const TypingContext = createContext<TypingContextType | null>(null);

const THROTTLE_MS = 1000; // Throttle typing start to max once per second
const AUTO_STOP_MS = 1200; // Auto-stop typing after 1200ms inactivity

export function TypingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [typingMap, setTypingMap] = useState<Map<string, Set<string>>>(new Map());
  const [isConnected, setIsConnected] = useState(() => isSocketConnected());
  
  const lastTypingStartRef = useRef<Map<string, number>>(new Map());
  const autoStopTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const currentConversationRef = useRef<string | null>(null);

  useEffect(() => {
    const cleanup = onConnectionChange(setIsConnected);
    return cleanup;
  }, []);

  useEffect(() => {
    if (!isConnected) return;

    const socket = getSocket();

    const handleTypingUpdate = (payload: ChatTypingUpdatePayload) => {
      if (payload.userId === user?.id) return;

      setTypingMap(prev => {
        const newMap = new Map(prev);
        let conversationTypers = newMap.get(payload.conversationId);
        
        if (payload.isTyping) {
          if (!conversationTypers) {
            conversationTypers = new Set();
            newMap.set(payload.conversationId, conversationTypers);
          }
          conversationTypers.add(payload.userId);
        } else {
          if (conversationTypers) {
            conversationTypers.delete(payload.userId);
            if (conversationTypers.size === 0) {
              newMap.delete(payload.conversationId);
            }
          }
        }
        
        return newMap;
      });
    };

    socket.on(CHAT_EVENTS.TYPING_UPDATE as any, handleTypingUpdate);

    return () => {
      socket.off(CHAT_EVENTS.TYPING_UPDATE as any, handleTypingUpdate);
    };
  }, [isConnected, user?.id]);

  useEffect(() => {
    return () => {
      autoStopTimerRef.current.forEach(timer => clearTimeout(timer));
      autoStopTimerRef.current.clear();
    };
  }, []);

  const startTyping = useCallback((conversationId: string) => {
    if (!isConnected) return;

    currentConversationRef.current = conversationId;

    const now = Date.now();
    const lastStart = lastTypingStartRef.current.get(conversationId) || 0;
    
    if (now - lastStart < THROTTLE_MS) return;
    
    lastTypingStartRef.current.set(conversationId, now);

    const socket = getSocket();
    socket.emit(TYPING_EVENTS.START, { conversationId });

    const existingTimer = autoStopTimerRef.current.get(conversationId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    const timer = setTimeout(() => {
      socket.emit(TYPING_EVENTS.STOP, { conversationId });
      autoStopTimerRef.current.delete(conversationId);
    }, AUTO_STOP_MS);
    
    autoStopTimerRef.current.set(conversationId, timer);
  }, [isConnected]);

  const stopTyping = useCallback((conversationId: string) => {
    if (!isConnected) return;

    const existingTimer = autoStopTimerRef.current.get(conversationId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      autoStopTimerRef.current.delete(conversationId);
    }

    lastTypingStartRef.current.delete(conversationId);

    const socket = getSocket();
    socket.emit(TYPING_EVENTS.STOP, { conversationId });
  }, [isConnected]);

  const getTypingUsers = useCallback((conversationId: string): string[] => {
    const typers = typingMap.get(conversationId);
    return typers ? Array.from(typers) : [];
  }, [typingMap]);

  const value = useMemo(() => ({
    getTypingUsers,
    startTyping,
    stopTyping,
  }), [getTypingUsers, startTyping, stopTyping]);

  return (
    <TypingContext.Provider value={value}>
      {children}
    </TypingContext.Provider>
  );
}

export function useTyping(): TypingContextType {
  const context = useContext(TypingContext);
  if (!context) {
    return {
      getTypingUsers: () => [],
      startTyping: () => {},
      stopTyping: () => {},
    };
  }
  return context;
}

export function useConversationTyping(conversationId: string | null): {
  typingUsers: string[];
  startTyping: () => void;
  stopTyping: () => void;
} {
  const { getTypingUsers, startTyping: ctxStartTyping, stopTyping: ctxStopTyping } = useTyping();
  
  const typingUsers = useMemo(() => {
    if (!conversationId) return [];
    return getTypingUsers(conversationId);
  }, [conversationId, getTypingUsers]);
  
  const startTyping = useCallback(() => {
    if (conversationId) {
      ctxStartTyping(conversationId);
    }
  }, [conversationId, ctxStartTyping]);
  
  const stopTyping = useCallback(() => {
    if (conversationId) {
      ctxStopTyping(conversationId);
    }
  }, [conversationId, ctxStopTyping]);
  
  return { typingUsers, startTyping, stopTyping };
}
