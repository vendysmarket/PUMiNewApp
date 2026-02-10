import { useState, useEffect, useCallback } from "react";

export interface ChatSession {
  id: string;
  title: string;
  messages: {
    id: number;
    content: string;
    isUser: boolean;
    images?: { preview: string; filename: string }[];
  }[];
  summaryText?: string;
  linkedFileId?: string; // Links to the file in Tár for updates
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = "emoria_chat_sessions";

export function useChatSessions() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);

  // Load sessions from localStorage
  const loadSessions = useCallback(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as ChatSession[];
        // Sort by updatedAt descending (most recent first)
        parsed.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        setSessions(parsed);
      }
    } catch (e) {
      console.error("Failed to load chat sessions:", e);
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    loadSessions();

    // Listen for storage changes
    const handleStorageChange = () => loadSessions();
    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("emoria_sessions_update", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("emoria_sessions_update", handleStorageChange);
    };
  }, [loadSessions]);

  // Save a new session or update existing one
  const saveSession = useCallback((
    session: Omit<ChatSession, "id" | "createdAt" | "updatedAt"> & { id?: string }
  ): { sessionId: string; isUpdate: boolean } => {
    const now = new Date().toISOString();
    const existingSessions = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as ChatSession[];
    let sessionId: string;
    let isUpdate = false;
    
    if (session.id) {
      // Update existing session
      const index = existingSessions.findIndex(s => s.id === session.id);
      if (index !== -1) {
        existingSessions[index] = {
          ...existingSessions[index],
          ...session,
          updatedAt: now,
        };
        sessionId = session.id;
        isUpdate = true;
      } else {
        sessionId = session.id;
      }
    } else {
      // Create new session
      sessionId = crypto.randomUUID();
      const newSession: ChatSession = {
        id: sessionId,
        title: session.title,
        messages: session.messages,
        summaryText: session.summaryText,
        linkedFileId: session.linkedFileId,
        createdAt: now,
        updatedAt: now,
      };
      existingSessions.unshift(newSession);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(existingSessions));
    window.dispatchEvent(new Event("emoria_sessions_update"));
    loadSessions();

    return { sessionId, isUpdate };
  }, [loadSessions]);

  // Update linked file ID for a session
  const updateSessionLinkedFile = useCallback((sessionId: string, fileId: string) => {
    const existingSessions = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as ChatSession[];
    const index = existingSessions.findIndex(s => s.id === sessionId);
    if (index !== -1) {
      existingSessions[index].linkedFileId = fileId;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existingSessions));
      window.dispatchEvent(new Event("emoria_sessions_update"));
    }
  }, []);

  // Get a specific session by ID
  const getSession = useCallback((id: string): ChatSession | undefined => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return undefined;
    
    try {
      const parsed = JSON.parse(stored) as ChatSession[];
      return parsed.find(s => s.id === id);
    } catch {
      return undefined;
    }
  }, []);

  // Delete a session
  const deleteSession = useCallback((id: string) => {
    const existingSessions = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as ChatSession[];
    const filtered = existingSessions.filter(s => s.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    window.dispatchEvent(new Event("emoria_sessions_update"));
    loadSessions();
  }, [loadSessions]);

  // Derive title from first user message or generate numbered fallback
  const deriveTitleFromMessages = useCallback((messages: ChatSession["messages"]): string => {
    const firstUserMessage = messages.find(m => m.isUser);
    if (!firstUserMessage) {
      // Count existing sessions to generate numbered title
      const existingSessions = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as ChatSession[];
      return `Új beszélgetés #${existingSessions.length + 1}`;
    }
    
    const text = firstUserMessage.content;
    const firstSentence = text.split(/[.!?]/)[0].trim();
    if (firstSentence.length <= 40) return firstSentence;
    const words = text.split(/\s+/).slice(0, 5).join(" ");
    return words.length > 40 ? words.slice(0, 37) + "..." : words;
  }, []);

  // Update title for an existing session
  const updateSessionTitle = useCallback((sessionId: string, newTitle: string) => {
    const existingSessions = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as ChatSession[];
    const index = existingSessions.findIndex(s => s.id === sessionId);
    if (index !== -1) {
      existingSessions[index].title = newTitle;
      existingSessions[index].updatedAt = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existingSessions));
      window.dispatchEvent(new Event("emoria_sessions_update"));
      loadSessions();
    }
  }, [loadSessions]);

  return {
    sessions,
    saveSession,
    getSession,
    deleteSession,
    deriveTitleFromMessages,
    updateSessionLinkedFile,
    updateSessionTitle,
    loadSessions,
  };
}
