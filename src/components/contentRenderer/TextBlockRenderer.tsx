import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useCaptureExpandState } from "@/contexts/CaptureExpandContext";
import { Markdown } from "../common";
import { HighlightedText } from "../common/HighlightedText";
import { layout } from "../renderers";
import { getMessageCollapse } from "../messageRenderer/messageCollapse";
import { ShowMoreToggle } from "../messageRenderer/ShowMoreToggle";
import { JUSTIFIED_PROSE } from "../messageRenderer/conversationLayout";

interface TextBlockRendererProps {
  text: string;
  /** Position in the content array; keeps each block's expand state apart. */
  index: number;
  searchQuery?: string;
  isCurrentMatch?: boolean;
  currentMatchIndex?: number;
}

/**
 * A text block of a content array (a later text block of an assistant reply,
 * a provider that stores turns as arrays). Same folding as the message bubble:
 * the first 10,000 characters until expanded.
 */
export function TextBlockRenderer({
  text,
  index,
  searchQuery = "",
  isCurrentMatch = false,
  currentMatchIndex = 0,
}: TextBlockRendererProps) {
  const [isExpanded, setIsExpanded] = useCaptureExpandState(`text-${index}`, false);
  const collapse = useMemo(() => getMessageCollapse(text, { markdown: true }), [text]);
  const showPreview = collapse.needsCollapse && !isExpanded;

  return (
    <div className={cn("bg-card border border-border", layout.containerPadding, layout.rounded)}>
      {searchQuery ? (
        <div className={cn("whitespace-pre-wrap text-foreground text-justify", layout.bodyText)}>
          <HighlightedText
            text={text}
            searchQuery={searchQuery}
            isCurrentMatch={isCurrentMatch}
            currentMatchIndex={currentMatchIndex}
          />
        </div>
      ) : (
        <>
          <Markdown className={cn("text-foreground", JUSTIFIED_PROSE)}>
            {showPreview ? collapse.preview : text}
          </Markdown>
          {collapse.needsCollapse && (
            <ShowMoreToggle
              isExpanded={isExpanded}
              onToggle={() => setIsExpanded((prev) => !prev)}
              className="mt-2"
            />
          )}
        </>
      )}
    </div>
  );
}
