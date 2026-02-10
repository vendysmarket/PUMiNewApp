import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { X, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import ChatMessage from "@/components/chat/ChatMessage";
import ChatComposer from "@/components/chat/ChatComposer";
import AuthBar from "@/components/chat/AuthBar";
import FocusSheet from "@/components/chat/FocusSheet";
import LearningFocusModal from "@/components/chat/LearningFocusModal";
import CloseTopicModal, { SummaryType } from "@/components/chat/CloseTopicModal";
import TypingIndicator from "@/components/chat/TypingIndicator";
import DetailedDocumentView from "@/components/chat/DetailedDocumentView";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useChatSessions } from "@/hooks/useChatSessions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { LearningFocusConfig, LearningFocusSession, Lesson, LearningOutline } from "@/types/learningFocus";
import { pumiInvoke } from "@/lib/pumiInvoke";

interface Message {
  id: number;
  content: string;
  isUser: boolean;
  images?: { preview: string; filename: string }[];
  isDocument?: boolean; // NEW - for detailed responses
  documentTitle?: string; // NEW
  documentCategory?: string; // NEW
  tokensUsed?: number; // NEW
}

interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

interface FocusSession {
  title: string;
  dayIndex: number;
  startedAt?: string;
  lastDoneDay?: string | null;
}

interface AttachedFile {
  id: string;
  file: File;
  preview?: string;
  type: "image" | "document";
}
// Token usage helper - UPDATED to handle detailed responses
function saveTokenUsage(
  usage:
    | {
        tokens_used_today?: number;
        token_limit?: number;
        remaining?: number;
        reset_at?: string;
      }
    | undefined,
): void {
  if (!usage) return;

  // Check if we have existing data with a resetAt time
  const existingData = localStorage.getItem("emoria_token_usage");
  let shouldReset = false;

  if (existingData) {
    try {
      const existing = JSON.parse(existingData);
      if (existing.resetAt) {
        const resetTime = new Date(existing.resetAt);
        const now = new Date();

        // If reset time has passed, we should start fresh
        if (now >= resetTime) {
          shouldReset = true;
        }
      }
    } catch (e) {
      // ignore parse errors
    }
  }

  const tokenData = {
    used: shouldReset ? 0 : usage.tokens_used_today || 0,
    limit: usage.token_limit || 25000,
    remaining: shouldReset
      ? usage.token_limit || 25000
      : usage.remaining || (usage.token_limit || 25000) - (usage.tokens_used_today || 0),
    resetAt: usage.reset_at || new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
  };

  localStorage.setItem("emoria_token_usage", JSON.stringify(tokenData));
  window.dispatchEvent(new Event("emoria_usage_update"));
}

// NEW: Update token usage after detailed response
function updateTokenUsageAfterDetailed(tokensUsed: number): void {
  const existingData = localStorage.getItem("emoria_token_usage");
  if (!existingData) return;

  try {
    const current = JSON.parse(existingData);
    current.used += tokensUsed;
    current.remaining = Math.max(0, current.remaining - tokensUsed);
    localStorage.setItem("emoria_token_usage", JSON.stringify(current));
    window.dispatchEvent(new Event("emoria_usage_update"));
  } catch (e) {
    console.error("Failed to update token usage:", e);
  }
}

// Convert File to base64
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getMediaType(file: File): string {
  return file.type || "application/octet-stream";
}

const deriveTitle = (text: string): string => {
  const firstSentence = text.split(/[.!?]/)[0].trim();
  if (firstSentence.length <= 50) return firstSentence;
  const words = text.split(/\s+/).slice(0, 6).join(" ");
  return words.length > 50 ? words.slice(0, 47) + "..." : words;
};

const ChatPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t, lang } = useTranslation();
  const { tier, member, refreshProfile } = useAuth();
  const { toast } = useToast();

  // Handle checkout success redirect
  useEffect(() => {
    if (searchParams.get('checkout') === 'success') {
      // Refresh profile data to get updated tier
      refreshProfile();
      
      // Show success message
      toast({
        title: "Előfizetés aktiválva! 🎉",
        description: "Mostantól hozzáférsz a prémium funkciókhoz.",
        duration: 5000,
      });
      
      // Clean URL
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, refreshProfile, toast]);
  const [mode, setMode] = useState<"chat" | "focus_plan">("chat");
  const [memoryNotice, setMemoryNotice] = useState<{
    id: string;
    text: string;
  } | null>(null);

  // Extract first name from member profile
  const firstName =
    member?.customFields?.["first-name"] || member?.customFields?.firstName || member?.auth?.email?.split("@")[0] || "";

  // Get tier-based greeting with optional name
  const getGreeting = () => {
    if (tier === "GEN_Z") {
      return {
        title: firstName ? `Csáó ${firstName}, mi a helyzet? 👀` : "Csáó, mi a helyzet? 👀",
        subtitle: "Mesélj. Mi van most benned? 💁🏼‍♀️",
      };
    }
    return {
      title: firstName ? `Szia ${firstName}, hogy vagy?` : "Szia, hogy vagy?",
      subtitle: "Mesélj, mi történt ma 💁🏼‍♀️",
    };
  };

  const greeting = getGreeting();

  const [messages, setMessages] = useState<Message[]>(() => {
    // Try to load active chat from localStorage first
    const activeChat = localStorage.getItem("emoria_active_chat");
    if (activeChat) {
      try {
        const parsed = JSON.parse(activeChat);
        if (parsed.messages && Array.isArray(parsed.messages) && parsed.messages.length > 0) {
          return parsed.messages;
        }
      } catch (e) {
        console.error("Failed to parse active chat:", e);
      }
    }

    // Fallback to greeting message
    return [
      {
        id: 1,
        content: `${greeting.title}\n\n${greeting.subtitle}`,
        isUser: false,
      },
    ];
  });
  const [focusSheetOpen, setFocusSheetOpen] = useState(false);
  const [activeSession, setActiveSession] = useState<FocusSession | null>(null);
  const [focusMode, setFocusMode] = useState(() => {
    return localStorage.getItem("emoria_mode") === "focus";
  });
  const [focusInputDraft, setFocusInputDraft] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isGeneratingDetailed, setIsGeneratingDetailed] = useState(false); // NEW
  const [focusOnboarding, setFocusOnboarding] = useState(false);
  const [showLearningModal, setShowLearningModal] = useState(false);
  const [pendingLearningConfig, setPendingLearningConfig] = useState<LearningFocusConfig | null>(null);
  const [showCloseTopicModal, setShowCloseTopicModal] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showProntoModal, setShowProntoModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { saveSession, getSession, deriveTitleFromMessages, updateSessionLinkedFile, updateSessionTitle } = useChatSessions();
  const [currentLinkedFileId, setCurrentLinkedFileId] = useState<string | null>(null);
  const [hasGeneratedTitle, setHasGeneratedTitle] = useState(false);
  const [generatedTitle, setGeneratedTitle] = useState<string | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Auto-hide memory notice after 3.5 seconds
  useEffect(() => {
    if (!memoryNotice) return;
    const t = setTimeout(() => setMemoryNotice(null), 3500);
    return () => clearTimeout(t);
  }, [memoryNotice]);

  // Auto-save active chat to localStorage whenever messages change
  useEffect(() => {
    if (messages.length > 1) {
      // Only save if there's more than the greeting
      const activeChat = {
        messages,
        lastUpdated: new Date().toISOString(),
        title: generatedTitle,
      };
      localStorage.setItem("emoria_active_chat", JSON.stringify(activeChat));
    }
  }, [messages, generatedTitle]);

  // Auto-generate descriptive title when chat reaches 5+ messages
  useEffect(() => {
    const generateTitle = async () => {
      // Count user and assistant messages (excluding initial greeting)
      const conversationMessages = messages.filter((m, idx) => idx > 0 || m.isUser);
      const messageCount = conversationMessages.length;

      // Generate title when we have 5+ messages and haven't already generated
      if (messageCount >= 5 && !hasGeneratedTitle) {
        setHasGeneratedTitle(true);

        try {
          const first5Messages = messages.slice(0, 6).map((m) => ({
            role: m?.isUser ? "user" : "assistant",
            content: (m?.content ?? "").slice(0, 500),
          }));

          // Use pumiInvoke to avoid CORS issues
          const data = await pumiInvoke<{ title?: string }>("/chat/enhanced", {
            conversation_context: first5Messages,
            mode: "title",
          });

          if (data.title && data.title.length > 0 && data.title.length <= 60) {
            setGeneratedTitle(data.title);

            if (currentSessionId) {
              // Update existing session title
              updateSessionTitle(currentSessionId, data.title);
            } else {
              // Auto-save the session with the generated title
              const { sessionId } = saveSession({
                title: data.title,
                messages,
              });
              setCurrentSessionId(sessionId);
            }

            // Dispatch event to update sidebar
            window.dispatchEvent(new Event("emoria_sessions_update"));
          }
        } catch (error) {
          console.error("Failed to generate title:", error);
        }
      }
    };

    generateTitle();
  }, [messages, hasGeneratedTitle, currentSessionId, saveSession, updateSessionTitle]);

  // Initialize token usage - check if reset needed on page load
  useEffect(() => {
    const stored = localStorage.getItem("emoria_token_usage");
    if (stored) {
      try {
        const data = JSON.parse(stored);

        // Check if resetAt has passed (new day)
        if (data.resetAt) {
          const resetTime = new Date(data.resetAt);
          const now = new Date();

          if (now >= resetTime) {
            // New day - reset usage
            const resetData = {
              used: 0,
              limit: data.limit || 25000,
              remaining: data.limit || 25000,
              resetAt: new Date(now.setHours(24, 0, 0, 0)).toISOString(),
            };
            localStorage.setItem("emoria_token_usage", JSON.stringify(resetData));
            window.dispatchEvent(new Event("emoria_usage_update"));
          }
        }
      } catch (e) {
        // Invalid data - reset to clean state
        const now = new Date();
        const resetData = {
          used: 0,
          limit: 25000,
          remaining: 25000,
          resetAt: new Date(now.setHours(24, 0, 0, 0)).toISOString(),
        };
        localStorage.setItem("emoria_token_usage", JSON.stringify(resetData));
        window.dispatchEvent(new Event("emoria_usage_update"));
      }
    }
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("emoria_focus_active");
    if (stored) {
      try {
        setActiveSession(JSON.parse(stored));
      } catch {
        setActiveSession(null);
        setActiveSession(null);
      }
    }
  }, []);

  // Handle loading session from URL params or starting new chat
  useEffect(() => {
    const sessionId = searchParams.get("session");
    const isNew = searchParams.get("new");

    if (isNew === "true") {
      // Start fresh chat - clear everything including active chat
      localStorage.removeItem("emoria_active_chat");
      const newGreeting = getGreeting();
      setMessages([
        {
          id: Date.now(),
          content: `${newGreeting.title}\n\n${newGreeting.subtitle}`,
          isUser: false,
        },
      ]);
      setCurrentSessionId(null);
      setCurrentLinkedFileId(null);
      setHasGeneratedTitle(false);
      setGeneratedTitle(null);
      setFocusInputDraft("");
      setFocusOnboarding(false);
      // Clear the param
      searchParams.delete("new");
      setSearchParams(searchParams, { replace: true });
    } else if (sessionId) {
      const session = getSession(sessionId);
      if (session) {
        localStorage.removeItem("emoria_active_chat"); // Clear active chat when loading from history
        setMessages(session.messages);
        setCurrentSessionId(sessionId);
        setCurrentLinkedFileId(session.linkedFileId || null);
        setHasGeneratedTitle(true); // Don't regenerate title for existing sessions
        setGeneratedTitle(session.title);
      }
      // Clear the param after loading
      searchParams.delete("session");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, getSession]);

  useEffect(() => {
    if (searchParams.get("startLearning") === "true") {
      setShowLearningModal(true);
      searchParams.delete("startLearning");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    localStorage.setItem("emoria_mode", focusMode ? "focus" : "chat");
  }, [focusMode]);

  const handleCreateFocusFromChat = (userDescription: string, aiPlanContent: string) => {
    const shortTitle = deriveTitle(userDescription);

    const newSession: FocusSession = {
      title: shortTitle,
      dayIndex: 1,
      startedAt: new Date().toISOString(),
      lastDoneDay: null,
    };
    localStorage.setItem("emoria_focus_active", JSON.stringify(newSession));
    setActiveSession(newSession);
    setFocusOnboarding(false);

    const fileName = lang === "hu" ? `Fókusz — ${shortTitle} — 1. nap` : `Focus — ${shortTitle} — Day 1`;
    const fileContent = aiPlanContent;

    const newFile = {
      id: crypto.randomUUID(),
      name: fileName,
      content: fileContent,
      createdAt: new Date().toISOString(),
    };

    const existingFiles = JSON.parse(localStorage.getItem("emoria_files") || "[]");
    const updatedFiles = [...existingFiles, newFile];
    localStorage.setItem("emoria_files", JSON.stringify(updatedFiles));

    const confirmMessage: Message = {
      id: Date.now() + 1,
      content: t("focusCreatedMessage"),
      isUser: false,
    };
    setMessages((prev) => [...prev, confirmMessage]);

    window.dispatchEvent(new Event("storage"));
    navigate(`/app/files?open=${newFile.id}`);
  };

  const handleStartLearningFocus = async (config: LearningFocusConfig) => {
    setShowLearningModal(false);
    setPendingLearningConfig(config);
    setIsTyping(true);
    setIsSending(true);

    const userMessage: Message = {
      id: Date.now(),
      content: config.goal,
      isUser: true,
    };
    setMessages((prev) => [...prev, userMessage]);

    const tier = localStorage.getItem("emoria_tier") || "genz";
    const currentLang = localStorage.getItem("emoria_lang") || "hu";
    const sessionId = localStorage.getItem("emoria_session_id") || crypto.randomUUID();
    localStorage.setItem("emoria_session_id", sessionId);

    const payload = {
      message: config.goal,
      history: [],
      tier,
      lang: currentLang,
      session_id: sessionId,
      mode: "focus_plan",
      focus_type: "learning",
      domain: config.domain,
      target_lang: config.domain === "language" ? config.targetLang : null,
      minutes_per_day: config.minutesPerDay,
      new_items_per_day: config.newItemsPerDay,
      level: config.level,
    };

    try {
      // Use pumiInvoke proxy to avoid CORS issues
      const data = await pumiInvoke<any>("/chat/enhanced", {
        ...payload,
        mode: "focus_plan",
      });

      if (data.error) {
        throw new Error(data.error);
      }

      if (data.usage) {
        saveTokenUsage(data.usage);
      }

      setIsTyping(false);
      setIsSending(false);
      const assistantText = data.reply || data.text || "";
      const assistantMessage: Message = {
        id: Date.now() + 1,
        content: assistantText,
        isUser: false,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // ✅ Memory feedback UI (only from enhanced endpoint)
      if (mode === "chat" && data?.memory_saved === 1) {
        toast({
          description: "🧠 Memória frissítve — Elmentettem ezt, hogy később relevánsabb válaszokat adhassak neked.",
        });
        setMemoryNotice({
          id: crypto.randomUUID(),
          text: "Memória frissítve — eltároltam az új információt, hogy később relevánsabb válaszokat adhassak neked.",
        });
      }

      if (data.focus && data.focus.type === "learning") {
        const session: LearningFocusSession = {
          type: "learning",
          config,
          outline: data.focus.outline,
          currentLesson: data.focus.lesson,
          startedAt: new Date().toISOString(),
          dayIndex: 1,
          lastDoneDay: null,
        };
        localStorage.setItem("emoria_learning_focus", JSON.stringify(session));
        navigate("/app/focus");
      } else {
        handleCreateFocusFromChat(config.goal, data.reply);
      }

      setPendingLearningConfig(null);
    } catch (error) {
      console.error("Learning focus error:", error);
      setIsTyping(false);
      setIsSending(false);
      setPendingLearningConfig(null);

      const assistantMessage: Message = {
        id: Date.now() + 1,
        content: "Connection error. Please try again.",
        isUser: false,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    }
  };

  // NEW: Auto-save detailed document to Tár
  const autoSaveDetailedToVault = (document: any) => {
    const files = JSON.parse(localStorage.getItem("emoria_files") || "[]");

    files.push({
      id: crypto.randomUUID(),
      name: document.title,
      content: document.content,
      type: "detailed_answer",
      category: document.category || "general",
      tokensUsed: document.tokens_used,
      createdAt: new Date().toISOString(),
    });

    localStorage.setItem("emoria_files", JSON.stringify(files));
    window.dispatchEvent(new Event("storage"));

    toast({ description: "📄 Részletes válasz mentve a Tárba" });
  };

  // MODIFIED: Enhanced handleSend with detailed response detection
  const handleSend = async (content: string, files?: AttachedFile[]) => {
    const isFocusPlan = focusOnboarding && focusMode && !activeSession;
    const shouldSendFocusPlan = isFocusPlan;
    const currentMode = shouldSendFocusPlan ? "focus_plan" : "chat";

    const messageImages = files
      ?.filter((f) => f.type === "image" && f.preview)
      .map((f) => ({
        preview: f.preview!,
        filename: f.file.name,
      }));

    const userMessage: Message = {
      id: Date.now(),
      content,
      isUser: true,
      images: messageImages,
    };
    setMessages((prev) => [...prev, userMessage]);

    setIsTyping(true);
    setIsSending(true);

    const history: HistoryMessage[] = messages.map((m) => ({
      role: (m.isUser ? "user" : "assistant") as "user" | "assistant",
      content: m.content,
    }));

    const tier = localStorage.getItem("emoria_tier") || "genz";
    const currentLang = localStorage.getItem("emoria_lang") || "hu";
    const sessionId = localStorage.getItem("emoria_session_id") || crypto.randomUUID();
    localStorage.setItem("emoria_session_id", sessionId);

    // Convert files to base64 for API
    let imagesPayload: { base64: string; media_type: string; filename: string }[] = [];
    if (files && files.length > 0) {
      try {
        imagesPayload = await Promise.all(
          files.map(async (f) => ({
            base64: await fileToBase64(f.file),
            media_type: getMediaType(f.file),
            filename: f.file.name,
          })),
        );
      } catch (err) {
        console.error("Error converting files:", err);
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      // ✅ All chat/focus requests go through pumiInvoke
      const data = await pumiInvoke<any>("/chat/enhanced", {
        message: content,
        history,
        tier,
        lang: currentLang,
        session_id: sessionId,
        mode: currentMode,
        images: imagesPayload.length > 0 ? imagesPayload : undefined,
        conversation_context: messages.slice(-5).map((m) => ({
          role: m.isUser ? "user" : "assistant",
          content: m.content,
          isUser: m.isUser,
        })),
      });

      clearTimeout(timeoutId);

      if (data.error) {
        throw new Error(data.error);
      }

      if (data.usage) {
        saveTokenUsage(data.usage);
      }

      setIsTyping(false);

      // NEW: Check if detailed response is needed
      if (data.type === "needs_detailed" && currentMode === "chat") {
        setIsGeneratingDetailed(true);
        toast({
          description: `📄 Részletes választ készítek... (~${data.metadata?.estimated_tokens || 2000} token)`,
        });

        try {
          // Call detailed answer endpoint via proxy
          const detailedData = await pumiInvoke<any>("/chat/enhanced", {
            message: content,
            lang: currentLang,
            tier,
            mode: "detailed",
            conversation_context: messages.slice(-5).map((m) => ({
              role: m.isUser ? "user" : "assistant",
              content: m.content,
            })),
          });

          if (detailedData.error) {
            throw new Error("Detailed answer failed");
          }

          if (detailedData.ok && detailedData.type === "detailed_document") {
            // API returns content directly, not nested under document
            const docContent = detailedData.content || detailedData.document?.content;
            const docTitle = detailedData.title || detailedData.document?.title || "Részletes válasz";
            const docCategory = detailedData.category || detailedData.document?.category;
            const docTokens = detailedData.tokens_used || detailedData.document?.tokens_used;

            // Add as document message
            const documentMessage: Message = {
              id: Date.now() + 1,
              content: docContent,
              isUser: false,
              isDocument: true,
              documentTitle: docTitle,
              documentCategory: docCategory,
              tokensUsed: docTokens,
            };
            setMessages((prev) => [...prev, documentMessage]);

            // Update token usage
            if (docTokens) {
              updateTokenUsageAfterDetailed(docTokens);
            }

            // Auto-save to Tár
            autoSaveDetailedToVault({
              title: docTitle,
              content: docContent,
              category: docCategory,
              tokens_used: docTokens,
            });
          } else {
            // Fallback to text response
            const assistantMessage: Message = {
              id: Date.now() + 1,
              content: detailedData.text || "Detailed response not available.",
              isUser: false,
            };
            setMessages((prev) => [...prev, assistantMessage]);
          }
        } catch (detailedError) {
          console.error("Detailed answer error:", detailedError);
          toast({ description: "⚠️ Részletes válasz sikertelen. Rövid válasz következik." });

          // Fallback: make normal chat request via proxy
          const fallbackData = await pumiInvoke<any>("/chat/enhanced", {
            message: content,
            history,
            tier,
            lang: currentLang,
            session_id: sessionId,
            mode: "chat",
          });
          const assistantMessage: Message = {
            id: Date.now() + 1,
            content: fallbackData.reply,
            isUser: false,
          };
          setMessages((prev) => [...prev, assistantMessage]);
        } finally {
          setIsGeneratingDetailed(false);
        }
      } else {
        // Normal response
        const assistantMessage: Message = {
          id: Date.now() + 1,
          content: data.reply || data.text,
          isUser: false,
        };
        setMessages((prev) => [...prev, assistantMessage]);

        // ✅ Memory feedback UI (only from enhanced endpoint in chat mode)
        if (currentMode === "chat" && data?.memory_saved === 1) {
          toast({
            description: "🧠 Memória frissítve — Elmentettem ezt, hogy később relevánsabb válaszokat adhassak neked.",
          });
          setMemoryNotice({
            id: crypto.randomUUID(),
            text: "Memória frissítve — eltároltam az új információt, hogy később relevánsabb válaszokat adhassak neked.",
          });
        }
      }

      setIsSending(false);

      if (shouldSendFocusPlan) {
        handleCreateFocusFromChat(content, data.reply);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      console.error("Chat error:", error);
      setIsTyping(false);
      setIsSending(false);
      setIsGeneratingDetailed(false);

      const assistantMessage: Message = {
        id: Date.now() + 1,
        content: "Connection error. Please try again.",
        isUser: false,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    }
  };

  const handleFocusClick = () => {
    setFocusMode(true);

    const stored = localStorage.getItem("emoria_focus_active");
    if (stored) {
      try {
        const session = JSON.parse(stored);
        setActiveSession(session);
        setFocusOnboarding(false);
      } catch {
        setActiveSession(null);
        startFocusOnboarding();
      }
    } else {
      setActiveSession(null);
      startFocusOnboarding();
    }
  };

  const startFocusOnboarding = () => {
    setFocusOnboarding(true);
    const onboardingMessage: Message = {
      id: Date.now(),
      content: t("focusOnboardingQuestion"),
      isUser: false,
    };
    setMessages((prev) => [...prev, onboardingMessage]);
  };

  const handleExitFocusMode = () => {
    setFocusMode(false);
    setFocusOnboarding(false);
    setFocusInputDraft("");
  };

  const handleChipClick = (text: string) => {
    setFocusInputDraft(text);
  };

  const handleSessionUpdate = (updatedSession: FocusSession) => {
    setActiveSession(updatedSession);
  };

  const handleProgressClick = () => {
    if (activeSession) {
      setFocusSheetOpen(true);
    }
  };
  // Generate a simple summary from chat messages (client-side placeholder)
  const generateSummary = (msgs: Message[]): string => {
    // Filter out the initial greeting and user messages only for key points
    const relevantMessages = msgs.filter((m, index) => index > 0);

    if (relevantMessages.length === 0) {
      return "• Nincs elegendő beszélgetés az összefoglalóhoz";
    }

    const bulletPoints: string[] = [];

    // Extract key points from the conversation
    for (const msg of relevantMessages) {
      if (msg.isUser) {
        // Add user topics as bullet points
        const firstLine = msg.content.split("\n")[0].trim();
        if (firstLine.length > 10 && firstLine.length < 200) {
          bulletPoints.push(`• Téma: ${firstLine}`);
        }
      } else {
        // Extract key points from assistant responses (first sentence)
        const sentences = msg.content.split(/[.!?]/).filter((s) => s.trim().length > 10);
        if (sentences.length > 0) {
          const keyPoint = sentences[0].trim();
          if (keyPoint.length < 150) {
            bulletPoints.push(`• ${keyPoint}`);
          }
        }
      }

      // Limit to 8 bullet points
      if (bulletPoints.length >= 8) break;
    }

    // Ensure at least 5 bullet points
    while (bulletPoints.length < 5 && bulletPoints.length > 0) {
      bulletPoints.push(`• Beszélgetés folytatása...`);
    }

    return bulletPoints.slice(0, 8).join("\n");
  };

  const handleCloseTopic = async (summaryType: "none" | "bullets" | "detailed") => {
    setShowCloseTopicModal(false);

    if (messages.length > 1) {
      const title = deriveTitleFromMessages(messages);
      const isUpdate = !!currentSessionId;
      const today = new Date().toISOString().split("T")[0];

      if (summaryType === "detailed") {
        try {
          toast({ description: "Részletes összefoglaló készítése..." });

          // Use pumiInvoke
          const data = await pumiInvoke<{ error?: string; ok?: boolean; type?: string; summary?: { content: string; id: string; title: string; tags?: string[]; createdAt: string }; files?: any[] }>("/summarize", {
            messages: messages.map((m) => ({
              role: m.isUser ? "user" : "assistant",
              content: m.content,
            })),
            lang: lang || "hu",
            user_instruction: "Készíts részletes, strukturált összefoglalót fájlokkal együtt.",
          });

          if (data.error) throw new Error("Summarization failed");

          if (data.ok && data.type === "summary_with_files") {
            const { sessionId } = saveSession({
              id: currentSessionId || undefined,
              title,
              messages,
              summaryText: data.summary.content,
              linkedFileId: currentLinkedFileId || undefined,
            });

            const existingFiles = JSON.parse(localStorage.getItem("emoria_files") || "[]");

            const summaryFileId = data.summary.id;
            existingFiles.push({
              id: summaryFileId,
              name: data.summary.title,
              content: data.summary.content,
              tags: data.summary.tags || [],
              type: "summary",
              attachments: data.files || [],
              createdAt: data.summary.createdAt,
            });

            if (data.files && data.files.length > 0) {
              data.files.forEach((file: any) => {
                existingFiles.push({
                  id: file.id,
                  name: file.filename,
                  content: file.content,
                  description: file.description,
                  type: "code",
                  language: file.language || "plaintext",
                  parentSummary: summaryFileId,
                  createdAt: file.createdAt || new Date().toISOString(),
                });
              });
            }

            localStorage.setItem("emoria_files", JSON.stringify(existingFiles));
            updateSessionLinkedFile(sessionId, summaryFileId);

            const fileCount = data.files ? data.files.length : 0;
            toast({
              description: `✅ Összefoglaló kész! ${fileCount} fájl csatolva a Tárban.`,
            });
          } else {
            throw new Error("Detailed summary not available");
          }
        } catch (error) {
          console.error("Detailed summary failed:", error);
          toast({ description: "❌ Részletes összefoglaló sikertelen, bulletpointok mentve helyette." });
          summaryType = "bullets";
        }
      }

      if (summaryType === "bullets") {
        let summary = generateSummary(messages);

        if (isUpdate) {
          summary = `Frissítve: ${today}\n\n${summary}`;
        }

        const { sessionId } = saveSession({
          id: currentSessionId || undefined,
          title,
          messages,
          summaryText: summary,
          linkedFileId: currentLinkedFileId || undefined,
        });

        const existingFiles = JSON.parse(localStorage.getItem("emoria_files") || "[]");

        if (currentLinkedFileId) {
          const fileIndex = existingFiles.findIndex((f: any) => f.id === currentLinkedFileId);
          if (fileIndex !== -1) {
            existingFiles[fileIndex].content = summary;
            existingFiles[fileIndex].updatedAt = new Date().toISOString();
            localStorage.setItem("emoria_files", JSON.stringify(existingFiles));
            toast({ description: "Összefoglaló frissítve a Tárban" });
          } else {
            const newFileId = crypto.randomUUID();
            existingFiles.push({
              id: newFileId,
              name: "Beszélgetés összefoglaló",
              content: summary,
              type: "bullets",
              createdAt: new Date().toISOString(),
            });
            localStorage.setItem("emoria_files", JSON.stringify(existingFiles));
            updateSessionLinkedFile(sessionId, newFileId);
            toast({ description: "Összefoglaló mentve a Tárba" });
          }
        } else {
          const newFileId = crypto.randomUUID();
          existingFiles.push({
            id: newFileId,
            name: "Beszélgetés összefoglaló",
            content: summary,
            type: "bullets",
            createdAt: new Date().toISOString(),
          });
          localStorage.setItem("emoria_files", JSON.stringify(existingFiles));
          updateSessionLinkedFile(sessionId, newFileId);
          toast({ description: "Összefoglaló mentve a Tárba és az előzményekbe" });
        }

        window.dispatchEvent(new Event("storage"));
      } else if (summaryType === "none") {
        saveSession({
          id: currentSessionId || undefined,
          title,
          messages,
          summaryText: "Nincs összefoglaló",
          linkedFileId: currentLinkedFileId || undefined,
        });

        toast({ description: "Beszélgetés mentve az előzményekbe" });
      }
    }

    localStorage.removeItem("emoria_active_chat");
    const newGreeting = getGreeting();
    setMessages([
      {
        id: Date.now(),
        content: `${newGreeting.title}\n\n${newGreeting.subtitle}`,
        isUser: false,
      },
    ]);

    setCurrentSessionId(null);
    setCurrentLinkedFileId(null);
    setFocusInputDraft("");
    setFocusOnboarding(false);
  };

  const hasUserMessages = messages.some((m) => m.isUser);
  const isEmptyState = !hasUserMessages && !currentSessionId;
  const isUserTyping = focusInputDraft.trim().length > 0;

  return (
    <>
      <div
        className="max-w-3xl mx-auto px-4 md:px-8"
        style={{ paddingBottom: "calc(200px + env(safe-area-inset-bottom, 0px))" }}
      >
        {focusMode && (
          <div className="flex items-center justify-center gap-3 mb-6">
            <span className="neon-badge px-3 py-1.5 rounded-full text-xs font-light tracking-wider text-foreground/90">
              {t("focusModeBeta")}
            </span>
            <button
              onClick={handleExitFocusMode}
              className="flex items-center gap-1 px-2 py-1 text-xs font-light text-foreground/50 hover:text-foreground transition-colors duration-300"
            >
              <X className="w-3 h-3" />
              {t("exitFocusMode")}
            </button>
          </div>
        )}

        {isEmptyState && !focusMode && (
          <div
            className={cn(
              "flex flex-col items-center justify-center text-center py-24 transition-all duration-300 motion-reduce:duration-0",
              isUserTyping ? "opacity-0 scale-95 pointer-events-none" : "opacity-100 scale-100",
            )}
          >
            <div className="welcome-glow-block space-y-3">
              <h1 className="text-2xl md:text-3xl font-light text-foreground tracking-wide">{greeting.title}</h1>
              <p className="text-base md:text-lg font-light text-foreground/70">{greeting.subtitle}</p>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-6">
          {memoryNotice && (
            <div className="flex justify-center">
              <div className="px-3 py-2 rounded-full text-xs font-light border border-foreground/20 bg-background/80 backdrop-blur-sm text-foreground/80">
                🧠 {memoryNotice.text}
              </div>
            </div>
          )}
          {messages.map((message, index) => {
            if (isEmptyState && !message.isUser && index === 0) {
              return null;
            }

            // NEW: Render detailed documents differently
            if (message.isDocument) {
              return (
                <DetailedDocumentView
                  key={message.id}
                  title={message.documentTitle || "Részletes válasz"}
                  content={message.content}
                  category={message.documentCategory}
                  tokensUsed={message.tokensUsed}
                />
              );
            }

            return (
              <div key={message.id}>
                {message.isUser && message.images && message.images.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2 justify-end">
                    {message.images.map((img, idx) => (
                      <img
                        key={idx}
                        src={img.preview}
                        alt={img.filename}
                        className="max-w-[200px] max-h-[150px] rounded-lg object-cover border border-foreground/20"
                      />
                    ))}
                  </div>
                )}
                <ChatMessage content={message.content} isUser={message.isUser} focusMode={focusMode} />
              </div>
            );
          })}
          {isTyping && !isGeneratingDetailed && <TypingIndicator focusMode={focusMode} />}
          {isGeneratingDetailed && (
            <div className="max-w-[70%] px-5 py-4 rounded-2xl mr-auto bg-transparent border border-foreground/80 text-foreground">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <span 
                    className="w-1.5 h-1.5 rounded-full bg-foreground/50 animate-[typing-dot_1.4s_ease-in-out_infinite]"
                    style={{ animationDelay: "0ms" }}
                  />
                  <span 
                    className="w-1.5 h-1.5 rounded-full bg-foreground/50 animate-[typing-dot_1.4s_ease-in-out_infinite]"
                    style={{ animationDelay: "200ms" }}
                  />
                  <span 
                    className="w-1.5 h-1.5 rounded-full bg-foreground/50 animate-[typing-dot_1.4s_ease-in-out_infinite]"
                    style={{ animationDelay: "400ms" }}
                  />
                </div>
                <span className="text-sm text-foreground/60">Részletes dokumentum készítése... (~30 mp)</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {hasUserMessages && (
        <div className="fixed bottom-[180px] md:bottom-[150px] left-0 md:left-16 right-0 px-4 md:px-8 z-20 pointer-events-none">
          <div className="max-w-3xl mx-auto flex justify-end pointer-events-auto">
            <button
              onClick={() => setShowCloseTopicModal(true)}
              className="flex items-center gap-1.5 px-3 md:px-4 py-2 text-[11px] md:text-xs font-light text-foreground/50 border border-foreground/20 rounded-full hover:border-foreground/40 hover:text-foreground/70 hover:bg-foreground/5 transition-all bg-background/90 backdrop-blur-sm"
            >
              <CheckCircle className="w-3 h-3 md:w-3.5 md:h-3.5" />
              <span className="hidden md:inline">Téma lezárása</span>
              <span className="md:hidden">Lezár</span>
            </button>
          </div>
        </div>
      )}

      <ChatComposer
        onSend={handleSend}
        value={focusInputDraft}
        onChange={setFocusInputDraft}
        onVaultClick={() => navigate("/app/files")}
        disabled={isSending || isGeneratingDetailed}
        isEmptyState={isEmptyState}
        onProntoClick={() => setShowProntoModal(true)}
      />

      <AuthBar className="fixed bottom-0 left-0 right-0 z-30" />

      {activeSession && (
        <FocusSheet
          open={focusSheetOpen}
          onOpenChange={setFocusSheetOpen}
          session={activeSession}
          onSessionUpdate={handleSessionUpdate}
        />
      )}

      <LearningFocusModal
        open={showLearningModal}
        onOpenChange={setShowLearningModal}
        initialGoal={focusInputDraft}
        onStart={handleStartLearningFocus}
      />

      <CloseTopicModal open={showCloseTopicModal} onOpenChange={setShowCloseTopicModal} onConfirm={handleCloseTopic} />

      <Dialog open={showProntoModal} onOpenChange={setShowProntoModal}>
        <DialogContent className="sm:max-w-[400px] bg-background border border-foreground/20">
          <DialogHeader>
            <DialogTitle className="text-center font-light tracking-wide text-foreground">PUMi Core</DialogTitle>
          </DialogHeader>

          <div className="py-4 space-y-4 text-sm">
            <div>
              <h3 className="text-foreground/80 font-medium mb-1">Mi ez?</h3>
              <p className="text-foreground/60 leading-relaxed">
                PUMi Core a PUMi nyelvi motorja. Generáció-érzékeny, és jelenlétre + fókuszra van hangolva.
              </p>
            </div>

            <div>
              <h3 className="text-foreground/80 font-medium mb-2">Mire jó?</h3>
              <ul className="text-foreground/60 space-y-1">
                <li>• beszélgetés: tisztázás, keretezés, döntési opciók</li>
                <li>• fókusz: napi terv, feladatokra bontás, follow-through</li>
                <li>• projektek: roadmap, prioritás, next steps</li>
                <li>• tanítás/tutoriálás: lépésről lépésre magyarázat</li>
                <li>• képek/screenshotok értelmezése</li>
                <li>• feltöltött fájlok átolvasása és összefoglalása</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() => setShowProntoModal(false)}
              className="w-full bg-foreground text-background hover:bg-foreground/90"
            >
              Bezárás
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ChatPage;
