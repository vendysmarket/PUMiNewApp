import { SimpleLessonItem } from "@/components/focus/SimpleLessonItem";

export default function TestLazyLoad() {
  return (
    <div className="min-h-screen bg-background p-8">
      <h1 className="text-2xl font-bold text-foreground mb-6">Lazy Loading Teszt</h1>

      <div className="max-w-2xl space-y-4">
        <SimpleLessonItem
          itemId="test-lesson-1"
          label="1. Lecke: Bevezetés"
          topic="Python alapok"
          estimatedMinutes={15}
          dayTitle="1. nap: Python alapok"
          domain="programming"
          level="beginner"
        />

        <SimpleLessonItem
          itemId="test-lesson-2"
          label="2. Lecke: Változók"
          topic="Python változók és típusok"
          estimatedMinutes={20}
          dayTitle="1. nap: Python alapok"
          domain="programming"
          level="beginner"
        />

        <SimpleLessonItem
          itemId="test-lesson-3"
          label="3. Lecke: Ciklusok"
          topic="For és while ciklusok"
          estimatedMinutes={25}
          dayTitle="2. nap: Vezérlési szerkezetek"
          domain="programming"
          level="intermediate"
        />
      </div>
    </div>
  );
}
