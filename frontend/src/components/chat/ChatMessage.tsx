import { cn } from "@/lib/utils";

interface ChatMessageProps {
  content: string;
  isUser: boolean;
  focusMode?: boolean;
}

const ChatMessage = ({ content, isUser, focusMode = false }: ChatMessageProps) => {
  return (
    <div
      className={cn(
        "max-w-[70%] px-5 py-3.5 rounded-2xl",
        isUser
          ? "ml-auto bg-foreground text-background"
          : cn(
              "mr-auto bg-transparent border text-foreground",
              focusMode
                ? "neon-glow-bubble border-foreground/40"
                : "border-foreground/80"
            )
      )}
    >
      <p className="text-sm font-light leading-relaxed">
        {content}
      </p>
    </div>
  );
};

export default ChatMessage;