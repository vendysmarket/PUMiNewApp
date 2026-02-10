import { useState, useRef, useEffect } from "react";
import { Send, Loader2, RotateCcw, MessageSquare } from "lucide-react";
import { pumiInvoke } from "@/lib/pumiInvoke";
import { useNavigate } from "react-router-dom";
import type { RoleplayContent } from "@/types/focusItem";

interface RoleplayRendererProps {
  content: RoleplayContent;
  topic: string;
  minChars: number;
  onValidationChange: (state: { messagesCount: number; charCount: number }) => void;
}

interface Message {
  role: "user" | "ai";
  content: string;
}

export function RoleplayRenderer({ content, topic, minChars, onValidationChange }: RoleplayRendererProps) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Update validation state
    const userMessages = messages.filter(m => m.role === "user");
    const totalChars = userMessages.reduce((sum, m) => sum + m.content.length, 0);
    onValidationChange({ messagesCount: userMessages.length, charCount: totalChars });
  }, [messages, onValidationChange]);

  const startRoleplay = async () => {
    setStarted(true);
    setLoading(true);
    
    try {
      const prompt = `Te egy nyelvgyakorlási partner vagy. A következő szituációban gyakorolunk: "${content.scenario}".
Te vagy: ${content.roles.ai}
A felhasználó: ${content.roles.user}

Kezdd a beszélgetést egy természetes mondattal. Maradj karakterben, legyél tömör (max 2 mondat).`;

      const response = await pumiInvoke<{ reply?: string; text?: string }>("/chat/enhanced", { message: prompt, mode: "roleplay" });
      const aiReply = response.reply || response.text || "Szia! Készen állsz a gyakorlásra?";
      
      setMessages([{ role: "ai", content: aiReply }]);
    } catch (error) {
      console.error("Roleplay start failed:", error);
      setMessages([{ role: "ai", content: "Szia! Készen állsz a gyakorlásra?" }]);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setLoading(true);

    try {
      const history = [...messages, { role: "user", content: userMessage }];
      const historyText = history
        .map(m => `${m.role === "user" ? content.roles.user : content.roles.ai}: ${m.content}`)
        .join("\n");

      const prompt = `Te egy nyelvgyakorlási partner vagy. Szituáció: "${content.scenario}".
Te vagy: ${content.roles.ai}

Eddigi beszélgetés:
${historyText}

Válaszolj természetesen, max 2 mondatban. Maradj karakterben.`;

      const response = await pumiInvoke<{ reply?: string; text?: string }>("/chat/enhanced", { message: prompt, mode: "roleplay" });
      const aiReply = response.reply || response.text || "Értem!";
      
      setMessages(prev => [...prev, { role: "ai", content: aiReply }]);
    } catch (error) {
      console.error("Roleplay message failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const reset = () => {
    setMessages([]);
    setInput("");
    setStarted(false);
    onValidationChange({ messagesCount: 0, charCount: 0 });
  };

  const openInChat = () => {
    const prompt = `Roleplay: ${content.scenario}\n\nTe vagy: ${content.roles.user}\nPartner: ${content.roles.ai}`;
    navigate(`/app/chat?prefill=${encodeURIComponent(prompt)}`);
  };

  const charCount = input.length;
  const charProgress = Math.min(100, (charCount / minChars) * 100);
  const isValidLength = charCount >= minChars;

  if (!started) {
    return (
      <div className="space-y-4">
        <div className="p-4 rounded-lg bg-foreground/5 border border-foreground/10">
          <h4 className="font-medium text-foreground mb-2">Szituáció</h4>
          <p className="text-muted-foreground">{content.scenario}</p>
          
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Te vagy:</span>
              <p className="font-medium text-foreground">{content.roles.user}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Partner:</span>
              <p className="font-medium text-foreground">{content.roles.ai}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={startRoleplay}
            className="flex-1 py-3 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 flex items-center justify-center gap-2"
          >
            <MessageSquare className="w-5 h-5" />
            Beszélgetés indítása
          </button>
          <button
            onClick={openInChat}
            className="py-3 px-4 border border-foreground/20 rounded-lg hover:bg-foreground/5"
            title="Megnyitás a Chat-ben"
          >
            ↗
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Messages */}
      <div className="h-[300px] overflow-y-auto border border-foreground/10 rounded-lg p-4 space-y-3 bg-foreground/[0.02]">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] px-4 py-2 rounded-2xl ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-foreground/10 text-foreground rounded-bl-md"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        
        {loading && (
          <div className="flex justify-start">
            <div className="bg-foreground/10 text-foreground px-4 py-2 rounded-2xl rounded-bl-md">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="space-y-2">
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Írd ide az üzeneted (min. ${minChars} karakter)...`}
            disabled={loading}
            rows={2}
            className="w-full px-4 py-3 pr-12 rounded-lg border border-foreground/20 bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="absolute right-2 bottom-2 p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Character progress */}
        <div className="flex items-center gap-2 text-xs">
          <div className="flex-1 h-1 bg-foreground/10 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${isValidLength ? "bg-green-500" : "bg-primary"}`}
              style={{ width: `${charProgress}%` }}
            />
          </div>
          <span className={isValidLength ? "text-green-600" : "text-muted-foreground"}>
            {charCount} / {minChars}
          </span>
        </div>
      </div>

      {/* Reset */}
      <button
        onClick={reset}
        className="w-full py-2 px-4 border border-foreground/20 rounded-lg hover:bg-foreground/5 flex items-center justify-center gap-2 text-muted-foreground"
      >
        <RotateCcw className="w-4 h-4" />
        Újrakezdés
      </button>
    </div>
  );
}
