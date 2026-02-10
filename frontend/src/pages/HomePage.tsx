import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import PumiLogo from "@/components/PumiLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import pumiLogo from "@/assets/pumi-logo.png";

/**
 * IMPORTANT:
 * - Do NOT edit the question/answer texts below (user provided final copy).
 * - This is a fake chat demo (no real input).
 */

// Countdown target: Feb 2, 2026 00:00 LOCAL time (registration allowed from this date)
const LAUNCH_UNLOCK = new Date("2026-02-02T00:00:00");

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const chatQA = [
  {
    question: "Mi a PUMi?",
    answer: `Egy magyar fejlesztésű AI-rendszer vagyok.
Chat és fókusz mód egy rendszerben.
Nem egy általános chatbot.
Konkrét problémák megoldására készültem.`,
  },
  {
    question: "Miben vagyok más, mint a ChatGPT, Claude vagy Gemini?",
    answer: `A nagy modellek hosszú válaszokban próbálják megoldani a problémádat.
Az én célom, hogy segítsek:
döntésben, fókuszban, tanulásban, struktúrában.
Nem hosszú válaszokat írok, hanem valóban használható irányt adok.`,
  },
  {
    question: "Miért generációkra vagyok szabva?",
    answer: `Mert más a problématér, és minden generációnak mások az igényei.
A Gen Z-nek tanulásban, digitális zajban és jövőtervezésben adok kapaszkodót.
A Millennialnak szervezésben, projektekben, életstruktúrában és célok elérésében segítek.

Fontos számomra, hogy mindenki a saját hangján legyen megszólítva.
Egyszerű: nem ugyanazt adom mindenkinek, mert nem ugyanarra van szüksége.`,
  },
  {
    question: "Miért engem használj nagy modellek helyett?",
    answer: `Egyrészt, mert natív magyar vagyok.
Magyar fejlesztés. Magyar gondolkodás.
Másrészt olyan funkciókat adok egy rendszerben,
amit máshol csak több külön eszközzel lehetne elérni.`,
  },
  {
    question: "Mitől más a hangvételem a többi modellhez képest?",
    answer: `Nem motivációs coach vagyok.
Nem ügyfélszolgálat.
Nem körbemagyarázok.
Nem gyártok kifogásokat.

Kimondom, amit gondolok — és megyünk tovább.

Fontos volt számomra,
hogy ne legyek „AI-szagú”,
de közben teljesítsem azt, amit egy AI-tól elvársz.`,
  },
  {
    question: "Mi az a Fókusz mód?",
    answer: `Egy valódi piaci újítás.
A tervezőim megértették, hogy az AI kiváló „tanár”:
ha megértem az igényeidet és készségeidet,
sokkal többet és minőségibben tudok segíteni.

A Fókusz mód nálam: tananyag, feladat, rövid visszacsatolás.
Használhatod új készséghez vagy projekthez.

Nem csak chat vagyok — hanem egy működő menetrend,
ami 7 napra bontja a fókuszba helyezett témádat
napi 45–60 perces blokkokra,
miközben figyelem az aktivitásodat
és segítek ott, ahol nehezebben megy.`,
  },
  {
    question: "Mennyibe kerülök?",
    answer: `Van egy 7 napos ingyenes próba.
Próbálj ki, tesztelj. Dönts később.

Utána:
Gen Z: 5 € / hó
Millennial: 8 € / hó

Kevesebb, mint bármely nagy AI-előfizetés,
így hosszú távon azok számára is elérhető vagyok,
akik nem engedhetik meg maguknak
a 20 € feletti havi díjakat.

Később családi előfizetés is érkezik,
amellyel 4–6 fős háztartások
költséghatékonyan férhetnek hozzá.`,
  },
  {
    question: "Lesz üzleti verzió?",
    answer: `Igen.
Később enterprise és üzleti verzió is elérhető lesz,
amellyel vállalkozásoknak segíthetek
döntésekben, piacfeltérképezésben
és napi operatív kérdésekben.

Ez a funkció jelenleg fejlesztés alatt áll.`,
  },
];
const HomePage = () => {
  const navigate = useNavigate();
  const { isLoggedIn, isReady } = useAuth();

  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [isUnlocked, setIsUnlocked] = useState(false);

  // Email form state
  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<"idle" | "loading" | "success" | "error" | "duplicate">("idle");
  const [emailError, setEmailError] = useState("");

  // Fake chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [availableQuestions, setAvailableQuestions] = useState(chatQA.map((q) => q.question));
  const chatEndRef = useRef<HTMLDivElement>(null);

  const hasChat = chatMessages.length > 0 || isTyping;

  // Redirect to app if logged in
  useEffect(() => {
    if (isReady && isLoggedIn) {
      navigate("/app/chat", { replace: true });
    }
  }, [isReady, isLoggedIn, navigate]);

  // Countdown timer
  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const diff = LAUNCH_UNLOCK.getTime() - now.getTime();

      if (diff <= 0) {
        setIsUnlocked(true);
        setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }

      setIsUnlocked(false);
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setCountdown({ days, hours, minutes, seconds });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isTyping]);

  const handleLogin = () => {
    navigate("/login");
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError("");

    const emailValue = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailValue || !emailRegex.test(emailValue)) {
      setEmailError("Kérlek, adj meg egy érvényes email címet.");
      setEmailStatus("error");
      return;
    }

    setEmailStatus("loading");

    try {
      const { error } = await supabase.from("launch_waitlist").insert({ email: emailValue });

      if (error) {
        if (error.code === "23505") {
          setEmailStatus("duplicate");
        } else {
          setEmailError("Hiba történt. Próbáld újra.");
          setEmailStatus("error");
        }
      } else {
        setEmailStatus("success");
        setEmail("");
      }
    } catch {
      setEmailError("Hiba történt. Próbáld újra.");
      setEmailStatus("error");
    }
  };

  const handleQuestionClick = (question: string) => {
    if (isTyping) return;

    const qa = chatQA.find((q) => q.question === question);
    if (!qa) return;

    setAvailableQuestions((prev) => prev.filter((q) => q !== question));
    setChatMessages((prev) => [...prev, { role: "user", content: question }]);

    setIsTyping(true);

    // Slightly more “AI-like” typing time (but still fast)
    const delay = 900 + Math.random() * 600; // 900–1500ms
    setTimeout(() => {
      setIsTyping(false);
      setChatMessages((prev) => [...prev, { role: "assistant", content: qa.answer }]);
    }, delay);
  };

  // Background styles tuned to look closer to EMORIA “kockás layer”
  const backgroundStyle = useMemo(
    () => ({
      backgroundImage: `
        radial-gradient(1200px 600px at 50% 18%, rgba(255,255,255,0.06), transparent 60%),
        radial-gradient(900px 500px at 50% 70%, rgba(255,255,255,0.04), transparent 55%),
        linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)
      `,
      backgroundSize: "100% 100%, 100% 100%, 42px 42px, 42px 42px",
      backgroundPosition: "center, center, center, center",
    }),
    [],
  );

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* PUMi grid background */}
      <div className="absolute inset-0 pointer-events-none" style={backgroundStyle} />

      {/* subtle vignette */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_35%,rgba(0,0,0,0.75)_100%)]" />

      {/* Top bar */}
      <header className="absolute top-0 right-0 p-4 z-10">
        <Button
          variant="outline"
          onClick={handleLogin}
          className="border-foreground/30 text-foreground hover:bg-foreground/10 hover:border-foreground/50 transition-all"
        >
          BELÉPÉS
        </Button>
      </header>

      <main className="relative z-[1] flex flex-col items-center px-4 pt-14 pb-16">
        {/* Pulsing logo wrapper */}
        <div className="mt-4 mb-8">
          <div className="relative">
            <div className="absolute inset-0 rounded-full blur-2xl opacity-40 animate-[pumiPulse_2.8s_ease-in-out_infinite]" />
            <div className="animate-[pumiPulse_2.8s_ease-in-out_infinite]">
              <PumiLogo className="w-40 h-auto md:w-56" />
            </div>
          </div>
        </div>

        {/* Countdown */}
        <div className="mb-8">
          {isUnlocked ? (
            <p className="text-xl md:text-2xl font-light text-foreground tracking-wide text-center">Elérhető</p>
          ) : (
            <>
              <p className="text-muted-foreground text-sm uppercase tracking-widest mb-4 text-center">
                Indulás hamarosan
              </p>
              <div className="flex gap-3 md:gap-5 justify-center">
                <CountdownBlock value={countdown.days} label="NAP" />
                <CountdownBlock value={countdown.hours} label="ÓRA" />
                <CountdownBlock value={countdown.minutes} label="PERC" />
                <CountdownBlock value={countdown.seconds} label="MP" />
              </div>
            </>
          )}
        </div>

        {/* Waitlist */}
        <div className="w-full max-w-sm mb-10">
          <p className="text-foreground/90 text-sm mb-3 text-center">Kérsz értesítést induláskor?</p>

          {emailStatus === "success" ? (
            <p className="text-center text-green-400 text-sm">Kész. Szólok induláskor.</p>
          ) : emailStatus === "duplicate" ? (
            <p className="text-center text-muted-foreground text-sm">Már fel vagy iratkozva.</p>
          ) : (
            <form onSubmit={handleEmailSubmit} className="flex gap-2">
              <Input
                type="email"
                placeholder="Email címed"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailError("");
                  setEmailStatus("idle");
                }}
                className="flex-1 bg-secondary/30 border-foreground/15 placeholder:text-muted-foreground/50"
                disabled={emailStatus === "loading"}
              />
              <Button
                type="submit"
                variant="outline"
                className="border-foreground/30 text-foreground hover:bg-foreground/10"
                disabled={emailStatus === "loading"}
              >
                {emailStatus === "loading" ? "..." : "Értesíts"}
              </Button>
            </form>
          )}

          {emailStatus === "error" && emailError && (
            <p className="text-red-400 text-xs mt-2 text-center">{emailError}</p>
          )}

          {emailStatus !== "success" && emailStatus !== "duplicate" && (
            <p className="text-muted-foreground/60 text-xs mt-2 text-center">
              Csak egy indulás-értesítőt küldünk. Nincs spam.
            </p>
          )}
        </div>

        {/* Fake chat */}
        <div className="w-full max-w-2xl">
          {/* Question chips */}
          {availableQuestions.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2 mb-4">
              {availableQuestions.map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => handleQuestionClick(q)}
                  disabled={isTyping}
                  className="px-3 py-1.5 rounded-full border border-foreground/20 text-foreground/80 text-xs
                             hover:border-foreground/40 hover:bg-foreground/5 transition-all
                             focus:outline-none focus:ring-2 focus:ring-foreground/20
                             disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Chat window */}
          {hasChat && (
            <div className="relative bg-secondary/15 border border-foreground/10 rounded-2xl p-4 mb-4 max-h-[360px] overflow-y-auto">
              {/* inner subtle grid on chat card */}
              <div
                className="absolute inset-0 rounded-2xl pointer-events-none opacity-40"
                style={{
                  backgroundImage: `
                    linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
                  `,
                  backgroundSize: "36px 36px",
                }}
              />

              <div className="relative space-y-3">
                {chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex items-start gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.role === "assistant" && <AssistantAvatar />}
                    <div
                      className={`max-w-[82%] px-3 py-2 rounded-xl text-sm whitespace-pre-line leading-relaxed ${
                        msg.role === "user" ? "bg-foreground/10 text-foreground" : "bg-secondary/45 text-foreground/90"
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}

                {/* Typing */}
                {isTyping && (
                  <div className="flex items-start gap-2 justify-start">
                    <AssistantAvatar />
                    <div className="bg-secondary/45 px-3 py-2 rounded-xl">
                      <div className="flex gap-1 items-center">
                        <span
                          className="w-1.5 h-1.5 bg-foreground/50 rounded-full animate-bounce"
                          style={{ animationDelay: "0ms" }}
                        />
                        <span
                          className="w-1.5 h-1.5 bg-foreground/50 rounded-full animate-bounce"
                          style={{ animationDelay: "150ms" }}
                        />
                        <span
                          className="w-1.5 h-1.5 bg-foreground/50 rounded-full animate-bounce"
                          style={{ animationDelay: "300ms" }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>
            </div>
          )}

          {/* Fake input */}
          <div className="relative">
            <input
              type="text"
              disabled
              placeholder="Írj egy kérdést…"
              className="w-full bg-secondary/25 border border-foreground/15 rounded-full px-5 py-3
                         text-muted-foreground placeholder:text-muted-foreground/50
                         cursor-not-allowed opacity-80"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-4 h-4 text-muted-foreground/50"
                >
                  <path d="m22 2-7 20-4-9-9-4Z" />
                  <path d="M22 2 11 13" />
                </svg>
              </div>
            </div>
          </div>

          {/* tiny footer note (optional vibe) */}
          <div className="mt-3 text-center text-xs text-muted-foreground/60">
            Ez egy demó. A belépés jelenleg limitált.
          </div>
        </div>

        {/* Keyframes (scoped) */}
        <style>
          {`
            @keyframes emoriaPulse {
              0%, 100% { transform: scale(1); opacity: 0.95; }
              50% { transform: scale(1.03); opacity: 1; }
            }
          `}
        </style>
      </main>
    </div>
  );
};

const AssistantAvatar = () => (
  <div className="w-6 h-6 rounded-full bg-foreground/10 flex-shrink-0 overflow-hidden flex items-center justify-center mt-0.5">
    <img src={pumiLogo} alt="PUMi" className="w-4 h-4 object-contain" />
  </div>
);

const CountdownBlock = ({ value, label }: { value: number; label: string }) => (
  <div className="flex flex-col items-center">
    <div className="w-14 h-14 md:w-18 md:h-18 rounded-xl bg-secondary/40 border border-foreground/10 flex items-center justify-center">
      <span className="text-xl md:text-2xl font-light text-foreground tabular-nums">
        {String(value).padStart(2, "0")}
      </span>
    </div>
    <span className="text-[10px] md:text-xs text-muted-foreground mt-2 tracking-wider">{label}</span>
  </div>
);

export default HomePage;
