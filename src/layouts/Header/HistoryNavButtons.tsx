import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { TooltipButton } from "@/shared/TooltipButton";
import { isWebUI } from "@/utils/platform";

/**
 * The parts of the Navigation API used here. It is not in every engine (nor in
 * TypeScript's DOM lib yet), so it is read defensively.
 */
interface NavigationLike extends EventTarget {
  canGoBack: boolean;
  canGoForward: boolean;
}

function getNavigation(): NavigationLike | null {
  if (typeof window === "undefined") return null;
  const navigation = (window as unknown as { navigation?: NavigationLike }).navigation;
  return navigation != null && typeof navigation.canGoBack === "boolean" ? navigation : null;
}

interface HistoryAvailability {
  canGoBack: boolean;
  canGoForward: boolean;
}

/**
 * Whether the browser history has an entry to go back / forward to. Without
 * the Navigation API there is no way to tell, so both stay enabled.
 */
function useHistoryAvailability(): HistoryAvailability {
  const [availability, setAvailability] = useState<HistoryAvailability>(() => {
    const navigation = getNavigation();
    return navigation
      ? { canGoBack: navigation.canGoBack, canGoForward: navigation.canGoForward }
      : { canGoBack: true, canGoForward: true };
  });

  useEffect(() => {
    const navigation = getNavigation();
    if (!navigation) return;
    const update = () =>
      setAvailability({
        canGoBack: navigation.canGoBack,
        canGoForward: navigation.canGoForward,
      });
    update();
    navigation.addEventListener("currententrychange", update);
    window.addEventListener("popstate", update);
    return () => {
      navigation.removeEventListener("currententrychange", update);
      window.removeEventListener("popstate", update);
    };
  }, []);

  return availability;
}

const buttonClass = cn(
  "p-1.5 rounded-md transition-colors text-muted-foreground",
  "hover:text-foreground hover:bg-muted",
  "disabled:opacity-40 disabled:pointer-events-none"
);

/**
 * Browser Back / Forward for the WebUI, where session and message selection
 * are recorded in the URL. The desktop build has no history to walk.
 */
export function HistoryNavButtons({ className }: { className?: string }) {
  if (!isWebUI()) return null;
  return <HistoryNavButtonsInner className={className} />;
}

function HistoryNavButtonsInner({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { canGoBack, canGoForward } = useHistoryAvailability();

  return (
    <div className={cn("flex items-center shrink-0", className)}>
      <TooltipButton
        onClick={() => window.history.back()}
        disabled={!canGoBack}
        className={buttonClass}
        content={t("header.history.back")}
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
      </TooltipButton>
      <TooltipButton
        onClick={() => window.history.forward()}
        disabled={!canGoForward}
        className={buttonClass}
        content={t("header.history.forward")}
      >
        <ArrowRight className="w-4 h-4" aria-hidden="true" />
      </TooltipButton>
    </div>
  );
}
