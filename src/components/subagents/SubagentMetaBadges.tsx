import { Cpu } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getSubagentStyle } from "@/utils/agentStyles";
import type { SubagentSession } from "@/types";

interface SubagentMetaBadgesProps {
  subagent: Pick<SubagentSession, "agent_type" | "model">;
  /** `pill` for roomy headers; `text` for dense list rows. */
  variant?: "pill" | "text";
  className?: string;
}

/** Agent type and model from the subagent's meta.json; renders nothing without them. */
export function SubagentMetaBadges({
  subagent,
  variant = "pill",
  className,
}: SubagentMetaBadgesProps) {
  const { t } = useTranslation();
  const agentType = subagent.agent_type?.trim();
  const model = subagent.model?.trim();
  if (!agentType && !model) return null;

  const style = getSubagentStyle(agentType);
  const TypeIcon = style.icon;

  if (variant === "text") {
    return (
      <span className={cn("inline-flex items-center gap-1.5 min-w-0", className)}>
        {agentType && (
          <span
            className={cn("truncate min-w-0 font-medium", style.text)}
            title={t("subagent.agentType", { type: agentType })}
          >
            {agentType}
          </span>
        )}
        {agentType && model && (
          <span className="shrink-0" aria-hidden="true">
            ·
          </span>
        )}
        {model && (
          <span className="shrink-0" title={t("subagent.model", { model })}>
            {model}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-1 min-w-0", className)}>
      {agentType && (
        <span
          className={cn(
            "inline-flex items-center gap-1 min-w-0 px-1.5 py-px rounded border font-mono text-px10 leading-4",
            style.bg,
            style.text,
            style.border,
          )}
          title={t("subagent.agentType", { type: agentType })}
        >
          <TypeIcon className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{agentType}</span>
        </span>
      )}
      {model && (
        <span
          className="inline-flex items-center gap-1 shrink-0 px-1.5 py-px rounded border border-border/60 bg-muted/50 font-mono text-px10 leading-4 text-muted-foreground"
          title={t("subagent.model", { model })}
        >
          <Cpu className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
          <span>{model}</span>
        </span>
      )}
    </span>
  );
}
