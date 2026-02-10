import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import type { FocusChatMessage } from "@/types/learningFocus";

interface FocusChatPanelProps {
  lang?: string;
  messages?: FocusChatMessage[];
  onSend?: (text: string) => Promise<void> | void;
  disabled?: boolean;
}

export default function FocusChatPanel({ messages = [], onSend }: FocusChatPanelProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const submit = async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    await onSend?.(text);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-3 py-2 border-b border-foreground/5">
        <p className="text-[10px] text-foreground/40">
          Írj ide bármit — ez a fókusz chat.
        </p>
      </div>

      {/* Scrollable messages area */}
      <div className="flex-1 overflow-y-auto px-3">
        <div className="flex flex-col gap-2 py-2">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                m.role === "user"
                  ? "self-end bg-foreground/10 text-foreground/80"
                  : "self-start bg-foreground/5 text-foreground/70"
              }`}
            >
              {m.content}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Fixed input at bottom */}
      <div className="flex-shrink-0 p-3 border-t border-foreground/10">
        <div className="flex items-center gap-2 rounded-xl border border-foreground/10 bg-foreground/5 px-3 py-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={t("typeMessage") ?? "Írj üzenetet…"}
            className="flex-1 bg-transparent outline-none text-sm text-foreground/90 placeholder:text-foreground/40"
          />
          <button type="button" onClick={submit} className="text-foreground/60 hover:text-foreground/90 transition">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
