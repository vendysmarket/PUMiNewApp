import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ActionType = "clearChat" | "deleteAccount" | "cancelSubscription" | null;

const ProfilePage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { member, tier } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [lang, setLang] = useState("hu");
  const [actionType, setActionType] = useState<ActionType>(null);

  // Get email from Memberstack
  const email = member?.auth?.email || "";

  // Get plan display name
  const getPlanLabel = () => {
    if (tier === "GEN_Z") return "GEN Z";
    if (tier === "MILLENIAL") return "MILLENNIAL";
    return "FREE";
  };

  useEffect(() => {
    setDisplayName(localStorage.getItem("emoria_display_name") || "");
    setLang(localStorage.getItem("emoria_lang") || "hu");
  }, []);

  const handleDisplayNameChange = (value: string) => {
    setDisplayName(value);
    localStorage.setItem("emoria_display_name", value);
  };

  const handleLangChange = (value: string) => {
    setLang(value);
    localStorage.setItem("emoria_lang", value);
    window.dispatchEvent(new Event("storage"));
  };

  const handleAction = () => {
    if (!actionType) return;

    switch (actionType) {
      case "clearChat":
        localStorage.removeItem("emoria_chat_history");
        localStorage.removeItem("emoria_chat_sessions");
        toast({ description: "Chat előzmények törölve." });
        break;
      case "deleteAccount":
        // UI only for now - would trigger account deletion
        toast({ description: "Fiók törlése folyamatban..." });
        break;
      case "cancelSubscription":
        // Open Stripe customer portal for cancellation
        window.open("https://billing.stripe.com/p/login/test_YOUR_PORTAL_LINK", "_blank");
        toast({
          description: "Stripe ügyfélportál megnyitva. Ott tudod lemondani az előfizetést.",
        });
        break;
    }

    setActionType(null);
  };

  const getActionMessage = () => {
    switch (actionType) {
      case "clearChat":
        return "Ez törli az összes chat előzményed.";
      case "deleteAccount":
        return "Ez véglegesen törli a fiókodat és minden adatodat.";
      case "cancelSubscription":
        return "Az előfizetés lemondása után a következő számlázási időpontig még használhatod a fizetett funkciókat. Utána automatikusan FREE csomagra váltunk.";
      default:
        return "";
    }
  };

  const getActionTitle = () => {
    switch (actionType) {
      case "clearChat":
        return "Chat előzmények törlése";
      case "deleteAccount":
        return "Fiók törlése";
      case "cancelSubscription":
        return "Előfizetés lemondása";
      default:
        return "Megerősítés";
    }
  };

  return (
    <div className="min-h-screen flex items-start justify-center pt-24 pb-12">
      <div className="w-full max-w-md px-8">
        {/* Page title */}
        <h1 className="text-lg font-light tracking-wider text-foreground/80 mb-10">Profil beállítások</h1>

        <div className="flex flex-col gap-8">
          {/* Section: Fiók */}
          <div className="flex flex-col gap-4">
            <h2 className="text-xs font-medium text-foreground/60 tracking-wider uppercase">Fiók</h2>

            {/* Email (read-only) */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-light text-foreground/40">Email</label>
              <div className="w-full px-5 py-4 rounded-full border border-foreground/10 bg-foreground/5 text-foreground/50 text-sm font-light">
                {email || "—"}
              </div>
            </div>

            {/* Display name */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-light text-foreground/40">Megjelenítendő név</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => handleDisplayNameChange(e.target.value)}
                placeholder="Add meg a neved..."
                className="w-full px-5 py-4 rounded-full border border-foreground/20 bg-transparent text-foreground/90 text-sm font-light placeholder:text-foreground/30 focus:outline-none focus:border-foreground/40 transition-colors"
              />
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-foreground/10" />

          {/* Section: Előfizetés */}
          <div className="flex flex-col gap-4">
            <h2 className="text-xs font-medium text-foreground/60 tracking-wider uppercase">Előfizetés</h2>

            {/* Current plan pill */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-light text-foreground/40">Jelenlegi csomag:</span>
              <span className="px-4 py-1.5 rounded-full border border-foreground/30 text-foreground/80 text-xs font-light">
                {getPlanLabel()}
              </span>
            </div>

            {/* Subscription details for paid users */}
            {tier !== "FREE" && (
              <div className="flex flex-col gap-2 px-5 py-4 rounded-lg border border-foreground/10 bg-foreground/5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-light text-foreground/40">Státusz</span>
                  <span className="text-xs font-light text-emerald-500">Aktív</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-light text-foreground/40">Következő megújulás</span>
                  <span className="text-xs font-light text-foreground/70">
                    {/* TODO: Get from Memberstack API */}
                    2025. február 15.
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-light text-foreground/40">Ár</span>
                  <span className="text-xs font-light text-foreground/70">{tier === "GEN_Z" ? "€5" : "€8"} / hó</span>
                </div>
              </div>
            )}

            {/* Manage subscription button */}
            <button
              onClick={() => navigate("/app/subscription")}
              className="w-full px-5 py-3 rounded-full border border-foreground/20 text-foreground/70 text-sm font-light hover:border-foreground/40 hover:bg-foreground/5 transition-all text-center"
            >
              {tier === "FREE" ? "Előfizetés választása" : "Csomag módosítása"}
            </button>

            {/* Cancel subscription button - only for paid users */}
            {tier !== "FREE" && (
              <button
                onClick={() => setActionType("cancelSubscription")}
                className="w-full px-5 py-3 rounded-full border border-amber-500/20 text-amber-400/60 text-sm font-light hover:border-amber-500/40 hover:text-amber-400/80 transition-all text-center"
              >
                Előfizetés lemondása
              </button>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-foreground/10" />

          {/* Section: Nyelv */}
          <div className="flex flex-col gap-4">
            <h2 className="text-xs font-medium text-foreground/60 tracking-wider uppercase">Nyelv</h2>

            <div className="flex gap-3">
              <button
                onClick={() => handleLangChange("hu")}
                className={`flex-1 px-5 py-3 rounded-full border text-sm font-light transition-all ${
                  lang === "hu"
                    ? "border-foreground/60 text-foreground/90"
                    : "border-foreground/20 text-foreground/40 hover:border-foreground/40"
                }`}
              >
                HU
              </button>
              <button
                onClick={() => handleLangChange("en")}
                className={`flex-1 px-5 py-3 rounded-full border text-sm font-light transition-all ${
                  lang === "en"
                    ? "border-foreground/60 text-foreground/90"
                    : "border-foreground/20 text-foreground/40 hover:border-foreground/40"
                }`}
              >
                EN
              </button>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-foreground/10" />

          {/* Section: Adatok */}
          <div className="flex flex-col gap-4">
            <h2 className="text-xs font-medium text-foreground/60 tracking-wider uppercase">Adatok</h2>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => setActionType("clearChat")}
                className="w-full px-5 py-3 rounded-full border border-foreground/20 text-foreground/50 text-sm font-light hover:border-foreground/40 hover:text-foreground/70 transition-all text-left"
              >
                Chat előzmények törlése
              </button>
              <button
                onClick={() => setActionType("deleteAccount")}
                className="w-full px-5 py-3 rounded-full border border-red-500/20 text-red-400/60 text-sm font-light hover:border-red-500/40 hover:text-red-400/80 transition-all text-left"
              >
                Fiók törlése
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Action Confirmation */}
      <AlertDialog open={!!actionType} onOpenChange={() => setActionType(null)}>
        <AlertDialogContent className="bg-background border border-foreground/20">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground/80 font-light">{getActionTitle()}</AlertDialogTitle>
            <AlertDialogDescription className="text-foreground/50">
              {getActionMessage()} Ez a művelet nem vonható vissza.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full border-foreground/20 text-foreground/60 hover:bg-foreground/5">
              Mégse
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAction}
              className={`rounded-full border bg-transparent transition-all ${
                actionType === "deleteAccount"
                  ? "border-red-500/40 text-red-400/80 hover:bg-red-500/10"
                  : "border-foreground/40 text-foreground/70 hover:bg-foreground/10"
              }`}
            >
              {actionType === "deleteAccount" ? "Törlés" : "Megerősítés"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ProfilePage;
