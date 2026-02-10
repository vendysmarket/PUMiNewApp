import { useState, useEffect, useCallback } from "react";

export interface TaskState {
  [taskId: string]: boolean;
}

const STORAGE_KEY_PREFIX = "pumi_tasks_";

/**
 * Hook to persist task completion state per day in localStorage.
 * @param sessionId - Unique session identifier (use createdAt or similar)
 * @param dayIndex - Current day index
 */
export function useTaskPersistence(sessionId: string | null, dayIndex: number) {
  const storageKey = sessionId ? `${STORAGE_KEY_PREFIX}${sessionId}_day${dayIndex}` : null;
  
  const [taskStates, setTaskStates] = useState<TaskState>({});

  // Load from localStorage on mount or when key changes
  useEffect(() => {
    if (!storageKey) {
      setTaskStates({});
      return;
    }

    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        setTaskStates(JSON.parse(stored));
      } else {
        setTaskStates({});
      }
    } catch {
      setTaskStates({});
    }
  }, [storageKey]);

  // Toggle a task's completion state
  const toggleTask = useCallback((taskId: string) => {
    if (!storageKey) return;

    setTaskStates((prev) => {
      const next = { ...prev, [taskId]: !prev[taskId] };
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }, [storageKey]);

  // Check if a task is completed
  const isTaskCompleted = useCallback((taskId: string): boolean => {
    return taskStates[taskId] === true;
  }, [taskStates]);

  // Get count of completed tasks
  const getCompletedCount = useCallback((taskIds: string[]): number => {
    return taskIds.filter((id) => taskStates[id] === true).length;
  }, [taskStates]);

  return {
    taskStates,
    toggleTask,
    isTaskCompleted,
    getCompletedCount,
  };
}
