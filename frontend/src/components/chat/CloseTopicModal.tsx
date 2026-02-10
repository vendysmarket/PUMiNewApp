import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export type SummaryType = "none" | "bullets" | "detailed";

interface CloseTopicModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (summaryType: SummaryType) => void;
}

const CloseTopicModal = ({ open, onOpenChange, onConfirm }: CloseTopicModalProps) => {
  const [selectedType, setSelectedType] = useState<SummaryType>("bullets");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background border border-foreground/20 max-w-md data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.98] motion-reduce:animate-none">
        <DialogHeader className="space-y-3">
          <DialogTitle className="text-foreground/80 font-light text-lg">Lezárjuk ezt a témát?</DialogTitle>
          <DialogDescription className="text-foreground/50 text-sm leading-relaxed">
            Milyen összefoglalót készítsek?
          </DialogDescription>
        </DialogHeader>

        {/* Summary Type Options */}
        <div className="space-y-3 mt-6">
          {/* Quick Bullets */}
          <label
            className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
              selectedType === "bullets"
                ? "border-foreground/40 bg-foreground/5"
                : "border-foreground/10 hover:border-foreground/20"
            }`}
            onClick={() => setSelectedType("bullets")}
          >
            <input
              type="radio"
              name="summaryType"
              value="bullets"
              checked={selectedType === "bullets"}
              onChange={() => setSelectedType("bullets")}
              className="mt-0.5 accent-foreground/70"
            />
            <div className="flex-1">
              <div className="text-foreground/80 text-sm font-medium">⚡ Gyors bulletpointok</div>
              <div className="text-foreground/40 text-xs mt-1">Rövid összefoglaló a legfontosabb pontokról</div>
            </div>
          </label>

          {/* Detailed with Files */}
          <label
            className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
              selectedType === "detailed"
                ? "border-foreground/40 bg-foreground/5"
                : "border-foreground/10 hover:border-foreground/20"
            }`}
            onClick={() => setSelectedType("detailed")}
          >
            <input
              type="radio"
              name="summaryType"
              value="detailed"
              checked={selectedType === "detailed"}
              onChange={() => setSelectedType("detailed")}
              className="mt-0.5 accent-foreground/70"
            />
            <div className="flex-1">
              <div className="text-foreground/80 text-sm font-medium">📄 Részletes összefoglaló + fájlok</div>
              <div className="text-foreground/40 text-xs mt-1">AI által generált dokumentáció kód fájlokkal</div>
            </div>
          </label>

          {/* No Summary */}
          <label
            className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
              selectedType === "none"
                ? "border-foreground/40 bg-foreground/5"
                : "border-foreground/10 hover:border-foreground/20"
            }`}
            onClick={() => setSelectedType("none")}
          >
            <input
              type="radio"
              name="summaryType"
              value="none"
              checked={selectedType === "none"}
              onChange={() => setSelectedType("none")}
              className="mt-0.5 accent-foreground/70"
            />
            <div className="flex-1">
              <div className="text-foreground/80 text-sm font-medium">🚫 Nem kell összefoglaló</div>
              <div className="text-foreground/40 text-xs mt-1">Csak menti a beszélgetést a history-ba</div>
            </div>
          </label>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 mt-8 pt-2">
          <button
            onClick={() => onOpenChange(false)}
            className="px-5 py-2.5 text-foreground/50 text-sm font-light hover:text-foreground/70 hover:bg-foreground/5 rounded-full transition-all"
          >
            Mégse
          </button>
          <button
            onClick={() => {
              onConfirm(selectedType);
              onOpenChange(false);
            }}
            className="px-6 py-2.5 rounded-full border border-foreground/40 text-foreground/70 text-sm font-light hover:border-foreground/60 hover:text-foreground/90 hover:bg-foreground/5 transition-all"
          >
            Lezárás
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CloseTopicModal;
