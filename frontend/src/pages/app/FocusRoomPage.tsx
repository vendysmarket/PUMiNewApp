// pages/app/FocusRoomPage.tsx
// FocusRoom — Interactive Learning Room page
// Manages room lifecycle: setup → session → completion

import { useState, useEffect, useCallback } from "react";
import { RoomSetup } from "@/components/focusroom/RoomSetup";
import { RoomSession } from "@/components/focusroom/RoomSession";
import { focusRoomApi } from "@/lib/focusRoomApi";
import { dispatchFocusProgressChange } from "@/hooks/useFocusInProgress";
import type {
  FocusRoom,
  FocusRoomConfig,
  PlanDaySummary,
} from "@/types/focusRoom";

const STORAGE_KEY = "pumi_focusroom_v1";
const PROGRESS_KEY = "pumi_focusroom_in_progress";

type ViewState = "setup" | "home" | "session";

export default function FocusRoomPage() {
  const [view, setView] = useState<ViewState>("setup");
  const [room, setRoom] = useState<FocusRoom | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Init: load from localStorage ──
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed: FocusRoom = JSON.parse(saved);
        setRoom(parsed);
        // Determine view based on state
        if (parsed.session) {
          setView("session");
          localStorage.setItem(PROGRESS_KEY, "1");
          dispatchFocusProgressChange();
        } else {
          setView("home");
        }
      } catch (err) {
        console.error("[FocusRoom] Failed to load saved room:", err);
      }
    }
  }, []);

  // ── Persist room on change ──
  useEffect(() => {
    if (room) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(room));
    }
  }, [room]);

  // ── Create room ──
  const handleCreateRoom = useCallback(async (config: FocusRoomConfig) => {
    setIsCreating(true);
    setError(null);

    try {
      const resp = await focusRoomApi.createRoom({
        domain: config.domain,
        target_language: config.targetLanguage,
        track: config.track,
        level: config.level,
        category: config.category,
        minutes_per_day: config.minutesPerDay,
        duration_days: config.durationDays,
        tone: config.tone,
      });

      if (!resp.ok) throw new Error(resp.error || "Room creation failed");

      const days: PlanDaySummary[] = resp.plan.days.map((d, i) => ({
        dayIndex: d.day_index,
        title: d.title,
        status: i === 0 ? "available" as const : "locked" as const,
      }));

      const newRoom: FocusRoom = {
        id: resp.room_id,
        config,
        plan: {
          id: `plan-${resp.room_id}`,
          roomId: resp.room_id,
          days,
          createdAt: new Date().toISOString(),
        },
        currentDayIndex: 1,
        completedDays: [],
        streak: 0,
        session: null,
        createdAt: new Date().toISOString(),
      };

      setRoom(newRoom);
      setView("home");
    } catch (err) {
      console.error("[FocusRoom] Create failed:", err);
      setError(err instanceof Error ? err.message : "Hiba történt a létrehozáskor.");
    } finally {
      setIsCreating(false);
    }
  }, []);

  // ── Start day session ──
  const handleStartDay = useCallback(() => {
    if (!room) return;
    setView("session");
    localStorage.setItem(PROGRESS_KEY, "1");
    dispatchFocusProgressChange();
  }, [room]);

  // ── Room update (from session) ──
  const handleRoomUpdate = useCallback((updatedRoom: FocusRoom) => {
    setRoom(updatedRoom);
    // If session ended, return to home
    if (!updatedRoom.session) {
      setView("home");
      localStorage.removeItem(PROGRESS_KEY);
      dispatchFocusProgressChange();
    }
  }, []);

  // ── Exit session ──
  const handleExit = useCallback(() => {
    if (room) {
      setRoom({ ...room, session: null });
    }
    setView("home");
    localStorage.removeItem(PROGRESS_KEY);
    dispatchFocusProgressChange();
  }, [room]);

  // ── Archive/reset room ──
  const handleArchive = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PROGRESS_KEY);
    dispatchFocusProgressChange();
    setRoom(null);
    setView("setup");
  }, []);

  // ── Render ──

  // Setup: no room exists
  if (view === "setup" || !room) {
    return <RoomSetup onCreateRoom={handleCreateRoom} isCreating={isCreating} />;
  }

  // Session: active day
  if (view === "session") {
    return (
      <div className="h-[calc(100vh-4rem)]">
        <RoomSession
          room={room}
          onRoomUpdate={handleRoomUpdate}
          onExit={handleExit}
        />
      </div>
    );
  }

  // Home: room exists, pick a day
  const progressPercent = Math.round((room.completedDays.length / room.plan.days.length) * 100);
  const todayCompleted = room.completedDays.includes(room.currentDayIndex);
  const currentDayTitle = room.plan.days.find(d => d.dayIndex === room.currentDayIndex)?.title || `Nap ${room.currentDayIndex}`;

  const LANG_LABELS: Record<string, string> = {
    english: "Angol", german: "Német", spanish: "Spanyol",
    italian: "Olasz", french: "Francia", greek: "Görög",
    japanese: "Japán", korean: "Koreai",
  };

  return (
    <div className="min-h-[80vh] flex flex-col px-4 md:px-6 animate-fade-in">
      {/* Header */}
      <div className="py-4 border-b border-border/30 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">
            {room.config.domain === "language"
              ? `${LANG_LABELS[room.config.targetLanguage || ""] || room.config.targetLanguage} FocusRoom`
              : "Micro-skill FocusRoom"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {room.completedDays.length}/{room.plan.days.length} nap • {room.streak} napos sorozat
          </p>
        </div>
        <button
          onClick={handleArchive}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-secondary/50"
        >
          Új terv
        </button>
      </div>

      {/* Progress bar */}
      <div className="py-4">
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>Haladás</span>
          <span>{progressPercent}%</span>
        </div>
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-foreground rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Day list */}
      <div className="flex-1 space-y-2 py-2">
        {room.plan.days.map((day) => {
          const isCompleted = room.completedDays.includes(day.dayIndex);
          const isCurrent = day.dayIndex === room.currentDayIndex;
          const isLocked = day.status === "locked";

          return (
            <div
              key={day.dayIndex}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all
                ${isCurrent && !isCompleted
                  ? "border-foreground/30 bg-foreground/5"
                  : isCompleted
                    ? "border-green-500/20 bg-green-500/5"
                    : "border-border/30 bg-card/20 opacity-50"
                }`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
                ${isCompleted ? "bg-green-500/20 text-green-400" : isCurrent ? "bg-foreground/10 text-foreground" : "bg-secondary text-muted-foreground"}`}>
                {isCompleted ? "✓" : day.dayIndex}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{day.title}</p>
              </div>
              {isCurrent && !isCompleted && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
                  Következő
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom CTA */}
      <div className="sticky bottom-0 py-4 bg-gradient-to-t from-background via-background to-transparent">
        {room.completedDays.length >= room.plan.days.length ? (
          <div className="text-center py-4">
            <p className="text-lg font-bold mb-2">Gratulálok! Minden nap kész!</p>
            <button
              onClick={handleArchive}
              className="py-3 px-6 rounded-xl text-sm bg-secondary/50 border border-border/50 hover:bg-secondary transition-all"
            >
              Új terv indítása
            </button>
          </div>
        ) : (
          <button
            onClick={handleStartDay}
            disabled={todayCompleted}
            className="w-full py-4 px-6 rounded-xl font-semibold text-lg
                     bg-foreground text-background
                     hover:bg-foreground/90 active:scale-[0.98]
                     disabled:opacity-30 disabled:cursor-not-allowed
                     transition-all flex items-center justify-center gap-3"
          >
            {todayCompleted ? "Mai nap teljesítve" : `${currentDayTitle} indítása`}
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="fixed bottom-20 left-4 right-4 md:left-auto md:right-4 md:w-96 p-4 rounded-xl bg-destructive/90 text-white text-sm animate-fade-in z-50">
          {error}
          <button onClick={() => setError(null)} className="absolute top-2 right-2 p-1">×</button>
        </div>
      )}
    </div>
  );
}
