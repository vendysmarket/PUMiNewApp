import { useState } from "react";
import { RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";
import type { CardsContent } from "@/types/focusItem";

interface CardsRendererProps {
  content: CardsContent;
  onValidationChange: (state: { itemsCompleted: number }) => void;
}

export function CardsRenderer({ content, onValidationChange }: CardsRendererProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [seenCards, setSeenCards] = useState<Set<number>>(new Set());

  const currentCard = content.cards[currentIndex];
  const totalCards = content.cards.length;

  const handleFlip = () => {
    if (!flipped) {
      // Mark as seen when flipped
      const newSeen = new Set(seenCards);
      newSeen.add(currentIndex);
      setSeenCards(newSeen);
      onValidationChange({ itemsCompleted: newSeen.size });
    }
    setFlipped(!flipped);
  };

  const goNext = () => {
    if (currentIndex < totalCards - 1) {
      setCurrentIndex(currentIndex + 1);
      setFlipped(false);
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setFlipped(false);
    }
  };

  const reset = () => {
    setCurrentIndex(0);
    setFlipped(false);
    setSeenCards(new Set());
    onValidationChange({ itemsCompleted: 0 });
  };

  return (
    <div className="space-y-4">
      {/* Progress indicator */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{currentIndex + 1} / {totalCards}</span>
        <span>{seenCards.size} megtekintve</span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1 bg-foreground/10 rounded-full overflow-hidden">
        <div 
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${(seenCards.size / totalCards) * 100}%` }}
        />
      </div>

      {/* Card */}
      <div 
        onClick={handleFlip}
        className="relative min-h-[200px] cursor-pointer perspective-1000"
      >
        <div 
          className={`w-full min-h-[200px] rounded-xl border-2 border-foreground/20 p-6 flex items-center justify-center text-center transition-all duration-500 transform-style-3d ${
            flipped ? "rotate-y-180" : ""
          }`}
          style={{
            transformStyle: "preserve-3d",
            transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          }}
        >
          {/* Front */}
          <div 
            className={`absolute inset-0 flex flex-col items-center justify-center p-6 backface-hidden ${
              flipped ? "invisible" : ""
            }`}
            style={{ backfaceVisibility: "hidden" }}
          >
            <span className="text-xs text-muted-foreground mb-2">ELEJE</span>
            <p className="text-xl font-semibold text-foreground">{currentCard.front}</p>
            <p className="text-sm text-muted-foreground mt-4">Kattints a megfordításhoz</p>
          </div>

          {/* Back */}
          <div 
            className={`absolute inset-0 flex flex-col items-center justify-center p-6 bg-primary/5 rounded-xl ${
              !flipped ? "invisible" : ""
            }`}
            style={{ 
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
            }}
          >
            <span className="text-xs text-muted-foreground mb-2">HÁTULJA</span>
            <p className="text-xl font-semibold text-primary">{currentCard.back}</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={goPrev}
          disabled={currentIndex === 0}
          className="flex items-center gap-1 px-4 py-2 rounded-lg border border-foreground/20 hover:bg-foreground/5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
          Előző
        </button>

        <button
          onClick={reset}
          className="p-2 rounded-lg border border-foreground/20 hover:bg-foreground/5"
          title="Újrakezdés"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <button
          onClick={goNext}
          disabled={currentIndex === totalCards - 1}
          className="flex items-center gap-1 px-4 py-2 rounded-lg border border-foreground/20 hover:bg-foreground/5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Következő
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* All cards completed */}
      {seenCards.size === totalCards && (
        <div className="mt-4 p-4 rounded-lg bg-green-500/10 text-center">
          <p className="font-medium text-green-600 dark:text-green-400">
            🎉 Minden kártyát átnéztél!
          </p>
        </div>
      )}
    </div>
  );
}
