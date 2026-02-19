// src/components/focus/AudioChatPanel.tsx
// Compact text chat for AudioDaySession with anti-drift guards.

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2 } from "lucide-react";
import { audioTutorApi } from "@/lib/audioTutorApi";
import type { AudioChatPayload } from "@/lib/audioTutorApi";
import { useToast } from "@/hooks/use-toast";

// ── Types ───────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  source: "user" | "ai";
  text: string;
  ts: number;
}

type SessionPhase = "intro" | "lesson" | "practice" | "summary";

interface AudioChatPanelProps {
  phase: SessionPhase;
  sessionId: string;
  stepId: string;
  lessonMd: string;
  targetLanguage?: string;
  level?: string;
  userName?: string;
  /** Stored messages — parent owns the list so it persists across phase changes */
  messages: ChatMessage[];
  onMessagesChange: (msgs: ChatMessage[]) => void;
  /** Local command handlers */
  onCommand: (cmd: "start" | "next" | "repeat" | "help" | "end" | "pause" | "resume") => void;
}

// ── Local command matching ──────────────────────────────────────────────────

const COMMAND_MAP: Record<string, "start" | "next" | "repeat" | "help" | "end" | "pause" | "resume"> = {
  start: "start",
  "kezdjük": "start",
  next: "next",
  "következő": "next",
  tovább: "next",
  repeat: "repeat",
  "ismételd": "repeat",
  help: "help",
  "nem értem": "help",
  "segítség": "help",
  end: "end",
  "befejezés": "end",
  "szünet": "pause",
  pause: "pause",
  "folytatás": "resume",
  resume: "resume",
};

function matchCommand(text: string) {
  const lower = text.trim().toLowerCase();
  return COMMAND_MAP[lower] ?? null;
}

// ── Quick-reply chips per phase ─────────────────────────────────────────────

const CHIPS: Record<SessionPhase, string[]> = {
  intro: ["Kezdjük", "Nem értem", "Befejezés"],
  lesson: ["Következő", "Ismételd", "Szünet", "Folytatás"],
  practice: ["Következő", "Ismételd", "Nem értem", "Befejezés"],
  summary: ["Befejezés"],
};

// ── Component ───────────────────────────────────────────────────────────────

const MAX_MESSAGES = 50;

export function AudioChatPanel({
  phase,
  sessionId,
  stepId,
  lessonMd,
  targetLanguage,
  level,
  userName,
  messages,
  onMessagesChange,
  onCommand,
}: AudioChatPanelProps) {
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const addMessage = useCallback(
    (source: "user" | "ai", text: string) => {
      const msg: ChatMessage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        source,
        text,
        ts: Date.now(),
      };
      const next = [...messages, msg].slice(-MAX_MESSAGES);
      onMessagesChange(next);
    },
    [messages, onMessagesChange],
  );

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");

    // ── Lesson playback phase: block free text ──
    if (phase === "lesson") {
      const cmd = matchCommand(text);
      if (cmd) {
        onCommand(cmd);
        addMessage("user", text);
        return;
      }
      toast({
        title: "Lecke fut",
        description: "A lecke épp fut. Használd a vezérlő gombokat.",
      });
      return;
    }

    // ── Check for local commands first ──
    const cmd = matchCommand(text);
    if (cmd) {
      addMessage("user", text);
      onCommand(cmd);
      return;
    }

    // ── Summary phase: short reflective only ──
    // (allow LLM call but with short cap — backend enforces 3 sentences)

    // ── Send to LLM ──
    addMessage("user", text);
    setSending(true);

    try {
      const payload: AudioChatPayload = {
        session_id: sessionId,
        step_id: stepId,
        user_text: text,
        lesson_md: lessonMd.slice(0, 2000),
        mode: phase === "practice" || phase === "summary" ? "practice" : "intro",
        target_language: targetLanguage,
        level,
        user_name: userName,
      };
      const resp = await audioTutorApi.chat(payload);
      if (resp.ok && resp.reply) {
        addMessage("ai", resp.reply);
      } else {
        throw new Error(resp.error || "no reply");
      }
    } catch {
      toast({
        title: "Hiba",
        description: "Nem sikerült válaszolni — próbáld újra.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }, [input, sending, phase, sessionId, stepId, lessonMd, targetLanguage, level, userName, addMessage, onCommand, toast]);

  const handleChipClick = (chip: string) => {
    const cmd = matchCommand(chip);
    if (cmd) {
      addMessage("user", chip);
      onCommand(cmd);
    } else {
      setInput(chip);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const inputDisabled = phase === "lesson";
  const chips = CHIPS[phase] || [];

  return (
    <div className="rounded-xl border border-border/50 bg-card/20 flex flex-col" style={{ maxHeight: "360px" }}>
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[100px]">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            {phase === "intro"
              ? "Írj vagy használd a gyorsgombokat!"
              : phase === "lesson"
                ? "A lecke épp fut — használd a gombokat."
                : "Kérdezz a feladattal kapcsolatban!"}
          </p>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`rounded-lg px-3 py-2 text-sm max-w-[85%] ${
              msg.source === "ai"
                ? "bg-secondary/50 border border-border/30 mr-auto"
                : "bg-primary/10 border border-primary/20 ml-auto"
            }`}
          >
            {msg.text}
          </div>
        ))}
        {sending && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" />
            PUMi gondolkodik...
          </div>
        )}
      </div>

      {/* Quick-reply chips */}
      {chips.length > 0 && (
        <div className="px-3 pb-2 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip}
              onClick={() => handleChipClick(chip)}
              className="px-2.5 py-1 rounded-full text-xs
                       bg-secondary/60 border border-border/40
                       hover:bg-secondary hover:border-foreground/30
                       transition-colors"
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-border/30 p-2 flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={inputDisabled}
          placeholder={
            inputDisabled
              ? "Lecke fut — használd a gombokat"
              : "Írj üzenetet..."
          }
          className="flex-1 bg-transparent text-sm px-3 py-2 rounded-lg border border-border/30
                   focus:outline-none focus:border-foreground/40
                   disabled:opacity-40 disabled:cursor-not-allowed
                   placeholder:text-muted-foreground/60"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || sending || inputDisabled}
          className="p-2 rounded-lg bg-foreground text-background
                   hover:bg-foreground/90 disabled:opacity-30 disabled:cursor-not-allowed
                   transition-colors shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
