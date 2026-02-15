// ============================================================================
// FOCUS ITEM VALIDATOR
// Server-side validation with repair and fallback logic
// ============================================================================

import {
  type StrictFocusItem,
  type FocusItemKind,
  type FocusItemContent,
  type FocusValidation,
  type LessonContent,
  FOCUS_ITEM_SCHEMA_VERSION,
  BACKEND_MODE_TO_KIND,
  DEFAULT_VALIDATION,
  DEFAULT_SCORING,
  KIND_TO_INPUT_TYPE,
} from "@/types/focusItem";

// ============================================================================
// VALIDATION RESULT
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  repaired?: StrictFocusItem;
}

// ============================================================================
// KIND DETECTION FROM RAW DATA
// ============================================================================

export function detectKindFromRaw(raw: any): FocusItemKind {
  // Check explicit kind field
  const rawKind = (raw?.kind || "").toLowerCase();
  if (rawKind && BACKEND_MODE_TO_KIND[rawKind]) {
    return BACKEND_MODE_TO_KIND[rawKind];
  }
  
  // Check type field
  const rawType = (raw?.type || "").toLowerCase();
  if (rawType && BACKEND_MODE_TO_KIND[rawType]) {
    return BACKEND_MODE_TO_KIND[rawType];
  }
  
  // Check practice_type field
  const rawPracticeType = (raw?.practice_type || "").toLowerCase();
  if (rawPracticeType && BACKEND_MODE_TO_KIND[rawPracticeType]) {
    return BACKEND_MODE_TO_KIND[rawPracticeType];
  }
  
  // Check subtype field
  const rawSubtype = (raw?.subtype || "").toLowerCase();
  if (rawSubtype && BACKEND_MODE_TO_KIND[rawSubtype]) {
    return BACKEND_MODE_TO_KIND[rawSubtype];
  }
  
  // Content-based detection
  if (raw?.content) {
    // Lesson detection: has summary, key_points, or language_lesson content
    if (raw.content.summary || raw.content.key_points || raw.content.content_type === "language_lesson" || raw.content.vocabulary_table) {
      return "lesson";
    }
    if (raw.content.sentences && Array.isArray(raw.content.sentences)) {
      return "translation";
    }
    if (raw.content.questions && Array.isArray(raw.content.questions)) {
      return "quiz";
    }
    if (raw.content.cards && Array.isArray(raw.content.cards)) {
      return "cards";
    }
    if (raw.content.scenario || raw.content.roles) {
      return "roleplay";
    }
    if (raw.content.situation && raw.content.outcome) {
      return "briefing";
    }
    if (raw.content.corrections && Array.isArray(raw.content.corrections)) {
      return "feedback";
    }
    if (raw.content.steps && Array.isArray(raw.content.steps)) {
      return "checklist";
    }
    if (raw.content.prompt || typeof raw.content === "string") {
      return "writing";
    }
  }
  
  // Check for legacy formats
  if (raw?.quiz && Array.isArray(raw.quiz)) {
    return "quiz";
  }
  if (raw?.flashcards && Array.isArray(raw.flashcards)) {
    return "cards";
  }
  
  // Default fallback
  return "writing";
}

// ============================================================================
// CONTENT EXTRACTION/REPAIR
// ============================================================================

function extractContent(raw: any, kind: FocusItemKind): FocusItemContent {
  const content = raw?.content;

  switch (kind) {
    case "lesson":
      return {
        kind: "lesson",
        data: extractLessonContent(raw),
      };

    case "translation":
      return {
        kind: "translation",
        data: {
          sentences: extractTranslationSentences(raw),
        },
      };
    
    case "quiz":
      return {
        kind: "quiz",
        data: {
          questions: extractQuizQuestions(raw),
        },
      };
    
    case "cards":
      return {
        kind: "cards",
        data: {
          cards: extractFlashcards(raw),
        },
      };
    
    case "roleplay": {
      // Normalize roles: backend may use "assistant" instead of "ai"
      const rawRoles = content?.roles || {};
      const roles = {
        user: rawRoles.user || "Te",
        ai: rawRoles.ai || rawRoles.assistant || "Partner",
      };
      return {
        kind: "roleplay",
        data: {
          scenario: content?.scenario || content?.scene_title || content?.setting?.goal || raw?.text || raw?.instructions_md || "Gyakorold a párbeszédet!",
          roles,
          starter_prompt: content?.starter_prompt || content?.opening_line,
          sample_exchanges: content?.sample_exchanges,
        },
      };
    }
    
    case "writing":
      return {
        kind: "writing",
        data: {
          prompt: content?.prompt || raw?.text || raw?.instructions_md || "Írj egy rövid szöveget!",
          example: content?.example,
          word_count_target: content?.word_count_target,
        },
      };
    
    case "checklist":
      return {
        kind: "checklist",
        data: {
          steps: extractChecklistSteps(raw),
          proof_prompt: content?.proof_prompt || "Írd le, hogyan végezted el a feladatot:",
        },
      };

    case "briefing":
      return {
        kind: "briefing",
        data: {
          situation: content?.situation || "A mai helyzet betöltése...",
          outcome: content?.outcome || "",
          key_vocabulary_preview: Array.isArray(content?.key_vocabulary_preview) ? content.key_vocabulary_preview : undefined,
        },
      };

    case "feedback":
      return {
        kind: "feedback",
        data: {
          user_text: content?.user_text || "",
          corrections: Array.isArray(content?.corrections) ? content.corrections.map((c: any) => ({
            original: c.original || "",
            corrected: c.corrected || "",
            explanation: c.explanation || "",
          })) : [],
          improved_version: content?.improved_version || "",
          alternative_tone: content?.alternative_tone,
          score: content?.score,
          praise: content?.praise,
          placeholder: content?.placeholder,
          message: content?.message,
        },
      };
  }
}

function extractLessonContent(raw: any): LessonContent {
  const content = raw?.content;
  const src = content?.data || content || {};

  // Base fields (backward compatible)
  const result: LessonContent = {
    title: src.title || raw?.title || raw?.label || "Tananyag",
    summary: src.summary || src.text || raw?.text || "",
    key_points: Array.isArray(src.key_points) ? src.key_points : [],
    example: src.example,
    micro_task: src.micro_task || undefined,
    common_mistakes: Array.isArray(src.common_mistakes) ? src.common_mistakes : undefined,
    estimated_minutes: src.estimated_minutes,
  };

  // Language lesson fields
  if (src.content_type === "language_lesson") {
    result.content_type = "language_lesson";
    result.introduction = src.introduction;

    if (Array.isArray(src.vocabulary_table)) {
      result.vocabulary_table = src.vocabulary_table.map((v: any) => ({
        word: v.word || "",
        translation: v.translation || "",
        pronunciation: v.pronunciation,
        example_sentence: v.example_sentence || "",
        example_translation: v.example_translation || "",
      }));
    }

    if (src.grammar_explanation && typeof src.grammar_explanation === "object") {
      result.grammar_explanation = {
        rule_title: src.grammar_explanation.rule_title || "",
        explanation: src.grammar_explanation.explanation || "",
        formation_pattern: src.grammar_explanation.formation_pattern,
        examples: Array.isArray(src.grammar_explanation.examples)
          ? src.grammar_explanation.examples.map((e: any) => ({
              target: e.target || "",
              hungarian: e.hungarian || "",
              note: e.note,
            }))
          : [],
        exceptions: Array.isArray(src.grammar_explanation.exceptions)
          ? src.grammar_explanation.exceptions
          : undefined,
      };
    }

    if (Array.isArray(src.dialogues)) {
      result.dialogues = src.dialogues.map((d: any) => ({
        title: d.title || "",
        context: d.context,
        lines: Array.isArray(d.lines)
          ? d.lines.map((l: any) => ({
              speaker: l.speaker || "",
              text: l.text || "",
              translation: l.translation || "",
            }))
          : [],
      }));
    }

    result.cultural_note = src.cultural_note;

    if (Array.isArray(src.practice_exercises)) {
      result.practice_exercises = src.practice_exercises.map((pe: any) => ({
        type: pe.type || "fill_in_blank",
        instruction: pe.instruction || "",
        items: Array.isArray(pe.items)
          ? pe.items.map((item: any) => ({
              prompt: item.prompt || "",
              answer: item.answer || "",
            }))
          : [],
      }));
    }
  }

  return result;
}

function extractTranslationSentences(raw: any): Array<{ source: string; target_lang: string; hint?: string }> {
  const content = raw?.content;

  // New format: sentences array
  if (content?.sentences && Array.isArray(content.sentences)) {
    return content.sentences.map((s: any) => ({
      source: s.source || s.text || s.prompt || (typeof s === "string" ? s : ""),
      target_lang: s.target_lang || content?.target_lang || "it",
      hint: s.hint,
    }));
  }

  // Legacy format: items array (old backend spec)
  if (content?.items && Array.isArray(content.items)) {
    return content.items.map((s: any) => ({
      source: s.prompt || s.source || s.text || (typeof s === "string" ? s : ""),
      target_lang: s.target_lang || content?.target_lang || "it",
      hint: s.hint,
    }));
  }

  // Extract from text (line by line)
  const text = content?.text || raw?.text || "";
  if (text) {
    const lines = text.split("\n").filter((l: string) => l.trim());
    return lines.slice(0, 5).map((line: string) => ({
      source: line.replace(/^\d+\.\s*/, "").trim(),
      target_lang: "it",
    }));
  }

  // Fallback
  return [{ source: "Szia, hogy vagy?", target_lang: "it" }];
}

function extractQuizQuestions(raw: any): Array<{ question: string; options: string[]; correct_index: number; explanation?: string }> {
  const content = raw?.content;
  
  // New format
  if (content?.questions && Array.isArray(content.questions)) {
    return content.questions.map((q: any) => ({
      question: q.question || q.q || "",
      options: q.options || [],
      correct_index: q.correct_index ?? q.correctIndex ?? q.answer_index ?? 0,
      explanation: q.explanation,
    }));
  }
  
  // Legacy format
  if (raw?.quiz && Array.isArray(raw.quiz)) {
    return raw.quiz.map((q: any) => ({
      question: q.question || q.q || "",
      options: q.options || [],
      correct_index: q.correct_index ?? q.correctIndex ?? q.answer_index ?? 0,
      explanation: q.explanation,
    }));
  }
  
  // Fallback
  return [{
    question: "Mi a helyes válasz?",
    options: ["Helyes válasz", "Nem ez a válasz", "Ez sem jó", "Egyik sem"],
    correct_index: 0,
    explanation: "Ez a helyes válasz.",
  }];
}

function extractFlashcards(raw: any): Array<{ front: string; back: string; audio_url?: string }> {
  const content = raw?.content;
  
  // New format
  if (content?.cards && Array.isArray(content.cards)) {
    return content.cards.map((c: any) => ({
      front: c.front,
      back: c.back,
      audio_url: c.audio_url,
    }));
  }
  
  // Legacy format
  if (raw?.flashcards && Array.isArray(raw.flashcards)) {
    return raw.flashcards.map((c: any) => ({
      front: c.front,
      back: c.back,
    }));
  }
  
  // Fallback
  return [
    { front: "Ciao", back: "Szia" },
    { front: "Grazie", back: "Köszönöm" },
  ];
}

function extractChecklistSteps(raw: any): Array<{ instruction: string; completed?: boolean }> {
  const content = raw?.content;
  
  // Filter function to remove title-like steps
  const filterValidSteps = (steps: Array<{ instruction: string; completed?: boolean }>) => {
    return steps.filter(step => {
      const s = step.instruction.trim().toLowerCase();
      if (!s) return false;
      if (s.endsWith(":")) return false;           // "Feladat:", "Lépések:"
      if (s === "feladat") return false;
      if (s === "task") return false;
      if (s.length < 8) return false;              // túl rövid címek
      return true;
    });
  };
  
  // New format: steps array
  const stepsArray = content?.steps || content?.items;
  if (stepsArray && Array.isArray(stepsArray)) {
    const mapped = stepsArray.map((s: any) => ({
      instruction: typeof s === "string" ? s : s.instruction || s.text || "",
      completed: s.completed || s.done,
    }));
    const filtered = filterValidSteps(mapped);
    return filtered.length > 0 ? filtered : [{ instruction: "Végezd el a feladatot" }];
  }
  
  // Extract from text (line by line)
  const text = content?.text || raw?.text || raw?.instructions_md || "";
  if (text) {
    const lines = text.split("\n").filter((l: string) => l.trim() && !l.startsWith("#"));
    const mapped = lines.slice(0, 10).map((line: string) => ({
      instruction: line.replace(/^[-*•]\s*/, "").replace(/^\d+\.\s*/, "").trim(),
    }));
    const filtered = filterValidSteps(mapped);
    return filtered.length > 0 ? filtered : [{ instruction: "Végezd el a feladatot" }];
  }
  
  // Fallback
  return [{ instruction: "Végezd el a feladatot" }];
}

// ============================================================================
// MAIN VALIDATION FUNCTION
// ============================================================================

export function validateFocusItem(raw: any): ValidationResult {
  const errors: string[] = [];
  
  // Check if it's already a valid StrictFocusItem
  if (isValidStrictFocusItem(raw)) {
    return { valid: true, errors: [] };
  }
  
  // Try to repair
  const kind = detectKindFromRaw(raw);
  
  // Extract or default title
  const title = raw?.title || raw?.label || raw?.topic || "Feladat";
  const subtitle = raw?.subtitle || raw?.topic || undefined;
  
  // Extract or default instructions
  const instructions_md = raw?.instructions_md || raw?.text || raw?.content?.text || raw?.content?.prompt || `Végezd el a ${kind} típusú feladatot.`;
  
  // Build repaired item
  const repaired: StrictFocusItem = {
    schema_version: FOCUS_ITEM_SCHEMA_VERSION,
    kind,
    title,
    subtitle,
    instructions_md,
    rubric_md: raw?.rubric_md,
    ui: {
      mode: raw?.ui?.mode || "inline",
      estimated_minutes: raw?.ui?.estimated_minutes || raw?.estimated_minutes || 5,
      icon: raw?.ui?.icon,
    },
    input: {
      type: raw?.input?.type || KIND_TO_INPUT_TYPE[kind],
      placeholder: raw?.input?.placeholder,
    },
    content: extractContent(raw, kind),
    validation: {
      ...DEFAULT_VALIDATION[kind],
      ...(raw?.validation || {}),
      require_interaction: true, // Always enforce
    },
    scoring: {
      ...DEFAULT_SCORING[kind],
      ...(raw?.scoring || {}),
    },
  };
  
  // Record what was missing
  if (!raw?.schema_version) errors.push("missing schema_version");
  if (!raw?.kind) errors.push("missing kind");
  if (!raw?.content) errors.push("missing content");
  if (!raw?.validation) errors.push("missing validation");
  
  return {
    valid: false,
    errors,
    repaired,
  };
}

// ============================================================================
// STRICT VALIDATION CHECK
// ============================================================================

function isValidStrictFocusItem(item: any): item is StrictFocusItem {
  if (!item || typeof item !== "object") return false;
  if (item.schema_version !== FOCUS_ITEM_SCHEMA_VERSION) return false;
  if (!isValidKind(item.kind)) return false;
  if (!item.title || typeof item.title !== "string") return false;
  if (!item.instructions_md || typeof item.instructions_md !== "string") return false;
  if (!item.content || !item.content.kind || !item.content.data) return false;
  if (!item.validation || item.validation.require_interaction !== true) return false;
  if (!item.scoring) return false;
  
  return true;
}

function isValidKind(kind: any): kind is FocusItemKind {
  return ["lesson", "translation", "quiz", "cards", "roleplay", "writing", "checklist", "briefing", "feedback"].includes(kind);
}

// ============================================================================
// FALLBACK TEMPLATES
// ============================================================================

export function getFallbackTemplate(kind: FocusItemKind, topic: string): StrictFocusItem {
  const templates: Record<FocusItemKind, StrictFocusItem> = {
    lesson: {
      schema_version: FOCUS_ITEM_SCHEMA_VERSION,
      kind: "lesson",
      title: "Tananyag",
      subtitle: topic,
      instructions_md: "Olvasd el az alábbi tananyagot:",
      ui: { mode: "inline", estimated_minutes: 5 },
      input: { type: "text" },
      content: {
        kind: "lesson",
        data: {
          title: topic,
          summary: `Ismerkedj meg a következő témával: ${topic}`,
          key_points: ["Figyeld meg a fő fogalmakat", "Próbáld megérteni az összefüggéseket"],
          example: undefined,
          micro_task: { instruction: "Foglald össze egy mondatban, mit tanultál!" },
        },
      },
      validation: { require_interaction: true },
      scoring: { max_points: 100, partial_credit: false },
    },
    translation: {
      schema_version: FOCUS_ITEM_SCHEMA_VERSION,
      kind: "translation",
      title: "Fordítási gyakorlat",
      subtitle: topic,
      instructions_md: "Fordítsd le a következő mondatokat:",
      ui: { mode: "inline", estimated_minutes: 5 },
      input: { type: "multi_text", placeholder: "Írd ide a fordítást..." },
      content: {
        kind: "translation",
        data: {
          sentences: [
            { source: "Szia, hogy vagy?", target_lang: "it" },
            { source: "Köszönöm, jól vagyok.", target_lang: "it" },
          ],
        },
      },
      validation: { require_interaction: true, min_items: 1 },
      scoring: { max_points: 100, partial_credit: true, auto_grade: true },
    },
    quiz: {
      schema_version: FOCUS_ITEM_SCHEMA_VERSION,
      kind: "quiz",
      title: "Kvíz",
      subtitle: topic,
      instructions_md: "Válaszolj a kérdésekre:",
      ui: { mode: "inline", estimated_minutes: 5 },
      input: { type: "choice" },
      content: {
        kind: "quiz",
        data: {
          questions: [{
            question: `Mi a témánk ma? (${topic})`,
            options: ["Helyes válasz", "Nem ez a válasz", "Ez sem jó", "Egyik sem"],
            correct_index: 0,
            explanation: "Ez a helyes válasz.",
          }],
        },
      },
      validation: { require_interaction: true, min_items: 1 },
      scoring: { max_points: 100, partial_credit: true, auto_grade: true },
    },
    cards: {
      schema_version: FOCUS_ITEM_SCHEMA_VERSION,
      kind: "cards",
      title: "Szókártyák",
      subtitle: topic,
      instructions_md: "Nézd át a kártyákat és próbáld megjegyezni:",
      ui: { mode: "inline", estimated_minutes: 5 },
      input: { type: "flip" },
      content: {
        kind: "cards",
        data: {
          cards: [
            { front: "Ciao", back: "Szia" },
            { front: "Grazie", back: "Köszönöm" },
            { front: "Prego", back: "Szívesen" },
          ],
        },
      },
      validation: { require_interaction: true, min_items: 1 },
      scoring: { max_points: 100, partial_credit: false },
    },
    roleplay: {
      schema_version: FOCUS_ITEM_SCHEMA_VERSION,
      kind: "roleplay",
      title: "Párbeszéd gyakorlat",
      subtitle: topic,
      instructions_md: "Gyakorold a párbeszédet a virtuális partnereddel:",
      ui: { mode: "inline", estimated_minutes: 10 },
      input: { type: "chat", placeholder: "Írd ide az üzeneted (min. 80 karakter)..." },
      content: {
        kind: "roleplay",
        data: {
          scenario: `Gyakorolj egy párbeszédet a következő témában: ${topic}`,
          roles: { user: "Te", ai: "Partner" },
          starter_prompt: "Kezdd a beszélgetést!",
        },
      },
      validation: { require_interaction: true, min_chars: 80, min_messages: 2 },
      scoring: { max_points: 100, partial_credit: true },
    },
    writing: {
      schema_version: FOCUS_ITEM_SCHEMA_VERSION,
      kind: "writing",
      title: "Írásbeli gyakorlat",
      subtitle: topic,
      instructions_md: "Írj egy rövid szöveget a témában:",
      ui: { mode: "inline", estimated_minutes: 10 },
      input: { type: "text", placeholder: "Írd ide a válaszod..." },
      content: {
        kind: "writing",
        data: {
          prompt: `Írj egy rövid szöveget a következő témában: ${topic}`,
          word_count_target: 50,
        },
      },
      validation: { require_interaction: true, min_chars: 50 },
      scoring: { max_points: 100, partial_credit: true, auto_grade: true },
    },
    checklist: {
      schema_version: FOCUS_ITEM_SCHEMA_VERSION,
      kind: "checklist",
      title: "Feladatlista",
      subtitle: topic,
      instructions_md: "Végezd el a következő lépéseket:",
      ui: { mode: "inline", estimated_minutes: 10 },
      input: { type: "checkbox" },
      content: {
        kind: "checklist",
        data: {
          steps: [
            { instruction: `Készülj fel a témára: ${topic}` },
            { instruction: "Gyakorold hangosan" },
            { instruction: "Értékeld magad" },
          ],
          proof_prompt: "Írd le, hogyan végezted el a feladatot:",
        },
      },
      validation: { require_interaction: true, require_proof: true, min_chars: 20 },
      scoring: { max_points: 100, partial_credit: false },
    },
    briefing: {
      schema_version: FOCUS_ITEM_SCHEMA_VERSION,
      kind: "briefing",
      title: "Mai helyzet",
      subtitle: topic,
      instructions_md: "Olvasd el a mai helyzet leírását:",
      ui: { mode: "inline", estimated_minutes: 2 },
      input: { type: "none" },
      content: {
        kind: "briefing",
        data: {
          situation: `Ma a következő munkahelyi szituációval foglalkozunk: ${topic}`,
          outcome: "A nap végére képes leszel alkalmazni a tanultakat.",
        },
      },
      validation: { require_interaction: true },
      scoring: { max_points: 0, partial_credit: false },
    },
    feedback: {
      schema_version: FOCUS_ITEM_SCHEMA_VERSION,
      kind: "feedback",
      title: "Visszajelzés",
      subtitle: topic,
      instructions_md: "Itt láthatod az AI visszajelzését az írásodról:",
      ui: { mode: "inline", estimated_minutes: 5 },
      input: { type: "none" },
      content: {
        kind: "feedback",
        data: {
          user_text: "",
          corrections: [],
          improved_version: "",
          placeholder: true,
          message: "Először fejezd be a szövegalkotás feladatot!",
        },
      },
      validation: { require_interaction: true },
      scoring: { max_points: 100, partial_credit: true },
    },
  };

  return templates[kind];
}

// ============================================================================
// VALIDATION STATE FOR COMPLETION BUTTON
// ============================================================================

export interface ValidationState {
  canComplete: boolean;
  reason?: string;
  progress: {
    current: number;
    required: number;
    type: "chars" | "items" | "messages";
  };
}

export function checkValidationState(
  item: StrictFocusItem,
  userState: {
    charCount?: number;
    itemsCompleted?: number;
    messagesCount?: number;
    proofText?: string;
  }
): ValidationState {
  const validation = item.validation;
  
  // Check min_chars
  if (validation.min_chars && validation.min_chars > 0) {
    const current = userState.charCount || 0;
    if (current < validation.min_chars) {
      return {
        canComplete: false,
        reason: `Legalább ${validation.min_chars} karakter szükséges`,
        progress: { current, required: validation.min_chars, type: "chars" },
      };
    }
  }
  
  // Check min_items
  if (validation.min_items && validation.min_items > 0) {
    const current = userState.itemsCompleted || 0;
    if (current < validation.min_items) {
      return {
        canComplete: false,
        reason: `Legalább ${validation.min_items} elem szükséges`,
        progress: { current, required: validation.min_items, type: "items" },
      };
    }
  }
  
  // Check min_messages
  if (validation.min_messages && validation.min_messages > 0) {
    const current = userState.messagesCount || 0;
    if (current < validation.min_messages) {
      return {
        canComplete: false,
        reason: `Legalább ${validation.min_messages} üzenet szükséges`,
        progress: { current, required: validation.min_messages, type: "messages" },
      };
    }
  }
  
  // Briefing and feedback are read-only — always completable
  if (item.kind === "briefing" || item.kind === "feedback") {
    return {
      canComplete: true,
      progress: { current: 1, required: 1, type: "items" },
    };
  }

  // Check proof text for checklist
  if (validation.require_proof && item.kind === "checklist") {
    const proofLength = userState.proofText?.length || 0;
    const minChars = validation.min_chars || 20;
    if (proofLength < minChars) {
      return {
        canComplete: false,
        reason: `Írd le, hogyan végezted el (min. ${minChars} karakter)`,
        progress: { current: proofLength, required: minChars, type: "chars" },
      };
    }
  }
  
  return {
    canComplete: true,
    progress: { current: 1, required: 1, type: "items" },
  };
}
