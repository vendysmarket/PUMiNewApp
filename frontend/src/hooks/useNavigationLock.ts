// src/hooks/useNavigationLock.ts
// Navigation lock hook - prevents leaving Focus when day is in-progress

import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

export function useNavigationLock(isLocked: boolean) {
  const { toast } = useToast();

  useEffect(() => {
    if (!isLocked) return;

    // Handler for clicks on navigation links
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a');
      
      if (!link) return;
      
      const href = link.getAttribute('href') || '';
      
      // Block navigation to other app sections
      const blockedPaths = [
        '/app/chat',
        '/app/files', 
        '/app/tar',
        '/app/profile',
        '/app/settings',
      ];
      
      const isBlockedPath = blockedPaths.some(path => href.startsWith(path));
      
      if (isBlockedPath) {
        e.preventDefault();
        e.stopPropagation();
        
        toast({
          title: "Fókusz nap fut",
          description: "Előbb fejezd be a napot vagy archiváld a fókuszt.",
          variant: "destructive",
        });
      }
    };

    // Attach click handler to document
    document.addEventListener('click', handleClick, true);

    // Browser navigation warning
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // Cleanup
    return () => {
      document.removeEventListener('click', handleClick, true);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isLocked, toast]);
}
