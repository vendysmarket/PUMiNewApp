import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
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

const SettingsPage = () => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDeleteAllData = () => {
    const keysToDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith("pumi_") || key.startsWith("emoria_"))) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach((key) => localStorage.removeItem(key));
    
    window.dispatchEvent(new Event("storage"));
    setShowDeleteConfirm(false);
    toast({ description: t("allLocalDataDeleted") });
  };

  const handleLogout = () => {
    toast({ description: t("logoutNotAvailable") });
  };

  return (
    <div className="max-w-md mx-auto px-8">
      <div className="flex flex-col gap-10 py-8">
        <h1 className="text-xl font-light text-foreground/80">{t("settings")}</h1>

        {/* Privacy Policy */}
        <div className="flex flex-col gap-3">
          <label className="text-xs font-light text-foreground/50 tracking-wider uppercase">
            {t("privacyPolicy")}
          </label>
          <div className="px-5 py-4 rounded-2xl border border-foreground/10">
            <p className="text-sm font-light text-foreground/50 leading-relaxed">
              {t("privacyPolicyText")}
            </p>
          </div>
        </div>

        {/* Terms */}
        <div className="flex flex-col gap-3">
          <label className="text-xs font-light text-foreground/50 tracking-wider uppercase">
            {t("terms")}
          </label>
          <div className="px-5 py-4 rounded-2xl border border-foreground/10">
            <p className="text-sm font-light text-foreground/50 leading-relaxed">
              {t("termsText")}
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-foreground/10" />

        {/* Danger Zone */}
        <div className="flex flex-col gap-3">
          <label className="text-xs font-light text-foreground/50 tracking-wider uppercase">
            {t("dangerZone")}
          </label>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full px-5 py-3 rounded-full border border-foreground/30 text-foreground/60 text-sm font-light hover:border-foreground/50 hover:text-foreground/80 transition-colors text-left"
            >
              {t("deleteAllLocalData")}
            </button>
            <button
              onClick={handleLogout}
              className="w-full px-5 py-3 rounded-full border border-foreground/20 text-foreground/40 text-sm font-light hover:border-foreground/40 hover:text-foreground/60 transition-colors text-left"
            >
              {t("logout")}
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="bg-background border border-foreground/20">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground/80 font-light">
              {t("deleteAllData")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-foreground/50">
              {t("deleteAllDataMessage")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-foreground/20 text-foreground/60 hover:bg-foreground/5">
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAllData}
              className="border-foreground/40 bg-transparent text-foreground/70 hover:bg-foreground/10"
            >
              {t("deleteAll")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SettingsPage;
