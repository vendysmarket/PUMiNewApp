import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronDown, ChevronUp, Loader2, BookOpen, HelpCircle, Dumbbell, Layers, CheckSquare, Check, MessageSquare, PenLine } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { PlanItem, ItemContent } from "@/types/learningFocus";
import type { StrictFocusItem, FocusItemKind } from "@/types/focusItem";
import { validateFocusItem, getFallbackTemplate, checkValidationState, type ValidationState } from "@/lib/focusItemValidator";
import { TranslationRenderer, QuizRenderer, CardsRenderer, RoleplayRenderer, WritingRenderer, ChecklistRenderer } from "./renderers";
import { focusApi as backendApi } from "@/features/focus/FocusApiClient";

const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

interface LazyItemRendererProps {
  item: PlanItem & { status?: string; score?: number; progress?: any };
  dayTitle: string;
  dayIntro?: string;
  domain?: string;
  level?: string;
  lang?: string;
  onComplete?: (item: PlanItem) => void;
}

interface CacheEntry {
  content: StrictFocusItem;
  timestamp: number;
}

const getCacheKey = (itemId: string) => `focus_item_v2_${itemId}`;

const pendingRequests: Record<string, Promise<StrictFocusItem | null>> = {};

export function LazyItemRenderer({ item, dayTitle, dayIntro, domain, level, lang, onComplete }: LazyItemRendererProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [strictItem, setStrictItem] = useState<StrictFocusItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [confirmStep, setConfirmStep] = useState(false);
  const mountedRef = useRef(true);
  
  // Validation state tracking
  const [validationState, setValidationState] = useState<ValidationState>({
    canComplete: false,
    progress: { current: 0, required: 1, type: "items" },
  });
  const [userState, setUserState] = useState({
    charCount: 0,
    itemsCompleted: 0,
    messagesCount: 0,
    proofText: "",
  });
  
  const isCompleted = item.status === "done" || item.progress?.status === "done" || (item as any).progress_status === "done";

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Check cache on mount
  useEffect(() => {
    const cacheKey = getCacheKey(item.id);
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed: CacheEntry = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < CACHE_DURATION) {
          setStrictItem(parsed.content);
          console.log(`[CACHE HIT] ${item.id}`);
        } else {
          localStorage.removeItem(cacheKey);
        }
      } catch {
        localStorage.removeItem(cacheKey);
      }
    }
  }, [item.id]);

  // Update validation state when user state or strict item changes
  useEffect(() => {
    if (strictItem) {
      const state = checkValidationState(strictItem, userState);
      setValidationState(state);
    }
  }, [strictItem, userState]);

  const handleValidationChange = useCallback((updates: Partial<typeof userState>) => {
    setUserState(prev => ({ ...prev, ...updates }));
  }, []);

  const loadContent = async () => {
    if (strictItem || loading) return;

    const cacheKey = getCacheKey(item.id);

    // Check for pending request
    if (pendingRequests[item.id]) {
      console.log(`[DEDUP] Waiting for existing request: ${item.id}`);
      setLoading(true);
      try {
        const result = await pendingRequests[item.id];
        if (mountedRef.current && result) {
          setStrictItem(result);
        }
      } finally {
        if (mountedRef.current) setLoading(false);
      }
      return;
    }

    setLoading(true);
    setError(null);

    const fetchPromise = (async (): Promise<StrictFocusItem | null> => {
      // Helper: validate + cache a raw content object
      const validateAndCache = (raw: any): StrictFocusItem | null => {
        const validation = validateFocusItem(raw);
        if (validation.valid) {
          const strict = raw as StrictFocusItem;
          localStorage.setItem(cacheKey, JSON.stringify({ content: strict, timestamp: Date.now() }));
          return strict;
        }
        if (validation.repaired) {
          console.log(`[REPAIR] Item ${item.id} repaired:`, validation.errors);
          localStorage.setItem(cacheKey, JSON.stringify({ content: validation.repaired, timestamp: Date.now() }));
          return validation.repaired;
        }
        return null;
      };

      // ── Direct backend via FocusApiClient ──
      try {
        console.log(`[API] Fetching content for: ${item.id}`);
        const resp = await backendApi.generateItemContent(item.id);
        if (resp.ok && resp.content) {
          const validated = validateAndCache(resp.content);
          if (validated) {
            console.log(`[API] Content loaded for: ${item.id}`);
            return validated;
          }
        }
        throw new Error("Backend returned invalid content");
      } catch (err) {
        console.error(`[API] Failed for ${item.id}:`, err);

        // Use fallback template so the UI doesn't break
        console.log(`[FALLBACK] Using template for ${item.id}`);
        const fallback = getFallbackTemplate(
          detectKindFromItem(item),
          item.topic || item.label
        );

        const cacheEntry: CacheEntry = {
          content: fallback,
          timestamp: Date.now(),
        };
        localStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
        return fallback;
      }
    })();

    pendingRequests[item.id] = fetchPromise;

    try {
      const result = await fetchPromise;
      if (mountedRef.current && result) {
        setStrictItem(result);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load");
      }
    } finally {
      delete pendingRequests[item.id];
      if (mountedRef.current) setLoading(false);
    }
  };

  const handleToggle = () => {
    const newExpanded = !expanded;
    setExpanded(newExpanded);
    if (newExpanded && !strictItem && !loading) {
      loadContent();
    }
  };

  const getIcon = () => {
    const kind = strictItem?.kind || detectKindFromItem(item);
    switch (kind) {
      case "translation": return <PenLine className="w-5 h-5 text-blue-500" />;
      case "quiz": return <HelpCircle className="w-5 h-5 text-purple-500" />;
      case "cards": return <Layers className="w-5 h-5 text-orange-500" />;
      case "roleplay": return <MessageSquare className="w-5 h-5 text-green-500" />;
      case "writing": return <Dumbbell className="w-5 h-5 text-teal-500" />;
      case "checklist": return <CheckSquare className="w-5 h-5 text-amber-500" />;
      default: return <BookOpen className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getTypeLabel = () => {
    const kind = strictItem?.kind || detectKindFromItem(item);
    switch (kind) {
      case "translation": return "Fordítás";
      case "quiz": return "Kvíz";
      case "cards": return "Kártyák";
      case "roleplay": return "Párbeszéd";
      case "writing": return "Írás";
      case "checklist": return "Feladat";
      default: return kind;
    }
  };

  const handleComplete = async () => {
    if (!onComplete || isCompleted) return;
    
    // Check validation state
    if (strictItem && !validationState.canComplete) {
      return;
    }
    
    // For checklist, require 2-step confirmation
    if (strictItem?.kind === "checklist" && !confirmStep) {
      setConfirmStep(true);
      return;
    }
    
    setCompleting(true);
    try {
      await onComplete(item);
    } finally {
      setCompleting(false);
      setConfirmStep(false);
    }
  };

  return (
    <div className={`border rounded-lg overflow-hidden bg-card ${isCompleted ? 'border-green-500/30 bg-green-500/5' : 'border-foreground/10'}`}>
      {/* Header - always visible */}
      <button
        onClick={handleToggle}
        className="w-full p-4 flex items-center gap-3 hover:bg-foreground/5 transition-colors text-left"
      >
        {isCompleted ? (
          <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
            <Check className="w-3 h-3 text-white" />
          </div>
        ) : (
          getIcon()
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full ${isCompleted ? 'bg-green-500/20 text-green-600 dark:text-green-400' : 'bg-foreground/10 text-foreground/60'}`}>
              {getTypeLabel()}
            </span>
            {strictItem?.ui?.estimated_minutes && (
              <span className="text-xs text-muted-foreground">
                ~{strictItem.ui.estimated_minutes} perc
              </span>
            )}
            {isCompleted && (
              <span className="text-xs text-green-600 dark:text-green-400">✓ Kész</span>
            )}
          </div>
          <p className={`font-medium mt-1 truncate ${isCompleted ? 'text-foreground/70' : 'text-foreground'}`}>
            {strictItem?.title || item.label}
          </p>
          {(strictItem?.subtitle || (item.topic && item.topic !== item.label)) && (
            <p className="text-sm text-foreground/60 truncate">{strictItem?.subtitle || item.topic}</p>
          )}
        </div>
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin text-foreground/40" />
        ) : expanded ? (
          <ChevronUp className="w-5 h-5 text-foreground/40" />
        ) : (
          <ChevronDown className="w-5 h-5 text-foreground/40" />
        )}
      </button>

      {/* Content - lazy loaded */}
      {expanded && (
        <div className="border-t border-foreground/10 p-4 bg-foreground/[0.02]">
          {loading && !strictItem && (
            <div className="flex items-center justify-center py-8 gap-2 text-foreground/60">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Tartalom betöltése...</span>
            </div>
          )}

          {error && (
            <div className="text-center py-4">
              <p className="text-destructive mb-2">{error}</p>
              <button
                onClick={loadContent}
                className="text-sm text-primary hover:underline"
              >
                Újrapróbálás
              </button>
            </div>
          )}

          {strictItem && (
            <>
              {/* Instructions */}
              {strictItem.instructions_md && (
                <div className="prose prose-sm dark:prose-invert max-w-none mb-4">
                  <ReactMarkdown>{strictItem.instructions_md}</ReactMarkdown>
                </div>
              )}
              
              {/* Kind-based renderer */}
              <StrictContentRenderer 
                item={strictItem}
                topic={item.topic || item.label}
                onValidationChange={handleValidationChange}
              />
            </>
          )}
          
          {/* Mark as done button with validation guards */}
          {strictItem && onComplete && !isCompleted && (
            <div className="mt-4 pt-4 border-t border-foreground/10">
              {/* 2-step confirmation for checklist */}
              {strictItem.kind === "checklist" && confirmStep ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmStep(false)}
                    className="flex-1 py-2 px-4 bg-foreground/10 text-foreground rounded-lg font-medium hover:bg-foreground/20 transition-colors"
                  >
                    Mégsem
                  </button>
                  <button
                    onClick={handleComplete}
                    disabled={completing}
                    className="flex-1 py-2 px-4 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {completing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Mentés...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Biztos!
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={handleComplete}
                    disabled={completing || !validationState.canComplete}
                    className="w-full py-2 px-4 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    title={!validationState.canComplete ? validationState.reason : undefined}
                  >
                    {completing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Mentés...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Kész, megcsináltam
                      </>
                    )}
                  </button>
                  
                  {/* Progress indicator */}
                  {!validationState.canComplete && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span>{validationState.reason}</span>
                        <span>
                          {validationState.progress.current} / {validationState.progress.required}
                        </span>
                      </div>
                      <div className="w-full h-1 bg-foreground/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ 
                            width: `${Math.min(100, (validationState.progress.current / validationState.progress.required) * 100)}%` 
                          }}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Detect kind from legacy PlanItem
function detectKindFromItem(item: PlanItem): FocusItemKind {
  const rawType = (item.type || "").toLowerCase();
  const rawPracticeType = (item.practice_type || "").toLowerCase();
  
  // Direct mappings
  if (rawType === "translation" || rawPracticeType === "translation") return "translation";
  if (rawType === "quiz") return "quiz";
  if (rawType === "flashcard" || rawType === "cards") return "cards";
  if (rawType === "roleplay" || rawType === "exercise" || rawType === "dialogue" || 
      rawPracticeType === "roleplay" || rawPracticeType === "exercise") return "roleplay";
  if (rawType === "writing" || rawPracticeType === "writing") return "writing";
  if (rawType === "task" || rawType === "feladat" || rawType === "speaking" || 
      rawType === "listening" || rawType === "reading") return "checklist";
  if (rawType === "practice" || rawType === "gyakorlat") {
    if (rawPracticeType === "translation") return "translation";
    if (rawPracticeType === "roleplay" || rawPracticeType === "exercise") return "roleplay";
    return "writing";
  }
  
  // Default to writing
  return "writing";
}

// Strict content renderer based on kind
function StrictContentRenderer({ 
  item, 
  topic,
  onValidationChange,
}: { 
  item: StrictFocusItem;
  topic: string;
  onValidationChange: (updates: any) => void;
}) {
  const content = item.content;
  
  switch (item.kind) {
    case "translation":
      if (content.kind === "translation") {
        return (
          <TranslationRenderer
            content={content.data}
            topic={topic}
            onValidationChange={onValidationChange}
          />
        );
      }
      break;
    
    case "quiz":
      if (content.kind === "quiz") {
        return (
          <QuizRenderer
            content={content.data}
            onValidationChange={onValidationChange}
          />
        );
      }
      break;
    
    case "cards":
      if (content.kind === "cards") {
        return (
          <CardsRenderer
            content={content.data}
            onValidationChange={onValidationChange}
          />
        );
      }
      break;
    
    case "roleplay":
      if (content.kind === "roleplay") {
        return (
          <RoleplayRenderer
            content={content.data}
            topic={topic}
            minChars={item.validation.min_chars || 80}
            onValidationChange={onValidationChange}
          />
        );
      }
      break;
    
    case "writing":
      if (content.kind === "writing") {
        return (
          <WritingRenderer
            content={content.data}
            topic={topic}
            minChars={item.validation.min_chars || 50}
            onValidationChange={onValidationChange}
          />
        );
      }
      break;
    
    case "checklist":
      if (content.kind === "checklist") {
        return (
          <ChecklistRenderer
            content={content.data}
            minChars={item.validation.min_chars || 20}
            onValidationChange={onValidationChange}
          />
        );
      }
      break;
  }
  
  // Fallback: render as markdown
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <p className="text-muted-foreground italic">Ismeretlen típus: {item.kind}</p>
    </div>
  );
}

export default LazyItemRenderer;
