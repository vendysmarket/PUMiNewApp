import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Lock } from "lucide-react";
import PumiLogo from "@/components/PumiLogo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";

// Registration is locked until this date
const REGISTRATION_UNLOCK = new Date("2026-02-02T00:00:00");

const SignupPage = () => {
  const navigate = useNavigate();
  const { isLoggedIn, isReady, signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLocked, setIsLocked] = useState(true);

  useEffect(() => {
    // Check if registration is unlocked
    const checkLock = () => {
      const now = new Date();
      setIsLocked(now < REGISTRATION_UNLOCK);
    };
    
    checkLock();
    const interval = setInterval(checkLock, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // If already logged in, redirect to chat
    if (isReady && isLoggedIn) {
      navigate("/app/chat", { replace: true });
    }
  }, [isLoggedIn, isReady, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isLocked) {
      toast({
        title: "Regisztráció nem elérhető",
        description: "A regisztráció 2026. február 2-tól lesz elérhető.",
        variant: "destructive",
      });
      return;
    }
    
    if (!email || !password) {
      toast({
        title: "Hiba",
        description: "Kérlek töltsd ki az összes mezőt",
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Hiba",
        description: "A jelszavak nem egyeznek",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Hiba",
        description: "A jelszónak legalább 6 karakter hosszúnak kell lennie",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    
    const { error } = await signUp(email, password);
    
    if (error) {
      let errorMessage = "Ismeretlen hiba történt";
      
      if (error.message.includes("already registered")) {
        errorMessage = "Ez az email cím már regisztrálva van";
      } else if (error.message.includes("invalid email")) {
        errorMessage = "Érvénytelen email cím";
      } else if (error.message.includes("password")) {
        errorMessage = "A jelszó nem megfelelő";
      } else {
        errorMessage = error.message;
      }
      
      toast({
        title: "Regisztráció sikertelen",
        description: errorMessage,
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    toast({
      title: "Sikeres regisztráció!",
      description: "Bejelentkeztünk a fiókodba.",
    });
    
    navigate("/app/chat", { replace: true });
  };

  // Show loading state while checking auth
  if (!isReady) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-foreground/40" />
      </div>
    );
  }

  // Show locked state if registration is not yet available
  if (isLocked) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md flex flex-col items-center gap-8">
          {/* Logo and heading */}
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <PumiLogo className="h-12 w-auto" />
            </div>
            <div className="flex items-center justify-center gap-2">
              <Lock className="h-5 w-5 text-foreground/60" />
              <h1 className="text-2xl font-semibold text-foreground">
                Regisztráció zárolva
              </h1>
            </div>
            <p className="text-foreground/60 text-sm">
              A regisztráció <span className="font-semibold text-foreground">2026. február 2.</span> 00:00-tól lesz elérhető.
            </p>
            <p className="text-foreground/40 text-xs mt-2">
              Addig is iratkozz fel a várólistára a főoldalon!
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-col items-center gap-3 text-sm">
            <Link
              to="/home"
              className="text-foreground underline hover:no-underline transition-all"
            >
              Vissza a főoldalra
            </Link>
            <div className="text-foreground/60">
              <span>Már van fiókod? </span>
              <Link
                to="/login"
                className="text-foreground underline hover:no-underline transition-all"
              >
                Belépés
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md flex flex-col items-center gap-8">
        {/* Logo and heading */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <PumiLogo className="h-12 w-auto" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">
            Készíts fiókot
          </h1>
          <p className="text-foreground/60 text-sm">
            Regisztrálj, hogy elkezdhesd a <span className="font-brand">PUMi</span> használatát
          </p>
        </div>

        {/* Google Sign In */}
        <GoogleSignInButton 
          className="w-full h-12 rounded-full" 
          label="Regisztráció Google-lal"
        />

        {/* Divider */}
        <div className="w-full flex items-center gap-4">
          <div className="flex-1 h-px bg-foreground/10" />
          <span className="text-xs text-foreground/40">vagy</span>
          <div className="flex-1 h-px bg-foreground/10" />
        </div>

        {/* Signup form */}
        <form onSubmit={handleSubmit} className="w-full space-y-4">
          <div className="space-y-2">
            <Input
              type="email"
              placeholder="Email cím"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              className="h-12 rounded-full px-5"
            />
          </div>
          
          <div className="space-y-2">
            <Input
              type="password"
              placeholder="Jelszó"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              className="h-12 rounded-full px-5"
            />
          </div>
          
          <div className="space-y-2">
            <Input
              type="password"
              placeholder="Jelszó megerősítése"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isLoading}
              className="h-12 rounded-full px-5"
            />
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-12 rounded-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Regisztráció...
              </>
            ) : (
              "Regisztráció"
            )}
          </Button>
        </form>

        {/* Login link */}
        <div className="text-center text-sm text-foreground/60">
          <span>Már van fiókod? </span>
          <Link
            to="/login"
            className="text-foreground underline hover:no-underline transition-all"
          >
            Belépés
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SignupPage;
