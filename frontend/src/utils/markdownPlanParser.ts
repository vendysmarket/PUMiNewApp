import type { StructuredPlan, PlanDay, PlanItem } from "@/types/learningFocus";

/**
 * Parses a markdown plan (from focus-proxy) into a StructuredPlan object.
 * 
 * Expected markdown format:
 * # Plan Title
 * 
 * ## 1. nap — Day Title
 * 
 * Intro paragraph here.
 * 
 * ### Tananyag
 * - **Item 1** — description
 * - **Item 2** — description
 * 
 * ### Feladatok
 * - [ ] Task 1
 * - [ ] Task 2
 */
export function parseMarkdownToPlan(markdown: string): StructuredPlan {
  const lines = markdown.split("\n");
  
  let planTitle = "7 napos terv";
  const days: PlanDay[] = [];
  
  let currentDay: PlanDay | null = null;
  let currentSection: "intro" | "lesson" | "tasks" | null = null;
  let introLines: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Skip empty lines (but track them for intro paragraph detection)
    if (!trimmed) {
      if (currentSection === "intro" && introLines.length > 0) {
        // Empty line might end intro section
      }
      continue;
    }
    
    // Plan title: # Title
    if (trimmed.startsWith("# ") && !trimmed.startsWith("## ")) {
      planTitle = trimmed.slice(2).trim();
      continue;
    }
    
    // Day header: ## 1. nap — Title OR ## Day 1 — Title
    const dayMatch = trimmed.match(/^##\s+(\d+)\.\s*(?:nap|Day)\s*[-—–]\s*(.+)$/i) 
                  || trimmed.match(/^##\s+(?:nap|Day)\s+(\d+)\s*[-—–]\s*(.+)$/i);
    
    if (dayMatch) {
      // Save previous day if exists
      if (currentDay) {
        if (introLines.length > 0) {
          currentDay.intro = introLines.join(" ").trim();
        }
        days.push(currentDay);
      }
      
      // Start new day
      const dayNum = parseInt(dayMatch[1], 10);
      const dayTitle = dayMatch[2].trim();
      
      currentDay = {
        day: dayNum,
        title: dayTitle,
        intro: "",
        items: [],
      };
      
      currentSection = "intro";
      introLines = [];
      continue;
    }
    
    // Section headers: ### Tananyag, ### Lesson, ### Feladatok, ### Tasks
    if (trimmed.startsWith("### ")) {
      const sectionName = trimmed.slice(4).trim().toLowerCase();
      
      // Save intro before moving to new section
      if (currentSection === "intro" && currentDay && introLines.length > 0) {
        currentDay.intro = introLines.join(" ").trim();
        introLines = [];
      }
      
      if (sectionName === "tananyag" || sectionName === "lesson" || sectionName === "lecke") {
        currentSection = "lesson";
      } else if (sectionName === "feladatok" || sectionName === "tasks" || sectionName === "teendők") {
        currentSection = "tasks";
      } else {
        // Unknown section, treat as intro continuation
        currentSection = "intro";
      }
      continue;
    }
    
    // Content lines
    if (currentDay) {
      // List items: - [ ] task OR - item
      if (trimmed.startsWith("- ")) {
        const content = trimmed.slice(2).trim();
        
        // Checkbox task: - [ ] or - [x]
        const checkboxMatch = content.match(/^\[[ x]\]\s*(.+)$/i);
        
        if (checkboxMatch) {
          // This is a task with checkbox
          const taskContent = checkboxMatch[1].trim();
          const itemId = `day${currentDay.day}-task-${currentDay.items.filter(i => i.type === "task").length + 1}`;
          
          currentDay.items.push({
            id: itemId,
            type: "task",
            label: "Feladat",
            content: taskContent,
          });
        } else if (currentSection === "lesson") {
          // This is a lesson/material item
          const itemId = `day${currentDay.day}-lesson-${currentDay.items.filter(i => i.type === "lesson").length + 1}`;
          
          currentDay.items.push({
            id: itemId,
            type: "lesson",
            label: "Tananyag",
            content: content,
          });
        } else if (currentSection === "tasks") {
          // Task without checkbox
          const itemId = `day${currentDay.day}-task-${currentDay.items.filter(i => i.type === "task").length + 1}`;
          
          currentDay.items.push({
            id: itemId,
            type: "task",
            label: "Feladat",
            content: content,
          });
        } else {
          // Default: treat as task
          const itemId = `day${currentDay.day}-task-${currentDay.items.filter(i => i.type === "task").length + 1}`;
          
          currentDay.items.push({
            id: itemId,
            type: "task",
            label: "Feladat",
            content: content,
          });
        }
      } else if (currentSection === "intro") {
        // Regular text line in intro section
        introLines.push(trimmed);
      }
    }
  }
  
  // Don't forget the last day
  if (currentDay) {
    if (introLines.length > 0) {
      currentDay.intro = introLines.join(" ").trim();
    }
    days.push(currentDay);
  }
  
  // If no days were parsed, create a minimal fallback structure
  if (days.length === 0) {
    return {
      title: planTitle,
      days: [
        {
          day: 1,
          title: "Kezdés",
          intro: "Indítsd el a tanulást!",
          items: [
            {
              id: "day1-task-1",
              type: "task",
              label: "Feladat",
              content: "Ismerkedj meg a témával",
            },
          ],
        },
      ],
    };
  }
  
  return {
    title: planTitle,
    days,
  };
}

/**
 * Helper function to extract only lesson items from a day
 */
export function getLessonItems(day: PlanDay): PlanItem[] {
  return day.items.filter(item => item.type === "lesson");
}

/**
 * Helper function to extract only task items from a day
 */
export function getTaskItems(day: PlanDay): PlanItem[] {
  return day.items.filter(item => item.type === "task");
}

/**
 * Check if a day has any lesson content
 */
export function hasLessonContent(day: PlanDay): boolean {
  return day.items.some(item => item.type === "lesson");
}
