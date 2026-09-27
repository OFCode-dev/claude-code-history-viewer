import type React from "react";
import { Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

// Favourites are marked in amber: the theme's warning hue, which each theme
// (light, dark, high contrast) tunes for contrast against its background.

interface FavoriteStarButtonProps {
  isFavorite: boolean;
  onToggle: () => void;
  className?: string;
  iconClassName?: string;
  ref?: React.Ref<HTMLButtonElement>;
}

/**
 * Star toggle. The click does not reach the row or list item it sits in, so
 * starring never also selects or opens what the star belongs to.
 */
export function FavoriteStarButton({
  isFavorite,
  onToggle,
  className,
  iconClassName = "w-3.5 h-3.5",
  ref,
}: FavoriteStarButtonProps) {
  const { t } = useTranslation();
  const label = isFavorite
    ? t("session.favorites.remove", "Remove from favorites")
    : t("session.favorites.add", "Add to favorites");

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle();
  };

  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={isFavorite}
      aria-label={label}
      title={label}
      onClick={handleClick}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isFavorite
          ? "text-warning hover:bg-warning/15"
          : "text-muted-foreground hover:bg-accent/20 hover:text-warning",
        className
      )}
    >
      <Star className={cn(iconClassName, isFavorite && "fill-current")} aria-hidden="true" />
    </button>
  );
}

/** Filled star that only marks a favourite, where it cannot be toggled. */
export function FavoriteStarIcon({ className }: { className?: string }) {
  const { t } = useTranslation();
  const label = t("session.favorites.starred", "Favorite");
  return (
    <span role="img" aria-label={label} title={label} className={cn("inline-flex shrink-0 text-warning", className)}>
      <Star className="w-3 h-3 fill-current" aria-hidden="true" />
    </span>
  );
}
