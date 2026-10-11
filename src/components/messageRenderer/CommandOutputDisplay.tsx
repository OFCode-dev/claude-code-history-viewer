/**
 * CommandOutputDisplay Component
 *
 * Displays command output with intelligent formatting based on content type.
 * Supports JSON, test results, build output, package management, tables, and terminal output.
 * Uses design tokens for consistent theming.
 *
 * @example
 * ```tsx
 * <CommandOutputDisplay stdout={commandResult.stdout} />
 * ```
 */

import React from "react";
import { Terminal, Package, TestTube, Hammer, BarChart3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getVariantStyles, layout } from "@/components/renderers";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/theme";
import { AnsiText } from "@/components/common/AnsiText";
import { CodeHighlight } from "@/components/common/CodeHighlight";

interface CommandOutputDisplayProps {
  stdout: string;
}

/** Header icon, label and style of each non-JSON output kind; `scroll` caps the body height. */
const OUTPUT_KINDS = {
  test: {
    Icon: TestTube,
    labelKey: "commandOutputDisplay.testResults",
    defaultValue: "Test Results",
    variant: "success",
    scroll: false,
  },
  build: {
    Icon: Hammer,
    labelKey: "commandOutputDisplay.buildOutput",
    defaultValue: "Build Output",
    variant: "terminal",
    scroll: true,
  },
  package: {
    Icon: Package,
    labelKey: "commandOutputDisplay.packageManagement",
    defaultValue: "Package Management",
    variant: "terminal",
    scroll: true,
  },
  table: {
    Icon: BarChart3,
    labelKey: "commandOutputDisplay.tableOutput",
    defaultValue: "Table Output",
    variant: "neutral",
    scroll: true,
  },
  terminal: {
    Icon: Terminal,
    labelKey: "commandOutputDisplay.terminalOutput",
    defaultValue: "Terminal Output",
    variant: "terminal",
    scroll: true,
  },
} as const;

/** Detect the output kind (checked in this order; the first match wins). */
const detectOutputKind = (stdout: string): keyof typeof OUTPUT_KINDS => {
  if (
    stdout.includes("Test Suites:") ||
    stdout.includes("jest") ||
    stdout.includes("coverage")
  ) {
    return "test";
  }
  if (
    stdout.includes("webpack") ||
    stdout.includes("build") ||
    stdout.includes("compile")
  ) {
    return "build";
  }
  if (
    stdout.includes("npm") ||
    stdout.includes("yarn") ||
    stdout.includes("pnpm")
  ) {
    return "package";
  }
  if (
    stdout.includes("|") &&
    stdout.includes("-") &&
    stdout.split("\n").length > 2
  ) {
    return "table";
  }
  return "terminal";
};

export const CommandOutputDisplay: React.FC<CommandOutputDisplayProps> = ({
  stdout,
}) => {
  const { t } = useTranslation();
  const { isDarkMode } = useTheme();

  // JSON 출력 처리
  const isJsonOutput =
    stdout.trim().startsWith("{") && stdout.trim().endsWith("}");
  if (isJsonOutput) {
    try {
      const parsed = JSON.parse(stdout);
      const neutralStyles = getVariantStyles("neutral");
      return (
        <div className="bg-card rounded border border-border">
          <div
            className={cn(
              layout.headerPadding,
              layout.smallText,
              neutralStyles.badge,
              neutralStyles.badgeText
            )}
          >
            {t("commandOutputDisplay.jsonOutput", {
              defaultValue: "JSON Output",
            })}
          </div>
          <CodeHighlight
            code={JSON.stringify(parsed, null, 2)}
            language="json"
            isDarkMode={isDarkMode}
            preOverrides={{
              fontSize: "calc(0.6875rem * var(--app-font-scale))",
              padding: "0.75rem",
            }}
          />
        </div>
      );
    } catch {
      // JSON 파싱 실패시 일반 텍스트로 처리
    }
  }

  const { Icon, labelKey, defaultValue, variant, scroll } =
    OUTPUT_KINDS[detectOutputKind(stdout)];
  const styles = getVariantStyles(variant);
  const body = (
    <pre className={cn(layout.monoText, "text-foreground/80 whitespace-pre-wrap p-3")}>
      <AnsiText text={stdout} />
    </pre>
  );

  return (
    <div className="bg-card rounded border border-border">
      <div
        className={cn(
          "flex items-center",
          layout.headerPadding,
          layout.iconSpacing,
          layout.smallText,
          styles.badge,
          styles.badgeText
        )}
      >
        <Icon className={layout.iconSize} />
        <span>{t(labelKey, { defaultValue })}</span>
      </div>
      {scroll ? (
        <div className="max-h-80 overflow-y-auto scrollbar-thin">{body}</div>
      ) : (
        body
      )}
    </div>
  );
};
