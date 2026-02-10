import { useState, useEffect, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Check, Lock, Circle, CheckCircle2, BookOpen, Loader2 } from "lucide-react";
import DOMPurify from "dompurify";
import { useTranslation } from "@/hooks/useTranslation";
import { useTaskPersistence } from "@/hooks/useTaskPersistence";
import type {
  FocusSession as BaseFocusSession,
  PracticeTask,
  QuizQuestion,
  StructuredPlan,
  PlanItem,
  PlanDay,
} from "@/types/learningFocus";

// Extend FocusSession to include lastDoneDay
interface FocusSession extends BaseFocusSession {
  lastDoneDay?: string;
}

interface DaysPanelProps {
  session: FocusSession | null;
  structuredPlan?: StructuredPlan | null;
  activeDayIndex?: number;
  onDayComplete: () => void;
  onTasksChange: (tasks: PracticeTask[]) => void;
  onQuizChange: (questions: QuizQuestion[]) => void;
  loadDayContent?: (dayIndex: number) => Promise<PlanDay | null>;
  onStartDay?: () => void; // ✅ NEW: Called when user starts today's session
  isDayStarted?: boolean; // ✅ NEW: Whether today's session has been started
}

// Pill wrapper component for consistent styling
const PillSection = ({
  children,
  className = "",
  dimmed = false,
  glow = false,
}: {
  children: ReactNode;
  className?: string;
  dimmed?: boolean;
  glow?: boolean;
}) => (
  <div
    className={`rounded-lg border transition-all duration-300 ${
      dimmed
        ? "bg-secondary/30 border-foreground/5"
        : glow
          ? "bg-secondary/50 border-foreground/15 shadow-sm"
          : "bg-secondary/40 border-foreground/10"
    } ${className}`}
  >
    {children}
  </div>
);

// Lesson/Material item display - with XSS sanitization
const LessonItem = ({ item }: { item: PlanItem }) => {
  const sanitizedHtml = DOMPurify.sanitize(
    item.content
      .replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground/90">$1</strong>')
      .replace(/—/g, '<span class="text-foreground/40">—</span>'),
    { ALLOWED_TAGS: ["strong", "span", "em"], ALLOWED_ATTR: ["class"] }
  );

  return (
    <div className="flex items-start gap-2 px-2 py-1.5">
      <BookOpen className="w-3 h-3 mt-0.5 text-foreground/40 flex-shrink-0" />
      <span
        className="text-xs leading-relaxed text-foreground/70"
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    </div>
  );
};

// Interactive task item with checkbox
const TaskItem = ({ task, completed, onToggle }: { task: PlanItem; completed: boolean; onToggle: () => void }) => (
  <button
    onClick={onToggle}
    className="w-full flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-foreground/5 transition-colors text-left group"
  >
    {completed ? (
      <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-foreground/50 flex-shrink-0" />
    ) : (
      <Circle className="w-3.5 h-3.5 mt-0.5 text-foreground/30 group-hover:text-foreground/50 flex-shrink-0" />
    )}
    <span className={`text-xs leading-relaxed ${completed ? "text-foreground/40 line-through" : "text-foreground/70"}`}>
      {task.content}
    </span>
  </button>
);

// Collapsible history pill - shows completed day with expandable transcript
const HistoryDayPill = ({
  dayIndex,
  title,
  completedTaskCount,
  totalTaskCount,
}: {
  dayIndex: number;
  title: string;
  completedTaskCount?: number;
  totalTaskCount?: number;
}) => {
  const [open, setOpen] = useState(false);
  const showProgress = totalTaskCount !== undefined && totalTaskCount > 0;

  return (
    <div className="rounded-lg border border-foreground/5 bg-secondary/20 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-2.5 py-1.5 text-left hover:bg-white/5 transition"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Check className="w-3 h-3 text-foreground/30 flex-shrink-0" />
          <span className="text-xs text-foreground/50 truncate">
            {dayIndex}. nap — {title}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {showProgress && (
            <span className="text-[10px] text-foreground/30">
              {completedTaskCount}/{totalTaskCount}
            </span>
          )}
          <div className="text-foreground/30">
            {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </div>
        </div>
      </button>
      {open && (
        <div className="px-2.5 pb-2 pt-1 border-t border-foreground/5">
          <p className="text-[10px] text-foreground/30">Befejezve — részletek hamarosan</p>
        </div>
      )}
    </div>
  );
};

// Locked future day pill - non-expandable
const LockedDayPill = ({ dayIndex, title }: { dayIndex: number; title: string }) => (
  <div className="rounded-lg border border-foreground/5 bg-secondary/20 flex items-center justify-between px-2.5 py-1.5">
    <span className="text-xs text-foreground/25 truncate">
      {dayIndex}. nap — {title}
    </span>
    <Lock className="w-3 h-3 text-foreground/15 flex-shrink-0" />
  </div>
);

// Extract short title from structured day or markdown
const extractShortTitle = (structuredDay: { title?: string; items?: PlanItem[] } | null, dayIndex: number): string => {
  if (structuredDay?.title) {
    // Remove "X. nap" prefix if present
    const cleaned = structuredDay.title.replace(/^\d+\.\s*nap[:\s—-]*/i, "").trim();
    if (cleaned) return cleaned;
  }

  // Try first item content as fallback
  if (structuredDay?.items?.[0]?.content) {
    const firstItem = structuredDay.items[0].content;
    // Truncate if too long
    return firstItem.length > 30 ? firstItem.slice(0, 30) + "…" : firstItem;
  }

  return `Nap ${dayIndex}`;
};

// Helper to separate lesson and task items
const separateItems = (items: PlanItem[]) => {
  const lessons = items.filter((item) => item.type === "lesson");
  const tasks = items.filter((item) => item.type === "task");
  return { lessons, tasks };
};

const DaysPanel = ({
  session,
  structuredPlan,
  activeDayIndex = 1,
  onDayComplete,
  loadDayContent,
  onStartDay,
  isDayStarted = false,
}: DaysPanelProps) => {
  const { t } = useTranslation();
  const [isLoadingToday, setIsLoadingToday] = useState(false);
  const [loadedTodayData, setLoadedTodayData] = useState<PlanDay | null>(null);

  // Check if user already completed today using session data
  const checkDailyLimit = (): boolean => {
    if (!session?.lastDoneDay) return false;

    // Use ISO date format to match FocusSheet
    const today = new Date().toISOString().split("T")[0]; // "2026-01-19"
    return session.lastDoneDay === today;
  };

  const alreadyDoneToday = checkDailyLimit();

  // ✅ NEW: Handle "Continue" button - start today's session
  const handleContinueDay = async () => {
    if (alreadyDoneToday) {
      alert("⏰ Holnap is itt vagyok!\n\nMai leckédet már teljesítetted. Gyere vissza holnap!");
      return;
    }

    // Load today's content if not loaded yet
    const todayStructured = structuredPlan?.days?.[activeDayIndex - 1];
    if (todayStructured && (!todayStructured.items || todayStructured.items.length === 0) && loadDayContent) {
      setIsLoadingToday(true);
      try {
        const day = await loadDayContent(activeDayIndex);
        setLoadedTodayData(day);
      } catch (error) {
        console.error("Failed to load day content:", error);
        alert("❌ Nem sikerült betölteni a mai leckét. Próbáld újra!");
        setIsLoadingToday(false);
        return;
      }
      setIsLoadingToday(false);
    }

    // Notify parent that day has started (will start timer)
    onStartDay?.();
  };

  // ✅ MODIFIED: Handle "I'm Done" button - complete the day
  const handleDayComplete = () => {
    if (alreadyDoneToday) {
      alert("⏰ Holnap is itt vagyok!\n\nMai leckédet már teljesítetted. Gyere vissza holnap!");
      return;
    }

    if (!isDayStarted) {
      alert("⏰ Még nem kezdted el a mai leckét!\n\nNyomd meg a 'Folytatás' gombot a kezdéshez.");
      return;
    }

    // Proceed with original completion
    onDayComplete();
  };

  // Get session ID for persistence (use createdAt as unique key)
  const sessionId = session?.createdAt?.replace(/[^a-zA-Z0-9]/g, "") ?? null;

  // Task persistence hook
  const { toggleTask, isTaskCompleted, getCompletedCount } = useTaskPersistence(sessionId, activeDayIndex);

  // Load today's content if not available
  useEffect(() => {
    const todayStructured = structuredPlan?.days?.[activeDayIndex - 1];

    // If today exists but has no items, try to load them
    if (todayStructured && (!todayStructured.items || todayStructured.items.length === 0) && loadDayContent) {
      setIsLoadingToday(true);
      loadDayContent(activeDayIndex)
        .then((day) => {
          setLoadedTodayData(day);
          setIsLoadingToday(false);
        })
        .catch(() => {
          setIsLoadingToday(false);
        });
    } else {
      setLoadedTodayData(todayStructured ?? null);
    }
  }, [activeDayIndex, structuredPlan, loadDayContent]);

  if (!session) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-xs text-foreground/30">{t("noActiveSession")}</p>
      </div>
    );
  }

  const planTitle = structuredPlan?.title ?? "7 napos terv";
  const totalDays = structuredPlan?.days?.length ?? 7;
  const todayIndex = Math.min(Math.max(activeDayIndex, 1), totalDays);

  // History days: 1..todayIndex-1
  const historyDays = Array.from({ length: Math.max(0, todayIndex - 1) }, (_, i) => i + 1);
  // Future days: todayIndex+1..totalDays
  const futureDays = Array.from({ length: Math.max(0, totalDays - todayIndex) }, (_, i) => todayIndex + 1 + i);

  // Today's structured data - use loaded data if available
  const todayStructured = loadedTodayData ?? structuredPlan?.days?.[todayIndex - 1] ?? null;
  const { lessons: todayLessons, tasks: todayTasks } = separateItems(todayStructured?.items ?? []);
  const todayTaskIds = todayTasks.map((t) => t.id);
  const completedCount = getCompletedCount(todayTaskIds);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto px-2.5 py-2.5 space-y-3">
        {/* Header pill */}
        <PillSection className="px-2.5 py-2 text-center">
          <p className="text-sm font-light text-foreground/90">
            {t("day")} {todayIndex}/{totalDays}
          </p>
          <p className="text-[9px] text-foreground/40 mt-0.5 truncate">{planTitle}</p>
        </PillSection>

        {/* History Section */}
        <div className="space-y-1">
          <p className="text-[9px] uppercase tracking-wider text-foreground/40 px-0.5">Történet</p>
          {historyDays.length > 0 ? (
            <div className="space-y-1">
              {historyDays.map((d) => {
                const structuredDay = structuredPlan?.days?.[d - 1] ?? null;
                const shortTitle = extractShortTitle(structuredDay, d);
                const { tasks } = separateItems(structuredDay?.items ?? []);
                const taskCount = tasks.length;

                return (
                  <HistoryDayPill
                    key={d}
                    dayIndex={d}
                    title={shortTitle}
                    completedTaskCount={taskCount}
                    totalTaskCount={taskCount}
                  />
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-foreground/5 bg-secondary/20 px-2.5 py-2">
              <p className="text-[10px] text-foreground/30 text-center">Még nincs befejezett nap</p>
            </div>
          )}
        </div>

        {/* Today Section - Fully Expanded with Lesson + Tasks */}
        <div className="space-y-1">
          <p className="text-[9px] uppercase tracking-wider text-foreground/40 px-0.5">Ma</p>
          <PillSection glow={todayTasks.length > 0 || todayLessons.length > 0}>
            {/* Day header */}
            <div className="px-2.5 py-1.5 border-b border-foreground/10 flex items-center justify-between">
              <span className="text-xs font-medium text-foreground/80 truncate">
                - {extractShortTitle(todayStructured, todayIndex)}
              </span>
              {todayTasks.length > 0 && (
                <span className="text-[10px] text-foreground/50 flex-shrink-0 ml-2">
                  {completedCount}/{todayTasks.length}
                </span>
              )}
            </div>

            <div className="px-1.5 py-2 space-y-2">
              {/* Intro text if available */}
              {todayStructured?.intro && (
                <p className="text-[10px] text-foreground/50 leading-relaxed px-2 pb-1">{todayStructured.intro}</p>
              )}

              {/* Loading state for today's content */}
              {isLoadingToday && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-4 h-4 text-foreground/40 animate-spin" />
                  <span className="ml-2 text-[10px] text-foreground/40">Betöltés...</span>
                </div>
              )}

              {/* LESSON / TANANYAG SECTION */}
              {!isLoadingToday && todayLessons.length > 0 && (
                <div className="border-t border-foreground/5 pt-2">
                  <p className="text-[9px] uppercase tracking-wider text-foreground/40 px-2 mb-1">Tananyag</p>
                  <div className="space-y-0.5">
                    {todayLessons.map((lesson) => (
                      <LessonItem key={lesson.id} item={lesson} />
                    ))}
                  </div>
                </div>
              )}

              {/* TASKS / FELADATOK SECTION */}
              {!isLoadingToday && todayTasks.length > 0 && (
                <div className="border-t border-foreground/5 pt-2">
                  <p className="text-[9px] uppercase tracking-wider text-foreground/40 px-2 mb-1">Feladatok</p>
                  <div className="space-y-0.5">
                    {todayTasks.map((task) => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        completed={isTaskCompleted(task.id)}
                        onToggle={() => toggleTask(task.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state - only show if not loading and no items */}
              {!isLoadingToday && todayLessons.length === 0 && todayTasks.length === 0 && (
                <p className="text-[10px] text-foreground/40 italic px-2 py-1">Nincs tartalom ehhez a naphoz</p>
              )}
            </div>
          </PillSection>
        </div>

        {/* Future Section - Locked Pills */}
        {futureDays.length > 0 && (
          <div className="space-y-1">
            <p className="text-[9px] uppercase tracking-wider text-foreground/40 px-0.5">Jövő</p>
            <div className="space-y-1">
              {futureDays.map((d) => {
                const structuredDay = structuredPlan?.days?.[d - 1] ?? null;
                const shortTitle = extractShortTitle(structuredDay, d);

                return <LockedDayPill key={d} dayIndex={d} title={shortTitle} />;
              })}
            </div>
          </div>
        )}
      </div>

      {/* Sticky bottom button */}
      <div className="flex-shrink-0 px-2.5 py-2.5 border-t border-foreground/10 bg-background/80 backdrop-blur-sm">
        {!isDayStarted && !alreadyDoneToday ? (
          // ✅ CONTINUE BUTTON - shown when day hasn't started yet
          <button
            onClick={handleContinueDay}
            disabled={isLoadingToday}
            className="w-full py-2.5 rounded-lg bg-foreground/10 border border-foreground/25 text-foreground/90 text-xs font-medium tracking-wider hover:bg-foreground/15 hover:border-foreground/40 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoadingToday ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Betöltés...
              </span>
            ) : (
              "Folytatás"
            )}
          </button>
        ) : (
          // ✅ I'M DONE BUTTON - shown after day started or if already done today
          <button
            onClick={handleDayComplete}
            disabled={alreadyDoneToday}
            className="w-full py-2.5 rounded-lg bg-foreground/10 border border-foreground/25 text-foreground/90 text-xs font-medium tracking-wider hover:bg-foreground/15 hover:border-foreground/40 transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {alreadyDoneToday ? "✓ Mai nap teljesítve" : t("imDone")}
          </button>
        )}
      </div>
    </div>
  );
};

export default DaysPanel;
