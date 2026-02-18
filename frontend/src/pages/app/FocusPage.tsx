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
import { generateSmartTitles, type SmartPlan } from "@/lib/smartPlanGenerator";
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
      const stats = await focusApi.stats("learning");
      if (stats.ok) {
        setStreak(stats.streak);
        setLastStreakDate(stats.last_streak_date || null);
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
    // Determine the new selection's track
    const newTrack = data.step2 && "category" in data.step2
      ? data.step2.category
      : data.step2 && "track" in data.step2
        ? data.step2.track
        : undefined;

    // Check if plan already exists - don't regenerate IF same track
    const existingPlanId = localStorage.getItem("pumi_focus_plan_id");
    if (existingPlanId && planMeta && outline) {
      // Guard: if user selected a different category than active plan, force new plan
      if (newTrack && planMeta.track && newTrack !== planMeta.track) {
        console.warn(`[FOCUS] Category mismatch: UI=${newTrack} vs plan=${planMeta.track} — archiving old plan`);
        await handleArchive();
        // Fall through to create a new plan
      } else {
        setView("outline");
        return;
      }
    }

    setLoading(true);
    setError(null);

    // Extract wizard data (new 3-step structure)
    const domain = data.step1.focusType === "language" ? "language"
      : data.step1.focusType === "project" ? "project"
      : data.step1.focusType === "smart_learning" ? "smart_learning"
      : "other";

    // Auto-generate goal title from wizard selections
    const LANG_LABELS: Record<string, string> = {
      english: "Angol", german: "Német", spanish: "Spanyol", italian: "Olasz",
      french: "Francia", greek: "Görög", portuguese: "Portugál", korean: "Koreai", japanese: "Japán",
    };
    const TRACK_LABELS: Record<string, string> = {
      foundations_language: "Alapozó", career_language: "Karrier",
    };

    let goalTitle = "Fókusz terv";
    let level = "beginner";
    let minutesPerDay = 20;
    let durationDays = 7;

    const SMART_CATEGORY_LABELS: Record<string, string> = {
      financial_basics: "Pénzügyi alapok",
      digital_literacy: "Digitális jártasság",
      communication_social: "Kommunikáció",
      study_brain_skills: "Tanulás & agy",
      knowledge_bites: "Tudásfalatok",
    };

    if (data.step2 && "targetLanguage" in data.step2) {
      // Language step2
      goalTitle = `${LANG_LABELS[data.step2.targetLanguage] || data.step2.targetLanguage} - ${TRACK_LABELS[data.step2.track] || data.step2.track}`;
      level = data.step2.level;
      minutesPerDay = data.step2.minutesPerDay || 20;
      durationDays = data.step2.durationDays || 7;
    } else if (data.step2 && "category" in data.step2) {
      // Smart learning step2
      minutesPerDay = data.step2.minutesPerDay || 20;
      durationDays = data.step2.durationDays || 7;
      goalTitle = `Micro-skill - ${SMART_CATEGORY_LABELS[data.step2.category] || data.step2.category}`;
    } else if (data.step2 && "minutesPerDay" in data.step2) {
      // Generic step2
      minutesPerDay = data.step2.minutesPerDay || 20;
      durationDays = data.step2.durationDays || 7;
      goalTitle = "Projekt terv";
    }

    try {
      // ── Syllabus generation for language domain ──
      let prebuiltDays: DayForBackend[] | undefined;
      let syllabusData: WeekPlan | undefined;

      let smartPlan: SmartPlan | undefined;

      if (domain === "language") {
        try {
          syllabusData = await generateSyllabus(data);
          prebuiltDays = mapSyllabusToDays(syllabusData, goalTitle, durationDays);
        } catch (syllabusErr) {
          console.warn("[FOCUS] Syllabus generation failed, falling back to defaults:", syllabusErr);
          // prebuiltDays stays undefined → backend generates defaults
        }
      } else if (domain === "smart_learning" && data.step2 && "category" in data.step2) {
        try {
          smartPlan = await generateSmartTitles(data.step2.category, durationDays);
          prebuiltDays = smartPlan.titles.map((title, i) => ({
            dayIndex: i,
            title: `Nap ${i + 1}: ${title}`,
            intro: "",
            items: [],
          }));
        } catch (smartErr) {
          console.warn("[FOCUS] Smart title generation failed, using generic titles:", smartErr);
        }
      }

      // ── Create plan (with or without syllabus items) ──
      const mode = domain === "project" ? "project" : "learning";
      const dayCount = Math.max(1, Math.min(14, durationDays || 7));
      const days = prebuiltDays || Array.from({ length: dayCount }, (_, i) => ({
        dayIndex: i,
        title: `${goalTitle} • Nap ${i + 1}`,
        intro: "",
        items: [],
      }));
      // Extract track system fields from wizard step2
      const step2Lang = data.step2 && "targetLanguage" in data.step2
        ? data.step2
        : null;
      const step2Smart = data.step2 && "category" in data.step2
        ? data.step2
        : null;

      const createResult = await focusApi.createPlan({
        title: goalTitle,
        message: goalTitle,
        domain,
        level,
        minutes_per_day: minutesPerDay,
        tone: data.step3?.tone,
        difficulty: data.step3?.difficulty,
        pacing: data.step3?.pacing,
        force_new: false,
        mode,
        days,
        // Track system: explicit target language + track + week outline for scope enforcement
        target_language: step2Lang?.targetLanguage,
        track: step2Lang?.track || step2Smart?.category,
        week_outline: syllabusData || undefined,
      });

      if (!createResult.ok) {
        throw new Error("Backend create-plan failed");
      }


      // Save plan_id
      localStorage.setItem("pumi_focus_plan_id", createResult.plan_id);

      // Save syllabus / smart plan for reference
      if (syllabusData) {
        localStorage.setItem("pumi_focus_syllabus", JSON.stringify(syllabusData));
      }
      if (smartPlan) {
        localStorage.setItem("pumi_focus_smart_plan", JSON.stringify(smartPlan));
      }

      // Build outline — enriched with syllabus or smart plan data if available
      const buildOutlineDays = () => {
        if (syllabusData) {
          return syllabusData.days.map((sd) => ({
            day: sd.day,
            title: `Nap ${sd.day}: ${sd.theme_hu}`,
            intro: sd.grammar_focus
              ? `${sd.grammar_focus} | ${sd.key_vocab.slice(0, 4).join(", ")}${sd.key_vocab.length > 4 ? "..." : ""}`
              : "",
          })).concat(
            Array.from({ length: Math.max(0, durationDays - syllabusData.days.length) }, (_, i) => ({
              day: syllabusData!.days.length + i + 1,
              title: `${goalTitle} • Nap ${syllabusData!.days.length + i + 1}`,
              intro: "",
            })),
          );
        }
        if (smartPlan) {
          return smartPlan.titles.map((t, i) => ({
            day: i + 1,
            title: `Nap ${i + 1}: ${t}`,
            intro: "",
          }));
        }
        return Array.from({ length: durationDays }, (_, i) => ({
          day: i + 1,
          title: `${goalTitle} • Nap ${i + 1}`,
          intro: "",
        }));
      };

      const localOutline: FocusOutline = {
        title: goalTitle,
        domain,
        level,
        minutes_per_day: minutesPerDay,
        days: buildOutlineDays(),
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
        track: step2Lang?.track || step2Smart?.category,
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

      setSelectedDayIndex(dayIdx);
      commitDay(day, dayIdx);
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
  
  const handleCompleteItem = async (itemId: string, resultJson?: any) => {
    if (completedItemIds.includes(itemId)) return;
    setCompletedItemIds(prev => [...prev, itemId]);

    // Persist item completion to backend
    try {
      const mode = outline?.domain === "project" || outline?.focus_type === "project" ? "project" : "learning";
      await focusApi.completeItem({
        item_id: itemId,
        status: "done",
        mode,
        result_json: resultJson || { completed: true },
      });
    } catch (err) {
      console.warn("[FOCUS] Item completion backend call failed (non-fatal):", err);
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
      const mode = outline?.domain === "project" || outline?.focus_type === "project" ? "project" : "learning";
      if (planId) {
        const result = await focusApi.completeDay({ plan_id: planId, day_index: selectedDayIndex, mode });
        
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
  
  const handleArchive = async () => {
    // Capture plan ID, then clear it IMMEDIATELY to prevent reuse during async archive
    const planId = localStorage.getItem("pumi_focus_plan_id");
    localStorage.removeItem("pumi_focus_plan_id");
    localStorage.removeItem(PLAN_META_KEY);
    setPlanMeta(null);

    // Archive plan in the database
    if (planId) {
      const mode = outline?.domain === "project" || outline?.focus_type === "project" ? "project" : "learning";
      try {
        await focusApi.reset({ plan_id: planId, reset_mode: "archive", mode });
      } catch (err) {
        console.error("[FOCUS] Failed to archive plan in DB:", err);
      }
    }

    // Clear remaining state
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(IN_PROGRESS_KEY);
    localStorage.removeItem(COMPLETED_ITEMS_KEY);
    localStorage.removeItem("pumi_focus_syllabus");
    localStorage.removeItem("pumi_focus_smart_plan");

    // Clear item caches (both old and new prefix)
    Object.keys(localStorage)
      .filter(k => k.startsWith("pumi_item_") || k.startsWith("focus_item_v5_"))
      .forEach(k => localStorage.removeItem(k));

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
