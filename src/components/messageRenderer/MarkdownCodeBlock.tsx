import React, { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { CodeHighlight } from "../common/CodeHighlight";
import { useCopyButton } from "../../hooks/useCopyButton";

// Prism needs the theme as a prop, so follow the root "dark" class.
const useIsDarkMode = () => {
  const [isDarkMode, setIsDarkMode] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const updateTheme = () => setIsDarkMode(root.classList.contains("dark"));
    const observer = new MutationObserver(updateTheme);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["class"],
    });
    updateTheme();
    return () => observer.disconnect();
  }, []);

  return isDarkMode;
};

export const MarkdownCodeBlock: React.FC<React.HTMLAttributes<HTMLPreElement>> = ({
  children,
}) => {
  const { t } = useTranslation();
  const { renderCopyButton } = useCopyButton();
  const copyId = useId();
  const isDarkMode = useIsDarkMode();
  const child = React.Children.toArray(children)[0];
  const codeProps = React.isValidElement<{
    className?: string;
    children?: string;
  }>(child)
    ? child.props
    : undefined;
  const rawCode = (codeProps?.children ?? "").replace(/\r?\n$/, "");
  const language =
    /(?:^|\s)language-(\S+)/.exec(codeProps?.className ?? "")?.[1] ?? "text";

  return (
    <div className="relative group/code my-3 text-left">
      <div className="absolute top-2 right-2 z-10 opacity-0 group-hover/code:opacity-100 group-focus-within/code:opacity-100 transition-opacity">
        {renderCopyButton(rawCode, copyId, t("copyButton.copy"), true)}
      </div>
      <CodeHighlight
        code={rawCode}
        language={language}
        isDarkMode={isDarkMode}
        preOverrides={{
          textAlign: "left",
          whiteSpace: "pre",
          overflowWrap: "normal",
          wordBreak: "normal",
          overflowX: "auto",
        }}
      />
    </div>
  );
};
