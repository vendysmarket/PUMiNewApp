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
import { pumiInvoke } from "@/lib/pumiInvoke";

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
    // ✅ Check if plan already exists - don't regenerate
    const existingPlanId = localStorage.getItem("pumi_focus_plan_id");
    if (existingPlanId && planMeta && outline) {
      console.log("[FOCUS] Plan already exists, skipping generation:", existingPlanId);
      setView("outline");
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Build prompt from wizard data
      const focusTypeLabel = {
        language: "nyelvtanulás",
        project: "projekt",
        study: "tanulás",
        habit: "szokás kialakítása",
        custom: "egyedi cél",
      }[data.step1.focusType || "custom"];
      
      let message = `${data.step2.goalSentence}`;
      let domain = data.step1.focusType === "language" ? "language" : "other";
      let level = "beginner";
      let minutesPerDay = 20;
      
      if (data.step3 && "level" in data.step3) {
        level = data.step3.level;
        minutesPerDay = data.step3.minutesPerDay;
      } else if (data.step3 && "minutesPerDay" in data.step3) {
        minutesPerDay = data.step3.minutesPerDay;
      }
      
      const result = await pumiInvoke<{ ok: boolean; outline?: any; text?: string; error?: string; detail?: string }>("/chat/enhanced", {
        mode: "focus_outline",
        message,
        lang: "hu",
        domain,
        level,
        minutes_per_day: minutesPerDay,
        duration: data.step2.durationDays,
        tone: data.step4.tone,
        difficulty: data.step4.difficulty,
        pacing: data.step4.pacing,
        include_exercise: true,
        include_translation: true,
        include_writing: true,
      });
      
      if (result.ok && (result.outline || result.text)) {
        let parsedOutline = result.outline;
        
        // ✅ Handle case where outline is in 'text' field as JSON string
        if (!parsedOutline && result.text) {
          try {
            const textParsed = JSON.parse(result.text);
            parsedOutline = textParsed.outline || textParsed;
          } catch (e) {
            console.error("[FOCUS] Failed to parse text field:", e);
          }
        }
        
        if (typeof parsedOutline === "string") {
          try {
            parsedOutline = JSON.parse(parsedOutline);
            parsedOutline = parsedOutline.outline || parsedOutline;
          } catch {}
        }
        
        if (parsedOutline && parsedOutline.days) {
          console.log("[FOCUS] Outline parsed successfully:", parsedOutline);
          
          // ✅ Transform days to backend format (dayIndex + items)
          const transformedDays = parsedOutline.days.map((d: any) => ({
            dayIndex: d.day,
            title: d.title,
            intro: d.intro,
            items: [], // Backend will populate items on start-day
          }));
          
          // ✅ Call State Engine to create plan
          console.log("[FOCUS] Calling create-plan with transformed days:", transformedDays);
          const createPlanResult = await focusApi.createPlan({
            title: parsedOutline.title,
            message: data.step2.goalSentence, // Required by backend
            days: transformedDays,
            domain: parsedOutline.domain || domain,
            level: parsedOutline.level || level,
            minutes_per_day: parsedOutline.minutes_per_day || minutesPerDay,
            lang: "hu",
          });
          
          if (!createPlanResult.ok) {
            setError("Terv létrehozása sikertelen a szerverben");
            return;
          }
          
          console.log("[FOCUS] Plan created:", createPlanResult.plan_id);
          
          // Save plan_id to localStorage
          localStorage.setItem("pumi_focus_plan_id", createPlanResult.plan_id);
          
          setOutline(parsedOutline);
          
          // Create plan meta with backend plan_id
          const newMeta: FocusPlanMeta = {
            id: createPlanResult.plan_id,
            focusType: data.step1.focusType || "custom",
            goal: data.step2.goalSentence,
            durationDays: data.step2.durationDays,
            minutesPerDay,
            startedAt: new Date().toISOString(),
            currentDayIndex: 1,
            completedDays: [],
            streak: 0,
            archived: false,
          };
          setPlanMeta(newMeta);
          
          setView("outline");
        } else {
          console.error("[FOCUS] Invalid outline format:", parsedOutline);
          setError("Érvénytelen outline formátum");
        }
      } else {
        // Handle error response from API
        const errorMsg = result.error || result.detail || "Terv generálás sikertelen";
        console.error("[FOCUS] API error:", errorMsg);
        setError(parseNetworkError(new Error(errorMsg)));
      }
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
  
  const handleStartDay = async (dayIndex: number) => {
    if (!outline || !planMeta) return;
    
    setLoadingDay(dayIndex);
    setSelectedDayIndex(dayIndex);
    setError(null);
    
    try {
      const selectedDay = outline.days?.[dayIndex - 1];
      const dayTitle = selectedDay?.title || `Nap ${dayIndex}`;
      
      const result = await pumiInvoke<{ ok: boolean; day?: any; text?: string; error?: string }>("/chat/enhanced", {
        mode: "focus_day",
        day_index: dayIndex,
        outline,
        message: `Generate day ${dayIndex}: ${dayTitle}`,
        lang: "hu",
        include_exercise: true,
        include_translation: true,
        include_writing: true,
      });
      
      if (result.ok) {
        let day = result.day;
        
        if (typeof day === "string") {
          try {
            day = JSON.parse(day);
            day = day.day || day;
          } catch {}
        }
        
        if (!day && result.text) {
          try {
            day = JSON.parse(result.text);
            day = day.day || day;
          } catch {}
        }
        
        if (day && day.items) {
          setCurrentDay(day);
          setCompletedItemIds([]); // Reset for new day
          setView("day");
          
          // Set in-progress + notify other components
          localStorage.setItem(IN_PROGRESS_KEY, "1");
          setInProgress(true);
          dispatchFocusProgressChange();
          
          // Update current day index
          setPlanMeta({ ...planMeta, currentDayIndex: dayIndex });
        } else {
          setError("Érvénytelen nap formátum");
        }
      } else {
        setError(result.error || "Nap generálás sikertelen");
      }
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
