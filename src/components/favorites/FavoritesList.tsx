import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { FavoriteStarButton, FavoriteStarIcon } from "./FavoriteStar";
import type { FavoriteSessionItem, UseFavoriteSessionsResult } from "./useFavoriteSessions";

export interface FavoritesListProps extends UseFavoriteSessionsResult {
  id?: string;
  className?: string;
}

/**
 * Favourite sessions, one line each: a star that unstars, the title, and the
 * project in dim text. A row opens its session; the open one is highlighted.
 * Renders nothing when there are no favourites. Data comes from
 * `useFavoriteSessions`, whose result is exactly these props.
 */
export function FavoritesList({ id, items, onOpen, onRemove, canRemove, className }: FavoritesListProps) {
  const { t } = useTranslation();
  if (items.length === 0) return null;

  return (
    <ul id={id} aria-label={t("session.favorites.title", "Favorites")} className={cn("flex flex-col", className)}>
      {items.map((item) => (
        <FavoriteRow
          key={item.entry.sessionId}
          item={item}
          onOpen={onOpen}
          onRemove={onRemove}
          canRemove={canRemove}
        />
      ))}
    </ul>
  );
}

interface FavoriteRowProps extends Pick<UseFavoriteSessionsResult, "onOpen" | "onRemove" | "canRemove"> {
  item: FavoriteSessionItem;
}

function FavoriteRow({ item, onOpen, onRemove, canRemove }: FavoriteRowProps) {
  const { entry, title, projectName, tooltip, isSelected } = item;

  return (
    <li
      className={cn(
        "flex h-7 items-center gap-1 rounded-md pl-1 pr-2 text-xs transition-colors",
        isSelected
          ? "bg-accent/10 text-foreground shadow-[inset_2px_0_0_var(--color-accent)]"
          : "text-sidebar-foreground/80 hover:bg-accent/8"
      )}
    >
      {canRemove ? (
        <FavoriteStarButton isFavorite onToggle={() => onRemove(entry)} className="h-5 w-5" iconClassName="w-3 h-3" />
      ) : (
        <FavoriteStarIcon className="w-5 justify-center" />
      )}
      <button
        type="button"
        onClick={() => onOpen(entry)}
        title={tooltip}
        aria-current={isSelected ? "true" : undefined}
        className={cn(
          "flex h-full min-w-0 flex-1 items-center gap-1.5 rounded text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        )}
      >
        {/* The title never shrinks, so the project gives way first; once the
            project is gone the title is capped at the row and truncates. */}
        <span className={cn("max-w-full shrink-0 truncate", isSelected && "font-medium")}>{title}</span>
        <span className="min-w-0 truncate text-2xs text-muted-foreground">{projectName}</span>
      </button>
    </li>
  );
}
