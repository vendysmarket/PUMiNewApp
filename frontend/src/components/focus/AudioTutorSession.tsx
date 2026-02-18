// src/components/focus/AudioTutorSession.tsx
// One-way Audio Tutor: generates lesson → plays TTS audio → step through → summary

import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, Play, Pause, SkipForward, Loader2, Volume2, CheckCircle2, RefreshCw, BookOpen } from "lucide-react";
import { audioTutorApi } from "@/lib/audioTutorApi";
import type { AudioLesson, AudioStep, AudioTutorProgress } from "@/types/audioTutor";
import { useToast } from "@/hooks/use-toast";

const STORAGE_KEY = "pumi_audio_tutor_session";

interface AudioTutorSessionProps {
  track: string;
  level?: string;
  onBack: () => void;
}

type SessionState = "idle" | "loading" | "active" | "summary";

export function AudioTutorSession({ track, level, onBack }: AudioTutorSessionProps) {
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioCacheRef = useRef<Map<string, string>>(new Map());

  const [state, setState] = useState<SessionState>("idle");
  const [lesson, setLesson] = useState<AudioLesson | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore session from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const progress: AudioTutorProgress = JSON.parse(saved);
        const today = new Date().toISOString().split("T")[0];
        if (progress.date === today && progress.track === track && progress.lesson) {
          setLesson(progress.lesson);
          setStepIndex(progress.stepIndex);
          setState("active");
        }
      }
    } catch {
      // ignore corrupt data
    }
  }, [track]);

  // Persist progress
  useEffect(() => {
    if (lesson && state === "active") {
      const progress: AudioTutorProgress = {
        track,
        stepIndex,
        date: new Date().toISOString().split("T")[0],
        lesson,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    }
  }, [lesson, stepIndex, state, track]);

  // Audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => setIsPlaying(false);
    const handlePause = () => setIsPlaying(false);
    const handlePlay = () => setIsPlaying(true);

    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("play", handlePlay);

    return () => {
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("play", handlePlay);
    };
  }, []);

  const generateLesson = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const resp = await audioTutorApi.generateLesson({ track, level });
      if (!resp.ok || !resp.steps?.length) {
        throw new Error(resp.error || "Failed to generate lesson");
      }
      const lessonData: AudioLesson = {
        title: resp.title,
        steps: resp.steps,
        closing: resp.closing,
      };
      setLesson(lessonData);
      setStepIndex(0);
      setState("active");
    } catch (err) {
      setError(String(err));
      setState("idle");
      toast({ title: "Hiba", description: "Nem sikerült a lecke generálása. Próbáld újra!", variant: "destructive" });
    }
  }, [track, level, toast]);

  const playStepAudio = useCallback(async (step: AudioStep) => {
    if (!audioRef.current) return;

    // Check cache first
    const cached = audioCacheRef.current.get(step.id);
    if (cached) {
      audioRef.current.src = cached;
      audioRef.current.play().catch(() => {});
      return;
    }

    setAudioLoading(true);
    try {
      const resp = await audioTutorApi.generateTts({ text: step.text });
      if (!resp.ok || !resp.audio_base64) {
        throw new Error(resp.error || "TTS failed");
      }
      const dataUrl = `data:${resp.content_type};base64,${resp.audio_base64}`;
      audioCacheRef.current.set(step.id, dataUrl);
      audioRef.current!.src = dataUrl;
      audioRef.current!.play().catch(() => {});
    } catch (err) {
      toast({ title: "Hang hiba", description: "Nem sikerült a hang generálása.", variant: "destructive" });
    } finally {
      setAudioLoading(false);
    }
  }, [toast]);

  const handlePlayPause = () => {
    if (!audioRef.current || !lesson) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else if (audioRef.current.src && audioRef.current.src !== window.location.href) {
      audioRef.current.play().catch(() => {});
    } else {
      playStepAudio(lesson.steps[stepIndex]);
    }
  };

  const handleNext = () => {
    if (!lesson) return;
    audioRef.current?.pause();
    if (stepIndex < lesson.steps.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      setState("summary");
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const handleFinish = () => {
    localStorage.removeItem(STORAGE_KEY);
    onBack();
  };

  const currentStep = lesson?.steps[stepIndex];

  const kindLabel = (kind: AudioStep["kind"]) => {
    switch (kind) {
      case "explain": return "Magyarázat";
      case "prompt": return "Gondolkodj!";
      case "recap": return "Összefoglaló";
    }
  };

  const kindColor = (kind: AudioStep["kind"]) => {
    switch (kind) {
      case "explain": return "border-blue-500/30 bg-blue-500/5";
      case "prompt": return "border-yellow-500/30 bg-yellow-500/5";
      case "recap": return "border-emerald-500/30 bg-emerald-500/5";
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 animate-fade-in">
      {/* Hidden audio element */}
      <audio ref={audioRef} />

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-secondary/50 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <Volume2 className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold">Audio Tutor</h1>
        </div>
      </div>

      {/* IDLE state */}
      {state === "idle" && (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
            <Volume2 className="w-10 h-10 text-primary" />
          </div>
          <h2 className="text-xl font-bold mb-2">Hallgasd meg a mai leckét</h2>
          <p className="text-muted-foreground text-sm mb-8 max-w-xs">
            Rövid, lépésről lépésre haladó audio lecke. Csak hallgatnod kell!
          </p>
          {error && (
            <p className="text-red-400 text-sm mb-4">{error}</p>
          )}
          <button
            onClick={generateLesson}
            className="py-4 px-8 rounded-xl font-semibold bg-foreground text-background hover:bg-foreground/90 active:scale-[0.98] transition-all flex items-center gap-3"
          >
            <Play className="w-5 h-5" />
            Lecke indítása
          </button>
        </div>
      )}

      {/* LOADING state */}
      {state === "loading" && (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">Lecke generálása...</p>
        </div>
      )}

      {/* ACTIVE state */}
      {state === "active" && lesson && currentStep && (
        <div className="space-y-6">
          {/* Lesson title + progress */}
          <div>
            <h2 className="text-lg font-bold mb-1">{lesson.title}</h2>
            <p className="text-sm text-muted-foreground">
              {stepIndex + 1} / {lesson.steps.length} lépés
            </p>
          </div>

          {/* Step card */}
          <div className={`rounded-xl border p-5 ${kindColor(currentStep.kind)}`}>
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-4 h-4 opacity-60" />
              <span className="text-xs font-medium opacity-70">{kindLabel(currentStep.kind)}</span>
            </div>
            <p className="text-base leading-relaxed">{currentStep.text}</p>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3">
            <button
              onClick={handlePlayPause}
              disabled={audioLoading}
              className="flex-1 py-3 px-4 rounded-xl font-medium bg-foreground text-background hover:bg-foreground/90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {audioLoading ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Hang betöltése...</>
              ) : isPlaying ? (
                <><Pause className="w-5 h-5" /> Szünet</>
              ) : (
                <><Play className="w-5 h-5" /> Lejátszás</>
              )}
            </button>
            <button
              onClick={handleNext}
              className="py-3 px-4 rounded-xl font-medium bg-secondary/50 border border-border/50 hover:bg-secondary transition-all flex items-center gap-2"
            >
              {stepIndex < lesson.steps.length - 1 ? (
                <><SkipForward className="w-4 h-4" /> Tovább</>
              ) : (
                <><CheckCircle2 className="w-4 h-4" /> Befejezés</>
              )}
            </button>
          </div>

          {/* Progress dots */}
          <div className="flex justify-center gap-2 pt-2">
            {lesson.steps.map((_, i) => (
              <div
                key={i}
                className={`w-2.5 h-2.5 rounded-full transition-all ${
                  i === stepIndex ? "bg-foreground scale-125" :
                  i < stepIndex ? "bg-foreground/50" : "bg-foreground/20"
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* SUMMARY state */}
      {state === "summary" && lesson && (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center mb-6">
            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
          </div>
          <h2 className="text-xl font-bold mb-2">Lecke teljesítve!</h2>
          <p className="text-muted-foreground text-sm mb-2">{lesson.title}</p>
          <p className="text-sm mb-8 max-w-sm">{lesson.closing}</p>

          <div className="space-y-3 w-full max-w-xs">
            <button
              onClick={handleFinish}
              className="w-full py-3 px-6 rounded-xl font-semibold bg-foreground text-background hover:bg-foreground/90 transition-all"
            >
              Befejezés
            </button>
            <button
              onClick={() => {
                audioCacheRef.current.clear();
                generateLesson();
              }}
              className="w-full py-3 px-6 rounded-xl font-medium bg-secondary/50 border border-border/50 hover:bg-secondary transition-all flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Új lecke
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
