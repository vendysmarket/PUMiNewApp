import { cn } from "@/lib/utils";
import pumiLogo from "@/assets/pumi-logo.png";

interface PumiLogoProps {
  className?: string;
  animate?: boolean;
}

const PumiLogo = ({ className, animate = false }: PumiLogoProps) => {
  return (
    <img
      src={pumiLogo}
      alt="PUMi"
      className={cn(
        "object-contain",
        animate ? "animate-pulse-soft" : "",
        className
      )}
    />
  );
};

export default PumiLogo;
