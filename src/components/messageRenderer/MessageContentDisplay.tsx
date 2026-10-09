import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CommandRenderer, ImageRenderer, TaskNotificationRenderer, hasTaskNotification } from "../contentRenderer";
import { isImageUrl, isBase64Image } from "../../utils/messageUtils";
import { TooltipButton } from "../../shared/TooltipButton";
import { HighlightedText } from "../common";
import { layout } from "@/components/renderers";
import { cn } from "@/lib/utils";
import { REMARK_PLUGINS, REHYPE_PLUGINS } from "@/lib/markdownPlugins";
import { useCaptureExpandState } from "@/contexts/CaptureExpandContext";
import { CONVERSATION_CARD_WIDTH, JUSTIFIED_PROSE } from "./conversationLayout";
import { getMessageCollapse } from "./messageCollapse";
import { ShowMoreToggle } from "./ShowMoreToggle";

// Tables show every row; a wide one scrolls inside its own box instead of
// widening the conversation.
const ScrollableTable = (props: React.HTMLAttributes<HTMLTableElement>) => (
  <div className="max-w-full overflow-x-auto">
    <table {...props} />
  </div>
);

interface MessageContentDisplayProps {
  content: string | null;
  messageType: string;
  searchQuery?: string;
  isCurrentMatch?: boolean;
  currentMatchIndex?: number; // 메시지 내에서 현재 활성화된 매치 인덱스
}

export const MessageContentDisplay: React.FC<MessageContentDisplayProps> = ({
  content,
  messageType,
  searchQuery = "",
  isCurrentMatch = false,
  currentMatchIndex = 0,
}) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useCaptureExpandState("content", false);

  // Messages over MESSAGE_PREVIEW_CHARS show their first 10,000 characters
  // until expanded; shorter ones always show in full.
  const collapse = useMemo(
    () =>
      typeof content === "string"
        ? getMessageCollapse(content, { markdown: messageType === "assistant" })
        : null,
    [content, messageType]
  );
  const needsExpand = !!collapse?.needsCollapse;

  if (!content) return null;

  if (typeof content === "string") {
    // Strip code blocks (``` ... ```) and inline code (` ... `) before testing
    // so that tags mentioned inside code examples don't trigger special renderers
    const contentWithoutCode = content
      .replace(/```[\s\S]*?```/g, "")
      .replace(/~~~[\s\S]*?~~~/g, "")
      .replace(/`[^`\n]*`/g, "");

    // Check for task-notification tags (agent task results)
    if (hasTaskNotification(contentWithoutCode)) {
      return <TaskNotificationRenderer text={content} />;
    }

    const hasCommandTags =
      /<command-name>[\s\S]*?<\/command-name>/.test(contentWithoutCode) ||
      /<command-message>[\s\S]*?<\/command-message>/.test(contentWithoutCode) ||
      /<command-args>[\s\S]*?<\/command-args>/.test(contentWithoutCode) ||
      /<local-command-caveat>[\s\S]*?<\/local-command-caveat>/.test(contentWithoutCode) ||
      /<[^>]*-stdout>[\s\S]*?<\/[^>]*>/.test(contentWithoutCode) ||
      /<[^>]*-stderr>[\s\S]*?<\/[^>]*>/.test(contentWithoutCode);

    if (hasCommandTags) {
      return <CommandRenderer text={content} />;
    }

    if (isImageUrl(content) || isBase64Image(content)) {
      return <ImageRenderer imageUrl={content} />;
    }

    const imageMatch = content.match(
      /(data:image\/[^;\s]+;base64,[A-Za-z0-9+/=]+|https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|svg|webp))/i
    );
    if (imageMatch && imageMatch[1]) {
      const imageUrl = imageMatch[1];
      const textWithoutImage = content.replace(imageMatch[0], "").trim();

      return (
        <>
          <ImageRenderer imageUrl={imageUrl} />
          {textWithoutImage && textWithoutImage.length > 0 && (
            <div className="mt-2">
              <MessageContentDisplay
                content={textWithoutImage}
                messageType={messageType}
                searchQuery={searchQuery}
                isCurrentMatch={isCurrentMatch}
                currentMatchIndex={currentMatchIndex}
              />
            </div>
          )}
        </>
      );
    }
  }

  if (typeof content !== "string") {
    return null; // Or some other fallback for non-string content
  }

  if (messageType === "user") {
    const showPreview = needsExpand && !isExpanded && !searchQuery;
    const displayContent = showPreview ? collapse!.preview : content;

    // Human prompts render as PromptCard; this is the fallback for other user
    // records that carry plain text. Left-aligned and neutral so it does not
    // read as something the person typed.
    return (
      <div className="mb-3 flex justify-start">
        <div className={cn(CONVERSATION_CARD_WIDTH, "bg-muted/40 text-foreground rounded-lg px-4 py-2.5 relative group border border-border")}>
          <div className={cn(
            "whitespace-pre-wrap break-words text-justify",
            layout.bodyText
          )}>
            {searchQuery ? (
              <HighlightedText
                text={content}
                searchQuery={searchQuery}
                isCurrentMatch={isCurrentMatch}
                currentMatchIndex={currentMatchIndex}
              />
            ) : (
              displayContent
            )}
          </div>

          {needsExpand && !searchQuery && (
            <ShowMoreToggle
              isExpanded={isExpanded}
              onToggle={() => setIsExpanded((prev) => !prev)}
              className="mt-1.5"
            />
          )}

          <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <TooltipButton
              onClick={() => navigator.clipboard.writeText(content)}
              className="p-1 rounded-full transition-colors bg-muted hover:bg-muted/80 text-muted-foreground"
              content={t("messageContentDisplay.copyMessage")}
            >
              <Copy className={layout.iconSizeSmall} />
            </TooltipButton>
          </div>
        </div>
      </div>
    );
  } else if (messageType === "assistant") {
    const showPreview = needsExpand && !isExpanded && !searchQuery;
    const displayContent = showPreview ? collapse!.preview : content;

    return (
      <div className="mb-3 flex justify-start">
        <div className={cn(CONVERSATION_CARD_WIDTH, "bg-secondary text-secondary-foreground rounded-2xl px-4 py-3 relative group shadow-sm border border-border")}>
          {/* 검색 중일 때는 plain text로 렌더링 (성능 + 하이라이팅) */}
          {searchQuery ? (
            <div className={`whitespace-pre-wrap break-words ${layout.bodyText}`}>
              <HighlightedText
                text={content}
                searchQuery={searchQuery}
                isCurrentMatch={isCurrentMatch}
                currentMatchIndex={currentMatchIndex}
              />
            </div>
          ) : (
            <div className={cn(
              layout.prose,
              JUSTIFIED_PROSE,
              "prose-headings:text-foreground prose-p:text-foreground prose-a:text-accent",
              "prose-code:text-foreground prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded",
              "prose-pre:bg-card prose-pre:text-foreground prose-pre:border prose-pre:border-border",
              "prose-blockquote:text-muted-foreground prose-blockquote:border-l-4 prose-blockquote:border-accent prose-blockquote:pl-4",
              "prose-ul:text-foreground prose-ol:text-foreground prose-li:text-foreground"
            )}>
              <ReactMarkdown
                remarkPlugins={REMARK_PLUGINS}
                rehypePlugins={REHYPE_PLUGINS}
                skipHtml
                components={{
                  table: ScrollableTable,
                }}
              >
                {displayContent}
              </ReactMarkdown>
            </div>
          )}

          {needsExpand && !searchQuery && (
            <ShowMoreToggle
              isExpanded={isExpanded}
              onToggle={() => setIsExpanded((prev) => !prev)}
              className="mt-2"
            />
          )}

          <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <TooltipButton
              onClick={() => navigator.clipboard.writeText(content)}
              className="p-1 rounded-full transition-colors bg-muted hover:bg-muted/80 text-muted-foreground"
              content={t("messageContentDisplay.copyMessage")}
            >
              <Copy className={layout.iconSizeSmall} />
            </TooltipButton>
          </div>
        </div>
      </div>
    );
  }

  // Fallback for other message types like 'system'
  return (
    <div className={layout.prose}>
      <div className="whitespace-pre-wrap text-foreground">
        {searchQuery ? (
          <HighlightedText
            text={content}
            searchQuery={searchQuery}
            isCurrentMatch={isCurrentMatch}
            currentMatchIndex={currentMatchIndex}
          />
        ) : (
          content
        )}
      </div>
    </div>
  );
};
