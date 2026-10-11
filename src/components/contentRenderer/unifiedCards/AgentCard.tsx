import { memo } from "react";
import {
  CheckCircle2,
  Bot,
  PlayCircle, Timer, Cpu, Hammer,
  ExternalLink,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Renderer } from "@/shared/RendererHeader";
import { getVariantStyles, layout } from "../../renderers";
import { Markdown } from "../../common/Markdown";
import { getSubagentStyle } from "@/utils/agentStyles";
import type { Props } from "./shared";
import { str, isError } from "./shared";
import { StatusBadge } from "./StatusBadge";
import { ResultBlock } from "./ResultBlock";
import { ToolIdBadge } from "./ToolIdBadge";
import { CollapsibleSection } from "./CollapsibleSection";
import { extractWorkflowResultText } from "./workflowParsing";
import { useAppStore } from "../../../store/useAppStore";
import { useSubagentForToolUse } from "../../subagents/useSubagentForToolUse";
import { openSubagentKeepingFocus } from "../../subagents/subagentFocus";
import { getSubagentLabel } from "@/utils/subagentLabel";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return s % 60 > 0 ? `${m}m ${s % 60}s` : `${m}m`;
}
function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export const AgentCard = memo(function AgentCard({ toolUse, toolResults }: Props) {
  const { t } = useTranslation();

  const toolId = (toolUse.id as string) || "";
  // The transcript this call spawned, when the session's subagents identify it.
  const subagent = useSubagentForToolUse(toolId);
  const navigateToSubagent = useAppStore((s) => s.navigateToSubagent);
  const input = (toolUse.input as Record<string, unknown>) ?? {};
  const description = str(input, "description") ?? "";
  const prompt = str(input, "prompt") ?? "";
  const subagentType = str(input, "subagent_type") ?? undefined;
  const runInBackground = input.run_in_background === true;
  const model = str(input, "model");
  const isolation = str(input, "isolation");

  const badge = getSubagentStyle(subagentType);
  const SubIcon = badge.icon;
  const taskStyles = getVariantStyles("task");

  const hasResult = toolResults.length > 0;
  const resultText = hasResult ? extractWorkflowResultText(toolResults) : null;
  const first = toolResults[0];
  const totalDurationMs = first?.totalDurationMs as number | undefined;
  const totalTokens = first?.totalTokens as number | undefined;
  const totalToolUseCount = first?.totalToolUseCount as number | undefined;

  return (
    <Renderer className={taskStyles.container} hasError={toolResults.some(isError)} expandKey={`unified-${(toolUse.id as string) || ""}`}>
      <Renderer.Header
        title={t("renderers.agentTool.title", { defaultValue: "Agent" })}
        icon={<Bot className={cn(layout.iconSize, taskStyles.icon)} />}
        titleClassName={taskStyles.title}
        rightContent={
          <div className={cn("flex items-center gap-2", layout.smallText)}>
            {subagentType && (
              <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 font-mono text-px11 uppercase tracking-wide", layout.rounded, badge.bg, badge.text, "border", badge.border)}>
                <SubIcon className="w-3 h-3" />{subagentType}
              </span>
            )}
            {runInBackground && (
              <span className={cn("px-1.5 py-0.5", layout.rounded, "bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30")}>
                {t("renderers.agentTool.background", { defaultValue: "background" })}
              </span>
            )}
            {/* Open the spawned subagent's transcript — in the header so it
                stays reachable while the card is collapsed; left out of
                screenshot captures, where it cannot be clicked. */}
            {subagent && (
              <button
                type="button"
                onClick={() => {
                  void openSubagentKeepingFocus(navigateToSubagent, subagent);
                }}
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 font-medium",
                  "in-[[data-capture-root]]:hidden",
                  layout.rounded,
                  "bg-primary/10 text-primary hover:bg-primary/20 transition-colors",
                  "border border-primary/20",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
                aria-label={t("subagent.openTranscriptOf", { label: getSubagentLabel(subagent) })}
                title={t("renderers.agentTool.messages", {
                  defaultValue: "{{count}} messages",
                  count: subagent.message_count,
                })}
              >
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
                {t("subagent.openTranscript")}
              </button>
            )}
            <StatusBadge results={toolResults} />
            <ToolIdBadge toolId={toolId} badgeClassName={taskStyles.badge} badgeTextClassName={taskStyles.badgeText} />
          </div>
        }
      />
      <Renderer.Content>
        {/* Description */}
        {description && (
          <div className={cn("flex items-start gap-2 p-2.5 mb-3 border", layout.rounded, taskStyles.badge, "border-tool-task/30")}>
            <SubIcon className={cn("w-4 h-4 shrink-0 mt-0.5", badge.text)} />
            <span className={cn(layout.bodyText, "text-foreground font-medium")}>{description}</span>
          </div>
        )}

        {/* Meta */}
        {(model || isolation) && (
          <div className={cn("mb-3 flex items-center gap-3 flex-wrap", layout.smallText)}>
            {model && <span className="flex items-center gap-1 text-muted-foreground"><Cpu className="w-3 h-3" /><code className={layout.monoText}>{model}</code></span>}
            {isolation && <span className="text-muted-foreground">{t("renderers.agentTool.isolation", { defaultValue: "Isolation" })}: <code className={cn("px-1.5 py-0.5", layout.rounded, "bg-muted/50 border border-border")}>{isolation}</code></span>}
          </div>
        )}

        {/* Prompt — collapsible markdown */}
        {prompt && (
          <CollapsibleSection
            className="mb-3"
            icon={<PlayCircle className={cn("w-3.5 h-3.5", taskStyles.icon)} />}
            label={t("renderers.agentTool.prompt", { defaultValue: "Prompt" })}
            ariaLabel={t("renderers.agentTool.togglePrompt", { defaultValue: "Toggle prompt" })}
            summary={<span className={cn(layout.smallText, "text-muted-foreground truncate flex-1")}>— {prompt.split("\n")[0]?.slice(0, 80)}{(prompt.split("\n")[0]?.length ?? 0) > 80 ? "…" : ""}</span>}
          >
            <div className="px-3 py-2 border-t border-border max-h-96 overflow-y-auto"><Markdown className="text-foreground/90">{prompt}</Markdown></div>
          </CollapsibleSection>
        )}

        {/* Result — collapsible markdown with stats */}
        {hasResult && resultText ? (
          <CollapsibleSection
            icon={<CheckCircle2 className="w-3.5 h-3.5 text-success" />}
            label={t("renderers.agentTool.result", { defaultValue: "Result" })}
            ariaLabel={t("renderers.agentTool.toggleResult", { defaultValue: "Toggle result" })}
            right={
              <div className={cn("flex items-center gap-2 ml-auto", layout.smallText)}>
                {totalDurationMs != null && <span className="inline-flex items-center gap-1 text-muted-foreground"><Timer className="w-3 h-3" />{formatDuration(totalDurationMs)}</span>}
                {totalTokens != null && <span className="inline-flex items-center gap-1 text-muted-foreground"><Cpu className="w-3 h-3" />{formatTokens(totalTokens)}</span>}
                {totalToolUseCount != null && <span className="inline-flex items-center gap-1 text-muted-foreground"><Hammer className="w-3 h-3" />{totalToolUseCount}</span>}
              </div>
            }
          >
            <div className="px-3 py-2 border-t border-border max-h-[32rem] overflow-y-auto"><Markdown className="text-foreground/90">{resultText}</Markdown></div>
          </CollapsibleSection>
        ) : (
          <ResultBlock results={toolResults} />
        )}
      </Renderer.Content>
    </Renderer>
  );
});
