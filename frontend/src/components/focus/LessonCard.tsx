import { useTranslation } from "@/hooks/useTranslation";

export type Lesson = {
  title?: string;
  summary?: string;
  bullets?: string[];
  examples?: { input: string; output: string }[];
};

interface LessonCardProps {
  lesson?: Lesson | null;
  dimmed?: boolean;
}

export default function LessonCard({ lesson, dimmed }: LessonCardProps) {
  const { t } = useTranslation();
  if (!lesson) return null;

  const header = t("lesson") ?? "Lesson";
  const title = lesson.title ?? t("todaysLesson") ?? t("today") ?? "Today";
  const exampleLabel = t("example") ?? "Example";

  return (
    <section className={dimmed ? "opacity-50 pointer-events-none" : ""}>
      <h3 className="text-sm font-medium text-foreground/70 mb-2">{header}</h3>

      <div className="rounded-xl border border-foreground/10 bg-background/10 p-4">
        <p className="text-base font-medium text-foreground/90 mb-2">{title}</p>

        {lesson.summary ? <p className="text-sm text-foreground/70 mb-3">{lesson.summary}</p> : null}

        {lesson.bullets?.length ? (
          <ul className="list-disc list-inside text-sm text-foreground/70 space-y-1 mb-3">
            {lesson.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        ) : null}

        {lesson.examples?.length ? (
          <div className="flex flex-col gap-2">
            {lesson.examples.map((ex, i) => (
              <div key={i} className="rounded-lg bg-foreground/5 p-2 text-sm">
                <p className="text-foreground/50 text-xs mb-1">{exampleLabel}</p>
                <p className="text-foreground/80 whitespace-pre-wrap">{ex.input}</p>
                <p className="text-foreground/60 mt-1 whitespace-pre-wrap">{ex.output}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
