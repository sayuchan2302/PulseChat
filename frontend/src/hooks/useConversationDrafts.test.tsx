import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useConversationDrafts } from './useConversationDrafts';

describe('useConversationDrafts', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('persists drafts per conversation and restores them when switching back', () => {
    const { result, rerender } = renderHook(
      ({ selectedUserId, selectedRoomId }: { selectedUserId: number | null; selectedRoomId: number | null }) => {
        const [messageInput, setMessageInput] = useState('');
        const drafts = useConversationDrafts({
          currentUserId: 10,
          selectedUserId,
          selectedRoomId,
          messageInput,
          setMessageInput,
        });
        return { messageInput, setMessageInput, ...drafts };
      },
      {
        initialProps: { selectedUserId: 1 as number | null, selectedRoomId: null as number | null },
      },
    );

    act(() => {
      result.current.setMessageInput('Hey Alice, draft message');
    });

    expect(result.current.conversationDrafts['user-1']).toBe('Hey Alice, draft message');

    // Switch to User 2 -> input should become empty while User 1's draft stays saved
    rerender({ selectedUserId: 2, selectedRoomId: null });
    expect(result.current.messageInput).toBe('');
    expect(result.current.conversationDrafts['user-1']).toBe('Hey Alice, draft message');

    // Type draft for User 2
    act(() => {
      result.current.setMessageInput('Draft for Bob');
    });
    expect(result.current.conversationDrafts['user-2']).toBe('Draft for Bob');

    // Switch back to User 1 -> restores User 1's draft
    rerender({ selectedUserId: 1, selectedRoomId: null });
    expect(result.current.messageInput).toBe('Hey Alice, draft message');

    // Clear input (e.g. after sending) -> deletes User 1's draft
    act(() => {
      result.current.setMessageInput('');
    });
    expect(result.current.conversationDrafts['user-1']).toBeUndefined();
    expect(result.current.conversationDrafts['user-2']).toBe('Draft for Bob');
  });
});

