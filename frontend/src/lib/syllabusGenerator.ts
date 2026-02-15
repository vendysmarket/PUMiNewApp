// src/lib/syllabusGenerator.ts
// Generates a structured 7-day syllabus via Claude, maps to backend items

import type { WizardData, WizardStep3Language, LanguageTrack } from "@/types/focusWizard";
import type { WeekPlan, SyllabusDay, SyllabusBlock, SyllabusBlockType } from "@/types/syllabus";
import { MAIN_TASK_ROTATION, BLOCK_TYPE_TO_ITEM_TYPE } from "@/types/syllabus";
import { pumiInvoke } from "@/lib/pumiInvoke";

// Track-specific block structures
const FOUNDATIONS_BLOCK_IDS = ["lesson_1", "lightning_1", "lesson_2", "lightning_2", "main"] as const;
const CAREER_BLOCK_IDS = ["situation", "phrases", "output", "drill", "main"] as const;

function getExpectedBlockIds(track?: LanguageTrack): readonly string[] {
  return track === "career_language" ? CAREER_BLOCK_IDS : FOUNDATIONS_BLOCK_IDS;
}

// ============================================================================
// PROMPT BUILDER
// ============================================================================

function buildSyllabusPrompt(wizardData: WizardData): string {
  const step3 = wizardData.step3 as WizardStep3Language | null;
  const language = step3?.targetLanguage || "english";
  const level = step3?.level || "beginner";
  const minutesPerDay = step3?.minutesPerDay || 20;
  const track = step3?.track;
  const goal = wizardData.step2.goalSentence;
  const durationDays = Math.min(wizardData.step2.durationDays, 7);

  const rotation = MAIN_TASK_ROTATION.slice(0, durationDays)
    .map((t, i) => `Day ${i + 1}: ${t}`)
    .join(", ");

  // Track-specific block structure for the prompt
  const isCareer = track === "career_language";
  const blockStructure = isCareer
    ? `   - situation (lesson block - situational input: email, meeting, interview, phone call)
   - phrases (quick quiz on situation phrases only)
   - output (lesson block - active production: write 5 sentences, reply to email, etc.)
   - drill (quick quiz on output material only)
   - main (main task - type rotates by day)`
    : `   - lesson_1 (lesson block)
   - lightning_1 (quick quiz on lesson_1 material only)
   - lesson_2 (lesson block - same day theme but practical usage)
   - lightning_2 (quick quiz on lesson_2 material only)
   - main (main task - type rotates by day)`;

  const blockIds = isCareer ? CAREER_BLOCK_IDS : FOUNDATIONS_BLOCK_IDS;
  const blockExample = isCareer
    ? `        { "block_id": "situation", "block_type": "lesson", "title_hu": "Szituáció", "topic_seed": "konkretan milyen szituacio", "grammar_focus": "...", "vocab_hint": ["3-5 szo"], "estimated_minutes": ${Math.round(minutesPerDay * 0.25)} },
        { "block_id": "phrases", "block_type": "lightning", "title_hu": "Kifejezések", "topic_seed": "rovid kviz a szituacio kifejezeseibol", "estimated_minutes": ${Math.round(minutesPerDay * 0.1)} },
        { "block_id": "output", "block_type": "lesson", "title_hu": "Aktív gyakorlat", "topic_seed": "aktiv hasznalat, iras, fogalmazas", "grammar_focus": "...", "vocab_hint": ["3-5 szo"], "estimated_minutes": ${Math.round(minutesPerDay * 0.25)} },
        { "block_id": "drill", "block_type": "lightning", "title_hu": "Drill", "topic_seed": "rovid kviz az aktiv gyakorlatbol", "estimated_minutes": ${Math.round(minutesPerDay * 0.1)} },
        { "block_id": "main", "block_type": "ROTATION_TYPE", "title_hu": "Fo feladat", "topic_seed": "...", "estimated_minutes": ${Math.round(minutesPerDay * 0.3)} }`
    : `        { "block_id": "lesson_1", "block_type": "lesson", "title_hu": "Tananyag I.", "topic_seed": "konkretan mit tanit", "grammar_focus": "...", "vocab_hint": ["3-5 szo"], "estimated_minutes": ${Math.round(minutesPerDay * 0.25)} },
        { "block_id": "lightning_1", "block_type": "lightning", "title_hu": "Villamkviz I.", "topic_seed": "rovid kviz az elozo tananyagbol", "estimated_minutes": ${Math.round(minutesPerDay * 0.1)} },
        { "block_id": "lesson_2", "block_type": "lesson", "title_hu": "Tananyag II.", "topic_seed": "gyakorlati hasznalat", "grammar_focus": "...", "vocab_hint": ["3-5 szo"], "estimated_minutes": ${Math.round(minutesPerDay * 0.25)} },
        { "block_id": "lightning_2", "block_type": "lightning", "title_hu": "Villamkviz II.", "topic_seed": "rovid kviz a masodik tananyagbol", "estimated_minutes": ${Math.round(minutesPerDay * 0.1)} },
        { "block_id": "main", "block_type": "ROTATION_TYPE", "title_hu": "Fo feladat", "topic_seed": "...", "estimated_minutes": ${Math.round(minutesPerDay * 0.3)} }`;

  const trackNote = isCareer
    ? `\nTrack: CAREER LANGUAGE (B1+ level, situational learning: email, meetings, interviews, phone calls)`
    : "";

  return `You are a curriculum designer for a language learning app.
Your job is to produce a coherent ${durationDays}-day micro-syllabus.
Output must be valid JSON only. No markdown, no explanations.

Create a ${durationDays}-day syllabus for:
- target_language: "${language}"
- user_native_language: "Hungarian"
- level: "${level}"
- minutes_per_day: ${minutesPerDay}
- goal: "${goal}"${trackNote}

Rules:
1) Every day MUST include exactly 5 blocks in this order:
${blockStructure}
2) main task block_type rotates: ${rotation}
3) Total minutes per day ≈ ${minutesPerDay}
4) topic_seed must be specific to the day's theme (not generic)
5) lightning/quiz blocks quiz ONLY material from the preceding lesson block
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
${blockExample}
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
  if (blockId.startsWith("lesson") || blockId === "situation" || blockId === "output") return "lesson";
  if (blockId.startsWith("lightning") || blockId === "phrases" || blockId === "drill") return "lightning";
  return MAIN_TASK_ROTATION[dayIndex % MAIN_TASK_ROTATION.length];
}

function getDefaultTitle(blockId: string): string {
  switch (blockId) {
    case "lesson_1": return "Tananyag I.";
    case "lightning_1": return "Villamkviz I.";
    case "lesson_2": return "Tananyag II.";
    case "lightning_2": return "Villamkviz II.";
    case "situation": return "Szituáció";
    case "phrases": return "Kifejezések";
    case "output": return "Aktív gyakorlat";
    case "drill": return "Drill";
    case "main": return "Fo feladat";
    default: return blockId;
  }
}

function validateWeekPlan(raw: any, track?: LanguageTrack): WeekPlan {
  const expectedBlockIds = [...getExpectedBlockIds(track)];

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
// HARDCODED LANGUAGE TEMPLATES (fallback when API fails)
// ============================================================================

interface LanguageTemplate {
  days: Array<{
    theme_hu: string;
    grammar_focus: string;
    key_vocab: string[];
    lesson1: { topic: string; grammar: string; vocab: string[] };
    lesson2: { topic: string; grammar: string; vocab: string[] };
    lightning1_topic: string;
    lightning2_topic: string;
    main_topic: string;
  }>;
}

const ENGLISH_BEGINNER_TEMPLATE: LanguageTemplate = {
  days: [
    {
      theme_hu: "Bemutatkozás és köszönés",
      grammar_focus: "to be ige (I am, you are, he/she is)",
      key_vocab: ["hello", "goodbye", "my name is", "nice to meet you", "please", "thank you", "yes", "no", "I am", "you are"],
      lesson1: { topic: "Angol köszönések és bemutatkozás", grammar: "to be ige jelen idő (I am, you are)", vocab: ["hello", "goodbye", "my name is", "nice to meet you", "I am"] },
      lesson2: { topic: "Udvariassági kifejezések a mindennapi életben", grammar: "kérdő mondatok a to be igével (Are you...?)", vocab: ["please", "thank you", "yes", "no", "you are"] },
      lightning1_topic: "Köszönések és bemutatkozás kvíz",
      lightning2_topic: "Udvariassági kifejezések kvíz",
      main_topic: "Bemutatkozás párbeszéd - köszönés és névcsere",
    },
    {
      theme_hu: "Számok és alapvető információk",
      grammar_focus: "számok 1-20, How old are you?, I have...",
      key_vocab: ["one", "two", "three", "four", "five", "ten", "twenty", "how old", "years old", "I have"],
      lesson1: { topic: "Angol számok 1-20 és kiejtésük", grammar: "számok használata mondatban", vocab: ["one", "two", "three", "five", "ten", "twenty"] },
      lesson2: { topic: "Kor és személyes adatok angolul", grammar: "How old are you? I am ... years old.", vocab: ["how old", "years old", "I have", "four"] },
      lightning1_topic: "Számok felismerése és kiejtése kvíz",
      lightning2_topic: "Személyes adatok és kor kvíz",
      main_topic: "Számok szókártyák - 1-20 angol számok",
    },
    {
      theme_hu: "Család és kapcsolatok",
      grammar_focus: "birtokos névmások (my, your, his, her)",
      key_vocab: ["mother", "father", "sister", "brother", "family", "my", "your", "his", "her", "friend"],
      lesson1: { topic: "Családtagok megnevezése angolul", grammar: "birtokos névmások (my, your)", vocab: ["mother", "father", "sister", "brother", "family"] },
      lesson2: { topic: "Család bemutatása és kapcsolatok leírása", grammar: "This is my... / He is her...", vocab: ["my", "your", "his", "her", "friend"] },
      lightning1_topic: "Családtagok nevei kvíz",
      lightning2_topic: "Birtokos névmások kvíz",
      main_topic: "Fordítsd le a családdal kapcsolatos mondatokat angolra",
    },
    {
      theme_hu: "Ételek és italok",
      grammar_focus: "I like / I don't like, some/any",
      key_vocab: ["water", "bread", "apple", "coffee", "milk", "I like", "I don't like", "hungry", "thirsty", "food"],
      lesson1: { topic: "Alapvető ételek és italok angolul", grammar: "I like / I don't like szerkezet", vocab: ["water", "bread", "apple", "coffee", "milk"] },
      lesson2: { topic: "Rendelés étteremben és boltban", grammar: "Can I have...? / I would like...", vocab: ["I like", "I don't like", "hungry", "thirsty", "food"] },
      lightning1_topic: "Ételek és italok nevei kvíz",
      lightning2_topic: "Rendelés és kérés kifejezések kvíz",
      main_topic: "Ételek és italok - feleletválasztós kvíz",
    },
    {
      theme_hu: "Mindennapi tevékenységek",
      grammar_focus: "egyszerű jelen idő (I go, I eat, I sleep)",
      key_vocab: ["go", "eat", "sleep", "work", "read", "walk", "morning", "evening", "every day", "sometimes"],
      lesson1: { topic: "Mindennapi igék és cselekvések", grammar: "egyszerű jelen idő - állító mondatok", vocab: ["go", "eat", "sleep", "work", "read"] },
      lesson2: { topic: "Napirendem leírása angolul", grammar: "időhatározók: every day, sometimes, always", vocab: ["walk", "morning", "evening", "every day", "sometimes"] },
      lightning1_topic: "Mindennapi igék kvíz",
      lightning2_topic: "Napirend és időhatározók kvíz",
      main_topic: "Írj 3-5 mondatot a napirendedről angolul",
    },
    {
      theme_hu: "Helyek és irányok",
      grammar_focus: "there is / there are, elöljárószók (in, on, at, near)",
      key_vocab: ["house", "school", "shop", "park", "street", "in", "on", "near", "where", "there is"],
      lesson1: { topic: "Helyek megnevezése a városban", grammar: "Where is...? / There is... / There are...", vocab: ["house", "school", "shop", "park", "street"] },
      lesson2: { topic: "Útbaigazítás és helymeghatározás", grammar: "elöljárószók: in, on, at, near", vocab: ["in", "on", "near", "where", "there is"] },
      lightning1_topic: "Helyek és épületek nevei kvíz",
      lightning2_topic: "Elöljárószók és helymeghatározás kvíz",
      main_topic: "Helyek és irányok - vegyes ismétlő kvíz",
    },
    {
      theme_hu: "Heti összefoglalás és gyakorlás",
      grammar_focus: "to be, egyszerű jelen, birtokos névmások ismétlés",
      key_vocab: ["hello", "family", "food", "go", "house", "like", "my", "please", "where", "every day"],
      lesson1: { topic: "A hét nyelvtani összefoglalása: to be, jelen idő, birtokos névmások", grammar: "to be + egyszerű jelen idő ismétlés", vocab: ["hello", "family", "food", "go", "like"] },
      lesson2: { topic: "Komplex mondatok építése az eddig tanultakból", grammar: "mondatösszekapcsolás: and, but, because", vocab: ["house", "my", "please", "where", "every day"] },
      lightning1_topic: "Heti nyelvtan összefoglaló kvíz",
      lightning2_topic: "Szókincs összefoglaló kvíz",
      main_topic: "Heti vegyes ismétlő feladatsor - minden témakör",
    },
  ],
};

const GERMAN_BEGINNER_TEMPLATE: LanguageTemplate = {
  days: [
    {
      theme_hu: "Bemutatkozás és köszönés",
      grammar_focus: "sein ige (ich bin, du bist, er/sie ist)",
      key_vocab: ["Hallo", "Tschüss", "ich heiße", "freut mich", "bitte", "danke", "ja", "nein", "ich bin", "du bist"],
      lesson1: { topic: "Német köszönések és bemutatkozás", grammar: "sein ige ragozása (ich bin, du bist, er ist)", vocab: ["Hallo", "Tschüss", "ich heiße", "freut mich", "ich bin"] },
      lesson2: { topic: "Udvariassági formák és tegezés/magázás", grammar: "du vs. Sie különbség", vocab: ["bitte", "danke", "ja", "nein", "du bist"] },
      lightning1_topic: "Köszönések és bemutatkozás kvíz",
      lightning2_topic: "Udvariassági kifejezések kvíz",
      main_topic: "Bemutatkozás párbeszéd - köszönés és névcsere németül",
    },
    {
      theme_hu: "Számok és személyes adatok",
      grammar_focus: "számok 1-20, Wie alt bist du?, haben ige",
      key_vocab: ["eins", "zwei", "drei", "vier", "fünf", "zehn", "zwanzig", "wie alt", "Jahre alt", "ich habe"],
      lesson1: { topic: "Német számok 1-20", grammar: "számok mondatban", vocab: ["eins", "zwei", "drei", "fünf", "zehn", "zwanzig"] },
      lesson2: { topic: "Kor és személyes adatok németül", grammar: "Wie alt bist du? Ich bin ... Jahre alt.", vocab: ["wie alt", "Jahre alt", "ich habe", "vier"] },
      lightning1_topic: "Számok kvíz",
      lightning2_topic: "Személyes adatok kvíz",
      main_topic: "Számok szókártyák - 1-20 német számok",
    },
    {
      theme_hu: "Család és birtoklás",
      grammar_focus: "birtokos névmások (mein, dein, sein, ihr)",
      key_vocab: ["Mutter", "Vater", "Schwester", "Bruder", "Familie", "mein", "dein", "sein", "ihr", "Freund"],
      lesson1: { topic: "Családtagok németül", grammar: "birtokos névmások (mein, dein)", vocab: ["Mutter", "Vater", "Schwester", "Bruder", "Familie"] },
      lesson2: { topic: "Család bemutatása", grammar: "Das ist mein/meine...", vocab: ["mein", "dein", "sein", "ihr", "Freund"] },
      lightning1_topic: "Családtagok kvíz",
      lightning2_topic: "Birtokos névmások kvíz",
      main_topic: "Családdal kapcsolatos mondatok fordítása németre",
    },
    {
      theme_hu: "Ételek és italok",
      grammar_focus: "mögen/möchten, ein/eine/kein",
      key_vocab: ["Wasser", "Brot", "Apfel", "Kaffee", "Milch", "ich mag", "ich möchte", "hungrig", "durstig", "Essen"],
      lesson1: { topic: "Alapvető ételek és italok németül", grammar: "Ich mag / Ich mag nicht", vocab: ["Wasser", "Brot", "Apfel", "Kaffee", "Milch"] },
      lesson2: { topic: "Rendelés étteremben", grammar: "Ich möchte... / Kann ich... haben?", vocab: ["ich mag", "ich möchte", "hungrig", "durstig", "Essen"] },
      lightning1_topic: "Ételek és italok kvíz",
      lightning2_topic: "Rendelés kifejezések kvíz",
      main_topic: "Ételek és italok feleletválasztós kvíz",
    },
    {
      theme_hu: "Mindennapi tevékenységek",
      grammar_focus: "jelen idő ragozás (gehen, essen, schlafen)",
      key_vocab: ["gehen", "essen", "schlafen", "arbeiten", "lesen", "laufen", "Morgen", "Abend", "jeden Tag", "manchmal"],
      lesson1: { topic: "Mindennapi igék németül", grammar: "jelen idő ragozás - regelm. igék", vocab: ["gehen", "essen", "schlafen", "arbeiten", "lesen"] },
      lesson2: { topic: "Napirend leírása németül", grammar: "időhatározók: jeden Tag, manchmal, immer", vocab: ["laufen", "Morgen", "Abend", "jeden Tag", "manchmal"] },
      lightning1_topic: "Mindennapi igék kvíz",
      lightning2_topic: "Napirend kvíz",
      main_topic: "Írj 3-5 mondatot a napirendedről németül",
    },
    {
      theme_hu: "Helyek és irányok",
      grammar_focus: "es gibt, elöljárószók (in, auf, an, bei)",
      key_vocab: ["Haus", "Schule", "Geschäft", "Park", "Straße", "in", "auf", "bei", "wo", "es gibt"],
      lesson1: { topic: "Helyek a városban németül", grammar: "Wo ist...? / Es gibt...", vocab: ["Haus", "Schule", "Geschäft", "Park", "Straße"] },
      lesson2: { topic: "Útbaigazítás németül", grammar: "elöljárószók: in, auf, an, bei", vocab: ["in", "auf", "bei", "wo", "es gibt"] },
      lightning1_topic: "Helyek és épületek kvíz",
      lightning2_topic: "Elöljárószók kvíz",
      main_topic: "Helyek és irányok - vegyes ismétlő kvíz",
    },
    {
      theme_hu: "Heti összefoglalás",
      grammar_focus: "sein, haben, jelen idő, birtokos névmások ismétlés",
      key_vocab: ["Hallo", "Familie", "Essen", "gehen", "Haus", "mag", "mein", "bitte", "wo", "jeden Tag"],
      lesson1: { topic: "Nyelvtani összefoglalás: sein, haben, jelen idő", grammar: "sein + jelen idő ismétlés", vocab: ["Hallo", "Familie", "Essen", "gehen", "mag"] },
      lesson2: { topic: "Komplex mondatok építése", grammar: "mondatösszekapcsolás: und, aber, weil", vocab: ["Haus", "mein", "bitte", "wo", "jeden Tag"] },
      lightning1_topic: "Heti nyelvtan összefoglaló kvíz",
      lightning2_topic: "Szókincs összefoglaló kvíz",
      main_topic: "Heti vegyes ismétlő feladatsor",
    },
  ],
};

/**
 * Build a generic beginner template for any language.
 * Uses Hungarian theme descriptions and generic topic seeds.
 */
function buildGenericTemplate(language: string): LanguageTemplate {
  const lang = language.charAt(0).toUpperCase() + language.slice(1).toLowerCase();
  return {
    days: [
      {
        theme_hu: "Bemutatkozás és köszönés",
        grammar_focus: "létige jelen idő",
        key_vocab: ["szia", "viszlát", "a nevem", "igen", "nem", "kérem", "köszönöm", "jó napot"],
        lesson1: { topic: `${lang} köszönések és alapvető kifejezések`, grammar: "létige jelen idő", vocab: ["szia", "viszlát", "a nevem", "jó napot"] },
        lesson2: { topic: `Udvariassági kifejezések - ${lang}`, grammar: "kérdő mondatok létigével", vocab: ["igen", "nem", "kérem", "köszönöm"] },
        lightning1_topic: "Köszönések kvíz",
        lightning2_topic: "Udvariassági kifejezések kvíz",
        main_topic: `Bemutatkozás párbeszéd - ${lang}`,
      },
      {
        theme_hu: "Számok és alapvető információk",
        grammar_focus: "számok 1-20",
        key_vocab: ["1", "2", "3", "4", "5", "10", "20", "hány éves", "van nekem"],
        lesson1: { topic: `Számok 1-20 - ${lang}`, grammar: "számok használata", vocab: ["1", "2", "3", "5", "10", "20"] },
        lesson2: { topic: `Kor és személyes adatok - ${lang}`, grammar: "Hány éves vagy?", vocab: ["hány éves", "van nekem", "4"] },
        lightning1_topic: "Számok kvíz",
        lightning2_topic: "Személyes adatok kvíz",
        main_topic: `Számok szókártyák - ${lang}`,
      },
      {
        theme_hu: "Család és kapcsolatok",
        grammar_focus: "birtokos névmások",
        key_vocab: ["anya", "apa", "testvér", "barát", "család", "enyém", "tiéd"],
        lesson1: { topic: `Családtagok - ${lang}`, grammar: "birtokos névmások", vocab: ["anya", "apa", "testvér", "család"] },
        lesson2: { topic: `Család bemutatása - ${lang}`, grammar: "Ez az én... / Ő az ő...", vocab: ["barát", "enyém", "tiéd"] },
        lightning1_topic: "Családtagok kvíz",
        lightning2_topic: "Birtokos névmások kvíz",
        main_topic: `Családdal kapcsolatos mondatok fordítása - ${lang}`,
      },
      {
        theme_hu: "Ételek és italok",
        grammar_focus: "szeretem / nem szeretem",
        key_vocab: ["víz", "kenyér", "alma", "kávé", "tej", "szeretem", "éhes", "szomjas", "étel"],
        lesson1: { topic: `Alapvető ételek és italok - ${lang}`, grammar: "Szeretem / Nem szeretem", vocab: ["víz", "kenyér", "alma", "kávé", "tej"] },
        lesson2: { topic: `Rendelés étteremben - ${lang}`, grammar: "Kérhetnék...? / Szeretnék...", vocab: ["szeretem", "éhes", "szomjas", "étel"] },
        lightning1_topic: "Ételek és italok kvíz",
        lightning2_topic: "Rendelés kifejezések kvíz",
        main_topic: `Ételek kvíz - ${lang}`,
      },
      {
        theme_hu: "Mindennapi tevékenységek",
        grammar_focus: "egyszerű jelen idő",
        key_vocab: ["menni", "enni", "aludni", "dolgozni", "olvasni", "reggel", "este", "minden nap", "néha"],
        lesson1: { topic: `Mindennapi igék - ${lang}`, grammar: "jelen idő ragozás", vocab: ["menni", "enni", "aludni", "dolgozni", "olvasni"] },
        lesson2: { topic: `Napirend leírása - ${lang}`, grammar: "időhatározók", vocab: ["reggel", "este", "minden nap", "néha"] },
        lightning1_topic: "Igék kvíz",
        lightning2_topic: "Napirend kvíz",
        main_topic: `Írj napirendet - ${lang}`,
      },
      {
        theme_hu: "Helyek és irányok",
        grammar_focus: "van/vannak, elöljárószók",
        key_vocab: ["ház", "iskola", "bolt", "park", "utca", "-ban/-ben", "mellett", "hol"],
        lesson1: { topic: `Helyek a városban - ${lang}`, grammar: "Hol van...? / Van...", vocab: ["ház", "iskola", "bolt", "park", "utca"] },
        lesson2: { topic: `Útbaigazítás - ${lang}`, grammar: "elöljárószók", vocab: ["-ban/-ben", "mellett", "hol"] },
        lightning1_topic: "Helyek kvíz",
        lightning2_topic: "Elöljárószók kvíz",
        main_topic: `Helyek vegyes kvíz - ${lang}`,
      },
      {
        theme_hu: "Heti összefoglalás",
        grammar_focus: "létige, jelen idő, birtokos névmások ismétlés",
        key_vocab: ["szia", "család", "étel", "menni", "ház", "szeretem", "enyém", "kérem", "hol", "minden nap"],
        lesson1: { topic: `Heti nyelvtan összefoglalás - ${lang}`, grammar: "létige + jelen idő ismétlés", vocab: ["szia", "család", "étel", "menni", "szeretem"] },
        lesson2: { topic: `Komplex mondatok - ${lang}`, grammar: "mondatösszekapcsolás", vocab: ["ház", "enyém", "kérem", "hol", "minden nap"] },
        lightning1_topic: "Nyelvtan összefoglaló kvíz",
        lightning2_topic: "Szókincs összefoglaló kvíz",
        main_topic: `Heti vegyes ismétlő feladatsor - ${lang}`,
      },
    ],
  };
}

function getTemplateForLanguage(language: string, _level: string): LanguageTemplate {
  const lang = language.toLowerCase().trim();
  if (lang === "english" || lang === "angol") return ENGLISH_BEGINNER_TEMPLATE;
  if (lang === "german" || lang === "német" || lang === "deutsch") return GERMAN_BEGINNER_TEMPLATE;
  return buildGenericTemplate(language);
}

function buildTemplateSyllabus(wizardData: WizardData): WeekPlan {
  const step3 = wizardData.step3 as WizardStep3Language | null;
  const language = step3?.targetLanguage || "english";
  const level = step3?.level || "beginner";
  const minutesPerDay = step3?.minutesPerDay || 20;
  const goal = wizardData.step2.goalSentence;
  const durationDays = Math.min(wizardData.step2.durationDays, 7);

  const template = getTemplateForLanguage(language, level);

  const days: SyllabusDay[] = template.days.slice(0, durationDays).map((d, i) => {
    const mainType = MAIN_TASK_ROTATION[i % MAIN_TASK_ROTATION.length];
    const blocks: SyllabusBlock[] = [
      {
        block_id: "lesson_1",
        block_type: "lesson",
        title_hu: "Tananyag I.",
        topic_seed: d.lesson1.topic,
        grammar_focus: d.lesson1.grammar,
        vocab_hint: d.lesson1.vocab,
        estimated_minutes: Math.round(minutesPerDay * 0.25),
      },
      {
        block_id: "lightning_1",
        block_type: "lightning",
        title_hu: "Villámkvíz I.",
        topic_seed: d.lightning1_topic,
        estimated_minutes: Math.round(minutesPerDay * 0.1),
      },
      {
        block_id: "lesson_2",
        block_type: "lesson",
        title_hu: "Tananyag II.",
        topic_seed: d.lesson2.topic,
        grammar_focus: d.lesson2.grammar,
        vocab_hint: d.lesson2.vocab,
        estimated_minutes: Math.round(minutesPerDay * 0.25),
      },
      {
        block_id: "lightning_2",
        block_type: "lightning",
        title_hu: "Villámkvíz II.",
        topic_seed: d.lightning2_topic,
        estimated_minutes: Math.round(minutesPerDay * 0.1),
      },
      {
        block_id: "main",
        block_type: mainType,
        title_hu: "Fő feladat",
        topic_seed: d.main_topic,
        estimated_minutes: Math.round(minutesPerDay * 0.3),
      },
    ];

    return {
      day: i + 1,
      theme_hu: d.theme_hu,
      grammar_focus: d.grammar_focus,
      key_vocab: d.key_vocab,
      blocks,
    };
  });

  return { language, level, goal, days };
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

  // Use /chat/enhanced json_mode only; do not chain into /chat/detailed here.
  let rawText = "";
  try {
    const resp = await withTimeout(
      pumiInvoke<{ reply?: string; text?: string; message?: string; type?: string; content?: string }>("/chat/enhanced", {
        message: prompt,
        lang: "hu",
        mode: "learning",
        json_mode: true,
      }),
      30000,
    );
    rawText = resp.reply || resp.text || resp.message || "";

    // For syllabus generation we never call /chat/detailed from frontend.
    if (!rawText && (resp as any).type === "needs_detailed") {
      throw new Error("Enhanced returned needs_detailed in json_mode");
    }
  } catch (err) {
    console.warn("[SYLLABUS] Chat endpoints failed, using template fallback:", err);
    const templatePlan = buildTemplateSyllabus(wizardData);
    console.log("[SYLLABUS] Template fallback:", templatePlan.days.length, "days");
    return templatePlan;
  }

  if (!rawText) {
    console.warn("[SYLLABUS] Empty API response, using template fallback");
    const templatePlan = buildTemplateSyllabus(wizardData);
    console.log("[SYLLABUS] Template fallback:", templatePlan.days.length, "days");
    return templatePlan;
  }

  const parsed = extractJsonFromText(rawText);
  if (!parsed || !parsed.days || !Array.isArray(parsed.days)) {
    console.warn("[SYLLABUS] Invalid JSON from API, using template fallback");
    const templatePlan = buildTemplateSyllabus(wizardData);
    console.log("[SYLLABUS] Template fallback:", templatePlan.days.length, "days");
    return templatePlan;
  }

  const step3 = wizardData.step3 as WizardStep3Language | null;
  const weekPlan = validateWeekPlan(parsed, step3?.track);
  console.log("[SYLLABUS] Generated:", weekPlan.days.length, "days, track:", step3?.track || "foundations_language");
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
    contentDepth?: "short" | "medium" | "substantial";
  }>;
}

export function mapSyllabusToDays(weekPlan: WeekPlan, goalTitle: string, totalDays: number): DayForBackend[] {
  const days: DayForBackend[] = weekPlan.days.map((day) => {
    // Collect lesson vocab_hints for scope-guarding quizzes (supports both track block IDs)
    const lesson1Vocab = day.blocks.find(b => b.block_id === "lesson_1" || b.block_id === "situation")?.vocab_hint || [];
    const lesson2Vocab = day.blocks.find(b => b.block_id === "lesson_2" || b.block_id === "output")?.vocab_hint || [];
    const allDayVocab = day.key_vocab.length > 0 ? day.key_vocab : [...lesson1Vocab, ...lesson2Vocab];

    const items = day.blocks.map((block) => {
      const mapping = BLOCK_TYPE_TO_ITEM_TYPE[block.block_type] || { type: "lesson" };

      let topic: string;

      if (block.block_type === "lightning" || block.block_type === "quiz" || block.block_type === "recap_mix") {
        // Scope-guarded quiz: explicitly constrain to day vocab
        const quizVocab = (block.block_id === "lightning_1" || block.block_id === "phrases") ? lesson1Vocab
          : (block.block_id === "lightning_2" || block.block_id === "drill") ? lesson2Vocab
          : allDayVocab;
        const vocabList = quizVocab.length > 0 ? quizVocab.join(", ") : allDayVocab.join(", ");
        topic = `${day.theme_hu} - ${block.topic_seed || "kvíz"}. KIZÁRÓLAG ezekből a szavakból/kifejezésekből kérdezz: ${vocabList}`;
        if (day.grammar_focus) {
          topic += `. Nyelvtan: ${day.grammar_focus}`;
        }
      } else if (block.block_type === "flashcards") {
        // Flashcards: use day vocab directly
        topic = `${day.theme_hu} - Szókártyák. Szavak: ${allDayVocab.join(", ")}`;
      } else if (block.block_type === "translation") {
        // Translation: constrain to day vocab
        topic = `${day.theme_hu} - Fordítás. KIZÁRÓLAG ezeket a szavakat/kifejezéseket használd: ${allDayVocab.join(", ")}`;
        if (day.grammar_focus) topic += `. Nyelvtan: ${day.grammar_focus}`;
      } else {
        // Lessons, roleplay, writing: rich topic with grammar + vocab
        const topicParts = [block.topic_seed || day.theme_hu];
        if (block.grammar_focus) topicParts.push(`(${block.grammar_focus})`);
        if (block.vocab_hint?.length) topicParts.push(`Szavak: ${block.vocab_hint.join(", ")}`);
        topic = topicParts.join(" - ");
      }

      return {
        itemKey: `d${day.day}-${block.block_id}`,
        type: mapping.type,
        practiceType: mapping.practiceType || null,
        topic,
        label: block.title_hu,
        estimatedMinutes: block.estimated_minutes,
        contentDepth: block.block_type === "lesson" ? "substantial" : undefined,
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
