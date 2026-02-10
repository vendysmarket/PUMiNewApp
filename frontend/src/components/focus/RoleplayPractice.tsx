// src/components/focus/RoleplayPractice.tsx
// Interactive roleplay dialogue practice with AI partner

import { useState, useEffect } from "react";
import { Loader2, User, Bot, RotateCw, Send, MessageSquare, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface RoleplayPracticeProps {
  practiceText: string;
  topic: string;
  dayTitle: string;
  lang?: string;
  onInteraction?: (hasInteracted: boolean) => void; // NEW: notify parent of interaction
}

interface Message {
  speaker: string; // "A (Te)", "B (AI)", etc.
  content: string;
}

export function RoleplayPractice({
  practiceText,
  topic,
  dayTitle,
  lang = "hu",
  onInteraction,
}: RoleplayPracticeProps) {
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState<"A" | "B" | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  // Notify parent when user has interacted (sent at least 1 message)
  useEffect(() => {
    onInteraction?.(hasInteracted);
  }, [hasInteracted, onInteraction]);

  const startRoleplay = async (role: "A" | "B") => {
    setSelectedRole(role);
    setMessages([]);
    setUserInput("");
    
    // If user chose B, AI starts as A
    if (role === "B") {
      await getAIResponse([], "A", true);
    }
  };

  const getAIResponse = async (history: Message[], aiRole: string, isFirst: boolean = false) => {
    setLoading(true);

    try {
      const conversation = history
        .map(m => `${m.speaker}: ${m.content}`)
        .join("\n");

      const { pumiInvoke } = await import("@/lib/pumiInvoke");
      const data = await pumiInvoke<{ ok: boolean; text?: string }>("/chat/enhanced", {
        mode: "roleplay",
        message: `Párbeszéd gyakorlat - te vagy ${aiRole} szerepében.

**Téma:** ${topic}
**Nap:** ${dayTitle}

${isFirst ? `
Kezdd el a beszélgetést természetesen, röviden (1 mondat).
` : `
**Eddigi beszélgetés:**
${conversation}

Válaszolj ${aiRole} szerepében, 1 mondatban.
`}

CSAK a mondatot írd, semmi mást!`,
        lang: lang,
      });

      if (data.ok && data.text) {
        const newMsg: Message = {
          speaker: `${aiRole} (AI)`,
          content: data.text.trim(),
        };
        setMessages(prev => [...prev, newMsg]);
      }
    } catch (err) {
      console.error("AI error:", err);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!userInput.trim() || loading) return;

    const userRole = selectedRole!;
    const aiRole = selectedRole === "A" ? "B" : "A";
    
    const userMsg: Message = {
      speaker: `${userRole} (Te)`,
      content: userInput.trim(),
    };
    
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setUserInput("");
    setHasInteracted(true); // Mark as interacted after first message
    
    await getAIResponse(newHistory, aiRole);
  };

  const reset = () => {
    setSelectedRole(null);
    setMessages([]);
    setUserInput("");
    // Keep hasInteracted true - they already interacted once
  };

  // Fallback CTA: Open chat with roleplay prompt
  const openInChat = () => {
    const prompt = encodeURIComponent(`Roleplay gyakorlat: ${topic}\n\nKontextus: ${dayTitle}\n\n${practiceText}`);
    navigate(`/app/chat?prompt=${prompt}`);
    setHasInteracted(true); // Count this as interaction
  };

  // Role selection screen
  if (!selectedRole) {
    return (
      <div className="space-y-4">
        {/* Context */}
        <div className="p-3 bg-foreground/5 rounded-lg border border-foreground/10">
          <p className="text-sm font-medium mb-1">🎭 Párbeszéd gyakorlat</p>
          <p className="text-sm text-foreground/70">{practiceText || "Gyakorold a párbeszédet az AI-val"}</p>
        </div>

        {/* Role selection */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground/80">Melyik szerepet választod?</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => startRoleplay("A")}
              className="p-4 rounded-lg border border-foreground/20 hover:border-primary hover:bg-primary/5 transition-colors text-center"
            >
              <User className="w-6 h-6 mx-auto mb-2 text-primary" />
              <p className="font-medium">A szerep</p>
              <p className="text-xs text-foreground/60">Te kezded</p>
            </button>
            <button
              onClick={() => startRoleplay("B")}
              className="p-4 rounded-lg border border-foreground/20 hover:border-primary hover:bg-primary/5 transition-colors text-center"
            >
              <Bot className="w-6 h-6 mx-auto mb-2 text-primary" />
              <p className="font-medium">B szerep</p>
              <p className="text-xs text-foreground/60">AI kezd</p>
            </button>
          </div>
        </div>

        {/* Fallback CTA - Open in Chat */}
        <div className="pt-2 border-t border-foreground/10">
          <button
            onClick={openInChat}
            className="w-full py-3 px-4 rounded-lg border border-foreground/20 hover:bg-foreground/5 transition-colors flex items-center justify-center gap-2 text-sm text-foreground/70"
          >
            <MessageSquare className="w-4 h-4" />
            Roleplay indítása a Chat-ben
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  }

  // Chat interface
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground/80">
            🎭 Te: {selectedRole} szerep
          </span>
        </div>
        <button
          onClick={reset}
          className="text-sm text-foreground/60 hover:text-foreground flex items-center gap-1"
        >
          <RotateCw className="w-3 h-3" />
          Újra
        </button>
      </div>

      {/* Messages */}
      <div className="space-y-3 min-h-[150px] max-h-[300px] overflow-y-auto p-2">
        {messages.length === 0 && !loading && (
          <p className="text-sm text-foreground/50 text-center py-4">
            Kezdd el a beszélgetést!
          </p>
        )}
        
        {messages.map((msg, index) => {
          const isUser = msg.speaker.includes("Te");
          return (
            <div
              key={index}
              className={`flex ${isUser ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] p-3 rounded-lg ${
                  isUser
                    ? "bg-primary text-primary-foreground"
                    : "bg-foreground/10 text-foreground"
                }`}
              >
                <p className="text-xs opacity-70 mb-1">{msg.speaker}</p>
                <p className="text-sm">{msg.content}</p>
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-foreground/10 p-3 rounded-lg">
              <Loader2 className="w-4 h-4 animate-spin text-foreground/50" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
          placeholder="Írd be a válaszod..."
          disabled={loading}
          className="flex-1 px-3 py-2 rounded-lg border border-foreground/20 bg-background text-foreground disabled:opacity-50"
        />
        <button
          onClick={sendMessage}
          disabled={!userInput.trim() || loading}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
