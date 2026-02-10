import { useEffect, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";

export type TextPrompt = {
  id?: string;
  title?: string;
  placeholder?: string;
  value?: string;
};

interface TextPromptSectionProps {
  prompts: TextPrompt[];
  onChange: (prompts: TextPrompt[]) => void;
  dimmed?: boolean;
}

export default function TextPromptSection({ prompts, onChange, dimmed }: TextPromptSectionProps) {
  const { t } = useTranslation();
  const [local, setLocal] = useState<TextPrompt[]>(prompts || []);

  useEffect(() => setLocal(prompts || []), [prompts]);

  const setValue = (id: string, v: string) => {
    const next = local.map((p, i) => {
      const pid = p.id ?? String(i);
      return pid === id ? { ...p, value: v } : p;
    });
    setLocal(next);
    onChange(next);
  };

  if (!local.length) return null;

  return (
    <section className={dimmed ? "opacity-50 pointer-events-none" : ""}>
      <h3 className="text-sm font-medium text-foreground/60 mb-2">Write</h3>

      <div className="flex flex-col gap-4">
        {local.map((p, i) => {
          const id = p.id ?? String(i);
          return (
            <div key={id} className="rounded-xl border border-foreground/10 bg-background/10 p-3">
              <p className="text-sm text-foreground/70">{p.title ?? (t("yourAnswer") ?? "Your answer")}</p>
              <textarea
                value={p.value ?? ""}
                onChange={(e) => setValue(id, e.target.value)}
                placeholder={p.placeholder ?? ""}
                className="mt-2 w-full min-h-[96px] resize-y rounded-xl border border-foreground/10 bg-background/30 px-3 py-2 text-sm text-foreground/90 outline-none focus:ring-2 focus:ring-foreground/15"
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
