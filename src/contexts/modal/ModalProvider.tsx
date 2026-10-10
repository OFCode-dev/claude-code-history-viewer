import { useState, useCallback, type ReactNode, useMemo, useRef } from "react";
import { isInInertSubtree } from "@/utils/focus";
import {
  ModalContext,
  type FeedbackPrefill,
  type FolderSelectorMode,
  type ModalType,
} from "./context";

interface ModalState {
  feedback: boolean;
  folderSelector: boolean;
  globalSearch: boolean;
  folderSelectorMode: FolderSelectorMode;
  feedbackPrefill: FeedbackPrefill | null;
}

export const ModalProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const focusOriginsRef = useRef<Partial<Record<ModalType, HTMLElement[]>>>({});
  const openOrderRef = useRef<ModalType[]>([]);
  const closeAllGenerationRef = useRef(0);

  const restoreFocus = useCallback((modal: ModalType) => {
    const candidates = focusOriginsRef.current[modal];
    if (candidates == null || candidates.length === 0) return false;

    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const target = candidates[index];
      if (target == null || !target.isConnected) {
        continue;
      }

      // The modal opened from a reading-mode panel that has hidden since:
      // its controls are inert, so land on that panel's handle instead.
      if (isInInertSubtree(target)) {
        const handle = target
          .closest("[data-autohide-region]")
          ?.querySelector<HTMLElement>(".autohide-handle");
        const fallback = handle ?? document.getElementById("main-content");
        if (!fallback) continue;
        fallback.focus({ preventScroll: true });
        return true;
      }

      target.focus();
      return true;
    }

    return false;
  }, []);

  const [modalState, setModalState] = useState<ModalState>({
    feedback: false,
    folderSelector: false,
    globalSearch: false,
    folderSelectorMode: "notFound",
    feedbackPrefill: null,
  });

  const isOpen = useCallback(
    (modal: ModalType): boolean => {
      return modalState[modal];
    },
    [modalState]
  );

  const openModal = useCallback(
    (
      modal: ModalType,
      options?: {
        mode?: FolderSelectorMode;
        feedbackPrefill?: FeedbackPrefill;
      }
    ) => {
      closeAllGenerationRef.current += 1;
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement) {
        const current = focusOriginsRef.current[modal] ?? [];
        focusOriginsRef.current[modal] = [...current, activeElement];
      }

      openOrderRef.current = [...openOrderRef.current.filter((item) => item !== modal), modal];

      setModalState((prev) => ({
        ...prev,
        [modal]: true,
        ...(modal === "folderSelector" &&
          options?.mode && { folderSelectorMode: options.mode }),
        ...(modal === "feedback" && {
          feedbackPrefill: options?.feedbackPrefill ?? null,
        }),
      }));
    },
    []
  );

  const closeModal = useCallback((modal: ModalType) => {
    closeAllGenerationRef.current += 1;
    openOrderRef.current = openOrderRef.current.filter((item) => item !== modal);
    setModalState((prev) => ({
      ...prev,
      [modal]: false,
      ...(modal === "feedback" && { feedbackPrefill: null }),
    }));
    restoreFocus(modal);
    focusOriginsRef.current[modal] = [];
  }, [restoreFocus]);

  const closeAllModals = useCallback(() => {
    const generation = ++closeAllGenerationRef.current;
    const openedModals = [...openOrderRef.current];
    openOrderRef.current = [];
    setModalState((prev) => ({
      ...prev,
      feedback: false,
      folderSelector: false,
      globalSearch: false,
      feedbackPrefill: null,
    }));
    requestAnimationFrame(() => {
      if (generation !== closeAllGenerationRef.current) {
        return;
      }
      for (const modal of [...openedModals].reverse()) {
        if (restoreFocus(modal)) {
          break;
        }
      }
      for (const modal of openedModals) {
        focusOriginsRef.current[modal] = [];
      }
    });
  }, [restoreFocus]);

  const value = useMemo(
    () => ({
      isOpen,
      folderSelectorMode: modalState.folderSelectorMode,
      feedbackPrefill: modalState.feedbackPrefill,
      openModal,
      closeModal,
      closeAllModals,
    }),
    [
      closeAllModals,
      closeModal,
      modalState.feedbackPrefill,
      isOpen,
      modalState.folderSelectorMode,
      openModal,
    ]
  );

  return (
    <ModalContext.Provider value={value}>{children}</ModalContext.Provider>
  );
};
