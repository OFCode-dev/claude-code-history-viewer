import { memo } from "react";
import { ChevronRight, Globe, Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";
import { safeStringify } from "../../utils/jsonUtils";
import { TruncatedPre } from "../common/TruncatedPre";
import { getVariantStyles, layout } from "@/components/renderers";
import { cn } from "@/lib/utils";
import { useCaptureExpandState } from "@/contexts/CaptureExpandContext";
import { ToolUseCard } from "./toolUseRenderers/ToolUseCard";

type Props = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export const ServerToolUseRenderer = memo(function ServerToolUseRenderer({
  id,
  name,
  input,
}: Props) {
  const { t } = useTranslation();
  const isWebSearch = name === "web_search";
  const variant = isWebSearch ? "web" : "mcp";
  const styles = getVariantStyles(variant);
  const [showInput, setShowInput] = useCaptureExpandState(`server-input-${id}`, false);

  return (
    <ToolUseCard
      title={
        isWebSearch
          ? t("serverToolUseRenderer.webSearch")
          : t("serverToolUseRenderer.serverTool", { name })
      }
      icon={
        isWebSearch ? (
          <Globe className={cn(layout.iconSize, styles.icon)} />
        ) : (
          <Wrench className={cn(layout.iconSize, styles.icon)} />
        )
      }
      variant={variant}
      toolId={id}
    >
      {isWebSearch && input.query !== undefined && (
        <div className={cn(layout.bodyText, "text-foreground")}>
          <span className="font-medium">
            {t("serverToolUseRenderer.query")}:
          </span>{" "}
          {String(input.query)}
        </div>
      )}
      {Object.keys(input).length > 0 &&
        !(isWebSearch && Object.keys(input).length === 1) && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowInput(prev => !prev)}
              className={cn(layout.monoText, styles.accent, "flex items-center gap-1 cursor-pointer hover:opacity-80")}
            >
              <ChevronRight className={cn("w-3 h-3 transition-transform", showInput && "rotate-90")} />
              {t("serverToolUseRenderer.showInput")}
            </button>
            {showInput && (
              <TruncatedPre
                content={safeStringify(input)}
                className={cn(layout.monoText, "mt-2 text-foreground bg-muted rounded p-2 overflow-x-auto")}
              />
            )}
          </div>
        )}
    </ToolUseCard>
  );
});
