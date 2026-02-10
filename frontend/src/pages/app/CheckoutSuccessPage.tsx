import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import pumiLogo from "@/assets/pumi-logo.png";

// Confetti particle component
const ConfettiParticle = ({ delay, left, duration }: { delay: number; left: number; duration: number }) => {
  const colors = [
    "hsla(43, 15%, 91%, 0.8)", // cream
    "hsla(43, 15%, 91%, 0.5)", // cream light
    "hsla(260, 60%, 60%, 0.7)", // purple (discord)
    "hsla(260, 60%, 70%, 0.5)", // purple light
  ];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const size = 4 + Math.random() * 6;
  
  return (
    <div
      className="absolute rounded-full pointer-events-none animate-confetti-fall"
      style={{
        left: `${left}%`,
        top: "-10px",
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: color,
        animationDelay: `${delay}ms`,
        animationDuration: `${duration}ms`,
        opacity: 0,
      }}
    />
  );
};

const TIER_NAMES: Record<string, string> = {
  GEN_Z: "GEN Z",
  MILLENIAL: "MILLENNIAL",
};

const CheckoutSuccessPage = () => {
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState<string>("");
  const [tierName, setTierName] = useState<string>("");
  const [confettiParticles, setConfettiParticles] = useState<Array<{ id: number; delay: number; left: number; duration: number }>>([]);
  const [showContent, setShowContent] = useState(false);

  // Get user data from localStorage
  useEffect(() => {
    // Get first name from member data
    try {
      const memberData = localStorage.getItem("emoria_member");
      if (memberData) {
        const member = JSON.parse(memberData);
        // Try customFields first, then email fallback
        const name = member?.customFields?.firstName 
          || member?.auth?.email?.split("@")[0] 
          || "";
        if (name) {
          setFirstName(name.charAt(0).toUpperCase() + name.slice(1).toLowerCase());
        }
      }
    } catch (e) {
      console.warn("Could not parse member data", e);
    }

    // Get tier name
    const tier = localStorage.getItem("emoria_tier") || "GEN_Z";
    setTierName(TIER_NAMES[tier] || "GEN Z");
  }, []);

  // Generate confetti particles on mount
  useEffect(() => {
    const particles = Array.from({ length: 15 }, (_, i) => ({
      id: i,
      delay: Math.random() * 3000,
      left: Math.random() * 100,
      duration: 4000 + Math.random() * 3000,
    }));
    setConfettiParticles(particles);
    
    // Show content with fade-in delay
    const timer = setTimeout(() => setShowContent(true), 300);
    return () => clearTimeout(timer);
  }, []);

  // Auto-redirect after 30 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      navigate("/app/chat");
    }, 30000);
    
    return () => clearTimeout(timer);
  }, [navigate]);

  const handleStartClick = useCallback(() => {
    navigate("/app/chat");
  }, [navigate]);

  const handleDiscordClick = useCallback(() => {
    window.open("https://discord.gg/lovable-dev", "_blank", "noopener,noreferrer");
  }, []);

  return (
    <div className="fixed inset-0 bg-background flex flex-col items-center justify-center overflow-hidden">
      {/* Confetti layer */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {confettiParticles.map((particle) => (
          <ConfettiParticle
            key={particle.id}
            delay={particle.delay}
            left={particle.left}
            duration={particle.duration}
          />
        ))}
      </div>

      {/* Main content */}
      <div
        className={`relative z-10 flex flex-col items-center text-center px-8 w-full max-w-[400px] transition-all duration-700 ${
          showContent ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        {/* Logo with glow */}
        <div className="relative mb-10">
          <img 
            src={pumiLogo} 
            alt="PUMi" 
            className="w-20 h-20 opacity-90"
            style={{
              filter: "drop-shadow(0 0 20px hsla(43, 15%, 91%, 0.4)) drop-shadow(0 0 40px hsla(43, 15%, 91%, 0.2))"
            }}
          />
        </div>

        {/* Greeting */}
        <h1 className="text-2xl font-light text-foreground mb-2">
          Szia{firstName ? ` ${firstName}` : ""}!
        </h1>
        <p className="text-foreground/70 mb-8 font-light">
          Örülök, hogy maradsz.
        </p>

        {/* Benefits list */}
        <div className="text-left w-full mb-8">
          <p className="text-foreground/60 text-sm mb-4">
            Most megnyílt előtted a teljes élmény:
          </p>
          <div className="space-y-2 text-foreground/80 text-sm">
            <p>✓ Korlátlan chat</p>
            <p>✓ Fókusz mód</p>
            <p>✓ {tierName} hangolás</p>
          </div>
        </div>

        {/* Divider */}
        <div className="w-full border-t border-foreground/10 mb-8" />

        {/* Discord section */}
        <div className="w-full text-center mb-8">
          <p className="text-foreground/70 text-sm mb-4">
            Csatlakozz a közösséghez!
          </p>
          <Button
            variant="outline"
            onClick={handleDiscordClick}
            className="rounded-full border-foreground/20 text-foreground/80 hover:bg-[hsla(260,60%,60%,0.1)] hover:border-[hsla(260,60%,60%,0.4)] transition-all"
          >
            Discord csatlakozás
          </Button>
        </div>

        {/* Divider */}
        <div className="w-full border-t border-foreground/10 mb-8" />

        {/* Start button */}
        <Button
          onClick={handleStartClick}
          className="rounded-full px-8 py-3 bg-foreground text-background hover:bg-foreground/90 font-medium"
        >
          Kezdjük!
        </Button>
      </div>
    </div>
  );
};

export default CheckoutSuccessPage;
