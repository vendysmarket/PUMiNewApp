import { MessageSquare, Archive, Sparkles, User, Settings, ExternalLink, LogOut, LogIn } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import pumiLogo from "@/assets/pumi-logo.png";

interface MobileDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MobileDrawer = ({ open, onOpenChange }: MobileDrawerProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoggedIn, logout } = useAuth();

  const isActive = (route: string) => location.pathname === route;

  const handleNavigate = (route: string) => {
    navigate(route);
    onOpenChange(false);
  };

  const handleLogin = () => {
    navigate("/login");
    onOpenChange(false);
  };

  const handleLogout = async () => {
    await logout();
    onOpenChange(false);
  };

  // All navigation items - single source of truth for mobile menu
  const navItems = [
    {
      icon: MessageSquare,
      label: "Chat",
      route: "/app/chat",
      requiresAuth: false,
    },
    {
      icon: Archive,
      label: "Fájlok / Tár",
      route: "/app/files",
      requiresAuth: false,
    },
    {
      icon: Sparkles,
      label: "Fókusz",
      route: "/app/focus",
      requiresAuth: false,
    },
    {
      icon: User,
      label: "Profil",
      route: "/app/profile",
      requiresAuth: true,
    },
    {
      icon: Settings,
      label: "Beállítások",
      route: "/app/settings",
      requiresAuth: false,
    },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side="left" 
        className="w-[280px] px-0 pb-8 pt-4 bg-background/95 backdrop-blur-xl border-r border-foreground/10"
      >
        {/* Header with logo */}
        <SheetHeader className="px-6 pb-6 border-b border-foreground/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src={pumiLogo} alt="" className="w-5 h-5 opacity-80" />
              {/* TODO: Replace with a real pixel font like "Press Start 2P" or "VT323" when imported */}
              <SheetTitle className="text-sm font-light tracking-[0.2em] text-foreground/80 font-brand">
                PUMi
              </SheetTitle>
            </div>
          </div>
        </SheetHeader>

        {/* Navigation items */}
        <div className="py-4">
          {navItems.map((item, index) => {
            const Icon = item.icon;
            const shouldHide = item.requiresAuth && !isLoggedIn;
            
            if (shouldHide) return null;

            const active = isActive(item.route);

            return (
              <button
                key={index}
                onClick={() => handleNavigate(item.route)}
                className={cn(
                  "w-full flex items-center gap-4 px-6 py-4 min-h-[52px] transition-colors",
                  active 
                    ? "text-foreground/90 bg-foreground/5" 
                    : "text-foreground/70 active:bg-foreground/5 hover:bg-foreground/5"
                )}
              >
                <Icon className="w-5 h-5" strokeWidth={1.5} />
                <span className="text-sm font-light">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div className="mx-6 border-t border-foreground/10" />

        {/* Discord link */}
        <div className="py-2">
          <button
            onClick={() => {
              window.open("https://discord.gg/6MZAwGxC", "_blank");
              onOpenChange(false);
            }}
            className="w-full flex items-center gap-4 px-6 py-4 min-h-[52px] transition-colors text-foreground/70 active:bg-foreground/5 hover:bg-foreground/5"
          >
            <svg 
              className="w-5 h-5" 
              viewBox="0 0 24 24" 
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
            <span className="text-sm font-light">Discord Közösség</span>
            <ExternalLink className="w-4 h-4 text-foreground/30 ml-auto" />
          </button>
        </div>

        {/* Divider */}
        <div className="mx-6 border-t border-foreground/10" />

        {/* Auth actions at bottom */}
        <div className="py-2">
          {isLoggedIn ? (
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-4 px-6 py-4 min-h-[52px] transition-colors text-foreground/70 active:bg-foreground/5 hover:bg-foreground/5"
            >
              <LogOut className="w-5 h-5" strokeWidth={1.5} />
              <span className="text-sm font-light">Kilépés</span>
            </button>
          ) : (
            <button
              onClick={handleLogin}
              className="w-full flex items-center gap-4 px-6 py-4 min-h-[52px] transition-colors text-foreground/70 active:bg-foreground/5 hover:bg-foreground/5"
            >
              <LogIn className="w-5 h-5" strokeWidth={1.5} />
              <span className="text-sm font-light">Belépés</span>
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MobileDrawer;
