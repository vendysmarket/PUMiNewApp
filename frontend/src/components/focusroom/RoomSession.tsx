// components/focusroom/RoomSession.tsx
// Main session orchestrator: state machine + script steps + retry-gate
//
// Phase flow: loading → intro → teach → task → evaluate → (retry | next_task | summary) → end
// The tutor EXECUTES a script. User input ONLY during task phase.

import { useState, useCallback, useEffect, useRef } from "react";
import { focusRoomApi } from "@/lib/focusRoomApi";
import { StepDisplay } from "./StepDisplay";
import { PlanSidebar } from "./PlanSidebar";
import { BottomControls } from "./BottomControls";
import { QuizRenderer, TranslationRenderer, WritingRenderer } from "@/components/focus/renderers";
import type {
  FocusRoom,
  SessionPhase,
  DaySession,
  DaySessionItem,
  ScriptStep,
  StepEntry,
  EvaluatePayload,
} from "@/types/focusRoom";
import type { QuizContent, TranslationContent, WritingContent } from "@/types/focusItem";
import { validateFocusItem } from "@/lib/focusItemValidator";

interface RoomSessionProps {
  room: FocusRoom;
  onRoomUpdate: (room: FocusRoom) => void;
  onExit: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeStep(type: StepEntry["type"], content: string, metadata?: StepEntry["metadata"]): StepEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    content,
    metadata,
    ts: Date.now(),
  };
}

// ── Component ────────────────────────────────────────────────────────────────

export function RoomSession({ room, onRoomUpdate, onExit }: RoomSessionProps) {
  const [phase, setPhase] = useState<SessionPhase>("loading");
  const [session, setSession] = useState<DaySession | null>(room.session);
  const [steps, setSteps] = useState<StepEntry[]>(room.session?.transcript || []);

  // Script steps (from backend — tutor reads these)
  const [scriptSteps, setScriptSteps] = useState<ScriptStep[]>(room.session?.scriptSteps || []);
  const [currentScriptIdx, setCurrentScriptIdx] = useState(room.session?.currentStepIndex || 0);

  // Practice tasks
  const [items, setItems] = useState<DaySessionItem[]>(room.session?.items || []);
  const [currentItemIdx, setCurrentItemIdx] = useState(room.session?.currentItemIndex || 0);

  // Lesson markdown (notebook)
  const [lessonMd, setLessonMd] = useState(room.session?.lessonMd || "");

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [scoreSum, setScoreSum] = useState(room.session?.scoreSum || 0);
  const [currentAttempt, setCurrentAttempt] = useState(1);

  // TTS audio
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const dayIndex = room.currentDayIndex;
  const currentDay = room.plan.days.find(d => d.dayIndex === dayIndex);

  // ── Step management ──
  const addStep = useCallback((type: StepEntry["type"], content: string, metadata?: StepEntry["metadata"]) => {
    setSteps(prev => [...prev, makeStep(type, content, metadata)]);
  }, []);

  // ── Load day content on mount ──
  useEffect(() => {
    if (phase === "loading" && !session) {
      loadDayContent();
    }
    if (session && phase === "loading") {
      setPhase(session.phase);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadDayContent = async () => {
    setIsLoading(true);
    try {
      const resp = await focusRoomApi.startDay({
        room_id: room.id,
        day_index: dayIndex,
        domain: room.config.domain,
        target_language: room.config.targetLanguage,
        track: room.config.track,
        level: room.config.level,
        category: room.config.category,
        minutes_per_day: room.config.minutesPerDay,
        day_title: currentDay?.title,
      });

      if (!resp.ok) throw new Error(resp.error || "Failed to start day");

      // Parse tasks from backend
      const dayItems: DaySessionItem[] = (resp.tasks || []).map(t => ({
        id: t.id,
        kind: t.kind as DaySessionItem["kind"],
        title: t.title,
        status: "pending" as const,
        content: t.content,
        attempts: 0,
      }));

      // Parse script steps
      const scripts: ScriptStep[] = (resp.script_steps || []).map(s => ({
        id: s.id,
        type: s.type as ScriptStep["type"],
        text: s.text,
      }));

      const newSession: DaySession = {
        dayIndex,
        phase: "intro",
        lessonMd: resp.lesson_md || "",
        scriptSteps: scripts,
        currentStepIndex: 0,
        items: dayItems,
        currentItemIndex: 0,
        transcript: [],
        scoreSum: 0,
        startedAt: new Date().toISOString(),
      };

      // Safe lesson_md accessor — handles all backend field name variations
      const rawResp = resp as any;
      const resolvedMd: string =
        rawResp.lesson_md ??
        rawResp.lesson?.body_md ??
        rawResp.body_md ??
        rawResp.lesson_text ??
        "";

      setSession({ ...newSession, lessonMd: resolvedMd });
      setItems(dayItems);
      setScriptSteps(scripts);
      setCurrentScriptIdx(0);
      setLessonMd(resolvedMd);
      setCurrentItemIdx(0);
      setScoreSum(0);

      // Show the first intro script step
      if (scripts.length > 0 && scripts[0].type === "intro") {
        setSteps([makeStep("tutor", scripts[0].text)]);
        setCurrentScriptIdx(1);
        // Start TTS for intro
        playTts(scripts[0].text);
      } else {
        setSteps([makeStep("tutor", `Szia! Mai téma: **${currentDay?.title || `Nap ${dayIndex}`}**`)]);
      }

      setPhase("intro");

      // Update room
      onRoomUpdate({ ...room, session: newSession });
    } catch (err) {
      console.error("[RoomSession] Load day failed:", err);
      addStep("tutor", "Hiba történt a tartalom betöltésekor. Próbáld újra.");
      setPhase("intro");
    } finally {
      setIsLoading(false);
    }
  };

  // ── TTS playback ──
  const playTts = async (text: string) => {
    if (isMuted) return;
    try {
      const resp = await focusRoomApi.tts({ text: text.slice(0, 2000) });
      if (resp.ok && resp.audio_base64) {
        const audio = new Audio(`data:${resp.content_type || "audio/mpeg"};base64,${resp.audio_base64}`);
        audioRef.current = audio;
        setIsAudioPlaying(true);
        audio.onended = () => setIsAudioPlaying(false);
        audio.onerror = () => setIsAudioPlaying(false);
        await audio.play();
      }
    } catch (err) {
      console.error("[TTS] Failed:", err);
    }
  };

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsAudioPlaying(false);
  };

  // ── Phase transitions ──
  const handleNext = useCallback(async () => {
    if (isLoading) return;

    switch (phase) {
      case "intro": {
        // Move to teach phase — show lesson notes + start playing script steps
        setPhase("teach");
        if (lessonMd && lessonMd.trim().length > 0) {
          addStep("lesson_note", lessonMd);
        } else {
          // Non-fatal: lesson content missing, but session can continue
          addStep("tutor", "A lecke tartalma most nem érhető el, de a feladatokkal folytathatod.");
        }
        // Play the next script step
        playNextScript(1); // skip intro (already played)
        break;
      }

      case "teach": {
        // Advance to next script step, or if done, move to task phase
        stopAudio();
        const nextIdx = currentScriptIdx + 1;
        if (nextIdx < scriptSteps.length && scriptSteps[nextIdx]?.type !== "transition") {
          // More teach steps
          playNextScript(nextIdx);
        } else {
          // Play transition step if exists, then go to tasks
          const transStep = scriptSteps.find(s => s.type === "transition");
          if (transStep) {
            addStep("tutor", transStep.text);
            playTts(transStep.text);
          }

          // Move to first task
          if (items.length > 0) {
            setTimeout(() => {
              setPhase("task");
              setCurrentItemIdx(0);
              setCurrentAttempt(1);
              const item = items[0];
              addStep("task_prompt", `**${item.title}**`);
            }, transStep ? 1500 : 0);
          } else {
            goToSummary();
          }
        }
        break;
      }

      case "evaluate": {
        // After evaluation, move to next task or summary
        const nextIdx = currentItemIdx + 1;
        if (nextIdx < items.length) {
          setCurrentItemIdx(nextIdx);
          setPhase("task");
          setCurrentAttempt(1);
          const item = items[nextIdx];
          addStep("task_prompt", `**${item.title}**`);
        } else {
          goToSummary();
        }
        break;
      }

      case "retry": {
        // Go back to task phase for retry
        setPhase("task");
        break;
      }

      case "summary": {
        // Complete day
        handleCompleteDay();
        break;
      }

      default:
        break;
    }
  }, [phase, isLoading, items, currentItemIdx, currentScriptIdx, scriptSteps, lessonMd]); // eslint-disable-line react-hooks/exhaustive-deps

  const playNextScript = (idx: number) => {
    if (idx < scriptSteps.length) {
      const step = scriptSteps[idx];
      if (step.type !== "transition") {
        addStep("tutor", step.text);
        playTts(step.text);
      }
      setCurrentScriptIdx(idx);
    }
  };

  const goToSummary = async () => {
    setIsLoading(true);
    try {
      const completedCount = items.filter(i => i.status === "completed").length;
      const resp = await focusRoomApi.close({
        room_id: room.id,
        day_index: dayIndex,
        items_completed: completedCount,
        items_total: items.length,
        score_sum: scoreSum,
      });

      if (resp.ok && resp.summary) {
        addStep("summary",
          `${resp.summary.message}\n\n` +
          `Feladatok: ${resp.summary.items_completed}/${resp.summary.items_total}\n` +
          `Átlag pontszám: ${resp.summary.avg_score}\n` +
          `Teljesítmény: ${resp.summary.completion_rate}%`
        );
      } else {
        const completedCount2 = items.filter(i => i.status === "completed").length;
        addStep("summary", `Mai nap kész! ${completedCount2}/${items.length} feladat teljesítve.`);
      }
    } catch {
      const completedCount = items.filter(i => i.status === "completed").length;
      addStep("summary", `Mai nap kész! ${completedCount}/${items.length} feladat teljesítve.`);
    } finally {
      setIsLoading(false);
    }
    setPhase("summary");
  };

  // ── Task answer + retry-gate ──
  const handleTaskAnswer = useCallback(async (itemId: string, answer: any) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    const answerText = typeof answer === "string" ? answer : JSON.stringify(answer);
    addStep("user_answer", answerText, { itemId });

    setIsLoading(true);
    try {
      const evalPayload: EvaluatePayload = {
        room_id: room.id,
        item_id: itemId,
        kind: item.kind,
        user_answer: answer,
        attempt: currentAttempt,
      };

      // Add context
      if (item.kind === "translation" && item.content?.sentences?.[0]) {
        evalPayload.source = item.content.sentences[0].source;
        evalPayload.target_lang = item.content.sentences[0].target_lang;
      }
      if (item.kind === "quiz" && item.content?.questions?.[0]) {
        evalPayload.question = item.content.questions[0].question;
        evalPayload.correct_answer = String(item.content.questions[0].correct_index);
        evalPayload.options = item.content.questions[0].options;
      }
      if (item.kind === "writing" && item.content) {
        evalPayload.prompt = item.content.prompt;
      }

      const result = await focusRoomApi.evaluate(evalPayload);

      if (result.correct) {
        // Correct! Mark completed and move on
        const score = result.score || 80;
        setScoreSum(prev => prev + score);
        setItems(prev => prev.map(i =>
          i.id === itemId
            ? { ...i, status: "completed" as const, attempts: currentAttempt, lastScore: score }
            : i
        ));
        addStep("evaluation", result.feedback || "Helyes!", {
          itemId,
          correct: true,
          score,
        });
        setPhase("evaluate");
      } else if (result.can_retry) {
        // Wrong but can retry — hint mode
        setItems(prev => prev.map(i =>
          i.id === itemId
            ? { ...i, attempts: currentAttempt }
            : i
        ));
        addStep("hint", result.feedback || "Próbáld újra!", {
          itemId,
          correct: false,
          canRetry: true,
          attempt: currentAttempt,
        });
        setCurrentAttempt(prev => prev + 1);
        setPhase("retry");
      } else {
        // Wrong and no more retries — reveal answer, mark failed
        setItems(prev => prev.map(i =>
          i.id === itemId
            ? { ...i, status: "completed" as const, attempts: currentAttempt, lastScore: 0 }
            : i
        ));
        addStep("evaluation", result.feedback || "Sajnos nem sikerült.", {
          itemId,
          correct: false,
          score: 0,
        });
        setPhase("evaluate");
      }
    } catch (err) {
      console.error("[RoomSession] Evaluation failed:", err);
      setItems(prev => prev.map(i =>
        i.id === itemId ? { ...i, status: "completed" as const, attempts: currentAttempt, lastScore: 70 } : i
      ));
      addStep("evaluation", "Értékelés nem sikerült, de a feladat elfogadva.", {
        itemId, correct: true, score: 70,
      });
      setScoreSum(prev => prev + 70);
      setPhase("evaluate");
    } finally {
      setIsLoading(false);
    }
  }, [items, room.id, currentAttempt, addStep]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Complete day ──
  const handleCompleteDay = useCallback(() => {
    stopAudio();
    const newCompleted = [...room.completedDays, dayIndex];
    const nextDay = dayIndex + 1;
    const updatedDays = room.plan.days.map(d => ({
      ...d,
      status: newCompleted.includes(d.dayIndex) ? "completed" as const
        : d.dayIndex === nextDay ? "available" as const
        : d.dayIndex > nextDay ? "locked" as const
        : d.status,
    }));

    onRoomUpdate({
      ...room,
      completedDays: newCompleted,
      currentDayIndex: Math.min(nextDay, room.plan.days.length),
      streak: room.streak + 1,
      session: null,
      plan: { ...room.plan, days: updatedDays },
    });

    setPhase("end");
    addStep("tutor", "A nap teljesítve! Holnap folytatjuk.");
  }, [room, dayIndex, onRoomUpdate, addStep]);

  // ── Select different day from sidebar ──
  const handleSelectDay = (newDayIndex: number) => {
    if (newDayIndex === dayIndex) return;
    if (phase !== "end" && session) return;
    onRoomUpdate({ ...room, currentDayIndex: newDayIndex, session: null });
  };

  // ── Audio controls ──
  const handlePlayPause = () => {
    if (isAudioPlaying) {
      stopAudio();
    }
  };

  const handleMuteToggle = () => {
    setIsMuted(prev => !prev);
    if (!isMuted) stopAudio();
  };

  // ── Render active task ──
  const activeTask = phase === "task" && items[currentItemIdx] ? items[currentItemIdx] : null;
  // Also show task during retry phase so user can try again
  const retryTask = phase === "retry" && items[currentItemIdx] ? items[currentItemIdx] : null;
  const taskToRender = activeTask || retryTask;

  const renderActiveTask = () => {
    if (!taskToRender?.content) return null;
    const item = taskToRender;

    const validated = validateFocusItem({ ...item.content, kind: item.kind });
    const normalized = validated.repaired || null;
    const contentData = normalized?.content?.data;

    switch (item.kind) {
      case "quiz": {
        const quizData = contentData as QuizContent | undefined;
        if (!quizData?.questions?.length) return <p className="text-sm text-muted-foreground">Kvíz nem elérhető.</p>;
        return (
          <QuizRenderer
            content={quizData}
            onValidationChange={({ itemsCompleted }) => {
              if (itemsCompleted > 0) {
                handleTaskAnswer(item.id, { completed: true, items_answered: itemsCompleted });
              }
            }}
          />
        );
      }

      case "translation": {
        const transData = contentData as TranslationContent | undefined;
        if (!transData?.sentences?.length) return <p className="text-sm text-muted-foreground">Fordítás nem elérhető.</p>;
        return (
          <TranslationTaskWrapper
            content={transData}
            onSubmit={(text) => handleTaskAnswer(item.id, text)}
          />
        );
      }

      case "writing": {
        const writingData = contentData as WritingContent | undefined;
        if (!writingData) return <p className="text-sm text-muted-foreground">Írás nem elérhető.</p>;
        return (
          <WritingTaskWrapper
            content={writingData}
            onSubmit={(text) => handleTaskAnswer(item.id, text)}
          />
        );
      }

      default:
        return (
          <div className="text-sm text-muted-foreground">
            <p>Feladat típus: {item.kind}</p>
            <button
              onClick={() => handleTaskAnswer(item.id, { completed: true })}
              className="mt-3 py-2 px-4 rounded-lg text-sm font-medium
                       bg-foreground text-background hover:bg-foreground/90 transition-colors"
            >
              Kész
            </button>
          </div>
        );
    }
  };

  // Determine if user input is allowed (only during task or retry)
  const inputAllowed = phase === "task" || phase === "retry";

  return (
    <div className="flex h-full">
      {/* Center: step display */}
      <div className="flex-1 flex flex-col min-w-0">
        <StepDisplay
          steps={steps}
          activeTaskSlot={inputAllowed ? renderActiveTask() : undefined}
          phase={phase}
        />
        <BottomControls
          phase={phase}
          isAudioPlaying={isAudioPlaying}
          isMuted={isMuted}
          isLoading={isLoading}
          onPlayPause={handlePlayPause}
          onMuteToggle={handleMuteToggle}
          onNext={handleNext}
          onCompleteDay={handleCompleteDay}
          onExit={onExit}
          scriptProgress={scriptSteps.length > 0
            ? { current: currentScriptIdx, total: scriptSteps.length }
            : undefined}
          taskProgress={items.length > 0
            ? { current: currentItemIdx + 1, total: items.length }
            : undefined}
        />
      </div>

      {/* Right sidebar: plan (hidden on mobile) */}
      <div className="hidden md:block w-64 shrink-0">
        <PlanSidebar
          days={room.plan.days}
          currentDayIndex={dayIndex}
          streak={room.streak}
          onSelectDay={handleSelectDay}
        />
      </div>
    </div>
  );
}

// ── Translation Task Wrapper ─────────────────────────────────────────────────

function TranslationTaskWrapper({
  content,
  onSubmit,
}: {
  content: TranslationContent;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState("");

  return (
    <div>
      <TranslationRenderer content={content} onValidationChange={() => {}} />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Írd ide a fordításod..."
        className="w-full mt-3 p-3 rounded-lg border border-border/50 bg-transparent text-sm
                 focus:outline-none focus:border-foreground/40 min-h-[80px] resize-y"
      />
      <button
        onClick={() => { if (text.trim().length >= 2) onSubmit(text); }}
        disabled={text.trim().length < 2}
        className="mt-2 py-2 px-4 rounded-lg text-sm font-medium
                 bg-foreground text-background hover:bg-foreground/90
                 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        Beküldés
      </button>
    </div>
  );
}

// ── Writing Task Wrapper ─────────────────────────────────────────────────────

function WritingTaskWrapper({
  content,
  onSubmit,
}: {
  content: WritingContent;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState("");

  return (
    <div>
      <WritingRenderer content={content} onValidationChange={() => {}} />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Írd ide a válaszod..."
        className="w-full mt-3 p-3 rounded-lg border border-border/50 bg-transparent text-sm
                 focus:outline-none focus:border-foreground/40 min-h-[100px] resize-y"
      />
      <button
        onClick={() => { if (text.trim().length >= 10) onSubmit(text); }}
        disabled={text.trim().length < 10}
        className="mt-2 py-2 px-4 rounded-lg text-sm font-medium
                 bg-foreground text-background hover:bg-foreground/90
                 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        Beküldés
      </button>
    </div>
  );
}
