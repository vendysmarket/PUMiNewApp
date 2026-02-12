// src/lib/syllabusGenerator.ts
// Generates a structured 7-day syllabus via Claude, maps to backend items

import type { WizardData, WizardStep3Language } from "@/types/focusWizard";
import type { WeekPlan, SyllabusDay, SyllabusBlock, SyllabusBlockType } from "@/types/syllabus";
import { MAIN_TASK_ROTATION, BLOCK_TYPE_TO_ITEM_TYPE } from "@/types/syllabus";
import { pumiInvoke } from "@/lib/pumiInvoke";

// ============================================================================
// PROMPT BUILDER
// ============================================================================

function buildSyllabusPrompt(wizardData: WizardData): string {
  const step3 = wizardData.step3 as WizardStep3Language | null;
  const language = step3?.targetLanguage || "english";
  const level = step3?.level || "beginner";
  const minutesPerDay = step3?.minutesPerDay || 20;
  const goal = wizardData.step2.goalSentence;
  const durationDays = Math.min(wizardData.step2.durationDays, 7);

  const rotation = MAIN_TASK_ROTATION.slice(0, durationDays)
    .map((t, i) => `Day ${i + 1}: ${t}`)
    .join(", ");

  return `You are a curriculum designer for a language learning app.
Your job is to produce a coherent ${durationDays}-day micro-syllabus.
Output must be valid JSON only. No markdown, no explanations.

Create a ${durationDays}-day syllabus for:
- target_language: "${language}"
- user_native_language: "Hungarian"
- level: "${level}"
- minutes_per_day: ${minutesPerDay}
- goal: "${goal}"

Rules:
1) Every day MUST include exactly 5 blocks in this order:
   - lesson_1 (lesson block)
   - lightning_1 (quick quiz on lesson_1 material only)
   - lesson_2 (lesson block - same day theme but practical usage)
   - lightning_2 (quick quiz on lesson_2 material only)
   - main (main task - type rotates by day)
2) main task block_type rotates: ${rotation}
3) Total minutes per day ≈ ${minutesPerDay}
4) topic_seed must be specific to the day's theme (not generic)
5) lightning blocks quiz ONLY material from the preceding lesson block
6) key_vocab: 8-12 words per day, progressing in difficulty
7) Each day's theme builds on previous days
8) vocab_hint in lesson blocks must be a subset of that day's key_vocab
9) All title_hu and topic_seed values MUST be in Hungarian
10) Keep vocabulary small. Reuse is allowed across days, but do not introduce new words in tasks that aren't in that day's vocab list.

Return ONLY this JSON (no markdown fences):
{
  "language": "${language}",
  "level": "${level}",
  "goal": "${goal}",
  "days": [
    {
      "day": 1,
      "theme_hu": "string - napi tema magyarul",
      "grammar_focus": "string - nyelvtani fokusz",
      "key_vocab": ["szo1", "szo2", "...8-12 szo"],
      "blocks": [
        { "block_id": "lesson_1", "block_type": "lesson", "title_hu": "Tananyag I.", "topic_seed": "konkretan mit tanit", "grammar_focus": "...", "vocab_hint": ["3-5 szo"], "estimated_minutes": ${Math.round(minutesPerDay * 0.25)} },
        { "block_id": "lightning_1", "block_type": "lightning", "title_hu": "Villamkviz I.", "topic_seed": "rovid kviz az elozo tananyagbol", "estimated_minutes": ${Math.round(minutesPerDay * 0.1)} },
        { "block_id": "lesson_2", "block_type": "lesson", "title_hu": "Tananyag II.", "topic_seed": "gyakorlati hasznalat", "grammar_focus": "...", "vocab_hint": ["3-5 szo"], "estimated_minutes": ${Math.round(minutesPerDay * 0.25)} },
        { "block_id": "lightning_2", "block_type": "lightning", "title_hu": "Villamkviz II.", "topic_seed": "rovid kviz a masodik tananyagbol", "estimated_minutes": ${Math.round(minutesPerDay * 0.1)} },
        { "block_id": "main", "block_type": "ROTATION_TYPE", "title_hu": "Fo feladat", "topic_seed": "...", "estimated_minutes": ${Math.round(minutesPerDay * 0.3)} }
      ]
    }
  ]
}`;
}

// ============================================================================
// JSON EXTRACTION
// ============================================================================

function extractJsonFromText(text: string): any {
  let cleaned = text.trim();
  // Strip markdown fences
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "");
  }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.substring(start, end + 1));
  } catch {
    return null;
  }
}

// ============================================================================
// VALIDATION & REPAIR
// ============================================================================

function getDefaultBlockType(blockId: string, dayIndex: number): SyllabusBlockType {
  if (blockId.startsWith("lesson")) return "lesson";
  if (blockId.startsWith("lightning")) return "lightning";
  return MAIN_TASK_ROTATION[dayIndex % MAIN_TASK_ROTATION.length];
}

function getDefaultTitle(blockId: string): string {
  switch (blockId) {
    case "lesson_1": return "Tananyag I.";
    case "lightning_1": return "Villamkviz I.";
    case "lesson_2": return "Tananyag II.";
    case "lightning_2": return "Villamkviz II.";
    case "main": return "Fo feladat";
    default: return blockId;
  }
}

function validateWeekPlan(raw: any): WeekPlan {
  const expectedBlockIds = ["lesson_1", "lightning_1", "lesson_2", "lightning_2", "main"];

  const days: SyllabusDay[] = (raw.days || []).map((d: any, i: number) => {
    const rawBlocks: any[] = d.blocks || [];

    const blocks: SyllabusBlock[] = expectedBlockIds.map((expectedId, idx) => {
      const found = rawBlocks.find((b: any) => b.block_id === expectedId) || rawBlocks[idx];
      const defaultType = getDefaultBlockType(expectedId, i);

      // For main block, force the rotation type
      const blockType: SyllabusBlockType =
        expectedId === "main"
          ? MAIN_TASK_ROTATION[i % MAIN_TASK_ROTATION.length]
          : (found?.block_type as SyllabusBlockType) || defaultType;

      return {
        block_id: expectedId,
        block_type: blockType,
        title_hu: found?.title_hu || getDefaultTitle(expectedId),
        topic_seed: found?.topic_seed || d.theme_hu || `Nap ${i + 1}`,
        grammar_focus: found?.grammar_focus,
        vocab_hint: Array.isArray(found?.vocab_hint) ? found.vocab_hint : undefined,
        estimated_minutes: found?.estimated_minutes || 5,
      };
    });

    return {
      day: d.day || i + 1,
      theme_hu: d.theme_hu || d.day_theme || `Nap ${i + 1}`,
      theme_en: d.theme_en,
      grammar_focus: d.grammar_focus || "",
      key_vocab: Array.isArray(d.key_vocab) ? d.key_vocab : [],
      blocks,
    };
  });

  return {
    language: raw.language || raw.target_language || "",
    level: raw.level || "",
    goal: raw.goal || raw.title || "",
    days,
  };
}

// ============================================================================
// GENERATE SYLLABUS
// ============================================================================

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Syllabus generation timed out")), ms),
  );
  return Promise.race([promise, timeout]);
}

export async function generateSyllabus(wizardData: WizardData): Promise<WeekPlan> {
  const prompt = buildSyllabusPrompt(wizardData);

  console.log("[SYLLABUS] Generating syllabus...");

  const resp = await withTimeout(
    pumiInvoke<{ reply?: string; text?: string; message?: string }>("/chat/enhanced", {
      message: prompt,
      lang: "hu",
      mode: "chat",
    }),
    20000,
  );

  const rawText = resp.reply || resp.text || resp.message || "";
  if (!rawText) {
    throw new Error("Syllabus generation returned empty response");
  }

  const parsed = extractJsonFromText(rawText);
  if (!parsed || !parsed.days || !Array.isArray(parsed.days)) {
    throw new Error("Syllabus generation returned invalid JSON");
  }

  const weekPlan = validateWeekPlan(parsed);
  console.log("[SYLLABUS] Generated:", weekPlan.days.length, "days");
  return weekPlan;
}

// ============================================================================
// MAP SYLLABUS → BACKEND ITEMS
// ============================================================================

export interface DayForBackend {
  dayIndex: number;
  title: string;
  intro: string;
  items: Array<{
    itemKey: string;
    type: string;
    practiceType: string | null;
    topic: string;
    label: string;
    estimatedMinutes: number;
  }>;
}

export function mapSyllabusToDays(weekPlan: WeekPlan, goalTitle: string, totalDays: number): DayForBackend[] {
  const days: DayForBackend[] = weekPlan.days.map((day) => {
    const items = day.blocks.map((block) => {
      const mapping = BLOCK_TYPE_TO_ITEM_TYPE[block.block_type] || { type: "lesson" };

      // Build rich topic that seeds coherent content generation
      const topicParts = [block.topic_seed || day.theme_hu];
      if (block.grammar_focus) topicParts.push(`(${block.grammar_focus})`);
      if (block.vocab_hint?.length) topicParts.push(`Szavak: ${block.vocab_hint.join(", ")}`);
      const topic = topicParts.join(" - ");

      return {
        itemKey: `d${day.day}-${block.block_id}`,
        type: mapping.type,
        practiceType: mapping.practiceType || null,
        topic,
        label: block.title_hu,
        estimatedMinutes: block.estimated_minutes,
      };
    });

    return {
      dayIndex: day.day - 1, // Backend expects 0-based
      title: `${goalTitle} - Nap ${day.day}: ${day.theme_hu}`,
      intro: day.grammar_focus
        ? `Nyelvtan: ${day.grammar_focus} | Szavak: ${day.key_vocab.slice(0, 5).join(", ")}${day.key_vocab.length > 5 ? "..." : ""}`
        : "",
      items,
    };
  });

  // Pad remaining days with empty items (backend generates defaults)
  for (let i = days.length; i < totalDays; i++) {
    days.push({
      dayIndex: i,
      title: `${goalTitle} • Nap ${i + 1}`,
      intro: "",
      items: [],
    });
  }

  return days;
}
