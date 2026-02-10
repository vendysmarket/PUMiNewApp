import { useState, useEffect } from "react";
import { Loader2, ChevronDown, ChevronUp } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { pumiInvoke } from "@/lib/pumiInvoke";

interface SimpleLessonItemProps {
  itemId: string;
  label: string;
  topic: string;
  estimatedMinutes: number;
  dayTitle: string;
  domain?: string;
  level?: string;
}

// CACHE KEY GENERATOR
const getCacheKey = (itemId: string) => `lesson_content_${itemId}`;

// CACHE EXPIRY (1 hour)
const CACHE_DURATION = 60 * 60 * 1000;

export const SimpleLessonItem = ({
  itemId,
  label,
  topic,
  estimatedMinutes,
  dayTitle,
  domain = "other",
  level = "beginner",
}: SimpleLessonItemProps) => {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState<string | null>(null);

  // CHECK CACHE ON MOUNT
  useEffect(() => {
    const cacheKey = getCacheKey(itemId);
    const cached = localStorage.getItem(cacheKey);

    if (cached) {
      try {
        const { text, timestamp } = JSON.parse(cached);
        const isExpired = Date.now() - timestamp > CACHE_DURATION;

        if (!isExpired) {
          console.log(`[CACHE HIT] ${itemId}`);
          setContent(text);
        } else {
          console.log(`[CACHE EXPIRED] ${itemId}`);
          localStorage.removeItem(cacheKey);
        }
      } catch (err) {
        console.error("Cache parse error:", err);
        localStorage.removeItem(cacheKey);
      }
    }
  }, [itemId]);

  const loadContent = async () => {
    if (content) {
      // Already loaded, just toggle
      setExpanded(!expanded);
      return;
    }

    // CHECK IF ALREADY LOADING (prevent duplicate requests)
    if (loading) {
      console.log(`[SKIP] Already loading ${itemId}`);
      return;
    }

    setLoading(true);
    setExpanded(true);

    console.log(`[API CALL] Loading ${itemId}`);

    try {
      const data = await pumiInvoke<{ ok: boolean; content?: { text: string }; error?: string }>(
        "/chat/focus-item-content",
        {
          item_type: "lesson",
          item_id: itemId,
          topic: topic,
          context: { day_title: dayTitle },
          domain: domain,
          level: level,
          lang: "hu",
        }
      );

      if (data?.ok && data?.content) {
        const text = data.content.text;
        setContent(text);

        // SAVE TO CACHE
        const cacheKey = getCacheKey(itemId);
        localStorage.setItem(
          cacheKey,
          JSON.stringify({
            text: text,
            timestamp: Date.now(),
          }),
        );

        console.log(`[CACHED] ${itemId}`);
      } else {
        console.error("Failed to load content:", data?.error);
        setContent("Hiba a tartalom betöltésekor.");
      }
    } catch (err) {
      console.error("Load failed:", err);
      setContent("Hiba történt a betöltés során.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-foreground/10 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={loadContent}
        disabled={loading}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-foreground/5 transition-colors text-left disabled:opacity-50"
      >
        <div className="flex-1">
          <h3 className="text-sm font-medium text-foreground/90">{label}</h3>
          <p className="text-xs text-foreground/50 mt-0.5">
            {topic} · ~{estimatedMinutes} perc
            {content && " · ✓ Betöltve"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {loading && <Loader2 className="w-4 h-4 animate-spin text-foreground/40" />}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-foreground/60" />
          ) : (
            <ChevronDown className="w-4 h-4 text-foreground/40" />
          )}
        </div>
      </button>

      {/* Content */}
      {expanded && content && (
        <div className="px-4 pb-4 pt-2 border-t border-foreground/10">
          <div className="prose prose-sm max-w-none text-foreground/80">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
};
