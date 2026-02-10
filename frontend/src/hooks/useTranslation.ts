import { useState, useEffect, useCallback } from "react";
import { translations, TranslationKey, Language, getTranslation } from "@/lib/i18n";

export const useTranslation = () => {
  const [lang, setLang] = useState<Language>(() => {
    const stored = localStorage.getItem("pumi_lang");
    return (stored === "en" || stored === "hu") ? stored : "hu";
  });

  useEffect(() => {
    const handleStorageChange = () => {
      const stored = localStorage.getItem("pumi_lang");
      const newLang = (stored === "en" || stored === "hu") ? stored : "hu";
      setLang(newLang);
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const t = useCallback((key: TranslationKey): string => {
    return getTranslation(lang, key);
  }, [lang]);

  return { t, lang };
};
