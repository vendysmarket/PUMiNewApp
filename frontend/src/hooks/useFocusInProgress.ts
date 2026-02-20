// src/hooks/useFocusInProgress.ts
// Hook to check if a focus session is in-progress (for nav lock visuals)

import { useState, useEffect } from "react";

const IN_PROGRESS_KEY = "pumi_focus_in_progress";
const FOCUSROOM_PROGRESS_KEY = "pumi_focusroom_in_progress";

export function useFocusInProgress() {
  const [inProgress, setInProgress] = useState(false);

  useEffect(() => {
    // Initial check — either old focus or new focusroom
    const checkProgress = () => {
      const isInProgress = localStorage.getItem(IN_PROGRESS_KEY) === "1"
        || localStorage.getItem(FOCUSROOM_PROGRESS_KEY) === "1";
      setInProgress(isInProgress);
    };
    
    checkProgress();

    // Listen for storage changes (from other tabs/components)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === IN_PROGRESS_KEY || e.key === FOCUSROOM_PROGRESS_KEY) {
        checkProgress();
      }
    };

    // Listen for custom event (same-tab updates)
    const handleFocusChange = () => {
      checkProgress();
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("focus-progress-changed", handleFocusChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("focus-progress-changed", handleFocusChange);
    };
  }, []);

  return inProgress;
}

// Dispatch event when in-progress changes
export function dispatchFocusProgressChange() {
  window.dispatchEvent(new CustomEvent("focus-progress-changed"));
}
