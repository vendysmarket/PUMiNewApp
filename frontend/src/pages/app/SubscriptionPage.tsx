import { ArrowLeft, Check, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

const SubscriptionPage = () => {
  const navigate = useNavigate();
  const { tier } = useAuth();

  const FOCUS_TEXT =
    "Fókusz mód: napi 45 perc fókusz, ami segít az aktivitásod növelésében — legyen szó tanulásról, projekt tervezésről vagy egy új készség elsajátításáról.";

  const plans = [
    {
      id: "gen_z",
      tierKey: "GEN_Z" as const,
      name: "GEN Z",
      tagline: "Teszteld 7 napig ingyen, dönts utána.",
      description: "Tinédzsereknek és fiatal felnőtteknek — amikor kell jelenlét, fókusz és digitális nyomás kezelése.",
      price: "€5",
      period: "/ hó",
      hufApprox: "kb. 2000 Ft / hó (árfolyamfüggő)",
      features: ["50 000 token / nap", FOCUS_TEXT, "Hosszú távú memória", "GEN Z hangolás"],
      paymentLink: "https://buy.stripe.com/9B628ralU03W29mbTXbbG03",
      colorClass: "border-emerald-500/30 hover:border-emerald-500/50",
      accentClass: "text-emerald-500",
      bgClass: "hover:bg-emerald-500/5",
      activeBorderClass: "border-emerald-500/60",
      buttonClass: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/20",
      disabledButtonClass: "bg-emerald-500/5 text-emerald-500/50 border-emerald-500/20",
    },
    {
      id: "millennial",
      tierKey: "MILLENNIAL" as const,
      name: "MILLENNIAL",
      tagline: "Teszteld 7 napig ingyen, dönts utána.",
      description:
        "Fiatal felnőtteknek és középkorúaknak — tervezéshez, szervezéshez, projektekhez és stabil napi struktúrához.",
      price: "€8",
      period: "/ hó",
      hufApprox: "kb. 3200 Ft / hó (árfolyamfüggő)",
      features: ["100 000 token / nap", FOCUS_TEXT, "Hosszú távú memória", "Millennial hangolás"],
      paymentLink: "https://buy.stripe.com/dRm14n2Ts9Ew3dqaPTbbG04",
      colorClass: "border-blue-500/30 hover:border-blue-500/50",
      accentClass: "text-blue-500",
      bgClass: "hover:bg-blue-500/5",
      activeBorderClass: "border-blue-500/60",
      buttonClass: "bg-blue-500/10 text-blue-500 border-blue-500/30 hover:bg-blue-500/20",
      disabledButtonClass: "bg-blue-500/5 text-blue-500/50 border-blue-500/20",
    },
  ];

  const handlePurchase = (paymentLink: string) => {
    window.location.href = paymentLink;
  };

  return (
    <div className="min-h-screen flex flex-col items-center px-4 md:px-6 py-8 md:py-12">
      {/* Back button */}
      <div className="w-full max-w-4xl mb-6 md:mb-8">
        <Button
          variant="ghost"
          onClick={() => navigate("/app/chat")}
          className="text-foreground/60 hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Vissza
        </Button>
      </div>

      {/* Header */}
      <div className="text-center mb-8 md:mb-12">
        <h1 className="text-xl md:text-2xl font-light tracking-wide text-foreground mb-2 md:mb-3">Előfizetés</h1>
        <p className="text-xs md:text-sm text-foreground/50">Válassz csomagot, vagy válts a két irány között.</p>
      </div>

      {/* Plan cards */}
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {plans.map((plan) => {
          const isActive = tier === plan.tierKey;

          return (
            <div
              key={plan.id}
              className={cn(
                "p-5 md:p-6 rounded-xl border transition-all relative flex flex-col",
                isActive ? plan.activeBorderClass : plan.colorClass,
                !isActive && plan.bgClass,
              )}
            >
              {/* Active badge */}
              {isActive && (
                <span
                  className={cn(
                    "absolute top-3 right-3 md:top-4 md:right-4 text-[10px] md:text-xs font-medium px-2 py-0.5 rounded-full border",
                    plan.accentClass,
                    plan.id === "gen_z"
                      ? "border-emerald-500/40 bg-emerald-500/10"
                      : "border-blue-500/40 bg-blue-500/10",
                  )}
                >
                  Aktív
                </span>
              )}

              {/* Tagline */}
              <p className="text-xs md:text-sm text-foreground/50 mb-3">{plan.tagline}</p>

              {/* Name */}
              <div className="pr-16 md:pr-0">
                <h2 className={cn("text-base md:text-lg font-medium", plan.accentClass)}>{plan.name}</h2>
              </div>

              {/* Price */}
              <div className="mt-4 mb-4 py-3 border-y border-foreground/10">
                <div className="flex items-baseline gap-1">
                  <span className={cn("text-2xl md:text-3xl font-light", plan.accentClass)}>{plan.price}</span>
                  <span className="text-xs md:text-sm text-foreground/40">{plan.period}</span>
                </div>
                <div className="mt-1 text-xs md:text-sm text-foreground/45">{plan.hufApprox}</div>
              </div>

              {/* Description */}
              <p className="text-xs md:text-sm text-foreground/55 leading-relaxed mb-4">{plan.description}</p>

              {/* Features */}
              <ul className="space-y-2 md:space-y-3 mb-6 flex-1">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-2 md:gap-3">
                    <Check className={cn("w-3.5 h-3.5 md:w-4 md:h-4 shrink-0 mt-0.5", plan.accentClass)} />
                    <span className="text-xs md:text-sm text-foreground/75 leading-relaxed">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <Button
                className={cn(
                  "w-full border text-sm md:text-base py-2.5 md:py-3",
                  isActive ? plan.disabledButtonClass : plan.buttonClass,
                )}
                disabled={isActive}
                onClick={() => handlePurchase(plan.paymentLink)}
              >
                {isActive ? "Aktív csomag" : "Erre váltok"}
              </Button>
            </div>
          );
        })}
      </div>

      {/* FREE block */}
      <div className="w-full max-w-4xl mt-6 md:mt-8">
        <div className="rounded-xl border border-foreground/15 bg-foreground/[0.02] p-5 md:p-6 flex items-start gap-3">
          <div className="shrink-0 mt-0.5">
            <Lock className="w-4 h-4 text-foreground/50" />
          </div>

          <div className="flex-1">
            <div className="flex items-baseline justify-between gap-4">
              <div className="text-sm md:text-base font-medium text-foreground/85">FREE</div>
              <div className="text-sm md:text-base text-foreground/60">€0</div>
            </div>

            <p className="mt-2 text-xs md:text-sm text-foreground/55 leading-relaxed">
              A FREE csomag remek a kipróbáláshoz. Ha tetszik és rendszeresen használnád, a GEN Z / MILLENNIAL ad teljes
              élményt: fókusz mód, hosszú távú memória és magasabb napi token limit.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionPage;
