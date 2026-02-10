import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";
import PumiLogo from "@/components/PumiLogo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";

const LoginPage = () => {
  const navigate = useNavigate();
  const { isLoggedIn, isReady, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // If already logged in, redirect to chat
    if (isReady && isLoggedIn) {
      navigate("/app/chat", { replace: true });
    }
  }, [isLoggedIn, isReady, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast({
        title: "Hiba",
        description: "Kérlek töltsd ki az összes mezőt",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    
    const { error } = await signIn(email, password);
    
    if (error) {
      let errorMessage = "Ismeretlen hiba történt";
      
      if (error.message.includes("Invalid login credentials")) {
        errorMessage = "Hibás email vagy jelszó";
      } else if (error.message.includes("Email not confirmed")) {
        errorMessage = "Az email cím nincs megerősítve";
      } else {
        errorMessage = error.message;
      }
      
      toast({
        title: "Belépés sikertelen",
        description: errorMessage,
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    toast({
      title: "Sikeres belépés!",
      description: "Üdv újra!",
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

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md flex flex-col items-center gap-8">
        {/* Logo and heading */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <PumiLogo className="h-12 w-auto" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">
            Üdv újra!
          </h1>
          <p className="text-foreground/60 text-sm">
            Lépj be a fiókodba a folytatáshoz
          </p>
        </div>

        {/* Google Sign In */}
        <GoogleSignInButton className="w-full h-12 rounded-full" />

        {/* Divider */}
        <div className="w-full flex items-center gap-4">
          <div className="flex-1 h-px bg-foreground/10" />
          <span className="text-xs text-foreground/40">vagy</span>
          <div className="flex-1 h-px bg-foreground/10" />
        </div>

        {/* Login form */}
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

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-12 rounded-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Belépés...
              </>
            ) : (
              "Belépés"
            )}
          </Button>
        </form>

        {/* Signup link */}
        <div className="text-center text-sm text-foreground/60">
          <span>Nincs még fiókod? </span>
          <Link
            to="/signup"
            className="text-foreground underline hover:no-underline transition-all"
          >
            Regisztráció
          </Link>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
