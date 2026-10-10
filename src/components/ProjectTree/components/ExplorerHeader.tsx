// src/components/ProjectTree/components/ExplorerHeader.tsx
import React from "react";
import { ArrowUpDown, ChevronsDownUp, PanelLeftClose, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ExplorerSort } from "../../../utils/explorerModel";
import { ExplorerIconButton } from "./ExplorerIconButton";

interface ExplorerHeaderProps {
  sort: ExplorerSort;
  onSortChange: (sort: ExplorerSort) => void;
  onCollapseAll: () => void;
  /** Desktop: fold the explorer into its rail. */
  onToggleCollapse?: () => void;
  /** Mobile drawer: close it. */
  onClose?: () => void;
  /** Reading mode: the pin toggle, in place of the rail button. */
  accessory?: React.ReactNode;
}

const SORT_OPTIONS: Array<{ value: ExplorerSort; labelKey: string }> = [
  { value: "name", labelKey: "project.sort.name" },
  { value: "recent", labelKey: "project.sort.recent" },
];

/** 36px header: collapse (or the reading-mode pin), title, sort and collapse-all. */
export const ExplorerHeader: React.FC<ExplorerHeaderProps> = ({
  sort,
  onSortChange,
  onCollapseAll,
  onToggleCollapse,
  onClose,
  accessory,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex h-9 shrink-0 items-center gap-0.5 pl-1.5 pr-1.5">
      {onToggleCollapse ? (
        <ExplorerIconButton label={t("project.collapseSidebar")} onClick={onToggleCollapse}>
          <PanelLeftClose aria-hidden="true" />
        </ExplorerIconButton>
      ) : onClose ? (
        <ExplorerIconButton label={t("common.close")} onClick={onClose}>
          <X aria-hidden="true" />
        </ExplorerIconButton>
      ) : (
        accessory ?? null
      )}
      <span className="min-w-0 flex-1 truncate pl-1 text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
        {t("project.explorer")}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <ExplorerIconButton label={t("project.sort.label")}>
            <ArrowUpDown aria-hidden="true" />
          </ExplorerIconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuLabel className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("project.sort.label")}
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={sort}
            onValueChange={(value) => onSortChange(value === "recent" ? "recent" : "name")}
          >
            {SORT_OPTIONS.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value} className="text-xs">
                {t(option.labelKey)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <ExplorerIconButton label={t("project.collapseAll")} onClick={onCollapseAll}>
        <ChevronsDownUp aria-hidden="true" />
      </ExplorerIconButton>
    </div>
  );
};
