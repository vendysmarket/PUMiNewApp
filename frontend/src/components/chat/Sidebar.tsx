import { useState, useRef, useEffect } from "react";
import { MessageSquare, Settings, User, Sparkles, Archive, Lock, ChevronDown, Info, History, Trash2, X, ExternalLink, Pencil, Check } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { TranslationKey } from "@/lib/i18n";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useChatSessions } from "@/hooks/useChatSessions";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { useFocusInProgress } from "@/hooks/useFocusInProgress";
import { useToast } from "@/hooks/use-toast";

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { hasPaidAccess } = useAuth();
  const focusInProgress = useFocusInProgress();
  const { toast } = useToast();
  const [prontoOpen, setProntoOpen] = useState(false);
  const [prontoMoreOpen, setProntoMoreOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const { sessions, deleteSession, updateSessionTitle } = useChatSessions();

  type MenuItemKey = "chat" | "focus" | "files" | "profile" | "settings";

  // Define which menu items require paid access
  const paidOnlyItems: MenuItemKey[] = ["focus", "files", "profile"];

  const menuItems: {
    Icon: typeof MessageSquare;
    labelKey: TranslationKey;
    route: string;
    entitlementKey: MenuItemKey;
  }[] = [
    { Icon: MessageSquare, labelKey: "chat", route: "/app/chat", entitlementKey: "chat" },
    { Icon: Sparkles, labelKey: "focus", route: "/app/focus", entitlementKey: "focus" },
    { Icon: Archive, labelKey: "files", route: "/app/files", entitlementKey: "files" },
    { Icon: User, labelKey: "profile", route: "/app/profile", entitlementKey: "profile" },
    { Icon: Settings, labelKey: "settings", route: "/app/settings", entitlementKey: "settings" },
  ];

  const isActive = (route: string) => location.pathname === route;

  // Check access based on AuthContext hasPaidAccess - single source of truth
  const hasAccess = (key: MenuItemKey): boolean => {
    if (paidOnlyItems.includes(key)) {
      return hasPaidAccess;
    }
    return true; // chat and settings always accessible
  };

  // Check if navigation is blocked due to focus in progress
  const isNavBlockedByFocus = (entitlementKey: MenuItemKey): boolean => {
    return focusInProgress && entitlementKey !== "focus" && location.pathname === "/app/focus";
  };

  const handleClick = (route: string, entitlementKey: MenuItemKey) => {
    // Block navigation when focus is in progress (except to focus page)
    if (isNavBlockedByFocus(entitlementKey)) {
      toast({
        title: "Fókusz fut",
        description: "Állítsd le vagy fejezd be a szakaszt a kilépéshez.",
        variant: "destructive",
      });
      return;
    }
    
    if (hasAccess(entitlementKey)) {
      navigate(route);
    }
  };

  const handleLoadSession = (sessionId: string) => {
    navigate(`/app/chat?session=${sessionId}`);
    setHistoryOpen(false);
  };

  const handleDeleteSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    deleteSession(sessionId);
  };

  const handleStartRename = (e: React.MouseEvent, sessionId: string, currentTitle: string) => {
    e.stopPropagation();
    setEditingSessionId(sessionId);
    setEditingTitle(currentTitle);
  };

  const handleSaveRename = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (editingSessionId && editingTitle.trim()) {
      updateSessionTitle(editingSessionId, editingTitle.trim().slice(0, 60));
    }
    setEditingSessionId(null);
    setEditingTitle("");
  };

  const handleCancelRename = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingSessionId(null);
    setEditingTitle("");
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveRename();
    } else if (e.key === "Escape") {
      handleCancelRename();
    }
  };

  // Focus input when editing starts
  useEffect(() => {
    if (editingSessionId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingSessionId]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return "Ma";
    if (days === 1) return "Tegnap";
    if (days < 7) return `${days} napja`;
    return date.toLocaleDateString("hu-HU", { month: "short", day: "numeric" });
  };

  return (
    <TooltipProvider delayDuration={200}>
      {/* Desktop Sidebar - hidden on mobile */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 z-40 flex-col items-center w-16 py-8">
        {/* Navigation icons - centered */}
        <div className="flex flex-col items-center justify-center gap-6 flex-1">
        {menuItems.map(({ Icon, labelKey, route, entitlementKey }) => {
            const itemHasAccess = hasAccess(entitlementKey);
            const isPaidLocked = !itemHasAccess;
            const isFocusBlocked = isNavBlockedByFocus(entitlementKey);
            const isLocked = isPaidLocked || isFocusBlocked;
            const isFocusItem = entitlementKey === "focus";

            return (
              <Tooltip key={labelKey}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => handleClick(route, entitlementKey)}
                    className={cn(
                      "relative p-2 rounded-lg transition-all duration-200 motion-reduce:duration-0 group/focus-btn",
                      isLocked
                        ? "text-foreground/20 cursor-not-allowed"
                        : isActive(route)
                          ? "text-foreground/90 bg-foreground/5 sidebar-item-active-glow"
                          : "text-foreground/40 hover:text-foreground/70 hover:bg-foreground/5"
                    )}
                    aria-label={t(labelKey)}
                  >
                    <Icon 
                      className={cn(
                        "w-5 h-5",
                        isFocusItem && !isLocked && "text-emerald-400 animate-focus-glow-pulse group-hover/focus-btn:[filter:drop-shadow(0_0_10px_rgba(16,185,129,0.6))]"
                      )} 
                      strokeWidth={1.5} 
                    />
                    {/* Running indicator - pulsing dot */}
                    {isFocusItem && focusInProgress && (
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
                    )}
                    {/* Beta badge - only show when not running */}
                    {isFocusItem && !focusInProgress && (
                      <span className="absolute -top-1 -right-2 px-1 py-0.5 text-[8px] font-medium tracking-wide text-emerald-400 border border-emerald-500/40 rounded-full bg-emerald-500/10 shadow-[0_0_6px_rgba(16,185,129,0.2)]">
                        BETA
                      </span>
                    )}
                    {isLocked && (
                      <Lock className="absolute -bottom-0.5 -right-0.5 w-3 h-3 text-foreground/30" strokeWidth={2} />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                  {isPaidLocked 
                    ? <span className="text-amber-400">🔒 Csak előfizetőknek</span> 
                    : isFocusBlocked
                      ? <span className="text-amber-400">🔒 Fókusz fut</span>
                      : t(labelKey)}
                </TooltipContent>
              </Tooltip>
            );
          })}

          {/* Chat History Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setHistoryOpen(true)}
                className={cn(
                  "p-2 rounded-lg transition-all duration-200 motion-reduce:duration-0",
                  historyOpen 
                    ? "text-foreground/90 bg-foreground/5" 
                    : "text-foreground/40 hover:text-foreground/70 hover:bg-foreground/5"
                )}
                aria-label="Beszélgetés előzmények"
              >
                <History className="w-5 h-5" strokeWidth={1.5} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              Beszélgetés előzmények
            </TooltipContent>
          </Tooltip>

          {/* Discord Community Link */}
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href="https://discord.gg/6MZAwGxC"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg text-foreground/40 hover:text-foreground/70 hover:bg-foreground/5 transition-all duration-200 motion-reduce:duration-0"
                aria-label="PUMi – Shared Presence"
              >
                <svg 
                  className="w-5 h-5" 
                  viewBox="0 0 24 24" 
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
              </a>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs flex items-center gap-1.5">
              <span className="font-brand">PUMi</span> – Shared Presence
              <ExternalLink className="w-3 h-3 text-foreground/40" />
            </TooltipContent>
          </Tooltip>
        </div>

        {/* PUMi Core Info - Bottom of sidebar */}
        <div className="mt-auto pt-4">
          <Collapsible open={prontoOpen} onOpenChange={setProntoOpen}>
            <CollapsibleTrigger asChild>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className={cn(
                      "p-2 rounded-lg transition-all duration-200 motion-reduce:duration-0",
                      prontoOpen 
                        ? "text-foreground/70 bg-foreground/5" 
                        : "text-foreground/40 hover:text-foreground/70 hover:bg-foreground/5"
                    )}
                    aria-label="PUMi Core"
                  >
                    <Info className="w-5 h-5" strokeWidth={1.5} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                  PUMi Core
                </TooltipContent>
              </Tooltip>
            </CollapsibleTrigger>
            <CollapsibleContent className="fixed left-16 bottom-6 z-50">
              <div className="bg-background/98 backdrop-blur-md border border-foreground/10 rounded-xl p-5 w-80 shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium tracking-wide text-foreground/90">PUMi Core</h3>
                  <button
                    onClick={() => setProntoOpen(false)}
                    className="p-1 rounded-full text-foreground/40 hover:text-foreground/70 hover:bg-foreground/10 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Description */}
                <div className="space-y-3 text-xs text-foreground/60 leading-relaxed">
                  <p className="text-foreground/70">A <span className="font-brand">PUMi</span> saját nyelvi motorja.</p>
                  
                  <p>
                    Megkülönbözteti a generációs különbségeket, végigvezet projekteken, 
                    fókuszt tart, és pontosan azt a nyelvet beszéli, amit te is.
                  </p>
                  
                  <p>
                    Ért képekhez és fájlokhoz, terveket készít, tanít, rendszerez és gondolkodik veled.
                  </p>
                  
                  <p className="text-foreground/50 italic pt-1">
                    Nem chatbot. Nem asszisztens.
                    <br />
                    Egy társ a mindennapokhoz.
                  </p>
                </div>

                {/* Capabilities section */}
                <Collapsible open={prontoMoreOpen} onOpenChange={setProntoMoreOpen} className="mt-4">
                  <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-foreground/50 hover:text-foreground/70 transition-colors py-1">
                    <ChevronDown className={cn(
                      "w-3 h-3 transition-transform duration-200 motion-reduce:duration-0",
                      prontoMoreOpen && "rotate-180"
                    )} />
                    <span>Képességek</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3 pt-3 border-t border-foreground/10">
                    <p className="text-xs text-foreground/50 mb-2.5">PUMi Core képes:</p>
                    <ul className="text-xs text-foreground/60 space-y-1.5">
                      <li className="flex items-start gap-2">
                        <span className="text-foreground/30 mt-0.5">•</span>
                        <span>feltöltött képek értelmezésére</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-foreground/30 mt-0.5">•</span>
                        <span>fájlok átolvasására és összefoglalására</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-foreground/30 mt-0.5">•</span>
                        <span>projektek lépésről lépésre tervezésére</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-foreground/30 mt-0.5">•</span>
                        <span>tanulás és tutoriálás támogatására</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-foreground/30 mt-0.5">•</span>
                        <span>fókusz és időstruktúra kialakítására</span>
                      </li>
                    </ul>
                    <p className="text-xs text-foreground/40 mt-3 italic">
                      Mindezt a te generációd nyelvén.
                    </p>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </aside>

      {/* Mobile Bottom Navigation is now in MobileBottomNav component */}

      {/* Backdrop for History drawer - covers everything except sidebar */}
      {historyOpen && (
        <div 
          className="fixed inset-0 md:left-16 bg-black/30 z-[55] overlay-fade-enter motion-reduce:animate-none" 
          onClick={() => setHistoryOpen(false)} 
        />
      )}

      {/* History Slide-in Drawer - positioned after sidebar on desktop, full width on mobile */}
      <div
        className={cn(
          "fixed top-0 left-0 md:left-16 h-full w-full md:w-80 bg-background border-r border-foreground/10 z-[60] transition-all duration-200 ease-out drawer-shadow-right",
          historyOpen 
            ? "translate-x-0 opacity-100 pointer-events-auto" 
            : "-translate-x-full opacity-0 pointer-events-none"
        )}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-foreground/10">
          <h2 className="text-sm font-light tracking-wider text-foreground/80">BESZÉLGETÉS ELŐZMÉNYEK</h2>
          <button
            onClick={() => setHistoryOpen(false)}
            className="p-1.5 rounded-full hover:bg-foreground/10 transition-colors"
          >
            <X className="w-4 h-4 text-foreground/50" />
          </button>
        </div>

        {/* Drawer Content */}
        <ScrollArea className="h-[calc(100%-70px)]">
          <div className="p-4">
            {sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <History className="w-12 h-12 text-foreground/20 mb-4" />
                <p className="text-sm text-foreground/40">
                  Még nincsenek beszélgetéseid.
                </p>
                <p className="text-xs text-foreground/30 mt-2">
                  A lezárt témák itt jelennek meg
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    onClick={() => editingSessionId !== session.id && handleLoadSession(session.id)}
                    className={cn(
                      "w-full text-left p-3 rounded-lg border border-foreground/10 hover:border-foreground/20 hover:bg-foreground/5 transition-colors group",
                      editingSessionId !== session.id && "cursor-pointer"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {editingSessionId === session.id ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              ref={editInputRef}
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onKeyDown={handleRenameKeyDown}
                              onBlur={() => handleSaveRename()}
                              className="h-7 text-sm px-2 bg-foreground/5 border-foreground/20"
                              maxLength={60}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <button
                              onClick={handleSaveRename}
                              className="p-1 rounded hover:bg-foreground/10 transition-colors"
                              aria-label="Mentés"
                            >
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            </button>
                            <button
                              onClick={handleCancelRename}
                              className="p-1 rounded hover:bg-foreground/10 transition-colors"
                              aria-label="Mégse"
                            >
                              <X className="w-3.5 h-3.5 text-foreground/40" />
                            </button>
                          </div>
                        ) : (
                          <p className="text-sm text-foreground/80 truncate font-medium">
                            {session.title}
                          </p>
                        )}
                        <p className="text-xs text-foreground/40 mt-1">
                          {formatDate(session.updatedAt)}
                        </p>
                      </div>
                      {editingSessionId !== session.id && (
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={(e) => handleStartRename(e, session.id, session.title)}
                            className="p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-foreground/10 transition-all"
                            aria-label="Átnevezés"
                          >
                            <Pencil className="w-3.5 h-3.5 text-foreground/40 hover:text-foreground/70" />
                          </button>
                          <button
                            onClick={(e) => handleDeleteSession(e, session.id)}
                            className="p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-foreground/10 transition-all"
                            aria-label="Törlés"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-foreground/40 hover:text-red-400" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
};

export default Sidebar;
