// ============================================================================
// FOCUS ITEM VALIDATOR
// Server-side validation with repair and fallback logic
// ============================================================================

import {
  type StrictFocusItem,
  type FocusItemKind,
  type FocusItemContent,
  type FocusValidation,
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
    
    case "roleplay":
      return {
        kind: "roleplay",
        data: {
          scenario: content?.scenario || raw?.text || raw?.instructions_md || "Gyakorold a párbeszédet!",
          roles: content?.roles || { user: "Te", ai: "Partner" },
          starter_prompt: content?.starter_prompt,
          sample_exchanges: content?.sample_exchanges,
        },
      };
    
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
  }
}

function extractTranslationSentences(raw: any): Array<{ source: string; target_lang: string; hint?: string }> {
  const content = raw?.content;
  
  // New format
  if (content?.sentences && Array.isArray(content.sentences)) {
    return content.sentences.map((s: any) => ({
      source: s.source || s.text || s,
      target_lang: s.target_lang || "it",
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
      question: q.question,
      options: q.options || [],
      correct_index: q.correct_index ?? q.correctIndex ?? 0,
      explanation: q.explanation,
    }));
  }
  
  // Legacy format
  if (raw?.quiz && Array.isArray(raw.quiz)) {
    return raw.quiz.map((q: any) => ({
      question: q.question,
      options: q.options || [],
      correct_index: q.correctIndex ?? q.correct_index ?? 0,
      explanation: q.explanation,
    }));
  }
  
  // Fallback
  return [{
    question: "Mi a helyes válasz?",
    options: ["A", "B", "C", "D"],
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
  
  // New format
  if (content?.steps && Array.isArray(content.steps)) {
    const mapped = content.steps.map((s: any) => ({
      instruction: typeof s === "string" ? s : s.instruction || s.text,
      completed: s.completed,
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
  return ["translation", "quiz", "cards", "roleplay", "writing", "checklist"].includes(kind);
}

// ============================================================================
// FALLBACK TEMPLATES
// ============================================================================

export function getFallbackTemplate(kind: FocusItemKind, topic: string): StrictFocusItem {
  const templates: Record<FocusItemKind, StrictFocusItem> = {
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
            options: ["A", "B", "C", "D"],
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
