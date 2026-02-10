import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { pumiInvoke } from "@/lib/pumiInvoke";
import { RefreshCw, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useChatSessions } from "@/hooks/useChatSessions";
import CloseTopicModal, { SummaryType } from "@/components/chat/CloseTopicModal";
import ChatMessage from "@/components/chat/ChatMessage";
import ChatComposer from "@/components/chat/ChatComposer";
import TypingIndicator from "@/components/chat/TypingIndicator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// ============ Types ============
type ChatRole = "user" | "assistant";

type VaultFile = {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  type: "document" | "summary" | "focus" | "note";
  tags?: string[];
};

interface AttachedFile {
  id: string;
  file: File;
  preview?: string;
  type: "image" | "document";
}

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  isError?: boolean;
  images?: { preview: string; filename: string }[];
}

// ============ Vault Helpers ============
const VAULT_KEY = "emoria_files"; // compatible with FilesPage

function readVault(): VaultFile[] {
  try {
    const raw = localStorage.getItem(VAULT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeVault(files: VaultFile[]) {
  localStorage.setItem(VAULT_KEY, JSON.stringify(files));
  // notify other tabs/components
  window.dispatchEvent(new StorageEvent("storage", { key: VAULT_KEY }));
}

function saveToVault(file: Omit<VaultFile, "id" | "createdAt">) {
  const files = readVault();
  const entry: VaultFile = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    ...file,
  };
  writeVault([entry, ...files]);
  return entry;
}

function safeTitleFromContent(content: string, fallback = "Mentett jegyzet") {
  const firstLine = (content || "").split("\n").find((l) => l.trim())?.trim() || "";
  const cleaned = firstLine.replace(/^#{1,6}\s+/, "").slice(0, 60);
  return cleaned || fallback;
}

// ============ Utility Functions ============
function buildHistory(messages: { isUser: boolean; content: string }[], limit = 12) {
  return messages
    .filter((m) => (m.content || "").trim().length > 0)
    .slice(-limit)
    .map((m) => ({
      role: (m.isUser ? "user" : "assistant") as ChatRole,
      content: m.content,
    }));
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

export default function NewChatPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { tier, member } = useAuth();
  const { saveSession, getSession } = useChatSessions();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);
  
  // Language from localStorage or default hu
  const lang = localStorage.getItem("emoria_lang") || "hu";
  
  // Extract first name from member profile
  const firstName =
    member?.customFields?.["first-name"] || member?.customFields?.firstName || member?.auth?.email?.split("@")[0] || "";

  // Get tier-based greeting with optional name
  const getGreeting = useCallback(() => {
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
  }, [tier, firstName]);

  const [messages, setMessages] = useState<Message[]>(() => {
    const greeting = getGreeting();
    return [
      {
        id: "intro",
        content: `${greeting.title}\n\n${greeting.subtitle}`,
        isUser: false,
      },
    ];
  });

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCloseTopicModal, setShowCloseTopicModal] = useState(false);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [showProntoModal, setShowProntoModal] = useState(false);

  // Handle new chat request or session loading
  useEffect(() => {
    const isNew = searchParams.get("new");
    const sessionId = searchParams.get("session");

    if (isNew === "true") {
      // Start fresh chat
      const greeting = getGreeting();
      setMessages([
        {
          id: crypto.randomUUID(),
          content: `${greeting.title}\n\n${greeting.subtitle}`,
          isUser: false,
        },
      ]);
      setInput("");
      setLastFailedMessage(null);
      setAttachedFiles([]);
      searchParams.delete("new");
      setSearchParams(searchParams, { replace: true });
    } else if (sessionId) {
      // Load session from history
      const session = getSession(sessionId);
      if (session) {
        setMessages(
          session.messages.map((m) => ({
            id: m.id?.toString() || crypto.randomUUID(),
            content: m.content,
            isUser: m.isUser,
            images: m.images,
          }))
        );
      }
      searchParams.delete("session");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, getGreeting, getSession]);

  // Smart scroll - only auto-scroll if user hasn't scrolled up
  const scrollToBottom = useCallback(() => {
    if (!userScrolledUp.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, []);


  // Scroll to bottom on new messages (respecting user scroll position)
  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, scrollToBottom]);


  // Map tier to API format
  const getApiTier = useCallback(() => {
    if (tier === "GEN_Z") return "genz";
    if (tier === "MILLENIAL") return "millennial";
    return "millennial"; // default
  }, [tier]);

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newFiles: AttachedFile[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      file,
      type: file.type.startsWith("image/") ? "image" : "document",
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
    }));

    setAttachedFiles((prev) => [...prev, ...newFiles]);
    e.target.value = "";
  };

  // Remove attached file
  const removeFile = (id: string) => {
    setAttachedFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file?.preview) {
        URL.revokeObjectURL(file.preview);
      }
      return prev.filter((f) => f.id !== id);
    });
  };

  async function sendMessage(messageOverride?: string) {
    const messageContent = messageOverride || input.trim();
    if ((!messageContent && attachedFiles.length === 0) || loading) return;

    // Clear any previous error state
    setLastFailedMessage(null);
    
    // Remove previous error messages
    setMessages((prev) => prev.filter((m) => !m.isError));

    // Build user message with images
    const userImages = attachedFiles
      .filter((f) => f.type === "image" && f.preview)
      .map((f) => ({ preview: f.preview!, filename: f.file.name }));

    const userMessage: Message = {
      id: crypto.randomUUID(),
      content: messageContent || (lang === "hu" ? "[Kép csatolva]" : "[Image attached]"),
      isUser: true,
      images: userImages.length > 0 ? userImages : undefined,
    };

    // Only add user message if not a retry
    if (!messageOverride) {
      setMessages((prev) => [...prev, userMessage]);
      setInput("");
    }
    
    setLoading(true);
    userScrolledUp.current = false; // Reset scroll tracking when sending

    try {
      console.log("[NewChatPage] Sending message via pumiInvoke...");
      
      const filtered = messages.filter((m) => m.id !== "intro" && !m.isError);
      const history = buildHistory(filtered, 12);
      
      // Prepare images for API
      let imagesPayload: { base64: string; media_type: string }[] | undefined;
      
      if (attachedFiles.length > 0 && !messageOverride) {
        const imageFiles = attachedFiles.filter((f) => f.type === "image");
        if (imageFiles.length > 0) {
          imagesPayload = await Promise.all(
            imageFiles.map(async (f) => ({
              base64: await fileToBase64(f.file),
              media_type: f.file.type || "image/jpeg",
            }))
          );
        }
      }
      
      const response = await pumiInvoke<any>("/chat/enhanced", {
        message: messageContent || "Nézd meg ezt a képet.",
        history,
        tier: getApiTier(),
        lang,
        mode: "chat",
        ...(imagesPayload && { images: imagesPayload }),
      });

      console.log("[NewChatPage] Response:", response);

      // Clear attached files after successful send
      attachedFiles.forEach((f) => {
        if (f.preview) URL.revokeObjectURL(f.preview);
      });
      setAttachedFiles([]);

      // Check for error response
      if (!response.ok && response.error) {
        throw new Error(response.error || "API error");
      }

      // 1) Detailed document - auto-save to Vault
      if (response.type === "detailed_document") {
        const content = String(response.content ?? "");
        const title = String(response.title ?? safeTitleFromContent(content, "Detailed dokumentum"));
        
        // Auto-save to vault
        saveToVault({
          title,
          content,
          type: "document",
          tags: response.category ? [String(response.category)] : ["detailed"],
        });

        const assistantMessage: Message = {
          id: crypto.randomUUID(),
          content: `✅ Elmentve a Tárba: **${title}**\n\n${content}`,
          isUser: false,
        };

        setMessages((prev) => [...prev, assistantMessage]);
        return;
      }

      // 2) Regular chat response
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        content: response.text || response.reply || "Nem érkezett válasz.",
        isUser: false,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      console.error("[NewChatPage] Error:", err);
      setLastFailedMessage(messageContent);
      
      const errorMessage = lang === "hu" 
        ? "Most nem érem el a szervert. Próbáld meg újra."
        : "Cannot reach the server right now. Please try again.";
      
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          content: errorMessage,
          isUser: false,
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const handleRetry = () => {
    if (lastFailedMessage) {
      // Remove the error message
      setMessages((prev) => prev.filter((m) => !m.isError));
      sendMessage(lastFailedMessage);
    }
  };

  const handleCloseTopic = async (_summaryType: SummaryType) => {
    if (loading) return;

    const filtered = messages.filter((m) => m.id !== "intro" && !m.isError);
    const history = buildHistory(filtered, 20);

    setLoading(true);
    setShowCloseTopicModal(false);

    try {
      const res = await pumiInvoke<any>("/summarize", {
        history,
        lang,
        tier: getApiTier(),
      });

      if (!res.ok) throw new Error(res.error || "Summarize failed");

      // Expected: { ok:true, title, summary, attachments?: [{title, content, type}] }
      const title = String(res.title ?? safeTitleFromContent(res.summary || "", "Összefoglaló"));
      const summary = String(res.summary ?? res.text ?? "");

      // Save summary to Vault
      saveToVault({
        title,
        content: summary,
        type: "summary",
        tags: ["topic-close"],
      });

      // Save attachments if any
      const atts = Array.isArray(res.attachments) ? res.attachments : [];
      for (const a of atts) {
        const aTitle = String(a.title ?? "Melléklet");
        const aContent = String(a.content ?? "");
        saveToVault({
          title: aTitle,
          content: aContent,
          type: "note",
          tags: [String(a.type ?? "attachment")],
        });
      }

      // Also save session for history
      saveSession({
        title,
        messages: messages
          .filter((m) => !m.isError)
          .map((m, idx) => ({
            id: idx,
            content: m.content,
            isUser: m.isUser,
            images: m.images,
          })),
        summaryText: summary,
      });

      // Show confirmation message
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          isUser: false,
          content: `✅ Téma lezárva és elmentve a Tárba: **${title}**${atts.length > 0 ? `\n\n📎 ${atts.length} melléklet mentve` : ""}`,
        },
      ]);

      // Reset to fresh state after a short delay
      setTimeout(() => {
        const newGreeting = getGreeting();
        setMessages([
          {
            id: crypto.randomUUID(),
            content: `${newGreeting.title}\n\n${newGreeting.subtitle}`,
            isUser: false,
          },
        ]);
        setLastFailedMessage(null);
        setAttachedFiles([]);
      }, 2000);

    } catch (err) {
      console.error("[NewChatPage] Summarize failed:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          isUser: false,
          content: lang === "hu" 
            ? "Nem sikerült lezárni a témát. Próbáld újra." 
            : "Could not close the topic. Please try again.",
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
    }

    // Dispatch event to update sidebar
    window.dispatchEvent(new Event("emoria_sessions_update"));
  };

  const handleVaultClick = () => {
    navigate("/app/files");
  };

  const hasConversation = messages.filter((m) => m.id !== "intro").length > 0;
  const canSend = (input.trim() || attachedFiles.length > 0) && !loading;

  const hasUserMessages = messages.some((m) => m.isUser);
  const isEmptyState = !hasUserMessages;

  // Handle send from ChatComposer
  const handleComposerSend = (message: string, files?: AttachedFile[]) => {
    if (files && files.length > 0) {
      setAttachedFiles(files);
    }
    setInput(message);
    // Use setTimeout to let state update, then send
    setTimeout(() => {
      sendMessage(message);
    }, 0);
  };

  return (
    <>
      <div
        className="max-w-3xl mx-auto px-4 md:px-8"
        style={{ paddingBottom: "calc(200px + env(safe-area-inset-bottom, 0px))" }}
      >
        {/* Welcome state when empty */}
        {isEmptyState && (
          <div
            className={cn(
              "flex flex-col items-center justify-center text-center py-24 transition-all duration-300 motion-reduce:duration-0",
              input.trim() ? "opacity-0 scale-95 pointer-events-none" : "opacity-100 scale-100",
            )}
          >
            <div className="welcome-glow-block space-y-3">
              <h1 className="text-2xl md:text-3xl font-light text-foreground tracking-wide">
                {getGreeting().title}
              </h1>
              <p className="text-base md:text-lg font-light text-foreground/70">
                {getGreeting().subtitle}
              </p>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex flex-col gap-6">
          {messages.map((message, index) => {
            // Hide intro message in empty state
            if (isEmptyState && !message.isUser && index === 0) {
              return null;
            }

            return (
              <div key={message.id}>
                {/* Image previews above user message */}
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

                {/* Error message with retry */}
                {message.isError ? (
                  <div className="max-w-[70%] px-5 py-3.5 rounded-2xl mr-auto bg-transparent border border-red-500/40 text-red-400">
                    <p className="text-sm font-light leading-relaxed">{message.content}</p>
                    {lastFailedMessage && (
                      <button
                        onClick={handleRetry}
                        className="mt-3 flex items-center gap-1.5 text-xs text-red-400/80 hover:text-red-400 transition-colors"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>{lang === "hu" ? "Újrapróbálás" : "Retry"}</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <ChatMessage content={message.content} isUser={message.isUser} />
                )}
              </div>
            );
          })}

          {/* Typing indicator */}
          {loading && <TypingIndicator />}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Close topic button - floating */}
      {hasUserMessages && !loading && (
        <div className="fixed bottom-[180px] md:bottom-[150px] left-0 md:left-16 right-0 px-4 md:px-8 z-20 pointer-events-none">
          <div className="max-w-3xl mx-auto flex justify-end pointer-events-auto">
            <button
              onClick={() => setShowCloseTopicModal(true)}
              className="flex items-center gap-1.5 px-3 md:px-4 py-2 text-[11px] md:text-xs font-light text-foreground/50 border border-foreground/20 rounded-full hover:border-foreground/40 hover:text-foreground/70 hover:bg-foreground/5 transition-all bg-background/90 backdrop-blur-sm"
            >
              <CheckCircle className="w-3 h-3 md:w-3.5 md:h-3.5" />
              <span className="hidden md:inline">{lang === "hu" ? "Téma lezárása" : "Close topic"}</span>
              <span className="md:hidden">{lang === "hu" ? "Lezár" : "Close"}</span>
            </button>
          </div>
        </div>
      )}

      {/* ChatComposer - matching legacy UI */}
      <ChatComposer
        onSend={handleComposerSend}
        value={input}
        onChange={setInput}
        onVaultClick={() => navigate("/app/files")}
        disabled={loading}
        hasMessages={hasUserMessages}
        isEmptyState={isEmptyState}
        onProntoClick={() => setShowProntoModal(true)}
      />

      {/* Close Topic Modal */}
      <CloseTopicModal
        open={showCloseTopicModal}
        onOpenChange={setShowCloseTopicModal}
        onConfirm={handleCloseTopic}
      />

      {/* PUMi Core Modal */}
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
}
