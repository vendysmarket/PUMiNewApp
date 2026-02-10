import { useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";

type FocusType = "learning" | "project";

interface FocusTypeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectLearning: () => void;
  onSelectProject: () => void;
}

export default function FocusTypeModal({
  open,
  onOpenChange,
  onSelectLearning,
  onSelectProject,
}: FocusTypeModalProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<FocusType | null>(null);

  if (!open) return null;

  const pick = (type: FocusType) => {
    setSelected(type);
    if (type === "learning") onSelectLearning();
    if (type === "project") onSelectProject();
    onOpenChange(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="absolute inset-0"
        onClick={() => onOpenChange(false)}
        aria-label="Close"
      />
      <div className="relative z-10 w-full max-w-md mx-4 rounded-3xl border border-foreground/10 bg-background p-6">
        <h2 className="text-lg font-medium text-foreground/90 text-center mb-2">
          {t("chooseFocusType")}
        </h2>

        <p className="text-sm text-foreground/50 text-center mb-6">
          Choose a focus type to start a new 7-day session.
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => pick("learning")}
            className={[
              "w-full text-left rounded-2xl border border-foreground/10 bg-foreground/5",
              "px-4 py-3 hover:bg-foreground/10 transition",
              selected === "learning" ? "ring-2 ring-foreground/20" : "",
            ].join(" ")}
          >
            <p className="font-medium text-foreground/80">{t("learningFocus")}</p>
            <p className="text-sm text-foreground/50 mt-0.5">
              {t("learningFocusDesc")}
            </p>
          </button>

          <button
            onClick={() => pick("project")}
            className={[
              "w-full text-left rounded-2xl border border-foreground/10 bg-foreground/5",
              "px-4 py-3 hover:bg-foreground/10 transition",
              selected === "project" ? "ring-2 ring-foreground/20" : "",
            ].join(" ")}
          >
            <p className="font-medium text-foreground/80">{t("projectFocus")}</p>
            <p className="text-sm text-foreground/50 mt-0.5">
              {t("projectFocusDesc")}
            </p>
          </button>
        </div>
      </div>
    </div>
  );
}
