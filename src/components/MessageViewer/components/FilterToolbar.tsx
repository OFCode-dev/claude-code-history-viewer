import { Filter, RotateCcw, User, Bot, MessageSquareText, MessagesSquare, Brain, Wrench, Terminal, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useAppStore } from "../../../store/useAppStore";

interface FilterToggleProps {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  /** Tooltip; defaults to the label. */
  title?: string;
  disabled?: boolean;
  /** Keep the text label even when the toolbar is narrow. */
  alwaysShowLabel?: boolean;
  /** Where a reading-mode chip lands focus (`data-autohide-focus`). */
  focusKey?: "dialogue" | "filters";
}

function FilterToggle({
  active,
  onClick,
  label,
  icon,
  title,
  disabled = false,
  alwaysShowLabel = false,
  focusKey,
}: FilterToggleProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-autohide-focus={focusKey}
      className={cn(
        "flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs border transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-accent/15 text-accent border-accent/30"
          : "bg-transparent text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/50",
        disabled && "opacity-40 cursor-not-allowed hover:bg-transparent"
      )}
      aria-pressed={active}
      aria-label={label}
      title={title ?? label}
    >
      {icon}
      {/* Icon-only while the toolbar is narrower than ~640px, so it stays on one line. */}
      <span className={alwaysShowLabel ? undefined : "hidden @[40rem]:inline"}>{label}</span>
    </button>
  );
}

interface FilterToolbarProps {
  totalCount: number;
  filteredCount: number;
  hasParallelTasks: boolean;
}

export function FilterToolbar({ totalCount, filteredCount, hasParallelTasks }: FilterToolbarProps) {
  const { t } = useTranslation();
  const {
    messageFilter,
    toggleRole,
    toggleContentType,
    toggleDialogue,
    resetMessageFilter,
    isMessageFilterActive,
  } = useAppStore();

  const isActive = isMessageFilterActive();
  // The dialogue view overrides the individual toggles; they keep their state
  // for when it is turned off, but cannot be changed meanwhile.
  const isDialogue = messageFilter.dialogue;

  return (
    <div
      className={cn(
        "@container flex flex-wrap items-center gap-1.5 px-3 py-1 border-b border-border/30 shrink-0 min-h-[32px]",
        isActive && "bg-accent/5"
      )}
    >
      {/* Filter icon + count */}
      <div className="flex items-center gap-1 shrink-0">
        <Filter className={cn("w-3.5 h-3.5 shrink-0", isActive ? "text-accent" : "text-muted-foreground")} />
        <span className={cn("text-2xs tabular-nums whitespace-nowrap", isActive ? "text-accent font-medium" : "text-muted-foreground")}>
          {isActive
            ? t("filter.showing", { filtered: filteredCount, total: totalCount })
            : totalCount}
        </span>
      </div>

      <div className="h-3.5 w-px bg-border/40 shrink-0" />

      <FilterToggle
        active={isDialogue}
        onClick={toggleDialogue}
        label={t("dialogue.toggle")}
        title={t("dialogue.tooltip")}
        icon={<MessagesSquare className="w-3 h-3" />}
        alwaysShowLabel
        focusKey="dialogue"
      />

      <div className="h-3.5 w-px bg-border/40 shrink-0" />

      {/* Role filters */}
      <div className="flex items-center gap-0.5 shrink-0">
        <FilterToggle
          active={messageFilter.roles.user}
          disabled={isDialogue}
          onClick={() => toggleRole("user")}
          label={t("filter.role.user")}
          focusKey="filters"
          icon={<User className="w-3 h-3" />}
        />
        <FilterToggle
          active={messageFilter.roles.assistant}
          disabled={isDialogue}
          onClick={() => toggleRole("assistant")}
          label={t("filter.role.assistant")}
          icon={<Bot className="w-3 h-3" />}
        />
      </div>

      <div className="h-3.5 w-px bg-border/40 shrink-0" />

      {/* Content type filters */}
      <div className="flex items-center gap-0.5 shrink-0">
        <FilterToggle
          active={messageFilter.contentTypes.text}
          disabled={isDialogue}
          onClick={() => toggleContentType("text")}
          label={t("filter.content.text")}
          icon={<MessageSquareText className="w-3 h-3" />}
        />
        <FilterToggle
          active={messageFilter.contentTypes.thinking}
          disabled={isDialogue}
          onClick={() => toggleContentType("thinking")}
          label={t("filter.content.thinking")}
          icon={<Brain className="w-3 h-3" />}
        />
        <FilterToggle
          active={messageFilter.contentTypes.toolCalls}
          disabled={isDialogue}
          onClick={() => toggleContentType("toolCalls")}
          label={t("filter.content.toolCalls")}
          icon={<Wrench className="w-3 h-3" />}
        />
        <FilterToggle
          active={messageFilter.contentTypes.commands}
          disabled={isDialogue}
          onClick={() => toggleContentType("commands")}
          label={t("filter.content.commands")}
          icon={<Terminal className="w-3 h-3" />}
        />
        {hasParallelTasks && (
          <FilterToggle
            active={messageFilter.contentTypes.parallelTasks}
            disabled={isDialogue}
            onClick={() => toggleContentType("parallelTasks")}
            label={t("filter.content.parallelTasks")}
            icon={<Zap className="w-3 h-3" />}
          />
        )}
      </div>

      {/* Reset button */}
      {isActive && (
        <>
          <div className="h-3.5 w-px bg-border/40 shrink-0" />
          <button
            onClick={resetMessageFilter}
            className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors shrink-0"
            aria-label={t("filter.reset")}
            title={t("filter.reset")}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  );
}
