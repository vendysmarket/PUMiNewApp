import { useState } from "react";
import { Loader2 } from "lucide-react";
import { pumiInvoke } from "@/lib/pumiInvoke";

interface SimpleLessonViewProps {
  itemId: string;
  topic: string;
  dayTitle: string;
}

export const SimpleLessonView = ({ itemId, topic, dayTitle }: SimpleLessonViewProps) => {
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState<string | null>(null);

  const loadContent = async () => {
    setLoading(true);
    try {
      const data = await pumiInvoke<{ ok: boolean; text?: string }>("/chat/enhanced", {
        mode: "chat",
        message: `Készíts egy rövid leckét a következő témában:

**Lecke azonosító:** ${itemId}
**Téma:** ${topic}
**Nap kontextus:** ${dayTitle}

Adj egy tömör, informatív összefoglalót (2-3 bekezdés).`,
        lang: "hu",
      });

      if (data.ok && data.text) {
        setContent(data.text);
      }
    } catch (err) {
      console.error("Load failed:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border rounded-lg">
      <h3 className="font-medium mb-2">{topic}</h3>
      
      {!content ? (
        <button 
          onClick={loadContent}
          disabled={loading}
          className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
        >
          {loading ? <Loader2 className="animate-spin" /> : "Tartalom betöltése"}
        </button>
      ) : (
        <div className="prose prose-sm dark:prose-invert">{content}</div>
      )}
    </div>
  );
};
