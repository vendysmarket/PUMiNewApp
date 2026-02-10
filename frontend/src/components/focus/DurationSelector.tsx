// src/components/focus/DurationSelector.tsx
// Duration selector for Focus plan - 7, 14, or 21 days only

import { Calendar } from "lucide-react";

interface DurationSelectorProps {
  selected: number;
  onChange: (days: number) => void;
}

const DURATIONS = [
  { days: 7, label: "1 hét", description: "Gyors célok" },
  { days: 14, label: "2 hét", description: "Kiegyensúlyozott" },
  { days: 21, label: "3 hét", description: "Mélyreható" },
];

export function DurationSelector({ selected, onChange }: DurationSelectorProps) {
  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-foreground/80 flex items-center gap-2">
        <Calendar className="w-4 h-4" />
        Terv időtartama
      </label>
      
      <div className="grid grid-cols-3 gap-3">
        {DURATIONS.map(({ days, label, description }) => (
          <button
            key={days}
            onClick={() => onChange(days)}
            className={`p-4 border-2 rounded-lg transition-all text-center ${
              selected === days
                ? "border-primary bg-primary/10"
                : "border-foreground/20 hover:border-foreground/40"
            }`}
          >
            <div className="text-2xl font-bold mb-1">{days}</div>
            <div className="text-sm font-medium mb-0.5">{label}</div>
            <div className="text-xs text-foreground/60">{description}</div>
          </button>
        ))}
      </div>
      
      <p className="text-xs text-foreground/50 text-center">
        Minden előfizetési szint számára elérhető
      </p>
    </div>
  );
}
