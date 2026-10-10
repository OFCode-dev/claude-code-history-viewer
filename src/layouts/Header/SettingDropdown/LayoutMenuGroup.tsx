import {
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "react-i18next";
import { MousePointer2 } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { isHoverRevealSetting, type HoverRevealSetting } from "@/store/slices/layoutSlice";

const HOVER_REVEAL_OPTIONS: ReadonlyArray<{ value: HoverRevealSetting; labelKey: string }> = [
  { value: "off", labelKey: "common.settings.layout.off" },
  { value: "standard", labelKey: "common.settings.layout.standard" },
  { value: "slow", labelKey: "common.settings.layout.slow" },
];

const radioItemClass =
  "pl-2 [&>span:first-child]:hidden data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground";

/**
 * How reading mode's hidden panels react to the pointer resting on a handle:
 * Off (click, tap or keys only), Standard, or Slow for magnifier, dwell-click
 * and tremor users.
 */
export const LayoutMenuGroup = () => {
  const { t } = useTranslation();
  const hoverReveal = useAppStore((s) => s.hoverReveal);
  const setHoverReveal = useAppStore((s) => s.setHoverReveal);
  const current = HOVER_REVEAL_OPTIONS.find((option) => option.value === hoverReveal);

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <MousePointer2 className="mr-2 h-4 w-4 text-foreground" aria-hidden="true" />
        <span>
          {t("common.settings.layout.title")} · {current ? t(current.labelKey) : hoverReveal}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup
          value={hoverReveal}
          onValueChange={(value) => {
            if (isHoverRevealSetting(value)) setHoverReveal(value);
          }}
        >
          {HOVER_REVEAL_OPTIONS.map(({ value, labelKey }) => (
            <DropdownMenuRadioItem key={value} value={value} className={radioItemClass}>
              <span>{t(labelKey)}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
};
