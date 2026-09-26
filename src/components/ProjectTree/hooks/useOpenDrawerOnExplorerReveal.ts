// src/components/ProjectTree/hooks/useOpenDrawerOnExplorerReveal.ts
import { useEffect } from "react";
import { useAppStore } from "../../../store/useAppStore";

/**
 * On mobile the explorer lives in a drawer that unmounts when closed, and its
 * modal overlay covers the header, so every breadcrumb reveal request arrives
 * while no tree is mounted to handle it. Open the drawer for it: the mounted
 * tree then performs the reveal and clears the request, instead of the request
 * lingering until the user next opens the drawer.
 */
export function useOpenDrawerOnExplorerReveal(
  isMobile: boolean,
  setDrawerOpen: (open: boolean) => void
) {
  const revealRequest = useAppStore((state) => state.explorerRevealRequest);

  useEffect(() => {
    if (isMobile && revealRequest) setDrawerOpen(true);
  }, [isMobile, revealRequest, setDrawerOpen]);
}
