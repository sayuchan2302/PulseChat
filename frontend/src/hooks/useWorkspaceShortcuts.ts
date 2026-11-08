import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';

interface UseWorkspaceShortcutsOptions {
  selectedConversationOpen: boolean;
  setGlobalSearchOpen: Dispatch<SetStateAction<boolean>>;
  handleToggleMessageSearch: () => void;
}

export function useWorkspaceShortcuts({
  selectedConversationOpen,
  setGlobalSearchOpen,
  handleToggleMessageSearch,
}: UseWorkspaceShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const hasPrimaryModifier = event.ctrlKey || event.metaKey;
      if (!hasPrimaryModifier || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();

      if (!event.shiftKey && key === 'k') {
        event.preventDefault();
        setGlobalSearchOpen((current) => !current);
        return;
      }

      if (event.shiftKey && key === 'f' && selectedConversationOpen) {
        event.preventDefault();
        handleToggleMessageSearch();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleToggleMessageSearch, selectedConversationOpen, setGlobalSearchOpen]);
}

