import { useCallback, useId, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { FavoritesList } from "@/components/favorites/FavoritesList";
import { useFavoriteSessions } from "@/components/favorites/useFavoriteSessions";

const OPEN_STORAGE_KEY = "projectTree.favoritesOpen";

function readOpenPreference(): boolean {
  try {
    return localStorage.getItem(OPEN_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

function writeOpenPreference(open: boolean): void {
  try {
    localStorage.setItem(OPEN_STORAGE_KEY, String(open));
  } catch {
    // Storage unavailable: the choice lasts this session only.
  }
}

/**
 * Starred sessions at the top of the explorer, one click from any project.
 * Collapsible (remembered); renders nothing until a session is starred.
 */
export function ExplorerFavorites() {
  const { t } = useTranslation();
  const listId = useId();
  const favorites = useFavoriteSessions();
  const [isOpen, setIsOpen] = useState(readOpenPreference);

  const toggle = useCallback(() => {
    setIsOpen((open) => {
      writeOpenPreference(!open);
      return !open;
    });
  }, []);

  if (favorites.items.length === 0) return null;

  return (
    <section className="pb-1">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        className={cn(
          "flex h-7 w-full items-end gap-1 px-3 pb-1.5 text-left",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
        )}
      >
        <ChevronRight
          aria-hidden="true"
          className={cn(
            "-ml-1 h-3 w-3 shrink-0 text-muted-foreground/70 transition-transform",
            isOpen && "rotate-90"
          )}
        />
        <span className="text-px10 font-semibold uppercase leading-none tracking-[0.08em] text-muted-foreground/80">
          {t("session.favorites.title")}
        </span>
        <span className="ml-auto text-px10 leading-none tabular-nums text-muted-foreground/60">
          {favorites.items.length}
        </span>
      </button>
      {isOpen && <FavoritesList id={listId} {...favorites} className="px-1.5" />}
    </section>
  );
}
