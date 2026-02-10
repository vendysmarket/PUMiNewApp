import { MessageSquare, Archive, Sparkles, Lock } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useFocusInProgress } from "@/hooks/useFocusInProgress";
import { useToast } from "@/hooks/use-toast";

const MobileBottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const focusInProgress = useFocusInProgress();
  const { toast } = useToast();

  const isActive = (route: string) => location.pathname === route;

  // Minimal bottom nav - core navigation only (Settings moved to drawer)
  const navItems = [
    { 
      icon: MessageSquare, 
      label: "Chat", 
      route: "/app/chat",
    },
    { 
      icon: Archive, 
      label: "Tár", 
      route: "/app/files",
    },
    { 
      icon: Sparkles, 
      label: "Fókusz", 
      route: "/app/focus",
    },
  ];

  const handleNavClick = (route: string) => {
    // If focus is in progress and trying to navigate away from focus page
    if (focusInProgress && route !== "/app/focus" && location.pathname === "/app/focus") {
      toast({
        title: "Fókusz fut",
        description: "Állítsd le vagy fejezd be a szakaszt a kilépéshez.",
        variant: "destructive",
      });
      return;
    }
    navigate(route);
  };

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-background/95 backdrop-blur-md border-t border-foreground/10 flex items-center justify-around px-4 safe-area-bottom">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.route);
        const isFocusItem = item.route === "/app/focus";
        
        // Lock non-focus items when focus is in progress
        const isLocked = focusInProgress && !isFocusItem && location.pathname === "/app/focus";

        return (
          <button
            key={item.label}
            onClick={() => handleNavClick(item.route)}
            className={cn(
              "relative flex flex-col items-center justify-center p-3 min-w-[64px] min-h-[48px] rounded-lg transition-all",
              isLocked
                ? "text-foreground/20 cursor-not-allowed"
                : active
                  ? "text-foreground/90"
                  : "text-foreground/40 active:text-foreground/70"
            )}
            aria-label={item.label}
          >
            <div className="relative">
              <Icon 
                className={cn(
                  "w-5 h-5",
                  isFocusItem && !isLocked && "text-emerald-400 animate-focus-glow-pulse"
                )} 
                strokeWidth={1.5} 
              />
              {/* Running indicator - pulsing dot */}
              {isFocusItem && focusInProgress && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
              )}
              {/* Beta badge */}
              {isFocusItem && !focusInProgress && (
                <span className="absolute -top-1.5 -right-3.5 px-1 py-0.5 text-[7px] font-medium tracking-wide text-emerald-400 border border-emerald-500/40 rounded-full bg-emerald-500/10 shadow-[0_0_6px_rgba(16,185,129,0.2)]">
                  BETA
                </span>
              )}
              {/* Lock icon for disabled items */}
              {isLocked && (
                <Lock className="absolute -bottom-0.5 -right-0.5 w-3 h-3 text-foreground/30" strokeWidth={2} />
              )}
            </div>
            <span className="text-[10px] mt-0.5 font-light">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};

export default MobileBottomNav;
