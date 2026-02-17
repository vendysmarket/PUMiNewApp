import { useState } from "react";
import { BookOpen, Lightbulb, AlertTriangle, CheckCircle2, Languages, MessageSquare, GraduationCap, Sparkles, Type, Eye, Zap } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { LessonContent } from "@/types/focusItem";
import { CharacterCanvas } from "./CharacterCanvas";

interface LessonRendererProps {
  content: LessonContent;
  onValidationChange: (state: { itemsCompleted: number }) => void;
}

export function LessonRenderer({ content, onValidationChange }: LessonRendererProps) {
  const [read, setRead] = useState(false);
  const [microAnswer, setMicroAnswer] = useState("");
  const [exerciseAnswers, setExerciseAnswers] = useState<Record<string, string>>({});
  const [showAnswers, setShowAnswers] = useState<Record<string, boolean>>({});

  const isLanguageLesson = content.content_type === "language_lesson";
  const isNonLatinBeginner = content.content_type === "language_nonlatin_beginner";

  const handleMarkRead = () => {
    setRead(true);
    onValidationChange({ itemsCompleted: 1 });
  };

  const markReadButton = !read ? (
    <button
      onClick={handleMarkRead}
      className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 flex items-center justify-center gap-2"
    >
      <CheckCircle2 className="w-4 h-4" />
      Elolvastam
    </button>
  ) : (
    <div className="flex items-center gap-2 text-green-600 dark:text-green-400 justify-center py-2">
      <CheckCircle2 className="w-4 h-4" />
      <span className="text-sm font-medium">Elolvasva</span>
    </div>
  );

  // ── Non-Latin Beginner Flow Layout ──
  if (isNonLatinBeginner && content.lesson_flow && content.lesson_flow.length > 0) {
    const flowTypeIcon = (type: string) => {
      switch (type) {
        case "hook": return <Eye className="w-4 h-4 text-violet-500" />;
        case "pattern": return <Type className="w-4 h-4 text-blue-500" />;
        case "meaning": return <Languages className="w-4 h-4 text-green-500" />;
        case "practice": case "micro": return <Zap className="w-4 h-4 text-amber-500" />;
        default: return <Lightbulb className="w-4 h-4 text-primary" />;
      }
    };

    const flowTypeColor = (type: string) => {
      switch (type) {
        case "hook": return "violet";
        case "pattern": return "blue";
        case "meaning": return "green";
        case "practice": case "micro": return "amber";
        default: return "primary";
      }
    };

    return (
      <div className="space-y-4">
        {content.lesson_flow.map((flowItem, fi) => {
          const color = flowTypeColor(flowItem.type);
          return (
            <div key={fi} className={`rounded-lg border border-${color}-500/20 overflow-hidden`}>
              {/* Flow card header */}
              <div className={`flex items-center gap-2 p-3 bg-${color}-500/10`}>
                {flowTypeIcon(flowItem.type)}
                <span className="text-sm font-medium">{flowItem.title_hu}</span>
              </div>

              <div className="p-4 space-y-3">
                {/* Body text */}
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{flowItem.body_md}</ReactMarkdown>
                </div>

                {/* Letters/Characters display */}
                {flowItem.letters && flowItem.letters.length > 0 && (
                  flowItem.type === "pattern" ? (
                    /* Pattern block: drawing canvas for each letter */
                    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(flowItem.letters.length, 2)}, 1fr)` }}>
                      {flowItem.letters.map((letter, li) => (
                        <div key={li} className="flex flex-col items-center p-3 rounded-lg bg-foreground/[0.03] border border-foreground/10">
                          <CharacterCanvas
                            targetGlyph={letter.glyph}
                            latinHint={letter.latin_hint}
                            size={140}
                          />
                          <span className="text-xs text-muted-foreground text-center mt-1">{letter.sound_hint_hu}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* Other blocks: static glyph display */
                    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(flowItem.letters.length, 3)}, 1fr)` }}>
                      {flowItem.letters.map((letter, li) => (
                        <div key={li} className="flex flex-col items-center p-4 rounded-lg bg-foreground/[0.03] border border-foreground/10">
                          <span className="text-4xl font-bold mb-2">{letter.glyph}</span>
                          <span className="text-sm font-medium text-primary">{letter.latin_hint}</span>
                          <span className="text-xs text-muted-foreground text-center mt-1">{letter.sound_hint_hu}</span>
                        </div>
                      ))}
                    </div>
                  )
                )}

                {/* Practice items (prompt → answer) — skip for pattern (canvas is enough) */}
                {flowItem.type !== "pattern" && flowItem.items && flowItem.items.length > 0 && (
                  <div className="space-y-2">
                    {flowItem.items.map((item, ii) => {
                      const key = `flow-${fi}-${ii}`;
                      return (
                        <div key={ii} className="flex flex-col gap-1">
                          <span className="text-sm">{item.prompt}</span>
                          <input
                            type="text"
                            value={exerciseAnswers[key] || ""}
                            onChange={(e) => setExerciseAnswers(prev => ({ ...prev, [key]: e.target.value }))}
                            placeholder="Válaszod..."
                            className="w-full px-2 py-1 rounded border border-foreground/20 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                          />
                          {showAnswers[key] && (
                            <span className="text-xs text-green-600 dark:text-green-400">Helyes: {item.answer}</span>
                          )}
                          {exerciseAnswers[key] && !showAnswers[key] && (
                            <button
                              onClick={() => setShowAnswers(prev => ({ ...prev, [key]: true }))}
                              className="text-xs text-primary hover:underline self-start"
                            >
                              Megoldás mutatása
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Key Points (if present) */}
        {content.key_points && content.key_points.length > 0 && (
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Összefoglalás</span>
            </div>
            <ul className="space-y-1">
              {content.key_points.map((point, i) => (
                <li key={i} className="text-sm text-foreground flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {markReadButton}
      </div>
    );
  }

  // ── Language Lesson Layout ──
  if (isLanguageLesson) {
    return (
      <div className="space-y-5">
        {/* Introduction */}
        {content.introduction && (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown>{content.introduction}</ReactMarkdown>
          </div>
        )}

        {/* Vocabulary Table */}
        {content.vocabulary_table && content.vocabulary_table.length > 0 && (
          <div className="rounded-lg border border-primary/20 overflow-hidden">
            <div className="flex items-center gap-2 p-3 bg-primary/10">
              <Languages className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Szószedet</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-foreground/10 bg-foreground/[0.03]">
                    <th className="text-left p-2 font-medium">Szó</th>
                    <th className="text-left p-2 font-medium">Fordítás</th>
                    <th className="text-left p-2 font-medium">Példa</th>
                  </tr>
                </thead>
                <tbody>
                  {content.vocabulary_table.map((entry, i) => (
                    <tr key={i} className="border-b border-foreground/5 hover:bg-foreground/[0.02]">
                      <td className="p-2 font-medium">
                        {entry.word}
                        {entry.pronunciation && (
                          <span className="text-xs text-muted-foreground ml-1">[{entry.pronunciation}]</span>
                        )}
                      </td>
                      <td className="p-2 text-muted-foreground">{entry.translation}</td>
                      <td className="p-2">
                        <div className="text-xs italic">{entry.example_sentence}</div>
                        <div className="text-xs text-muted-foreground">{entry.example_translation}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Grammar Explanation */}
        {content.grammar_explanation && (
          <div className="p-4 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
            <div className="flex items-center gap-2 mb-3">
              <GraduationCap className="w-4 h-4 text-indigo-500" />
              <span className="text-sm font-medium">{content.grammar_explanation.rule_title}</span>
            </div>
            <div className="prose prose-sm dark:prose-invert max-w-none mb-3">
              <ReactMarkdown>{content.grammar_explanation.explanation}</ReactMarkdown>
            </div>
            {content.grammar_explanation.formation_pattern && (
              <div className="p-2 rounded bg-indigo-500/10 text-sm font-mono mb-3">
                {content.grammar_explanation.formation_pattern}
              </div>
            )}
            {content.grammar_explanation.examples.length > 0 && (
              <div className="space-y-2">
                {content.grammar_explanation.examples.map((ex, i) => (
                  <div key={i} className="flex flex-col gap-0.5 p-2 rounded bg-background/50">
                    <span className="text-sm font-medium">{ex.target}</span>
                    <span className="text-sm text-muted-foreground">{ex.hungarian}</span>
                    {ex.note && <span className="text-xs text-indigo-400">{ex.note}</span>}
                  </div>
                ))}
              </div>
            )}
            {content.grammar_explanation.exceptions && content.grammar_explanation.exceptions.length > 0 && (
              <div className="mt-3 p-2 rounded bg-amber-500/10 border border-amber-500/20">
                <span className="text-xs font-medium text-amber-500">Kivétel(ek):</span>
                <ul className="mt-1 space-y-1">
                  {content.grammar_explanation.exceptions.map((exc, i) => (
                    <li key={i} className="text-xs text-foreground">{exc}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Dialogues */}
        {content.dialogues && content.dialogues.length > 0 && content.dialogues.map((dialogue, di) => (
          <div key={di} className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-medium">{dialogue.title}</span>
            </div>
            {dialogue.context && (
              <p className="text-xs text-muted-foreground mb-3 italic">{dialogue.context}</p>
            )}
            <div className="space-y-2">
              {dialogue.lines.map((line, li) => (
                <div key={li} className={`flex flex-col p-2 rounded ${
                  line.speaker === "A" ? "bg-blue-500/10 mr-8" : "bg-green-500/10 ml-8"
                }`}>
                  <span className="text-xs font-medium text-foreground/60">{line.speaker}</span>
                  <span className="text-sm font-medium">{line.text}</span>
                  <span className="text-xs text-muted-foreground">{line.translation}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Cultural Note */}
        {content.cultural_note && (
          <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-purple-500" />
              <span className="text-sm font-medium">Kulturális érdekesség</span>
            </div>
            <p className="text-sm">{content.cultural_note}</p>
          </div>
        )}

        {/* Practice Exercises */}
        {content.practice_exercises && content.practice_exercises.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-green-500" />
              <span className="text-sm font-medium">Gyakorlás</span>
            </div>
            {content.practice_exercises.map((exercise, ei) => (
              <div key={ei} className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <p className="text-sm font-medium mb-2">{exercise.instruction}</p>
                <div className="space-y-2">
                  {exercise.items.map((exItem, ii) => {
                    const key = `${ei}-${ii}`;
                    return (
                      <div key={ii} className="flex flex-col gap-1">
                        <span className="text-sm">{exItem.prompt}</span>
                        <input
                          type="text"
                          value={exerciseAnswers[key] || ""}
                          onChange={(e) => setExerciseAnswers(prev => ({ ...prev, [key]: e.target.value }))}
                          placeholder="Válaszod..."
                          className="w-full px-2 py-1 rounded border border-foreground/20 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                        {showAnswers[key] && (
                          <span className="text-xs text-green-600 dark:text-green-400">Helyes: {exItem.answer}</span>
                        )}
                        {exerciseAnswers[key] && !showAnswers[key] && (
                          <button
                            onClick={() => setShowAnswers(prev => ({ ...prev, [key]: true }))}
                            className="text-xs text-primary hover:underline self-start"
                          >
                            Megoldás mutatása
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Key Points (summary) */}
        {content.key_points && content.key_points.length > 0 && (
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Összefoglalás</span>
            </div>
            <ul className="space-y-1">
              {content.key_points.map((point, i) => (
                <li key={i} className="text-sm text-foreground flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Common Mistakes */}
        {content.common_mistakes && content.common_mistakes.length > 0 && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-medium">Gyakori hibák</span>
            </div>
            <ul className="space-y-1">
              {content.common_mistakes.map((mistake, i) => (
                <li key={i} className="text-sm text-foreground flex items-start gap-2">
                  <span className="text-amber-500 mt-0.5">!</span>
                  <span>{mistake}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {markReadButton}
      </div>
    );
  }

  // ── Non-Language Fallback (existing layout) ──
  return (
    <div className="space-y-4">
      {content.summary && (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown>{content.summary}</ReactMarkdown>
        </div>
      )}

      {content.key_points && content.key_points.length > 0 && (
        <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">Kulcspontok</span>
          </div>
          <ul className="space-y-1">
            {content.key_points.map((point, i) => (
              <li key={i} className="text-sm text-foreground flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {content.example && (
        <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-medium">Példa</span>
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown>{content.example}</ReactMarkdown>
          </div>
        </div>
      )}

      {content.common_mistakes && content.common_mistakes.length > 0 && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-medium">Gyakori hibák</span>
          </div>
          <ul className="space-y-1">
            {content.common_mistakes.map((mistake, i) => (
              <li key={i} className="text-sm text-foreground flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">!</span>
                <span>{mistake}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {content.micro_task && (
        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <p className="text-sm font-medium mb-2">{content.micro_task.instruction}</p>
          <textarea
            value={microAnswer}
            onChange={(e) => setMicroAnswer(e.target.value)}
            placeholder="Írd ide a válaszod..."
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-foreground/20 bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {content.micro_task.expected_output && microAnswer.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Elvárt válasz: {content.micro_task.expected_output}
            </p>
          )}
        </div>
      )}

      {markReadButton}
    </div>
  );
}
