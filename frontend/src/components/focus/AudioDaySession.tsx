// src/components/focus/AudioDaySession.tsx
// Hybrid Audio Day Session: intro chat → lesson (TTS) → practice → summary
// Replaces FocusDayView for language + micro-skill focus types.

import { useState, useEffect, useRef, useCallback } from "react";
import { useConversation } from "@elevenlabs/react";
import ReactMarkdown from "react-markdown";
import {
  Loader2, Volume2, Mic, MicOff, SkipForward, CheckCircle2,
  BookOpen, Play, StopCircle, Calendar, Flame, Target,
} from "lucide-react";
import { LazyItemRenderer } from "@/components/focus/LazyItemRenderer";
import { AudioChatPanel, type ChatMessage } from "@/components/focus/AudioChatPanel";
import { focusApi } from "@/lib/focusApi";
import { validateFocusItem } from "@/lib/focusItemValidator";
import { lessonToScript } from "@/lib/lessonToScript";
import type { PlanDay, FocusOutline, PlanItem } from "@/types/learningFocus";
import type { StrictFocusItem } from "@/types/focusItem";
import { useToast } from "@/hooks/use-toast";

const AGENT_ID = "agent_4001khrwb3tcfsqtr0sjjfd8e5qj";
const NOTES_STORAGE_KEY = "pumi_audio_day_notes";
const CHAT_STORAGE_PREFIX = "pumi_audio_chat_";

type SessionPhase = "loading" | "intro" | "lesson" | "practice" | "summary";

interface AudioDaySessionProps {
  currentDay: PlanDay;
  outline: FocusOutline;
  dayIndex: number;
  streak: number;
  completedItemIds: string[];
  onCompleteItem: (itemId: string, resultJson?: any) => void;
  onCompleteDay: () => void;
  onReset: () => void;
  loading: boolean;
}

interface TranscriptEntry {
  source: "user" | "ai";
  text: string;
}

export function AudioDaySession({
  currentDay,
  outline,
  dayIndex,
  streak,
  completedItemIds,
  onCompleteItem,
  onCompleteDay,
  onReset,
  loading,
}: AudioDaySessionProps) {
  const { toast } = useToast();
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const [phase, setPhase] = useState<SessionPhase>("loading");
  const [lessonScript, setLessonScript] = useState<string>("");
  const [lessonItem, setLessonItem] = useState<StrictFocusItem | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [micEnabled, setMicEnabled] = useState(true);
  const [agentError, setAgentError] = useState<string | null>(null);

  // ── Chat state ──
  const sessionId = useRef(
    `audio_${currentDay.title?.replace(/\s/g, "_")}_${dayIndex}_${Date.now()}`
  ).current;
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    try {
      const stored = localStorage.getItem(CHAT_STORAGE_PREFIX + sessionId);
      if (stored) return JSON.parse(stored);
    } catch { /* ignore */ }
    return [];
  });

  // Items split: first "lesson"/"smart_lesson" is the lesson, rest are practice
  const items = currentDay.items || [];
  const lessonItemRaw = items.find(
    (i) => i.type === "lesson" || i.type === "content" || i.type === "smart_lesson" || i.kind === "lesson" || i.kind === "smart_lesson" || i.kind === "content"
  );
  const practiceItems = items.filter((i) => i !== lessonItemRaw);

  // Practice completion tracking
  const practiceCompletedCount = practiceItems.filter(
    (i) => completedItemIds.includes(i.id)
  ).length;
  const allPracticeDone = practiceItems.length === 0 || practiceCompletedCount >= Math.ceil(practiceItems.length * 0.6);

  // ── ElevenLabs Conversation ──
  const conversation = useConversation({
    onConnect: () => {
      console.log("[AudioDay] Agent connected");
    },
    onDisconnect: () => {
      console.log("[AudioDay] Agent disconnected");
      // If still in intro/lesson phase, advance to practice
      if (phase === "intro" || phase === "lesson") {
        setPhase(practiceItems.length > 0 ? "practice" : "summary");
      }
    },
    onMessage: (msg: { message: string; source: "user" | "ai" }) => {
      setTranscript((prev) => [...prev, { source: msg.source, text: msg.message }]);

      // Detect lecture mode transition from agent
      if (msg.source === "ai" && phase === "intro") {
        const text = msg.message.toLowerCase();
        if (
          text.includes("kezdjük a mai leckét") ||
          text.includes("kezdjük el") ||
          text.includes("mehet a tanulás")
        ) {
          setPhase("lesson");
          // Mute user mic for lecture
          toggleMic(false);
        }
      }

      // Detect lesson end
      if (msg.source === "ai" && phase === "lesson") {
        const text = msg.message.toLowerCase();
        if (
          text.includes("gyakorló feladat") ||
          text.includes("ez volt a mai lecke") ||
          text.includes("most jönnek")
        ) {
          handleLessonEnd();
        }
      }
    },
    onError: (error: Error) => {
      console.error("[AudioDay] Agent error:", error);
      setAgentError(error.message);
      toast({
        title: "Audio hiba",
        description: "Az audio tutor kapcsolat megszakadt. Folytatás szöveges módban.",
        variant: "destructive",
      });
      // Fallback to practice
      if (phase === "intro" || phase === "lesson") {
        setPhase(practiceItems.length > 0 ? "practice" : "summary");
      }
    },
  });

  // ── Toggle microphone ──
  const toggleMic = useCallback((enabled: boolean) => {
    const stream = mediaStreamRef.current;
    if (stream) {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
    setMicEnabled(enabled);
  }, []);

  // ── Load lesson content ──
  useEffect(() => {
    if (!lessonItemRaw) {
      // No lesson item — skip to practice
      setPhase(practiceItems.length > 0 ? "practice" : "summary");
      return;
    }

    let cancelled = false;

    const loadLesson = async () => {
      try {
        // Check localStorage cache first
        const cacheKey = `focus_item_v5_${lessonItemRaw.id}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Date.now() - parsed.timestamp < 3600000) {
            if (!cancelled) {
              setLessonItem(parsed.content);
              setLessonScript(lessonToScript(parsed.content));
              setPhase("intro");
              return;
            }
          }
        }

        // Generate via API
        const resp = await focusApi.generateItemContent({
          item_id: lessonItemRaw.id,
          topic: lessonItemRaw.topic || lessonItemRaw.label,
          label: lessonItemRaw.label,
          day_title: currentDay.title,
          mode: "learning",
          domain: outline.domain,
          level: outline.level,
          lang: outline.lang,
        });

        if (cancelled) return;

        if (resp.ok && resp.content) {
          const validation = validateFocusItem(resp.content);
          const strict = validation.valid
            ? (resp.content as StrictFocusItem)
            : validation.repaired;

          if (strict) {
            setLessonItem(strict);
            setLessonScript(lessonToScript(strict));
            // Cache it
            localStorage.setItem(
              cacheKey,
              JSON.stringify({ content: strict, timestamp: Date.now() })
            );
            // Mark lesson item as completed (user "attended" the audio lesson)
            onCompleteItem(lessonItemRaw.id, { completed: true, mode: "audio" });
            setPhase("intro");
            return;
          }
        }

        throw new Error("Failed to generate lesson content");
      } catch (err) {
        console.error("[AudioDay] Lesson load error:", err);
        if (!cancelled) {
          toast({
            title: "Hiba",
            description: "Nem sikerült a lecke betöltése. Próbáld újra!",
            variant: "destructive",
          });
          // Skip to practice as fallback
          setPhase(practiceItems.length > 0 ? "practice" : "summary");
        }
      }
    };

    loadLesson();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonItemRaw?.id]);

  // ── Start ElevenLabs session when entering intro phase ──
  useEffect(() => {
    if (phase !== "intro" || !lessonScript) return;

    let cancelled = false;

    const startAgent = async () => {
      try {
        // Request mic
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        await conversation.startSession({
          agentId: AGENT_ID,
          dynamicVariables: {
            lesson_content: lessonScript,
            user_name: "Tanuló",
            target_language: outline.lang || "hu",
            level: outline.level || "beginner",
          },
        });
      } catch (err) {
        console.error("[AudioDay] Failed to start agent:", err);
        if (!cancelled) {
          setAgentError(String(err));
          // Fallback: skip to practice
          setPhase(practiceItems.length > 0 ? "practice" : "summary");
        }
      }
    };

    startAgent();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, lessonScript]);

  // ── Handle lesson end ──
  const handleLessonEnd = useCallback(async () => {
    try {
      await conversation.endSession();
    } catch { /* ignore */ }

    // Stop media stream
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;

    // Save notes
    const notesKey = `${NOTES_STORAGE_KEY}_${new Date().toISOString().split("T")[0]}`;
    const notes = transcript
      .filter((t) => t.source === "ai")
      .map((t) => t.text)
      .join("\n\n");
    localStorage.setItem(notesKey, notes);

    setPhase(practiceItems.length > 0 ? "practice" : "summary");
  }, [conversation, transcript, practiceItems.length]);

  // ── Skip to practice (manual) ──
  const handleSkipToNextPhase = useCallback(async () => {
    if (phase === "intro" || phase === "lesson") {
      await handleLessonEnd();
    } else if (phase === "practice") {
      setPhase("summary");
    }
  }, [phase, handleLessonEnd]);

  // ── Persist chat messages ──
  const handleChatMessagesChange = useCallback((msgs: ChatMessage[]) => {
    setChatMessages(msgs);
    try {
      localStorage.setItem(CHAT_STORAGE_PREFIX + sessionId, JSON.stringify(msgs.slice(-50)));
    } catch { /* quota exceeded — ignore */ }
  }, [sessionId]);

  // ── Chat command handler ──
  const handleChatCommand = useCallback((cmd: "start" | "next" | "repeat" | "help" | "end" | "pause" | "resume") => {
    switch (cmd) {
      case "start":
        if (phase === "intro") {
          // Transition to lesson
          setPhase("lesson");
          toggleMic(false);
        }
        break;
      case "next":
        handleSkipToNextPhase();
        break;
      case "repeat":
        // For now, just add an AI message acknowledging
        handleChatMessagesChange([
          ...chatMessages,
          { id: `sys-${Date.now()}`, source: "ai", text: "Rendben, nézzük újra az aktuális részt!", ts: Date.now() },
        ]);
        break;
      case "help":
        handleChatMessagesChange([
          ...chatMessages,
          { id: `sys-${Date.now()}`, source: "ai", text: "Használd a \"Következő\" gombot a továbblépéshez, vagy írd le a kérdésed a lecke tartalmával kapcsolatban!", ts: Date.now() },
        ]);
        break;
      case "end":
        if (phase === "summary") {
          onCompleteDay();
        } else {
          handleSkipToNextPhase();
        }
        break;
      case "pause":
        // Pause audio agent if connected
        if (conversation.status === "connected") {
          conversation.endSession().catch(() => {});
        }
        break;
      case "resume":
        // Resume not supported after end — just notify
        handleChatMessagesChange([
          ...chatMessages,
          { id: `sys-${Date.now()}`, source: "ai", text: "A lecke folytatásához nyomd meg a lejátszás gombot!", ts: Date.now() },
        ]);
        break;
    }
  }, [phase, chatMessages, handleChatMessagesChange, handleSkipToNextPhase, toggleMic, conversation, onCompleteDay]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (conversation.status === "connected") {
        conversation.endSession().catch(() => {});
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Render ──
  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 pb-40 animate-fade-in">
      {/* Header */}
      <div className="mb-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-500/20 text-violet-400 border border-violet-500/30">
              <Volume2 className="w-3 h-3" />
              Audio Tutor
            </span>
            <span className="px-2 py-1 rounded-full text-[10px] bg-foreground/10 text-foreground/60">
              {phase === "loading" && "Betöltés..."}
              {phase === "intro" && "Bevezető"}
              {phase === "lesson" && "Lecke"}
              {phase === "practice" && "Gyakorlás"}
              {phase === "summary" && "Összegzés"}
            </span>
          </div>
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
                     border border-destructive/30 text-destructive
                     hover:bg-destructive/10 transition-colors"
          >
            <StopCircle className="w-3 h-3" />
            Leállítás
          </button>
        </div>

        {/* Day info */}
        <div className="neon-glow-card bg-secondary/30 rounded-xl p-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-foreground text-background flex items-center justify-center shrink-0 font-bold text-lg">
              {dayIndex}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg md:text-xl font-bold truncate">{currentDay.title}</h1>
              {currentDay.intro && (
                <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{currentDay.intro}</p>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-border/50 bg-card/30 p-2 text-center">
            <Calendar className="w-3 h-3 mx-auto mb-0.5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Nap</p>
            <p className="text-sm font-bold">{dayIndex}/{outline.days?.length || 7}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-card/30 p-2 text-center">
            <Flame className="w-3 h-3 mx-auto mb-0.5 text-orange-400" />
            <p className="text-xs text-muted-foreground">Streak</p>
            <p className="text-sm font-bold">{streak}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-card/30 p-2 text-center">
            <Target className="w-3 h-3 mx-auto mb-0.5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Feladatok</p>
            <p className="text-sm font-bold">{completedItemIds.length}/{items.length}</p>
          </div>
        </div>
      </div>

      {/* ── LOADING PHASE ── */}
      {phase === "loading" && (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">Lecke betöltése...</p>
        </div>
      )}

      {/* ── INTRO PHASE ── */}
      {phase === "intro" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-5 text-center">
            <Volume2 className="w-8 h-8 mx-auto mb-3 text-violet-400" />
            <h2 className="text-lg font-bold mb-2">Bevezető beszélgetés</h2>
            <p className="text-sm text-muted-foreground mb-4">
              PUMi köszönt és kérdez pár dolgot. Nyugodtan válaszolj hangosan!
            </p>
            <div className="flex items-center justify-center gap-2 text-sm">
              {conversation.status === "connected" ? (
                <span className="flex items-center gap-2 text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Kapcsolódva
                </span>
              ) : (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Kapcsolódás...
                </span>
              )}
            </div>
          </div>

          {/* Mic status */}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => toggleMic(!micEnabled)}
              className={`p-3 rounded-full transition-colors ${
                micEnabled
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-red-500/20 text-red-400"
              }`}
            >
              {micEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            </button>
            <span className="text-sm text-muted-foreground">
              {micEnabled ? "Mikrofon aktív" : "Mikrofon némítva"}
            </span>
          </div>

          {/* Transcript */}
          {transcript.length > 0 && (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {transcript.map((t, i) => (
                <div
                  key={i}
                  className={`rounded-lg p-3 text-sm ${
                    t.source === "ai"
                      ? "bg-secondary/50 border border-border/50"
                      : "bg-primary/10 border border-primary/20 ml-8"
                  }`}
                >
                  <span className="text-xs text-muted-foreground block mb-1">
                    {t.source === "ai" ? "PUMi" : "Te"}
                  </span>
                  {t.text}
                </div>
              ))}
            </div>
          )}

          {/* Skip button */}
          <button
            onClick={handleSkipToNextPhase}
            className="w-full py-3 px-4 rounded-xl text-sm bg-secondary/50 border border-border/50 hover:bg-secondary transition-all flex items-center justify-center gap-2"
          >
            <SkipForward className="w-4 h-4" />
            Ugrás a leckére
          </button>
        </div>
      )}

      {/* ── LESSON PHASE ── */}
      {phase === "lesson" && (
        <div className="space-y-6">
          {/* Agent speaking indicator */}
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 flex items-center gap-3">
            <Volume2 className="w-6 h-6 text-blue-400 animate-pulse" />
            <div>
              <p className="font-medium">PUMi tanít...</p>
              <p className="text-xs text-muted-foreground">Hallgasd és olvasd a jegyzetet alatta</p>
            </div>
            <button
              onClick={handleSkipToNextPhase}
              className="ml-auto px-3 py-1.5 rounded-lg text-xs bg-secondary/50 border border-border/50 hover:bg-secondary transition-colors flex items-center gap-1"
            >
              <SkipForward className="w-3 h-3" />
              Tovább
            </button>
          </div>

          {/* MD Notes — the lesson content for reading */}
          {lessonScript && (
            <div className="rounded-xl border border-border/50 bg-card/30 p-5 prose prose-invert prose-sm max-w-none">
              <div className="flex items-center gap-2 mb-3 text-muted-foreground">
                <BookOpen className="w-4 h-4" />
                <span className="text-xs font-medium">Jegyzet</span>
              </div>
              <ReactMarkdown>{lessonScript}</ReactMarkdown>
            </div>
          )}

          {/* Live transcript */}
          {transcript.length > 0 && (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {transcript
                .filter((t) => t.source === "ai")
                .slice(-3)
                .map((t, i) => (
                  <div key={i} className="rounded-lg p-2 text-xs bg-secondary/30 text-muted-foreground">
                    {t.text}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* ── PRACTICE PHASE ── */}
      {phase === "practice" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4">
            <h2 className="font-bold mb-1">Gyakorló feladatok</h2>
            <p className="text-sm text-muted-foreground">
              {practiceItems.length} feladat — legalább 60% kell a nap teljesítéséhez
            </p>
          </div>

          {/* Practice items using existing renderers */}
          <div className="space-y-3">
            {practiceItems.map((item) => {
              const isDone = completedItemIds.includes(item.id);
              return (
                <div key={item.id}>
                  <LazyItemRenderer
                    item={item}
                    dayTitle={currentDay.title}
                    dayIntro={currentDay.intro}
                    domain={outline.domain || "other"}
                    level={outline.level || "beginner"}
                    lang={outline.lang || "hu"}
                    onComplete={(completedItem) => {
                      onCompleteItem(completedItem.id);
                    }}
                  />
                  {isDone && (
                    <div className="relative -mt-3 mb-3">
                      <div className="flex items-center justify-center gap-1 py-1 text-xs text-green-500">
                        <CheckCircle2 className="w-3 h-3" />
                        Teljesítve
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Collapsible lesson notes */}
          {lessonScript && (
            <details className="rounded-xl border border-border/50 bg-card/30">
              <summary className="p-4 cursor-pointer flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <BookOpen className="w-4 h-4" />
                Lecke jegyzet megtekintése
              </summary>
              <div className="px-4 pb-4 prose prose-invert prose-sm max-w-none">
                <ReactMarkdown>{lessonScript}</ReactMarkdown>
              </div>
            </details>
          )}
        </div>
      )}

      {/* ── SUMMARY PHASE ── */}
      {phase === "summary" && (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
          <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center mb-6">
            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
          </div>
          <h2 className="text-xl font-bold mb-2">Mai nap teljesítve!</h2>
          <p className="text-muted-foreground text-sm mb-2">{currentDay.title}</p>
          <p className="text-sm mb-6">
            {completedItemIds.length}/{items.length} feladat kész
          </p>

          {lessonScript && (
            <details className="w-full max-w-md rounded-xl border border-border/50 bg-card/30 mb-6 text-left">
              <summary className="p-4 cursor-pointer flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <BookOpen className="w-4 h-4" />
                Lecke jegyzet
              </summary>
              <div className="px-4 pb-4 prose prose-invert prose-sm max-w-none">
                <ReactMarkdown>{lessonScript}</ReactMarkdown>
              </div>
            </details>
          )}
        </div>
      )}

      {/* ── Chat Panel (visible in all phases except loading) ── */}
      {phase !== "loading" && (
        <div className="mt-6">
          <AudioChatPanel
            phase={phase}
            sessionId={sessionId}
            stepId={lessonItemRaw?.id || `day-${dayIndex}`}
            lessonMd={lessonScript}
            targetLanguage={outline.lang}
            level={outline.level}
            userName="Tanuló"
            messages={chatMessages}
            onMessagesChange={handleChatMessagesChange}
            onCommand={handleChatCommand}
          />
        </div>
      )}

      {/* ── Error display ── */}
      {agentError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive mt-4">
          Audio hiba: {agentError}
        </div>
      )}

      {/* ── Sticky Bottom CTA ── */}
      {(phase === "practice" || phase === "summary") && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent">
          <div className="max-w-2xl mx-auto">
            {phase === "summary" || allPracticeDone ? (
              <button
                onClick={onCompleteDay}
                disabled={loading}
                className="w-full py-4 px-6 rounded-xl font-semibold
                         bg-green-600 text-white
                         hover:bg-green-500 active:scale-[0.98]
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all duration-200
                         flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Mentés...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    Nap befejezése
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleSkipToNextPhase}
                className="w-full py-4 px-6 rounded-xl font-semibold
                         bg-foreground text-background
                         hover:bg-foreground/90 active:scale-[0.98]
                         transition-all duration-200
                         flex items-center justify-center gap-2"
              >
                <SkipForward className="w-5 h-5" />
                Következő feladat
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
