import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';

interface UseWorkspaceShortcutsOptions {
  selectedConversationOpen: boolean;
  setGlobalSearchOpen: Dispatch<SetStateAction<boolean>>;
  handleToggleMessageSearch: () => void;
  onNavigateConversation?: (direction: 'prev' | 'next') => void;
}

export function useWorkspaceShortcuts({
  selectedConversationOpen,
  setGlobalSearchOpen,
  handleToggleMessageSearch,
  onNavigateConversation,
}: UseWorkspaceShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        onNavigateConversation &&
        (event.key === 'ArrowUp' || event.key === 'ArrowDown')
      ) {
        event.preventDefault();
        onNavigateConversation(event.key === 'ArrowUp' ? 'prev' : 'next');
        return;
      }

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
  }, [handleToggleMessageSearch, onNavigateConversation, selectedConversationOpen, setGlobalSearchOpen]);
}

