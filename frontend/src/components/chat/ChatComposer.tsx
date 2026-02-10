import { useState, useEffect, Dispatch, SetStateAction } from "react";
import { ArrowUp, Archive, Paperclip, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import MobileActionsSheet from "./MobileActionsSheet";

interface AttachedFile {
  id: string;
  file: File;
  preview?: string;
  type: "image" | "document";
}

interface TokenUsage {
  used: number;
  limit: number;
  remaining: number;
  resetAt?: string;
}

interface ChatComposerProps {
  onSend: (message: string, files?: AttachedFile[]) => void;
  value?: string;
  onChange?: Dispatch<SetStateAction<string>>;
  onVaultClick?: () => void;
  disabled?: boolean;
  hasMessages?: boolean;
  isEmptyState?: boolean;
  onProntoClick?: () => void;
}

const ChatComposer = ({
  onSend,
  value,
  onChange,
  onVaultClick,
  disabled = false,
  hasMessages = false,
  isEmptyState = false,
  onProntoClick,
}: ChatComposerProps) => {
  const [internalValue, setInternalValue] = useState("");
  const [usage, setUsage] = useState<TokenUsage>({ used: 0, limit: 25000, remaining: 25000 });
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [lang, setLang] = useState("hu");
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);

  // Use external value if provided, otherwise use internal state
  const currentValue = value !== undefined ? value : internalValue;
  const setValue = onChange || setInternalValue;

  // Load language
  useEffect(() => {
    const stored = localStorage.getItem("emoria_lang") || "hu";
    setLang(stored);
  }, []);

  // Load token usage from localStorage
  useEffect(() => {
    const loadUsage = () => {
      const stored = localStorage.getItem("emoria_token_usage");
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
              localStorage.setItem("emoria_token_usage", JSON.stringify(resetData));
              setUsage(resetData);
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

    const handleStorageChange = () => {
      loadUsage();
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("emoria_usage_update", handleStorageChange);

    // Check every minute for day change
    const interval = setInterval(loadUsage, 60000);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("emoria_usage_update", handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((currentValue.trim() || attachedFiles.length > 0) && !isLimitReached && !disabled) {
      onSend(currentValue.trim(), attachedFiles.length > 0 ? attachedFiles : undefined);
      setValue("");
      setAttachedFiles([]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newFiles: AttachedFile[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      file,
      type: file.type.startsWith("image/") ? "image" : "document",
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
    }));

    setAttachedFiles((prev) => [...prev, ...newFiles]);
    e.target.value = "";
  };

  const removeFile = (id: string) => {
    setAttachedFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file?.preview) {
        URL.revokeObjectURL(file.preview);
      }
      return prev.filter((f) => f.id !== id);
    });
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
    <>
      {/* Chat page: input at bottom safe area (no bottom nav). Other pages: would have bottom nav offset but ChatComposer is only used on chat page */}
      <div className="fixed bottom-0 left-0 md:left-16 right-0 px-3 md:px-8 pb-4 md:pb-6 pt-4 bg-gradient-to-t from-background via-background to-transparent z-30 safe-area-bottom">
        <div className="max-w-3xl mx-auto flex flex-col gap-2 md:gap-3">
          {/* Attached files preview */}
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 px-2">
              {attachedFiles.map((file) => (
                <div
                  key={file.id}
                  className="relative group flex items-center gap-2 px-3 py-1.5 bg-foreground/5 border border-foreground/10 rounded-lg"
                >
                  {file.type === "image" && file.preview ? (
                    <img src={file.preview} alt="" className="w-8 h-8 rounded object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded bg-foreground/10 flex items-center justify-center">
                      <Paperclip className="w-4 h-4 text-foreground/50" />
                    </div>
                  )}
                  <span className="text-xs text-foreground/70 max-w-[100px] truncate">{file.file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(file.id)}
                    className="p-0.5 rounded-full hover:bg-foreground/10 transition-colors"
                  >
                    <X className="w-3 h-3 text-foreground/50" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Token Usage Meter */}
          <div className="px-2 md:px-6">
            <div className="h-[2px] w-full bg-foreground/10 rounded-full overflow-hidden">
              <div
                className={cn("h-full transition-all duration-500 ease-out rounded-full", getBarColor())}
                style={{ width: `${usagePercentage}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1">
              <p className="text-[10px] text-foreground/40">{Math.round(usagePercentage)}% használva</p>
              {isLimitReached && (
                <p className="text-[10px] text-red-400/80">
                  {lang === "hu" ? "Napi limit elérve" : "Daily limit reached"}
                  {usage.resetAt &&
                    ` • Reset: ${new Date(usage.resetAt).toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" })}`}
                </p>
              )}
            </div>
          </div>

          {/* PUMi Core indicator - desktop: above input, mobile: in input bar */}
          <div className="hidden md:flex justify-end px-2">
            <button
              type="button"
              onClick={onProntoClick}
              className="flex items-center gap-1.5 text-[11px] text-foreground/50 hover:text-foreground/70 transition-colors"
            >
              <span
                className="w-1.5 h-1.5 rounded-full bg-foreground/60 motion-safe:animate-pulse"
                style={{
                  boxShadow: "0 0 4px hsla(43, 15%, 91%, 0.4), 0 0 8px hsla(43, 15%, 91%, 0.2)",
                }}
              />
              <span className="font-light tracking-wide">PUMi Core</span>
            </button>
          </div>

          {/* Input row with action buttons */}
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            {/* Mobile: Single "+" button that opens action sheet */}
            <button
              type="button"
              onClick={() => setMobileActionsOpen(true)}
              className="md:hidden p-2.5 rounded-full border border-foreground/20 text-foreground/50 active:bg-foreground/10 transition-all min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
              aria-label="További műveletek"
            >
              <Plus className="w-5 h-5" />
            </button>

            {/* Desktop: Action buttons - hidden on mobile */}
            <div className="hidden md:flex items-center gap-1">
              <button
                type="button"
                onClick={onVaultClick}
                className="p-2.5 rounded-full border border-foreground/20 text-foreground/50 hover:border-foreground/40 hover:text-foreground/70 transition-all flex items-center justify-center"
                title={lang === "hu" ? "Fájlok" : "Files"}
              >
                <Archive className="w-4 h-4" />
              </button>

              {/* File attachment - desktop only */}
              <label className="p-2.5 rounded-full border border-foreground/20 text-foreground/50 hover:border-foreground/40 hover:text-foreground/70 transition-all cursor-pointer flex items-center justify-center">
                <Paperclip className="w-4 h-4" />
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
            </div>

            {/* Main input - takes most width on mobile */}
            <div className="flex-1 relative min-w-0">
              <input
                type="text"
                value={currentValue}
                onChange={(e) => setValue(e.target.value)}
                placeholder={
                  isLimitReached
                    ? lang === "hu"
                      ? "Napi limit elérve..."
                      : "Daily limit reached..."
                    : "Message PUMi..."
                }
                disabled={isLimitReached || disabled}
                className={cn(
                  "w-full bg-transparent border rounded-full px-4 md:px-6 py-3 md:py-4 text-sm font-light text-foreground placeholder:text-foreground/30 focus:outline-none transition-all duration-300 motion-reduce:duration-0",
                  isEmptyState && !currentValue.trim()
                    ? "empty-chat-input border-foreground/30 focus:border-foreground/60"
                    : "border-foreground/30 focus:border-foreground/60",
                  (isLimitReached || disabled) && "opacity-50 cursor-not-allowed border-red-500/30",
                )}
              />
            </div>

            {/* Mobile: PUMi Core badge - positioned to right of input, before send button */}
            <button
              type="button"
              onClick={onProntoClick}
              className="md:hidden flex items-center gap-1 px-2 py-1 text-[9px] text-foreground/40 active:text-foreground/60 transition-colors shrink-0"
              aria-label="PUMi Core info"
            >
              <span
                className="w-1 h-1 rounded-full bg-foreground/50 motion-safe:animate-pulse"
                style={{
                  boxShadow: "0 0 3px hsla(43, 15%, 91%, 0.3)",
                }}
              />
              <span className="font-light tracking-wide">Core</span>
            </button>

            {/* Send button - 44px min tap target on mobile */}
            <button
              type="submit"
              disabled={(!currentValue.trim() && attachedFiles.length === 0) || isLimitReached || disabled}
              className="w-11 h-11 md:w-12 md:h-12 min-w-[44px] min-h-[44px] rounded-full border flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 shrink-0 border-foreground/30 text-foreground/50 hover:text-foreground hover:border-foreground/60"
            >
              <ArrowUp className="w-5 h-5" strokeWidth={1.5} />
            </button>
          </form>
        </div>
      </div>

      {/* Mobile Actions Sheet - attachments only */}
      <MobileActionsSheet
        open={mobileActionsOpen}
        onOpenChange={setMobileActionsOpen}
        onVaultClick={onVaultClick}
        onFileSelect={handleFileSelect}
      />
    </>
  );
};

export default ChatComposer;
