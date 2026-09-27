import { useAppStore } from "@/store/useAppStore";
import { FavoriteStarButton, FavoriteStarIcon } from "@/components/favorites/FavoriteStar";
import { useSessionFavorite } from "@/components/favorites/useSessionFavorite";

/**
 * Star for the session on screen, shown right after the breadcrumb's session
 * crumb. Hidden inside a subagent transcript: a subagent is not a row of the
 * session list, so it is not something that can be a favourite.
 */
export function HeaderFavoriteButton() {
  const selectedSession = useAppStore((s) => s.selectedSession);
  const isInSubagent = useAppStore((s) => s.parentSessionStack.length > 0);
  const session = isInSubagent ? null : selectedSession;
  const { isFavorite, canToggle, toggle } = useSessionFavorite(session);

  if (session == null) return null;
  if (!canToggle) {
    return isFavorite ? <FavoriteStarIcon className="pointer-events-auto" /> : null;
  }
  return (
    <FavoriteStarButton
      isFavorite={isFavorite}
      onToggle={toggle}
      className="h-6 w-6 pointer-events-auto"
      iconClassName="w-3.5 h-3.5"
    />
  );
}
