import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import type { PracticeTask } from "@/types/learningFocus";

type PracticeTaskWithNotes = PracticeTask & {
  notes?: string;
};

interface PracticeListProps {
  tasks: PracticeTask[];
  onTasksChange?: (tasks: PracticeTask[]) => void;
}

/**
 * Behavior:
 * - Row click: expand/collapse details (notes)
 * - Checkbox click: toggle completed only (doesn't collapse)
 * - Notes are stored per-task in local state (and kept with tasks objects)
 * - Syncs local state if parent provides a new tasks array (e.g. day change)
 */
const PracticeList = ({ tasks, onTasksChange }: PracticeListProps) => {
  const { t } = useTranslation();

  // Stable key per task (prefer id if present, else index-based fallback)
  const keyedIncoming = useMemo(() => {
    return (tasks || []).map((task, idx) => {
      const key = (task as any).id ?? `idx_${idx}`;
      return { key, task };
    });
  }, [tasks]);

  const [localTasks, setLocalTasks] = useState<PracticeTaskWithNotes[]>(
    (tasks || []).map((x) => ({ ...x, notes: (x as any).notes ?? "" })),
  );
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // Keep local state in sync when tasks prop changes (e.g., switching days)
  useEffect(() => {
    setLocalTasks((prev) => {
      const prevByKey = new Map<string, PracticeTaskWithNotes>();
      prev.forEach((p, idx) => {
        const k = (p as any).id ?? `idx_${idx}`;
        prevByKey.set(k, p);
      });

      return keyedIncoming.map(({ key, task }, idx) => {
        const prevTask = prevByKey.get(key);
        return {
          ...task,
          // preserve notes if we had them
          notes: prevTask?.notes ?? (task as any).notes ?? "",
        };
      });
    });

    // If expanded item no longer exists, collapse
    if (expandedKey && !keyedIncoming.some(({ key }) => key === expandedKey)) {
      setExpandedKey(null);
    }
  }, [keyedIncoming, expandedKey]);

  const emit = (updated: PracticeTaskWithNotes[]) => {
    setLocalTasks(updated);
    onTasksChange?.(updated); // compatible: extra fields don't break TS structurally
  };

  const toggleCompletedByIndex = (index: number) => {
    const updated = localTasks.map((task, i) => (i === index ? { ...task, completed: !task.completed } : task));
    emit(updated);
  };

  const toggleExpand = (key: string) => {
    setExpandedKey((cur) => (cur === key ? null : key));
  };

  const updateNotes = (index: number, notes: string) => {
    const updated = localTasks.map((task, i) => (i === index ? { ...task, notes } : task));
    emit(updated);
  };

  if (!localTasks?.length) return null;

  return (
    <div className="w-full">
      <h3 className="text-sm font-medium text-foreground/70 mb-3">{t("practice")}</h3>

      <div className="flex flex-col gap-2">
        {localTasks.map((task, index) => {
          const key = (task as any).id ?? `idx_${index}`;
          const isExpanded = expandedKey === key;

          return (
            <div
              key={key}
              className={[
                "rounded-xl border border-foreground/15 bg-background/5",
                "hover:border-foreground/25 transition-colors",
                isExpanded ? "border-foreground/25" : "",
              ].join(" ")}
            >
              {/* Header row */}
              <div
                className="flex items-start gap-3 px-4 py-3 cursor-pointer select-none"
                onClick={() => toggleExpand(key)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") toggleExpand(key);
                }}
              >
                {/* Checkbox */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCompletedByIndex(index);
                  }}
                  className={[
                    "mt-0.5 w-5 h-5 rounded-full border flex-shrink-0",
                    "flex items-center justify-center transition-colors",
                    task.completed ? "border-foreground/60 bg-foreground/10" : "border-foreground/30",
                  ].join(" ")}
                  aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
                >
                  {task.completed && <div className="w-2 h-2 rounded-full bg-foreground/60" />}
                </button>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p
                    className={[
                      "text-sm font-light leading-relaxed break-words",
                      task.completed ? "text-foreground/50 line-through" : "text-foreground/85",
                    ].join(" ")}
                  >
                    {task.instruction}
                  </p>
                  <p className="text-xs text-foreground/45 mt-1">
                    {isExpanded ? (t("tapToCollapse") ?? "Tap to collapse") : (t("tapToExpand") ?? "Tap to expand")}
                  </p>
                </div>

                {/* Chevron */}
                <div className="text-foreground/40 text-xs mt-1">{isExpanded ? "▲" : "▼"}</div>
              </div>

              {/* Expanded content */}
              {isExpanded ? (
                <div className="px-4 pb-4">
                  <div className="rounded-lg border border-foreground/10 bg-background/10 p-3">
                    <p className="text-xs text-foreground/60 mb-2">{t("notes") ?? "Notes / Answer"}</p>
                    <textarea
                      value={task.notes ?? ""}
                      onChange={(e) => updateNotes(index, e.target.value)}
                      placeholder={t("writeHere") ?? "Write your answer or notes here..."}
                      className={[
                        "w-full min-h-[84px] resize-y rounded-lg",
                        "bg-background/30 border border-foreground/10",
                        "px-3 py-2 text-sm text-foreground/85",
                        "outline-none focus:border-foreground/25",
                      ].join(" ")}
                    />
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-foreground/45">{t("autosaved") ?? "Autosaved"}</p>
                      <button
                        type="button"
                        onClick={() => setExpandedKey(null)}
                        className="text-xs text-foreground/70 hover:text-foreground/90 transition"
                      >
                        {t("done") ?? "Done"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PracticeList;
