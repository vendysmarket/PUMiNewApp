// src/pages/app/FocusPage.tsx
// Focus Mode - Complete architecture with Home, Wizard, Outline, Day, Progress views

import { useState, useEffect, useCallback } from "react";
import { useNavigationLock } from "@/hooks/useNavigationLock";
import { dispatchFocusProgressChange } from "@/hooks/useFocusInProgress";
import { FocusHome } from "@/components/focus/FocusHome";
import { FocusWizard } from "@/components/focus/FocusWizard";
import { FocusOutlineView } from "@/components/focus/FocusOutlineView";
import { FocusDayView } from "@/components/focus/FocusDayView";
import { FocusProgress } from "@/components/focus/FocusProgress";
import { ArchiveModal } from "@/components/focus/ArchiveModal";
import { WizardData, FocusPlanMeta, FocusType } from "@/types/focusWizard";
import type { FocusOutline, PlanDay } from "@/types/learningFocus";
import { focusApi } from "@/lib/focusApi";
import { generateSyllabus, mapSyllabusToDays, type DayForBackend } from "@/lib/syllabusGenerator";
import type { WeekPlan } from "@/types/syllabus";

// ============================================================================
// Helpers
// ============================================================================

function parseNetworkError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const errorName = err instanceof Error ? err.name : "";
  
  // Check for actual CORS errors - must be TypeError with specific patterns
  // CORS errors manifest as TypeError with "Failed to fetch" and no response
  const isCorsError = (
    errorName === "TypeError" && 
    (message.includes("Failed to fetch") || message.includes("NetworkError")) &&
    (message.toLowerCase().includes("cors") || message.includes("blocked"))
  );
  
  if (isCorsError) {
    return "Backend CORS beállítás hiányzik – nem a te neted.";
  }
  
  // Check for 422 validation errors
  if (message.includes("422")) {
    return "Validációs hiba – hibás adat-struktúra.";
  }
  
  // Check for AI/LLM JSON generation errors
  if (message.includes("invalid JSON") || message.includes("Invalid JSON") || message.includes("outline failed")) {
    return "Az AI nem tudott érvényes tervet generálni. Próbáld újra!";
  }
  
  // Check for 500 errors
  if (message.includes("500")) {
    return "Szerver hiba történt. Próbáld újra pár másodperc múlva.";
  }
  
  // Generic network/fetch errors (not CORS)
  if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
    return "Hálózati hiba történt. Ellenőrizd az internetkapcsolatot.";
  }
  
  return "Hálózati hiba történt. Próbáld újra.";
}

// ============================================================================
// Storage Keys
// ============================================================================

const STORAGE_KEY = "pumi_focus_session_v2";
const PLAN_META_KEY = "pumi_focus_plan_meta";
const IN_PROGRESS_KEY = "pumi_focus_in_progress";
const COMPLETED_ITEMS_KEY = "pumi_focus_completed_items";

// ============================================================================
// Types
// ============================================================================

type ViewState = "home" | "wizard" | "outline" | "day" | "progress";

interface SessionData {
  outline: FocusOutline | null;
  currentDay: PlanDay | null;
}

// ============================================================================
// Component
// ============================================================================

export default function FocusPage() {
  // View state
  const [view, setView] = useState<ViewState>("home");
  const [loading, setLoading] = useState(false);
  const [loadingDay, setLoadingDay] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Plan data
  const [planMeta, setPlanMeta] = useState<FocusPlanMeta | null>(null);
  const [outline, setOutline] = useState<FocusOutline | null>(null);
  const [currentDay, setCurrentDay] = useState<PlanDay | null>(null);
  const [selectedDayIndex, setSelectedDayIndex] = useState(1);
  const [completedItemIds, setCompletedItemIds] = useState<string[]>([]);
  
  // Streak state - fetched from API
  const [streak, setStreak] = useState(0);
  const [lastStreakDate, setLastStreakDate] = useState<string | null>(null);
  
  // Modals
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  
  // In-progress state
  const [inProgress, setInProgress] = useState(false);
  
  // Navigation lock
  useNavigationLock(inProgress);

  // ============================================================================
  // Computed: Check if today's day is already completed
  // ============================================================================
  const today = new Date().toISOString().split("T")[0];
  const todayCompleted = lastStreakDate === today;

  // ============================================================================
  // FETCH STREAK - On mount and after day complete
  // ============================================================================
  
  const fetchStreak = async () => {
    try {
      const stats = await focusApi.stats();
      if (stats.ok) {
        setStreak(stats.streak);
        setLastStreakDate(stats.last_streak_date || null);
        console.log("[FOCUS] Streak fetched:", stats.streak, "Last:", stats.last_streak_date);
      }
    } catch (err) {
      // Graceful fallback: stats endpoint may not be available yet
      console.warn("[FOCUS] Stats endpoint not available, using default streak:", err);
      setStreak(0);
      setLastStreakDate(null);
    }
  };

  // ============================================================================
  // INIT - Load session from localStorage + fetch streak
  // ============================================================================
  
  useEffect(() => {
    const initSession = () => {
      // Load plan meta
      const savedMeta = localStorage.getItem(PLAN_META_KEY);
      if (savedMeta) {
        try {
          const meta: FocusPlanMeta = JSON.parse(savedMeta);
          if (!meta.archived) {
            setPlanMeta(meta);
          }
        } catch (err) {
          console.error("[FOCUS] Failed to load plan meta:", err);
        }
      }
      
      // Load session data
      const savedSession = localStorage.getItem(STORAGE_KEY);
      if (savedSession) {
        try {
          const session: SessionData = JSON.parse(savedSession);
          setOutline(session.outline);
          setCurrentDay(session.currentDay);
        } catch (err) {
          console.error("[FOCUS] Failed to load session:", err);
        }
      }
      
      // Load completed items
      const savedItems = localStorage.getItem(COMPLETED_ITEMS_KEY);
      if (savedItems) {
        try {
          setCompletedItemIds(JSON.parse(savedItems));
        } catch (err) {
          console.error("[FOCUS] Failed to load completed items:", err);
        }
      }
      
      // Check in-progress state
      const progressFlag = localStorage.getItem(IN_PROGRESS_KEY) === "1";
      setInProgress(progressFlag);
      
      // Auto-continue if in-progress
      if (progressFlag && savedSession) {
        const session: SessionData = JSON.parse(savedSession);
        if (session.currentDay) {
          setView("day");
        }
      }
    };
    
    initSession();
    
    // Fetch streak from API on mount
    fetchStreak();
  }, []);

  // ============================================================================
  // PERSIST - Save on change
  // ============================================================================
  
  useEffect(() => {
    if (outline || currentDay) {
      const session: SessionData = { outline, currentDay };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    }
  }, [outline, currentDay]);
  
  useEffect(() => {
    if (planMeta) {
      localStorage.setItem(PLAN_META_KEY, JSON.stringify(planMeta));
    }
  }, [planMeta]);
  
  useEffect(() => {
    localStorage.setItem(COMPLETED_ITEMS_KEY, JSON.stringify(completedItemIds));
  }, [completedItemIds]);

  // ============================================================================
  // WIZARD COMPLETE - Generate plan
  // ============================================================================
  
  const handleWizardComplete = async (data: WizardData) => {
    // Check if plan already exists - don't regenerate
    const existingPlanId = localStorage.getItem("pumi_focus_plan_id");
    if (existingPlanId && planMeta && outline) {
      console.log("[FOCUS] Plan already exists, skipping:", existingPlanId);
      setView("outline");
      return;
    }

    setLoading(true);
    setError(null);

    // Extract wizard data
    const goalTitle = data.step2.goalSentence;
    const domain = data.step1.focusType === "language" ? "language"
      : data.step1.focusType === "project" ? "project"
      : "other";
    let level = "beginner";
    let minutesPerDay = 100; // 4×25 min default

    if (data.step3 && "level" in data.step3) {
      level = data.step3.level;
      minutesPerDay = data.step3.minutesPerDay || 100;
    } else if (data.step3 && "minutesPerDay" in data.step3) {
      minutesPerDay = data.step3.minutesPerDay || 100;
    }

    const durationDays = data.step2.durationDays || 7;

    try {
      // ── Syllabus generation for language domain ──
      let prebuiltDays: DayForBackend[] | undefined;
      let syllabusData: WeekPlan | undefined;

      if (domain === "language") {
        try {
          console.log("[FOCUS] Generating syllabus...");
          syllabusData = await generateSyllabus(data);
          prebuiltDays = mapSyllabusToDays(syllabusData, goalTitle, durationDays);
          console.log("[FOCUS] Syllabus generated:", syllabusData.days.length, "days,", prebuiltDays.reduce((sum, d) => sum + d.items.length, 0), "items");
        } catch (syllabusErr) {
          console.warn("[FOCUS] Syllabus generation failed, falling back to defaults:", syllabusErr);
          // prebuiltDays stays undefined → backend generates defaults
        }
      }

      // ── Create plan (with or without syllabus items) ──
      console.log("[FOCUS] Calling backend create-plan...");
      const mode = domain === "project" ? "project" : "learning";
      const dayCount = Math.max(1, Math.min(14, durationDays || 7));
      const days = prebuiltDays || Array.from({ length: dayCount }, (_, i) => ({
        dayIndex: i,
        title: `${goalTitle} • Nap ${i + 1}`,
        intro: "",
        items: [],
      }));
      const createResult = await focusApi.createPlan({
        title: goalTitle,
        message: goalTitle,
        domain,
        level,
        minutes_per_day: minutesPerDay,
        tone: data.step4?.tone,
        difficulty: data.step4?.difficulty,
        pacing: data.step4?.pacing,
        force_new: false,
        mode,
        days,
      });

      if (!createResult.ok) {
        throw new Error("Backend create-plan failed");
      }

      console.log("[FOCUS] Plan created:", createResult.plan_id);

      // Save plan_id
      localStorage.setItem("pumi_focus_plan_id", createResult.plan_id);

      // Save syllabus for reference
      if (syllabusData) {
        localStorage.setItem("pumi_focus_syllabus", JSON.stringify(syllabusData));
      }

      // Build outline — enriched with syllabus data if available
      const localOutline: FocusOutline = {
        title: goalTitle,
        domain,
        level,
        minutes_per_day: minutesPerDay,
        days: syllabusData
          ? syllabusData.days.map((sd) => ({
              day: sd.day,
              title: `Nap ${sd.day}: ${sd.theme_hu}`,
              intro: sd.grammar_focus
                ? `${sd.grammar_focus} | ${sd.key_vocab.slice(0, 4).join(", ")}${sd.key_vocab.length > 4 ? "..." : ""}`
                : "",
            }))
          // Pad remaining days if syllabus covers fewer than durationDays
          .concat(
            Array.from({ length: Math.max(0, durationDays - syllabusData.days.length) }, (_, i) => ({
              day: syllabusData!.days.length + i + 1,
              title: `${goalTitle} • Nap ${syllabusData!.days.length + i + 1}`,
              intro: "",
            })),
          )
          : Array.from({ length: durationDays }, (_, i) => ({
              day: i + 1,
              title: `${goalTitle} • Nap ${i + 1}`,
              intro: "",
            })),
      };

      setOutline(localOutline);
      setPlanMeta({
        id: createResult.plan_id,
        focusType: data.step1.focusType || "custom",
        goal: goalTitle,
        durationDays,
        minutesPerDay,
        startedAt: new Date().toISOString(),
        currentDayIndex: 1,
        completedDays: [],
        streak: 0,
        archived: false,
      });
      setView("outline");
    } catch (err) {
      console.error("[FOCUS] Wizard complete error:", err);
      setError(parseNetworkError(err));
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // START DAY
  // ============================================================================
  
  // Helper: commit started day into component state
  const commitDay = (day: any, dayIdx: number) => {
    setCurrentDay(day);
    setCompletedItemIds([]);
    setView("day");
    localStorage.setItem(IN_PROGRESS_KEY, "1");
    setInProgress(true);
    dispatchFocusProgressChange();
    if (planMeta) setPlanMeta({ ...planMeta, currentDayIndex: dayIdx });
  };

  const handleStartDay = async (dayIndex: number) => {
    if (!outline || !planMeta) return;

    setLoadingDay(dayIndex);
    setSelectedDayIndex(dayIndex);
    setError(null);

    const planId = localStorage.getItem("pumi_focus_plan_id");

    try {
      if (!planId) throw new Error("No planId found");

      // ── Via pumi-proxy (focusApi) ──
      console.log("[FOCUS] Calling backend start-day...");
      const mode = outline?.domain === "project" || outline?.focus_type === "project" ? "project" : "learning";
      const started = await focusApi.startDay({ plan_id: planId, mode });

      if (!started.ok) throw new Error("Backend start-day failed");

      const dayIdx = started.day?.day_index ?? dayIndex;
      const dayData = await focusApi.getDay({ plan_id: planId, day_index: dayIdx, mode });

      if (!dayData.ok || !dayData.day) throw new Error("Backend get-day failed");

      const day = {
        ...dayData.day,
        items: dayData.items ?? dayData.day.items ?? [],
      };

      if (!day.items || day.items.length === 0) {
        throw new Error("Backend returned day with no items");
      }

      console.log("[FOCUS] Day loaded:", day);
      commitDay(day, dayIndex);
    } catch (err) {
      console.error("[FOCUS] Start day error:", err);
      setError(parseNetworkError(err));
    } finally {
      setLoadingDay(null);
    }
  };

  // ============================================================================
  // COMPLETE ITEM - with optional result data for validation
  // ============================================================================
  
  const handleCompleteItem = (itemId: string, resultJson?: any) => {
    if (!completedItemIds.includes(itemId)) {
      setCompletedItemIds([...completedItemIds, itemId]);
      
      // Log result for debugging (backend validation happens via separate endpoint)
      if (resultJson) {
        console.log("[FOCUS] Item completed with result:", itemId, resultJson);
      }
    }
  };

  // ============================================================================
  // COMPLETE DAY - With error handling for not_allowed
  // ============================================================================
  
  const handleCompleteDay = async () => {
    if (!planMeta || !currentDay) return;
    
    setLoading(true);
    
    try {
      const planId = localStorage.getItem("pumi_focus_plan_id");
      if (planId) {
        const result = await focusApi.completeDay({ plan_id: planId, day_index: selectedDayIndex });
        
        // Handle not_allowed or error responses
        if (!result.ok) {
          const reason = (result as any).reason || (result as any).error || "Nap befejezése sikertelen";
          setError(reason);
          
          // If not allowed (e.g. day not started or wrong date), go back to outline
          if ((result as any).not_allowed || (result as any).reason?.includes("not started")) {
            localStorage.removeItem(IN_PROGRESS_KEY);
            setInProgress(false);
            dispatchFocusProgressChange();
            setView("outline");
          }
          return;
        }
        
        // Update streak from response if available
        if (result.streak !== undefined) {
          setStreak(result.streak);
        }
        
        // Update last streak date to today
        setLastStreakDate(new Date().toISOString().split("T")[0]);
      }
      
      // Update plan meta locally
      const newCompletedDays = [...planMeta.completedDays, selectedDayIndex];
      
      setPlanMeta({
        ...planMeta,
        completedDays: newCompletedDays,
        streak: streak + 1,
        currentDayIndex: selectedDayIndex + 1,
      });
      
      // Clear in-progress + notify other components
      localStorage.removeItem(IN_PROGRESS_KEY);
      setInProgress(false);
      dispatchFocusProgressChange();
      
      // Reset and go to home (dashboard)
      setCurrentDay(null);
      setCompletedItemIds([]);
      setView("home");
      
      // Refresh streak from API to ensure accuracy
      fetchStreak();
    } catch (err) {
      console.error("[FOCUS] Complete day error:", err);
      const message = err instanceof Error ? err.message : String(err);
      setError(parseNetworkError(err));
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // ARCHIVE & RESET
  // ============================================================================
  
  const handleArchive = () => {
    // Archive current plan
    if (planMeta) {
      const archivedMeta = { ...planMeta, archived: true };
      // Could save to archive storage here
    }
    
    // Clear all state
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PLAN_META_KEY);
    localStorage.removeItem(IN_PROGRESS_KEY);
    localStorage.removeItem(COMPLETED_ITEMS_KEY);
    localStorage.removeItem("pumi_focus_plan_id");
    localStorage.removeItem("pumi_focus_syllabus");

    // Clear item caches
    Object.keys(localStorage)
      .filter(k => k.startsWith("pumi_item_"))
      .forEach(k => localStorage.removeItem(k));
    
    setPlanMeta(null);
    setOutline(null);
    setCurrentDay(null);
    setCompletedItemIds([]);
    setInProgress(false);
    dispatchFocusProgressChange();
    setShowArchiveModal(false);
    setView("home");
  };

  // ============================================================================
  // RENDER
  // ============================================================================
  
  return (
    <>
      {/* Archive Modal */}
      {showArchiveModal && (
        <ArchiveModal
          streak={planMeta?.streak || 0}
          onConfirm={handleArchive}
          onCancel={() => setShowArchiveModal(false)}
        />
      )}
      
      {/* Views */}
      {view === "home" && (
        <FocusHome
          activePlan={planMeta}
          inProgressDay={inProgress}
          streak={streak}
          todayCompleted={todayCompleted}
          onStartWizard={() => setView("wizard")}
          onContinueDay={() => {
            // Don't allow starting if today is already completed
            if (todayCompleted && !inProgress) {
              return;
            }
            if (currentDay) {
              setView("day");
            } else if (planMeta) {
              handleStartDay(planMeta.currentDayIndex);
            }
          }}
          onViewOutline={() => setView("outline")}
          onViewProgress={() => setView("progress")}
          onNewPlan={() => setShowArchiveModal(true)}
        />
      )}
      
      {view === "wizard" && (
        <FocusWizard
          onComplete={handleWizardComplete}
          onCancel={() => setView("home")}
          isGenerating={loading}
        />
      )}
      
      {view === "outline" && outline && planMeta && (
        <FocusOutlineView
          outline={outline}
          planMeta={planMeta}
          selectedDayIndex={selectedDayIndex}
          loadingDay={loadingDay}
          inProgressDay={inProgress}
          streak={streak}
          todayCompleted={todayCompleted}
          onStartDay={handleStartDay}
          onContinueDay={() => {
            if (currentDay) {
              setView("day");
            } else {
              handleStartDay(planMeta.currentDayIndex);
            }
          }}
          onBack={() => setView("home")}
          onNewPlan={() => setShowArchiveModal(true)}
        />
      )}
      
      {view === "day" && currentDay && outline && planMeta && (
        <FocusDayView
          currentDay={currentDay}
          outline={outline}
          dayIndex={selectedDayIndex}
          streak={streak}
          completedItemIds={completedItemIds}
          onCompleteItem={handleCompleteItem}
          onCompleteDay={handleCompleteDay}
          onBack={() => {}} // Disabled - navigation locked during focus
          onReset={() => setShowArchiveModal(true)}
          loading={loading}
        />
      )}
      
      {view === "progress" && planMeta && (
        <FocusProgress
          planMeta={planMeta}
          onBack={() => setView("home")}
        />
      )}
      
      {/* Error display */}
      {error && (
        <div className="fixed bottom-20 left-4 right-4 md:left-auto md:right-4 md:w-96 p-4 rounded-xl bg-destructive/90 text-white text-sm animate-fade-in z-50">
          {error}
          <button 
            onClick={() => setError(null)}
            className="absolute top-2 right-2 p-1"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
