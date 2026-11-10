import { fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useWorkspaceShortcuts } from './useWorkspaceShortcuts';

describe('useWorkspaceShortcuts', () => {
  it('toggles global search when Ctrl+K is pressed', () => {
    const setGlobalSearchOpen = vi.fn();
    const handleToggleMessageSearch = vi.fn();

    renderHook(() =>
      useWorkspaceShortcuts({
        selectedConversationOpen: false,
        setGlobalSearchOpen,
        handleToggleMessageSearch,
      }),
    );

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(setGlobalSearchOpen).toHaveBeenCalledTimes(1);
    expect(handleToggleMessageSearch).not.toHaveBeenCalled();
  });

  it('toggles in-conversation message search when Ctrl+Shift+F is pressed with an open conversation', () => {
    const setGlobalSearchOpen = vi.fn();
    const handleToggleMessageSearch = vi.fn();

    renderHook(() =>
      useWorkspaceShortcuts({
        selectedConversationOpen: true,
        setGlobalSearchOpen,
        handleToggleMessageSearch,
      }),
    );

    fireEvent.keyDown(window, { key: 'F', ctrlKey: true, shiftKey: true });
    expect(handleToggleMessageSearch).toHaveBeenCalledTimes(1);
  });

  it('navigates conversations with Alt+ArrowUp and Alt+ArrowDown', () => {
    const onNavigateConversation = vi.fn();

    renderHook(() =>
      useWorkspaceShortcuts({
        selectedConversationOpen: true,
        setGlobalSearchOpen: vi.fn(),
        handleToggleMessageSearch: vi.fn(),
        onNavigateConversation,
      }),
    );

    fireEvent.keyDown(window, { key: 'ArrowUp', altKey: true });
    expect(onNavigateConversation).toHaveBeenCalledWith('prev');

    fireEvent.keyDown(window, { key: 'ArrowDown', altKey: true });
    expect(onNavigateConversation).toHaveBeenCalledWith('next');
  });
});

