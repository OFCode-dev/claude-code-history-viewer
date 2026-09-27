// src/components/ProjectTree/components/HighlightText.tsx
import React from "react";
import type { TextRange } from "../../../utils/explorerModel";

interface HighlightTextProps {
  text: string;
  ranges?: readonly TextRange[];
}

/** `text` with the filter's matches wrapped in `<mark>`. */
export const HighlightText: React.FC<HighlightTextProps> = ({ text, ranges }) => {
  if (!ranges || ranges.length === 0) return <>{text}</>;

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) parts.push(text.slice(cursor, range.start));
    parts.push(
      <mark key={range.start} className="rounded-[2px] bg-accent/25 text-inherit">
        {text.slice(range.start, range.end)}
      </mark>
    );
    cursor = range.end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
};
