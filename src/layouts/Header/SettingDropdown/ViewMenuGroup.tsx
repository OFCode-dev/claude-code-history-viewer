import {
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { useAppStore } from "@/store/useAppStore";
import { useTranslation } from "react-i18next";
import { Map as MapIcon } from "lucide-react";

/**
 * Design §7 / Decision 1: a new "View" heading, since the switch toggles a
 * display, not a message filter, and the settings menu has no existing
 * display heading to reuse. Copies "Show system messages" in
 * `FilterMenuGroup.tsx` exactly (role, aria-checked, decorative Switch).
 */
export const ViewMenuGroup = () => {
  const { t } = useTranslation();
  const { isMinimapOpen, toggleMinimap } = useAppStore();

  return (
    <>
      <DropdownMenuLabel>
        {t("common.settings.view.title")}
      </DropdownMenuLabel>
      <DropdownMenuItem
        role="menuitemcheckbox"
        aria-checked={isMinimapOpen}
        onSelect={(e) => {
          e.preventDefault();
          toggleMinimap();
        }}
      >
        <MapIcon className="mr-2 h-4 w-4 text-foreground" />
        <span className="flex-1">
          {t("common.settings.view.showMinimap")}
        </span>
        <Switch
          checked={isMinimapOpen}
          aria-hidden="true"
          tabIndex={-1}
          className="ml-2"
        />
      </DropdownMenuItem>
    </>
  );
};
