import { Flame, Archive, X, LogIn, LogOut, Sparkles, Plus, Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getTranslation, Language } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import pumiLogo from "@/assets/pumi-logo.png";
import MobileDrawer from "./MobileDrawer";

// Stripe Payment Links with 7-day trial
const STRIPE_LINK_GENZ = "https://buy.stripe.com/9B628ralU03W29mbTXbbG03";
const STRIPE_LINK_MILLENIAL = "https://buy.stripe.com/dRm14n2Ts9Ew3dqaPTbbG04";

interface SavedFile {
  id: string;
  name: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
}

const TopBar = () => {
  const { isLoggedIn, tier, hasPaidAccess, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isOnChatPage = location.pathname === "/app/chat";

  const [streak, setStreak] = useState<number>(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [lang, setLang] = useState<Language>("hu");
  const [tarOpen, setTarOpen] = useState(false);
  const [savedItems, setSavedItems] = useState<SavedFile[]>([]);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // One-time migration: merge emoria_tar_items into emoria_files
  useEffect(() => {
    const migrationDone = localStorage.getItem("emoria_tar_migration_done");
    if (migrationDone) return;

    const oldTarItems = localStorage.getItem("emoria_tar_items");
    if (oldTarItems) {
      try {
        const tarItems = JSON.parse(oldTarItems) as { title?: string; content?: string; date?: string }[];
        if (tarItems.length > 0) {
          const existingFiles = JSON.parse(localStorage.getItem("emoria_files") || "[]") as SavedFile[];

          // Convert old tar items to new file format and merge
          const migratedItems: SavedFile[] = tarItems.map((item, idx) => ({
            id: crypto.randomUUID(),
            name: item.title || `Mentett elem ${idx + 1}`,
            content: item.content || "",
            createdAt: item.date || new Date().toISOString(),
          }));

          const mergedFiles = [...existingFiles, ...migratedItems];
          localStorage.setItem("emoria_files", JSON.stringify(mergedFiles));

          // Remove old key
          localStorage.removeItem("emoria_tar_items");
        }
      } catch (e) {
        console.error("Migration error:", e);
      }
    }

    localStorage.setItem("emoria_tar_migration_done", "true");
  }, []);

  const refreshValues = () => {
    const storedStreak = parseInt(localStorage.getItem("emoria_focus_streak") || "0", 10);
    const storedLang = (localStorage.getItem("emoria_lang") as Language) || "hu";
    setStreak(storedStreak);
    setLang(storedLang);

    // Load saved items from emoria_files (same key as /app/files)
    const storedItems = localStorage.getItem("emoria_files");
    if (storedItems) {
      try {
        const parsed = JSON.parse(storedItems) as SavedFile[];
        // Sort by createdAt descending (newest first)
        parsed.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setSavedItems(parsed);
      } catch (e) {
        setSavedItems([]);
      }
    } else {
      setSavedItems([]);
    }
  };

  useEffect(() => {
    refreshValues();

    const handleStorageChange = () => {
      refreshValues();
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("emoria_entitlements_update", handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("emoria_entitlements_update", handleStorageChange);
    };
  }, []);

  const handleLogin = () => {
    navigate("/login");
  };

  const handleLogout = async () => {
    await logout();
  };

  const handleUpgrade = (stripeLink: string) => {
    setUpgradeOpen(false);
    // Open Stripe payment link in new tab
    window.open(stripeLink, "_blank");
  };

  // Tier display label and styling
  const getTierDisplay = () => {
    if (tier === "FREE") {
      return { label: "FREE", className: "border-amber-500/30 text-amber-500/70" };
    }
    if (tier === "GEN_Z") {
      return { label: "GEN Z", className: "border-emerald-500/30 text-emerald-500/70" };
    }
    if (tier === "MILLENIAL") {
      return { label: "MILLENNIAL", className: "border-blue-500/30 text-blue-500/70" };
    }
    return { label: tier, className: "border-foreground/20 text-foreground/70" };
  };

  const tierDisplay = getTierDisplay();
  const isFree = !hasPaidAccess;

  const t = (key: Parameters<typeof getTranslation>[1]) => getTranslation(lang, key);

  return (
    <>
      <header className="fixed top-0 left-0 md:left-16 right-0 z-50 h-14 md:h-20 flex items-center justify-between px-4 md:px-8 bg-gradient-to-b from-background via-background/95 to-transparent">
        <div className="flex items-center gap-2 md:gap-2">
          {/* Mobile hamburger menu */}
          <button
            onClick={() => setMobileDrawerOpen(true)}
            className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg text-foreground/60 hover:text-foreground/80 hover:bg-foreground/5 transition-colors"
            aria-label="Menu"
          >
            <Menu className="w-5 h-5" strokeWidth={1.5} />
          </button>
          
          <img src={pumiLogo} alt="" className="w-4 h-4 md:w-5 md:h-5 opacity-80" />
          {/* TODO: Replace with a real pixel font like "Press Start 2P" or "VT323" when imported */}
          <span className="text-xs md:text-sm font-light tracking-[0.2em] md:tracking-[0.3em] text-foreground/80 font-brand">
            PUMi
          </span>
        </div>

        <div className="flex items-center gap-1.5 md:gap-2 flex-nowrap">
          {/* Tier pill - always visible */}
          <button
            onClick={() => setModalOpen(true)}
            className={cn(
              "flex items-center h-7 md:h-8 px-2.5 md:px-4 rounded-full border text-[10px] md:text-xs font-light tracking-wider transition-all cursor-pointer hover:opacity-80 shrink-0",
              tierDisplay.className,
            )}
          >
            {tierDisplay.label}
          </button>

          {/* Streak counter - only show for paid users */}
          {!isFree && (
            <div className="flex items-center gap-1 md:gap-2 h-7 md:h-8 px-2.5 md:px-4 rounded-full border border-foreground/20 shrink-0">
              <Flame className="w-3 h-3 md:w-3.5 md:h-3.5 text-foreground/70" />
              <span className="text-[10px] md:text-xs font-light text-foreground/70">{streak}</span>
            </div>
          )}

          {/* New chat button - visible on chat page */}
          {isOnChatPage && (
            <>
              {/* Mobile: icon only */}
              <button
                onClick={() => navigate("/app/chat?new=true")}
                className="md:hidden flex items-center justify-center h-7 w-7 rounded-full border border-foreground/20 text-foreground/60 active:bg-foreground/10 transition-all cursor-pointer shrink-0"
                aria-label="Új beszélgetés"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              {/* Desktop: icon + text */}
              <button
                onClick={() => navigate("/app/chat?new=true")}
                className="hidden md:flex items-center justify-center gap-2 h-8 px-4 rounded-full border border-foreground/20 text-foreground/60 hover:border-foreground/40 hover:bg-foreground/5 transition-all cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="text-xs font-light tracking-wider">Új beszélgetés</span>
              </button>
            </>
          )}
          {isLoggedIn && isFree && (
            <button
              onClick={() => setUpgradeOpen(true)}
              className="hidden md:flex items-center gap-2 h-8 px-4 rounded-full border border-emerald-500/30 text-emerald-500/70 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all cursor-pointer shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="text-xs font-light tracking-wider">{lang === "hu" ? "Frissítés" : "Upgrade"}</span>
            </button>
          )}

          {/* Login button for non-logged-in users - desktop only (drawer handles mobile) */}
          {!isLoggedIn && (
            <button
              onClick={handleLogin}
              className="hidden md:flex items-center justify-center gap-2 h-8 px-4 rounded-full border border-foreground/20 text-foreground/60 hover:border-foreground/40 hover:bg-foreground/5 transition-all cursor-pointer shrink-0"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span className="text-xs font-light tracking-wider">
                {lang === "hu" ? "Belépés" : "Log in"}
              </span>
            </button>
          )}

          {/* Logout button for logged-in users - desktop only (drawer handles mobile) */}
          {isLoggedIn && (
            <button
              onClick={handleLogout}
              className="hidden md:flex items-center justify-center gap-2 h-8 px-4 rounded-full border border-foreground/20 text-foreground/60 hover:border-foreground/40 hover:bg-foreground/5 transition-all cursor-pointer shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="text-xs font-light tracking-wider">
                {lang === "hu" ? "Kilépés" : "Log out"}
              </span>
            </button>
          )}

          {/* Archive button - desktop only, items exist */}
          {savedItems.length > 0 && (
            <button
              onClick={() => setTarOpen(true)}
              className="hidden md:flex items-center justify-center gap-2 h-8 px-4 rounded-full border border-foreground/20 text-foreground/60 hover:border-foreground/40 hover:bg-foreground/5 transition-all cursor-pointer shrink-0"
            >
              <Archive className="w-3.5 h-3.5" />
              <span className="text-xs font-light tracking-wider">
                {lang === "hu" ? "Tár" : "Archive"}
              </span>
            </button>
          )}
        </div>
      </header>

      {/* Mobile Drawer for secondary navigation */}
      <MobileDrawer
        open={mobileDrawerOpen}
        onOpenChange={setMobileDrawerOpen}
      />

      {/* Tár side panel with backdrop */}
      <div
        className={cn(
          "fixed top-0 right-0 h-full w-full md:w-80 z-[60] bg-background border-l border-foreground/20 p-6 overflow-y-auto transition-transform duration-300",
          tarOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-light tracking-wide text-foreground">{lang === "hu" ? "Tár" : "Archive"}</h2>
          <button
            onClick={() => setTarOpen(false)}
            className="p-1 rounded-full hover:bg-foreground/5 text-foreground/60"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-3">
          {savedItems.length === 0 ? (
            <p className="text-sm text-foreground/40 text-center py-8">
              {lang === "hu" ? "Nincs mentett elem" : "No saved items"}
            </p>
          ) : (
            <div className="space-y-2">
              {savedItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    setTarOpen(false);
                    navigate(`/app/files?id=${item.id}`);
                  }}
                  className="p-3 rounded-lg border border-foreground/10 hover:border-foreground/30 hover:bg-foreground/5 transition-all cursor-pointer"
                >
                  <p className="text-sm text-foreground/80 line-clamp-2">{item.name || "Mentett elem"}</p>
                  <p className="text-xs text-foreground/40 mt-1">
                    {new Date(item.updatedAt || item.createdAt).toLocaleDateString("hu-HU", {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Backdrop for Tár panel */}
      {tarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-[55] overlay-fade-enter motion-reduce:animate-none"
          onClick={() => setTarOpen(false)}
        />
      )}

      {/* Tier Info Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[340px] bg-background border border-foreground/20">
          <DialogHeader>
            <DialogTitle className="text-center font-light tracking-wide text-foreground">
              {!isLoggedIn ? "Jelentkezz be az EMORIA-ba" : "Jelenlegi előfizetésed"}
            </DialogTitle>
          </DialogHeader>

          <div className="py-4 space-y-4">
            {!isLoggedIn ? (
              <p className="text-sm text-center text-foreground/60">hogy elkezdhessük.</p>
            ) : (
              <>
                {/* Tier pill */}
                <div className="text-center">
                  <span
                    className={cn(
                      "inline-block px-6 py-2 rounded-full border text-sm font-medium",
                      tierDisplay.className,
                    )}
                  >
                    {tierDisplay.label}
                  </span>
                </div>

                {/* Features list based on tier */}
                <ul className="text-sm text-foreground/60 space-y-1.5 pl-4">
                  {tier === "FREE" && (
                    <>
                      <li>• Korlátozott chat.</li>
                      <li>• Fókusz mód nem elérhető.</li>
                      <li>• Memória nem elérhető.</li>
                    </>
                  )}
                  {tier === "GEN_Z" && (
                    <>
                      <li>• Korlátlan chat.</li>
                      <li>• Fókusz mód elérhető.</li>
                      <li>• Memória elérhető.</li>
                      <li>• GEN Z hangolás.</li>
                    </>
                  )}
                  {tier === "MILLENIAL" && (
                    <>
                      <li>• Korlátlan chat.</li>
                      <li>• Fókusz mód elérhető.</li>
                      <li>• Memória elérhető.</li>
                      <li>• Millenial hangolás.</li>
                    </>
                  )}
                </ul>
              </>
            )}
          </div>

          <DialogFooter className="flex flex-col gap-2 sm:flex-col">
            {!isLoggedIn ? (
              <Button
                onClick={() => {
                  setModalOpen(false);
                  handleLogin();
                }}
                className="w-full bg-foreground text-background hover:bg-foreground/90"
              >
                Belépés
              </Button>
            ) : (
              <>
                <Button
                  onClick={() => {
                    setModalOpen(false);
                    navigate("/app/subscription");
                  }}
                  className="w-full bg-foreground text-background hover:bg-foreground/90"
                >
                  Előfizetés módosítása
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setModalOpen(false)}
                  className="w-full text-foreground/70 hover:text-foreground"
                >
                  Bezárás
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upgrade Modal */}
      <Dialog open={upgradeOpen} onOpenChange={setUpgradeOpen}>
        <DialogContent className="sm:max-w-[400px] bg-background border border-foreground/20">
          <DialogHeader>
            <DialogTitle className="text-center font-light tracking-wide text-foreground">Válassz csomagot</DialogTitle>
          </DialogHeader>

          <div className="py-4 space-y-3">
            {/* GEN Z Plan */}
            <div className="p-4 rounded-lg border border-emerald-500/30 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all text-left group">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-emerald-500/90 group-hover:text-emerald-500">GEN Z</h3>
                  <p className="text-xs text-foreground/50 mt-1.5 leading-relaxed">
                    Tinédzsereknek és fiatal felnőtteknek.
                    <br />
                    Akiknek szükségük van jelenlétre,
                    <br />
                    fókuszra és digitális nyomás kezelésére.
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-lg font-light text-emerald-500/90">€5</span>
                  <span className="text-xs text-foreground/40"> / hó</span>
                </div>
              </div>
              <Button
                onClick={() => handleUpgrade(STRIPE_LINK_GENZ)}
                className="w-full mt-3 bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 hover:bg-emerald-500/20 hover:border-emerald-500/50"
              >
                Előfizetek
              </Button>
            </div>

            {/* MILLENIAL Plan */}
            <div className="p-4 rounded-lg border border-blue-500/30 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all text-left group">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-blue-500/90 group-hover:text-blue-500">MILLENIAL</h3>
                  <p className="text-xs text-foreground/50 mt-1.5 leading-relaxed">
                    Fiatal felnőtteknek és középkorúaknak.
                    <br />
                    Akik terveznek, szerveznek,
                    <br />
                    projektek és életstruktúra mentén gondolkodnak.
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-lg font-light text-blue-500/90">€8</span>
                  <span className="text-xs text-foreground/40"> / hó</span>
                </div>
              </div>
              <Button
                onClick={() => handleUpgrade(STRIPE_LINK_MILLENIAL)}
                className="w-full mt-3 bg-blue-500/10 text-blue-500 border border-blue-500/30 hover:bg-blue-500/20 hover:border-blue-500/50"
              >
                Előfizetek
              </Button>
            </div>
          </div>

          {/* Footer note */}
          <div className="pt-2 border-t border-foreground/10">
            <p className="text-xs text-foreground/40 text-center leading-relaxed">
              A FREE csomag korlátozott chatet ad.
              <br />A fókusz mód és memória csak előfizetéssel érhető él.
            </p>
          </div>

          <DialogFooter className="mt-2">
            <Button
              variant="ghost"
              onClick={() => setUpgradeOpen(false)}
              className="w-full text-foreground/70 hover:text-foreground"
            >
              Mégse
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TopBar;
