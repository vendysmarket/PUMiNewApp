import { cn } from "@/lib/utils";

interface TypingIndicatorProps {
  focusMode?: boolean;
}

const TypingIndicator = ({ focusMode = false }: TypingIndicatorProps) => {
  return (
    <div
      className={cn(
        "max-w-[70%] px-5 py-4 rounded-2xl mr-auto bg-transparent border text-foreground",
        focusMode
          ? "neon-glow-bubble border-foreground/40"
          : "border-foreground/80"
      )}
    >
      <div className="flex items-center gap-1">
        <span 
          className="w-1.5 h-1.5 rounded-full bg-foreground/50 animate-[typing-dot_1.4s_ease-in-out_infinite]"
          style={{ animationDelay: "0ms" }}
        />
        <span 
          className="w-1.5 h-1.5 rounded-full bg-foreground/50 animate-[typing-dot_1.4s_ease-in-out_infinite]"
          style={{ animationDelay: "200ms" }}
        />
        <span 
          className="w-1.5 h-1.5 rounded-full bg-foreground/50 animate-[typing-dot_1.4s_ease-in-out_infinite]"
          style={{ animationDelay: "400ms" }}
        />
      </div>
    </div>
  );
};

export default TypingIndicator;
