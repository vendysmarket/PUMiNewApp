// components/focusroom/RoomSetup.tsx
// Compact setup form for creating a new FocusRoom

import { useState } from "react";
import { BookOpen, Lightbulb, ArrowRight, Loader2 } from "lucide-react";
import type { RoomDomain, RoomLevel, FocusRoomConfig } from "@/types/focusRoom";
import pumiLogo from "@/assets/pumi-logo.png";

interface RoomSetupProps {
  onCreateRoom: (config: FocusRoomConfig) => void;
  isCreating: boolean;
}

const LANGUAGES = [
  { value: "english", label: "Angol" },
  { value: "german", label: "Német" },
  { value: "spanish", label: "Spanyol" },
  { value: "italian", label: "Olasz" },
  { value: "french", label: "Francia" },
  { value: "greek", label: "Görög" },
  { value: "japanese", label: "Japán" },
  { value: "korean", label: "Koreai" },
];

const SMART_CATEGORIES = [
  { value: "financial_basics", label: "Pénzügyi alapok" },
  { value: "digital_literacy", label: "Digitális jártasság" },
  { value: "communication_social", label: "Kommunikáció" },
  { value: "study_brain_skills", label: "Tanulás & agy" },
  { value: "knowledge_bites", label: "Tudásfalatok" },
];

const LEVELS: { value: RoomLevel; label: string }[] = [
  { value: "beginner", label: "Kezdő" },
  { value: "basic", label: "Alapszint" },
  { value: "intermediate", label: "Haladó" },
];

export function RoomSetup({ onCreateRoom, isCreating }: RoomSetupProps) {
  const [domain, setDomain] = useState<RoomDomain | null>(null);
  const [language, setLanguage] = useState("english");
  const [category, setCategory] = useState("financial_basics");
  const [level, setLevel] = useState<RoomLevel>("beginner");
  const [track, setTrack] = useState("foundations_language");

  const handleCreate = () => {
    if (!domain) return;
    const config: FocusRoomConfig = {
      domain,
      level,
      minutesPerDay: 20,
      durationDays: 7,
      tone: "casual",
    };
    if (domain === "language") {
      config.targetLanguage = language;
      config.track = track;
    } else {
      config.category = category;
    }
    onCreateRoom(config);
  };

  // Step 1: Pick domain
  if (!domain) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center px-4 animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center mb-6 p-3">
          <img src={pumiLogo} alt="PUMi" className="w-full h-full object-contain" />
        </div>
        <h1 className="text-2xl font-bold mb-2">FocusRoom</h1>
        <p className="text-muted-foreground text-sm mb-8 text-center max-w-xs">
          Interaktív tanulószoba — AI tanár, hangos lecke, gyakorlatok
        </p>

        <div className="w-full max-w-sm space-y-3">
          <button
            onClick={() => setDomain("language")}
            className="w-full py-4 px-6 rounded-xl font-medium
                     bg-secondary/50 border border-border/50
                     hover:bg-secondary hover:border-foreground/30
                     transition-all flex items-center gap-4"
          >
            <BookOpen className="w-5 h-5 shrink-0" />
            <div className="text-left">
              <p className="font-semibold">Nyelvtanulás</p>
              <p className="text-xs text-muted-foreground">Szókincs, nyelvtan, párbeszédek</p>
            </div>
          </button>

          <button
            onClick={() => setDomain("smart_learning")}
            className="w-full py-4 px-6 rounded-xl font-medium
                     bg-secondary/50 border border-border/50
                     hover:bg-secondary hover:border-foreground/30
                     transition-all flex items-center gap-4"
          >
            <Lightbulb className="w-5 h-5 shrink-0" />
            <div className="text-left">
              <p className="font-semibold">Micro-skill</p>
              <p className="text-xs text-muted-foreground">Rövid tudásfalatok, gondolkodás</p>
            </div>
          </button>
        </div>
      </div>
    );
  }

  // Step 2: Configure
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-4 animate-fade-in">
      <h2 className="text-xl font-bold mb-6">
        {domain === "language" ? "Nyelv beállítása" : "Kategória választás"}
      </h2>

      <div className="w-full max-w-sm space-y-5">
        {/* Language selector */}
        {domain === "language" && (
          <>
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Nyelv</label>
              <div className="grid grid-cols-2 gap-2">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.value}
                    onClick={() => setLanguage(lang.value)}
                    className={`py-2.5 px-4 rounded-lg text-sm border transition-all
                      ${language === lang.value
                        ? "bg-foreground text-background border-foreground"
                        : "bg-secondary/50 border-border/50 hover:bg-secondary"
                      }`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Szint</label>
              <div className="grid grid-cols-3 gap-2">
                {LEVELS.map((l) => (
                  <button
                    key={l.value}
                    onClick={() => setLevel(l.value)}
                    className={`py-2.5 px-4 rounded-lg text-sm border transition-all
                      ${level === l.value
                        ? "bg-foreground text-background border-foreground"
                        : "bg-secondary/50 border-border/50 hover:bg-secondary"
                      }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Irány</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setTrack("foundations_language")}
                  className={`py-2.5 px-4 rounded-lg text-sm border transition-all
                    ${track === "foundations_language"
                      ? "bg-foreground text-background border-foreground"
                      : "bg-secondary/50 border-border/50 hover:bg-secondary"
                    }`}
                >
                  Alapozó
                </button>
                <button
                  onClick={() => setTrack("career_language")}
                  className={`py-2.5 px-4 rounded-lg text-sm border transition-all
                    ${track === "career_language"
                      ? "bg-foreground text-background border-foreground"
                      : "bg-secondary/50 border-border/50 hover:bg-secondary"
                    }`}
                >
                  Karrier
                </button>
              </div>
            </div>
          </>
        )}

        {/* Smart learning category selector */}
        {domain === "smart_learning" && (
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">Kategória</label>
            <div className="space-y-2">
              {SMART_CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setCategory(cat.value)}
                  className={`w-full py-3 px-4 rounded-lg text-sm border transition-all text-left
                    ${category === cat.value
                      ? "bg-foreground text-background border-foreground"
                      : "bg-secondary/50 border-border/50 hover:bg-secondary"
                    }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Create button */}
        <div className="pt-4 flex gap-3">
          <button
            onClick={() => setDomain(null)}
            className="px-6 py-3 rounded-xl text-sm bg-secondary/50 border border-border/50
                     hover:bg-secondary transition-all"
          >
            Vissza
          </button>
          <button
            onClick={handleCreate}
            disabled={isCreating}
            className="flex-1 py-3 px-6 rounded-xl font-semibold
                     bg-foreground text-background
                     hover:bg-foreground/90 active:scale-[0.98]
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-all flex items-center justify-center gap-2"
          >
            {isCreating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowRight className="w-4 h-4" />
            )}
            {isCreating ? "Generálás..." : "Indítás"}
          </button>
        </div>
      </div>
    </div>
  );
}
