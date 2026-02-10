import { useNavigate } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

interface FocusComposerProps {
  onChipClick: (text: string) => void;
  onStartFocus: () => void;
  inputValue: string;
}

const FocusComposer = ({ onChipClick, onStartFocus, inputValue }: FocusComposerProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const chips = [
    t("focusChip1"),
    t("focusChip2"),
    t("focusChip3"),
    t("focusChip4"),
    t("focusChip5"),
    t("focusChip6"),
  ];

  return (
    <div className="neon-glow-card rounded-2xl p-6 bg-background/80 backdrop-blur-sm">
      <h3 className="text-lg font-light text-foreground tracking-wide mb-4">
        {t("whatShouldWeFocus")}
      </h3>

      <div className="flex flex-wrap gap-2 mb-4">
        {chips.map((chip, index) => (
          <button
            key={index}
            onClick={() => onChipClick(chip)}
            className="px-3 py-2 text-xs font-light text-foreground/80 border border-foreground/20 rounded-full hover:border-foreground/50 hover:text-foreground transition-all duration-300"
          >
            {chip}
          </button>
        ))}
      </div>

      <p className="text-xs font-light text-foreground/50 mb-4">
        {t("focusComposerHelper")}
      </p>

      {inputValue.trim() && (
        <button
          onClick={onStartFocus}
          className="w-full py-3 rounded-full border border-foreground text-foreground text-sm font-light tracking-widest hover:bg-foreground hover:text-background transition-all duration-300 neon-glow-button mb-3"
        >
          {t("startThisFocus")}
        </button>
      )}

      {/* Link to Focus page */}
      <button
        onClick={() => navigate("/app/focus")}
        className="flex items-center justify-center gap-2 w-full py-2 text-xs font-light text-foreground/50 hover:text-foreground transition-colors duration-300"
      >
        <ExternalLink className="w-3 h-3" />
        {t("openFocusPage")}
      </button>
    </div>
  );
};

export default FocusComposer;
