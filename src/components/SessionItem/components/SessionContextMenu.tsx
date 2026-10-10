import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Pencil,
  RotateCcw,
  Terminal,
  Copy,
  FileText,
  FolderOpen,
  Play,
  Trash2,
  Star,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAutoHideHold } from "@/components/AutoHide/autoHideHolds";
import { cn } from "@/lib/utils";
import { computeMenuPosition, type Boundary } from "@/utils/contextMenu";

interface SessionContextMenuProps {
  position: { x: number; y: number; boundary?: Boundary | null };
  /** Whether the session is starred; labels the favourite item */
  isFavorite?: boolean;
  /** Stars or unstars the session; the item is left out when absent */
  onToggleFavorite?: () => void;
  hasCustomName: boolean;
  readOnly: boolean;
  supportsNativeRename: boolean;
  supportsResumeCommand: boolean;
  supportsSessionDeletion: boolean;
  supportsRevealInFinder: boolean;
  providerId: string;
  onClose: () => void;
  onRenameClick: (e: React.MouseEvent) => void;
  onResetCustomName: () => void;
  onNativeRenameClick: (e: React.MouseEvent) => void;
  onCopySessionId: (e: React.MouseEvent) => void;
  onCopyResumeCommand: (e: React.MouseEvent) => void;
  onCopyFilePath: (e: React.MouseEvent) => void;
  onRevealInFinder: (e: React.MouseEvent) => void;
  onDeleteSession: (e: React.MouseEvent) => void;
}

export const SessionContextMenu: React.FC<SessionContextMenuProps> = ({
  position,
  isFavorite = false,
  onToggleFavorite,
  hasCustomName,
  readOnly,
  supportsNativeRename,
  supportsResumeCommand,
  supportsSessionDeletion,
  supportsRevealInFinder,
  providerId,
  onClose,
  onRenameClick,
  onResetCustomName,
  onNativeRenameClick,
  onCopySessionId,
  onCopyResumeCommand,
  onCopyFilePath,
  onRevealInFinder,
  onDeleteSession,
}) => {
  const { t } = useTranslation();
  // Opened from a reading-mode overlay, the menu belongs to it and holds it open.
  const ownerProps = useAutoHideHold(true);
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState({ x: position.x, y: position.y });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      onClose();
    };

    document.addEventListener("mousedown", handleClickOutside);
    // Capture phase: the menu answers Esc before selection mode even when it
    // opened later (spec §4.3, one layer per press).
    document.addEventListener("keydown", handleEscape, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape, true);
    };
  }, [onClose]);

  // Close on scroll or resize. Arm one animation frame after mount so a
  // synchronous scroll burst during the click-to-open sequence can't close
  // the menu immediately. Capture phase on scroll catches scroll on any
  // descendant (scroll events don't bubble, but capture flows root → target).
  // removeEventListener must match the capture flag or the listener leaks.
  useEffect(() => {
    let armed = false;
    const raf = requestAnimationFrame(() => {
      armed = true;
    });
    const handleScroll = () => {
      if (armed) onClose();
    };
    const handleResize = () => {
      if (armed) onClose();
    };
    document.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    window.addEventListener("resize", handleResize);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("scroll", handleScroll, { capture: true });
      window.removeEventListener("resize", handleResize);
    };
  }, [onClose]);

  useLayoutEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      setAdjustedPosition(
        computeMenuPosition(
          { x: position.x, y: position.y },
          { width: rect.width, height: rect.height },
          position.boundary,
        ),
      );
    }
  }, [position]);

  const menuItemClass = cn(
    "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm",
    "hover:bg-accent hover:text-accent-foreground",
    "transition-colors cursor-pointer"
  );

  const handleAction = (handler: ((e: React.MouseEvent) => void) | (() => void)) => {
    return (e: React.MouseEvent) => {
      e.stopPropagation();
      handler(e);
      onClose();
    };
  };

  return createPortal(
    <div
      ref={menuRef}
      {...ownerProps}
      role="menu"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      className={cn(
        "fixed z-50 min-w-[200px] rounded-lg border shadow-lg",
        "bg-popover border-border",
        "animate-in fade-in-0 zoom-in-95 duration-100"
      )}
      style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
    >
      <div className="p-1">
        {onToggleFavorite && (
          <button type="button" role="menuitem" onClick={handleAction(onToggleFavorite)} className={menuItemClass}>
            <Star className={cn("w-3.5 h-3.5", isFavorite && "fill-current text-warning")} />
            <span>
              {isFavorite
                ? t("session.favorites.remove", "Remove from favorites")
                : t("session.favorites.add", "Add to favorites")}
            </span>
          </button>
        )}

        {!readOnly && (
          <button type="button" role="menuitem" onClick={handleAction(onRenameClick)} className={menuItemClass}>
            <Pencil className="w-3.5 h-3.5" />
            <span>{t("session.renameMenuItem", "Rename")}</span>
          </button>
        )}

        {!readOnly && hasCustomName && (
          <button type="button" role="menuitem" onClick={handleAction(onResetCustomName)} className={menuItemClass}>
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t("session.resetName", "Reset name")}</span>
          </button>
        )}

        {!readOnly && supportsNativeRename && (
          <>
            <div className="my-1 border-t border-border/50" />
            <button type="button" role="menuitem" onClick={handleAction(onNativeRenameClick)} className={menuItemClass}>
              <Terminal className="w-3.5 h-3.5" />
              <span>
                {providerId === "opencode"
                  ? t("session.nativeRename.menuItemOpenCode", "Rename in OpenCode")
                  : providerId === "codex"
                    ? t("session.nativeRename.menuItemCodex", "Rename in Codex CLI")
                  : providerId === "forgecode"
                    ? t("session.nativeRename.menuItemForgeCode", "Rename in ForgeCode")
                    : t("session.nativeRename.menuItem", "Rename in Claude Code")}
              </span>
            </button>
          </>
        )}

        {!readOnly && <div className="my-1 border-t border-border/50" />}

        <button type="button" role="menuitem" onClick={handleAction(onCopySessionId)} className={menuItemClass}>
          <Copy className="w-3.5 h-3.5" />
          <span>{t("session.copySessionId", "Copy Session ID")}</span>
        </button>

        {supportsResumeCommand && (
          <button type="button" role="menuitem" onClick={handleAction(onCopyResumeCommand)} className={menuItemClass}>
            <Play className="w-3.5 h-3.5" />
            <span>{t("session.copyResumeCommand", "Copy Resume Command")}</span>
          </button>
        )}

        <button type="button" role="menuitem" onClick={handleAction(onCopyFilePath)} className={menuItemClass}>
          <FileText className="w-3.5 h-3.5" />
          <span>{t("session.copyFilePath", "Copy File Path")}</span>
        </button>

        {supportsRevealInFinder && (
          <button type="button" role="menuitem" onClick={handleAction(onRevealInFinder)} className={menuItemClass}>
            <FolderOpen className="w-3.5 h-3.5" />
            <span>{t("session.showJsonlFile", "Show JSONL File")}</span>
          </button>
        )}

        {supportsSessionDeletion && (
          <>
            <div className="my-1 border-t border-border/50" />

            <button
              type="button"
              role="menuitem"
              onClick={handleAction(onDeleteSession)}
              className={cn(menuItemClass, "text-destructive hover:text-destructive")}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t("session.deleteSession", "Delete Session")}</span>
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  );
};
