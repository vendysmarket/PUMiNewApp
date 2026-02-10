import * as React from "react";
import { Flame } from "lucide-react";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  streak: number;
  label?: string;
  size?: "sm" | "md";
};

const StreakModule = React.forwardRef<HTMLButtonElement, Props>(
  ({ streak, label = "Sorozat", size = "md", className = "", ...props }, ref) => {
    const sizeClasses = size === "sm" 
      ? "px-3 py-1.5 text-xs gap-1.5" 
      : "px-4 py-2 text-sm gap-2";
    
    const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

    return (
      <button
        ref={ref}
        type="button"
        className={[
          "inline-flex items-center rounded-full",
          "border border-foreground/10 bg-foreground/5",
          "text-foreground/80 hover:bg-foreground/10 transition",
          sizeClasses,
          className,
        ].join(" ")}
        {...props}
      >
        <Flame className={`${iconSize} text-foreground/80`} />
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-foreground/60">{streak}</span>
      </button>
    );
  }
);

StreakModule.displayName = "StreakModule";

export default StreakModule;
