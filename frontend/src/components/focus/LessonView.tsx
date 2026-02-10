import { useState, useEffect } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  CheckCircle2,
  XCircle,
  PenLine,
  Loader2,
  Clock,
} from "lucide-react";
import DOMPurify from "dompurify";
import type { StructuredPlan, PlanItem, PlanDay } from "@/types/learningFocus";
import { SimpleLessonItem } from "./SimpleLessonItem";

// ✅ Helper to format seconds as MM:SS
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

// ✅ Timer display component
const TimerDisplay = ({ timeRemaining }: { timeRemaining: number }) => {
  const percentage = (timeRemaining / 2700) * 100; // 2700 = 45 minutes in seconds
  const isWarning = timeRemaining <= 300; // Last 5 minutes

  return (
    <div className="rounded-lg border border-foreground/10 bg-foreground/5 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Clock className={`w-4 h-4 ${isWarning ? "text-orange-400" : "text-foreground/60"}`} />
          <span className="text-xs text-foreground/60">Fókusz idő</span>
        </div>
        <span className={`text-lg font-mono font-medium ${isWarning ? "text-orange-400" : "text-foreground/90"}`}>
          {formatTime(timeRemaining)}
        </span>
      </div>
      {/* Progress bar */}
      <div className="w-full h-1.5 bg-foreground/10 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-1000 ${isWarning ? "bg-orange-400" : "bg-foreground/40"}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {isWarning && (
        <p className="text-[10px] text-orange-400 mt-1.5 text-center">
          Még {Math.ceil(timeRemaining / 60)} perc van hátra!
        </p>
      )}
    </div>
  );
};

interface LessonViewProps {
  structuredPlan: StructuredPlan | null;
  activeDayIndex: number;
  loadDayContent?: (dayIndex: number) => Promise<PlanDay | null>;
  isDayStarted?: boolean; // ✅ NEW: Whether today's session has started
  timeRemaining?: number; // ✅ NEW: Seconds remaining in today's session (0-2700)
}

// Helper to render markdown-style content with bold support - with XSS sanitization
const renderFormattedContent = (text: string): string => {
  const formatted = text
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground/95 font-semibold">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em class="text-foreground/70 italic">$1</em>')
    .replace(/—/g, '<span class="text-foreground/40 mx-1">—</span>');
  
  return DOMPurify.sanitize(formatted, {
    ALLOWED_TAGS: ["strong", "em", "span", "p", "br"],
    ALLOWED_ATTR: ["class"],
  });
};

// Expandable lesson card component
const LessonCard = ({ item, index }: { item: PlanItem; index: number }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Content is the main text to display (can include **bold** and — formatting)
  const content = item.content || "";
  const label = item.label || "Tananyag";
  const hasContent = content.length > 0;

  // Extract a preview from content - get text before first em-dash or first 50 chars
  const getPreview = () => {
    if (!content) return null;
    const dashIndex = content.indexOf("—");
    if (dashIndex > 0 && dashIndex < 60) {
      // Get the bold title if present
      const boldMatch = content.match(/\*\*(.+?)\*\*/);
      return boldMatch ? boldMatch[1] : content.substring(0, dashIndex).trim();
    }
    return content.substring(0, 50) + (content.length > 50 ? "..." : "");
  };

  const preview = getPreview();

  return (
    <button
      onClick={() => setIsExpanded(!isExpanded)}
      className="w-full text-left rounded-lg border border-foreground/10 bg-foreground/5 hover:bg-foreground/8 transition-all duration-200 overflow-hidden group"
    >
      <div className="flex items-start gap-3 p-3">
        <div className="w-6 h-6 rounded-full bg-foreground/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <BookOpen className="w-3.5 h-3.5 text-foreground/50" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground/85 leading-relaxed">
            {hasContent && preview ? preview : label}
          </p>
          {!isExpanded && hasContent && <p className="text-xs text-foreground/50 mt-0.5">Kattints a részletekért...</p>}
        </div>
        <div className="text-foreground/30 group-hover:text-foreground/50 transition-colors flex-shrink-0">
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {isExpanded && hasContent && (
        <div className="px-3 pb-3 pt-2 border-t border-foreground/5 ml-9">
          <div
            className="text-sm text-foreground/75 leading-relaxed"
            dangerouslySetInnerHTML={{
              __html: renderFormattedContent(content),
            }}
          />
        </div>
      )}
    </button>
  );
};

// Flashcard component with flip animation
const Flashcard = ({ front, back }: { front: string; back: string }) => {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <button
      onClick={() => setIsFlipped(!isFlipped)}
      className="relative w-full h-24 perspective-1000"
      style={{ perspective: "1000px" }}
    >
      <div
        className={`absolute inset-0 rounded-xl border border-foreground/15 transition-all duration-500 transform-style-3d ${
          isFlipped ? "[transform:rotateY(180deg)]" : ""
        }`}
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* Front */}
        <div
          className="absolute inset-0 rounded-xl bg-gradient-to-br from-foreground/10 to-foreground/5 flex items-center justify-center p-4 backface-hidden"
          style={{ backfaceVisibility: "hidden" }}
        >
          <p className="text-sm font-medium text-foreground/90 text-center">{front}</p>
        </div>
        {/* Back */}
        <div
          className="absolute inset-0 rounded-xl bg-gradient-to-br from-foreground/15 to-foreground/8 flex items-center justify-center p-4 [transform:rotateY(180deg)] backface-hidden"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          <p className="text-sm text-foreground/80 text-center">{back}</p>
        </div>
      </div>
      {/* Flip hint */}
      <div className="absolute bottom-1 right-2 text-[9px] text-foreground/30 flex items-center gap-1">
        <RotateCcw className="w-2.5 h-2.5" />
        {isFlipped ? "vissza" : "fordítsd meg"}
      </div>
    </button>
  );
};

// Quiz question component
const QuizQuestion = ({
  question,
  options,
  correctIndex,
  onAnswer,
}: {
  question: string;
  options: string[];
  correctIndex: number;
  onAnswer: (correct: boolean) => void;
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const hasAnswered = selectedIndex !== null;

  const handleSelect = (index: number) => {
    if (hasAnswered) return;
    setSelectedIndex(index);
    onAnswer(index === correctIndex);
  };

  return (
    <div className="rounded-lg border border-foreground/10 bg-foreground/5 p-4 space-y-3">
      <p className="text-sm text-foreground/85 font-medium">{question}</p>
      <div className="space-y-2">
        {options.map((option, i) => {
          const isSelected = selectedIndex === i;
          const isCorrect = i === correctIndex;
          const showCorrect = hasAnswered && isCorrect;
          const showIncorrect = hasAnswered && isSelected && !isCorrect;

          return (
            <button
              key={i}
              onClick={() => handleSelect(i)}
              disabled={hasAnswered}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-200 flex items-center gap-2 ${
                showCorrect
                  ? "bg-green-500/20 border border-green-500/40 text-foreground/90"
                  : showIncorrect
                    ? "bg-red-500/20 border border-red-500/40 text-foreground/90"
                    : isSelected
                      ? "bg-foreground/15 border border-foreground/25"
                      : "bg-foreground/5 border border-foreground/10 hover:bg-foreground/10 hover:border-foreground/20"
              } disabled:cursor-default`}
            >
              {showCorrect && <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />}
              {showIncorrect && <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
              <span>{option}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// Writing prompt component
const WritingPrompt = ({ prompt }: { prompt: string }) => {
  const [text, setText] = useState("");

  return (
    <div className="rounded-lg border border-foreground/10 bg-foreground/5 p-4 space-y-3">
      <div className="flex items-center gap-2 text-foreground/60">
        <PenLine className="w-4 h-4" />
        <p className="text-sm">{prompt}</p>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Írj ide..."
        className="w-full min-h-[100px] rounded-lg bg-background/50 border border-foreground/10 p-3 text-sm text-foreground/90 placeholder:text-foreground/30 resize-none focus:outline-none focus:border-foreground/25 transition-colors"
      />
      {text.length > 0 && (
        <p className="text-[10px] text-foreground/40 text-right">{text.split(/\s+/).filter(Boolean).length} szó</p>
      )}
    </div>
  );
};

const LessonView = ({
  structuredPlan,
  activeDayIndex,
  loadDayContent,
  isDayStarted = false,
  timeRemaining = 0,
}: LessonViewProps) => {
  const [quizScore, setQuizScore] = useState({ correct: 0, total: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [loadedDay, setLoadedDay] = useState<PlanDay | null>(null);

  // Load day content when activeDayIndex changes or when items are missing
  useEffect(() => {
    const currentDay = structuredPlan?.days?.[activeDayIndex - 1];

    // If day exists but has no items, try to load them
    if (currentDay && (!currentDay.items || currentDay.items.length === 0) && loadDayContent) {
      setIsLoading(true);
      loadDayContent(activeDayIndex)
        .then((day) => {
          setLoadedDay(day);
          setIsLoading(false);
        })
        .catch(() => {
          setIsLoading(false);
        });
    } else {
      // Day already has items or no loader available
      setLoadedDay(currentDay ?? null);
    }
  }, [activeDayIndex, structuredPlan, loadDayContent]);

  // Reset quiz score when day changes
  useEffect(() => {
    setQuizScore({ correct: 0, total: 0 });
  }, [activeDayIndex]);

  // Show loading state
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 text-foreground/40 animate-spin" />
          <p className="text-sm text-foreground/50">Tartalom betöltése...</p>
        </div>
      </div>
    );
  }

  // Use loaded day if available, otherwise fall back to structuredPlan
  const currentDay = loadedDay || structuredPlan?.days?.[activeDayIndex - 1];

  if (!currentDay) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-foreground/40">Nincs aktív lecke</p>
      </div>
    );
  }

  // Separate items by type
  const lessonItems = currentDay.items?.filter((item) => item.type === "lesson") ?? [];
  const taskItems = currentDay.items?.filter((item) => item.type === "task") ?? [];

  // Extract flashcards, quiz, and writePrompt from items (if they have these properties)
  const flashcards = currentDay.items?.flatMap((item) => (item as any).flashcards ?? []) ?? [];
  const quizQuestions = currentDay.items?.flatMap((item) => (item as any).quiz ?? []) ?? [];
  const writePrompts = currentDay.items?.map((item) => (item as any).writePrompt).filter(Boolean) ?? [];

  const handleQuizAnswer = (correct: boolean) => {
    setQuizScore((prev) => ({
      correct: prev.correct + (correct ? 1 : 0),
      total: prev.total + 1,
    }));
  };

  // Extract clean title
  const dayTitle = currentDay.title?.replace(/^\d+\.\s*nap[:\s—-]*/i, "").trim() || `Nap ${activeDayIndex}`;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-foreground/10 space-y-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-foreground/40 mb-1">Mai lecke</p>
          <h2 className="text-base font-medium text-foreground/90">
            {activeDayIndex}. nap — {dayTitle}
          </h2>
        </div>

        {/* ✅ Timer Display - shown when day is started */}
        {isDayStarted && timeRemaining > 0 && <TimerDisplay timeRemaining={timeRemaining} />}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {/* Intro Section */}
        {currentDay.intro && (
          <div className="rounded-lg bg-foreground/5 border border-foreground/10 p-4">
            <p className="text-sm text-foreground/70 leading-relaxed">{currentDay.intro}</p>
          </div>
        )}

        {/* Lesson Content Section (Tananyag) */}
        {lessonItems.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-xs uppercase tracking-wider text-foreground/50 font-medium">Tananyag</h3>
            <div className="space-y-2">
              {lessonItems.map((item, index) => {
                // NEW: lazy loading items (have topic field)
                if ((item as any).topic) {
                  return (
                    <SimpleLessonItem
                      key={item.id}
                      itemId={item.id}
                      label={item.label || `Lecke ${index + 1}`}
                      topic={(item as any).topic}
                      estimatedMinutes={(item as any).estimated_minutes || 3}
                      dayTitle={currentDay.title || `Nap ${activeDayIndex}`}
                      domain={structuredPlan?.domain}
                      level={structuredPlan?.level}
                    />
                  );
                }
                
                // OLD: static content items (have content field)
                return <LessonCard key={item.id} item={item} index={index} />;
              })}
            </div>
          </section>
        )}

        {/* Flashcards Section (Gyakorló kártyák) */}
        {flashcards.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-xs uppercase tracking-wider text-foreground/50 font-medium">Gyakorló kártyák</h3>
            <div className="grid grid-cols-1 gap-3">
              {flashcards.map((card: { front: string; back: string }, index: number) => (
                <Flashcard key={index} front={card.front} back={card.back} />
              ))}
            </div>
          </section>
        )}

        {/* Quiz Section (Kvíz) */}
        {quizQuestions.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs uppercase tracking-wider text-foreground/50 font-medium">Kvíz</h3>
              {quizScore.total > 0 && (
                <span className="text-xs text-foreground/50">
                  {quizScore.correct}/{quizScore.total} helyes
                </span>
              )}
            </div>
            <div className="space-y-3">
              {quizQuestions.map((q: { question: string; options: string[]; correctIndex: number }, index: number) => (
                <QuizQuestion
                  key={index}
                  question={q.question}
                  options={q.options}
                  correctIndex={q.correctIndex}
                  onAnswer={handleQuizAnswer}
                />
              ))}
            </div>
          </section>
        )}

        {/* Writing Prompt Section (Írás gyakorlat) */}
        {writePrompts.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-xs uppercase tracking-wider text-foreground/50 font-medium">Írás gyakorlat</h3>
            {writePrompts.map((prompt: string, index: number) => (
              <WritingPrompt key={index} prompt={prompt} />
            ))}
          </section>
        )}

        {/* Fallback if no structured content yet - show tasks as simple practice list */}
        {lessonItems.length === 0 && flashcards.length === 0 && quizQuestions.length === 0 && taskItems.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-xs uppercase tracking-wider text-foreground/50 font-medium">Gyakorlás</h3>
            <div className="space-y-2">
              {taskItems.map((task) => (
                <div key={task.id} className="rounded-lg border border-foreground/10 bg-foreground/5 p-3">
                  <p className="text-sm text-foreground/70">{task.content}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {lessonItems.length === 0 && taskItems.length === 0 && flashcards.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <BookOpen className="w-8 h-8 text-foreground/20 mb-3" />
            <p className="text-sm text-foreground/40">Nincs tartalom ehhez a naphoz</p>
            <p className="text-xs text-foreground/30 mt-1">Kezdj egy új fókuszt a jobb oldalon</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LessonView;
