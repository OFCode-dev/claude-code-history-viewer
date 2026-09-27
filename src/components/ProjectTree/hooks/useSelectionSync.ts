// src/components/ProjectTree/hooks/useSelectionSync.ts
import { useEffect, useRef } from "react";
import type { ClaudeProject } from "../../../types";
import { findRowForProject, type ExplorerModel } from "../../../utils/explorerModel";

interface UseSelectionSyncArgs {
  /** The unfiltered model: the rows the selection opens must outlive a search. */
  model: ExplorerModel;
  /** The rendered (filtered) model; the row may appear only once it updates. */
  visibleModel: ExplorerModel;
  selectedProject: ClaudeProject | null;
  selectedSessionPath: string | null;
  expandedKeys: ReadonlySet<string>;
  ensureProjectExpanded: (projectPath: string, keys: string[]) => void;
  treeRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * A selection made elsewhere (global search, deep link, breadcrumb, session
 * pick) opens the rows above its row once per selection and scrolls it into
 * view. Rebuilding the tree (a filter, a sort) does not re-open anything the
 * user closed since.
 */
export function useSelectionSync({
  model,
  visibleModel,
  selectedProject,
  selectedSessionPath,
  expandedKeys,
  ensureProjectExpanded,
  treeRef,
}: UseSelectionSyncArgs) {
  const selectedPath = selectedProject?.path ?? null;
  const appliedSelectionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedPath) {
      appliedSelectionRef.current = null;
      return;
    }
    const signature = `${selectedPath}\n${selectedSessionPath ?? ""}`;
    if (appliedSelectionRef.current === signature) return;
    const found = findRowForProject(model, selectedPath);
    // Not listed yet (provider filter, still loading): retried when it is.
    if (!found) return;
    appliedSelectionRef.current = signature;
    ensureProjectExpanded(selectedPath, found.ancestorKeys);
  }, [ensureProjectExpanded, model, selectedPath, selectedSessionPath]);

  // Scroll once per selection, as soon as its row exists — not on every
  // expand/collapse, which would pull the list away from the folder just opened.
  const pendingScrollRef = useRef<string | null>(null);
  useEffect(() => {
    pendingScrollRef.current = selectedPath;
  }, [selectedPath, selectedSessionPath]);

  useEffect(() => {
    if (!pendingScrollRef.current) return;
    const frameId = requestAnimationFrame(() => {
      const row = treeRef.current?.querySelector<HTMLElement>(
        '[role="treeitem"][aria-selected="true"]'
      );
      if (!row) return;
      pendingScrollRef.current = null;
      row.scrollIntoView?.({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frameId);
  }, [expandedKeys, visibleModel, selectedPath, selectedSessionPath, treeRef]);
}
