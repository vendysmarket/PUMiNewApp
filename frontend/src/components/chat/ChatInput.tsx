import { useState, useEffect } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface TokenUsage {
  used: number;
  limit: number;
  remaining: number;
  resetAt?: string;
}

interface ChatInputProps {
  onSend: (message: string) => void;
  focusMode?: boolean;
  value?: string;
  onChange?: (value: string) => void;
  tokenUsage?: TokenUsage;
}

const ChatInput = ({ onSend, focusMode = false, value, onChange, tokenUsage }: ChatInputProps) => {
  const [internalValue, setInternalValue] = useState("");
  const [usage, setUsage] = useState<TokenUsage>({ used: 0, limit: 25000, remaining: 25000 });

  // Use external value if provided, otherwise use internal state
  const currentValue = value !== undefined ? value : internalValue;
  const setValue = onChange || setInternalValue;

  // Load token usage from localStorage or props
  useEffect(() => {
    const loadUsage = () => {
      if (tokenUsage) {
        setUsage(tokenUsage);
        return;
      }

      const stored = localStorage.getItem("pumi_token_usage");
      if (stored) {
        try {
          const data = JSON.parse(stored);

          // Check if resetAt has passed (new day started)
          if (data.resetAt) {
            const resetTime = new Date(data.resetAt);
            const now = new Date();

            // If reset time has passed, clear usage
            if (now >= resetTime) {
              const resetData = {
                used: 0,
                limit: data.limit,
                remaining: data.limit,
                resetAt: new Date(now.setHours(24, 0, 0, 0)).toISOString(),
              };
              localStorage.setItem("pumi_token_usage", JSON.stringify(resetData));
              setUsage(resetData);
              window.dispatchEvent(new Event("pumi_usage_update"));
              return;
            }
          }

          setUsage(data);
        } catch (e) {
          // ignore
        }
      }
    };

    loadUsage();

    // Listen for usage updates
    const handleStorageChange = () => {
      loadUsage();
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("pumi_usage_update", handleStorageChange);

    // Check every minute for day change
    const interval = setInterval(loadUsage, 60000);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("pumi_usage_update", handleStorageChange);
      clearInterval(interval);
    };
  }, [tokenUsage]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentValue.trim() && !isLimitReached) {
      onSend(currentValue.trim());
      setValue("");
    }
  };

  // Calculate usage percentage
  const usagePercentage = usage.limit > 0 ? Math.min(100, (usage.used / usage.limit) * 100) : 0;
  const isLimitReached = usage.remaining <= 0;
  const isWarning = usagePercentage >= 80 && usagePercentage < 95;
  const isCritical = usagePercentage >= 95;

  // Determine bar color
  const getBarColor = () => {
    if (isLimitReached || isCritical) return "bg-red-500/80";
    if (isWarning) return "bg-amber-500/70";
    return "bg-foreground/30";
  };

  return (
    <form onSubmit={handleSubmit} className="fixed bottom-6 left-16 right-0 px-8 py-4">
      <div className="max-w-3xl mx-auto flex flex-col gap-2">
        {/* Token Usage Meter - subtle bar above input */}
        <div className="px-6">
          <div className="h-[2px] w-full bg-foreground/10 rounded-full overflow-hidden">
            <div
              className={cn("h-full transition-all duration-500 ease-out rounded-full", getBarColor())}
              style={{ width: `${usagePercentage}%` }}
            />
          </div>

          {/* Show percentage and message */}
          <div className="flex items-center justify-between mt-1">
            <p className="text-[10px] text-foreground/40">{Math.round(usagePercentage)}% használva</p>
            {isLimitReached && (
              <p className="text-[10px] text-red-400/80">
                Napi limit elérve{" "}
                {usage.resetAt &&
                  `• Reset: ${new Date(usage.resetAt).toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" })}`}
              </p>
            )}
          </div>
        </div>

        {/* Input row */}
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <input
              type="text"
              value={currentValue}
              onChange={(e) => setValue(e.target.value)}
              placeholder={isLimitReached ? "Napi limit elérve..." : "Message PUMi..."}
              disabled={isLimitReached}
              className={cn(
                "w-full bg-transparent border rounded-full px-6 py-4 text-sm font-light text-foreground placeholder:text-foreground/30 focus:outline-none transition-all duration-300",
                focusMode ? "neon-glow-input border-foreground/60" : "border-foreground/30 focus:border-foreground/60",
                isLimitReached && "opacity-50 cursor-not-allowed border-red-500/30",
              )}
            />
          </div>
          <button
            type="submit"
            disabled={!currentValue.trim() || isLimitReached}
            className={cn(
              "w-12 h-12 rounded-full border flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300",
              focusMode
                ? "neon-glow-button border-foreground/60 text-foreground hover:bg-foreground hover:text-background"
                : "border-foreground/30 text-foreground/50 hover:text-foreground hover:border-foreground/60",
            )}
          >
            <ArrowUp className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </form>
  );
};

export default ChatInput;
