import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LogIn, UserPlus, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

interface AuthBarProps {
  className?: string;
}

const AuthBar = ({ className }: AuthBarProps) => {
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const [lang, setLang] = useState<string>("hu");

  // Navigate to dedicated auth pages instead of opening modals
  const handleLogin = () => {
    navigate("/login");
  };

  const handleSignup = () => {
    navigate("/signup");
  };

  useEffect(() => {
    const loadLang = () => {
      const storedLang = localStorage.getItem("pumi_lang") || "hu";
      setLang(storedLang);
    };
    loadLang();
    window.addEventListener("storage", loadLang);
    return () => {
      window.removeEventListener("storage", loadLang);
    };
  }, []);

  // Only show for logged out users
  if (isLoggedIn) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-3 py-3 px-4 border-t border-foreground/10 bg-background/80 backdrop-blur-sm",
        className,
      )}
    >
      {/* Upgrade teaser */}
      <div className="flex items-center gap-2 text-xs text-foreground/40">
        <Sparkles className="w-3.5 h-3.5" />
      </div>

      <div className="h-4 w-px bg-foreground/20" />

      {/* Login button */}
      <button
        onClick={handleLogin}
        className="flex items-center gap-2 px-4 py-2 rounded-full border border-foreground/20 hover:border-foreground/40 hover:bg-foreground/5 transition-all text-sm text-foreground/70 hover:text-foreground"
      >
        <LogIn className="w-4 h-4" />
        <span>{lang === "hu" ? "Belépés" : "Login"}</span>
      </button>

      {/* Signup button */}
      <button
        onClick={handleSignup}
        className="flex items-center gap-2 px-4 py-2 rounded-full bg-foreground text-background hover:bg-foreground/90 transition-all text-sm font-medium"
      >
        <UserPlus className="w-4 h-4" />
        <span>{lang === "hu" ? "Regisztráció" : "Sign up"}</span>
      </button>
    </div>
  );
};

export default AuthBar;
