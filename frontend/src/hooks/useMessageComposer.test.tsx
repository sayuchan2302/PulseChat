import { act, renderHook } from '@testing-library/react';
import { useRef, useState } from 'react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { User } from '../types';
import type { ChatMessage } from '../types/chat.types';
import { useMessageComposer } from './useMessageComposer';

const currentUser: User = {
  id: 1,
  username: 'alice',
  fullName: 'Alice',
  online: true,
  createdAt: '2026-01-01T00:00:00Z',
};

const peerUser: User = {
  id: 2,
  username: 'bob',
  fullName: 'Bob',
  online: true,
  createdAt: '2026-01-01T00:00:00Z',
};

function setupComposer(initialInput = '', messages: ChatMessage[] = [], onEditMessage = vi.fn()) {
  return renderHook(() => {
    const [messageInput, setMessageInput] = useState(initialInput);
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [mentionStartIndex, setMentionStartIndex] = useState(-1);
    const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
    const [slashCommandQuery, setSlashCommandQuery] = useState<string | null>(null);
    const [, setEmojiPickerOpen] = useState(false);
    const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
    const messageInputSelectionRef = useRef({ start: 0, end: 0 });
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const composer = useMessageComposer({
      selectedUser: peerUser,
      selectedRoom: null,
      currentUser,
      messages,
      onEditMessage,
      messageInput,
      mentionQuery,
      mentionStartIndex,
      mentionActiveIndex,
      messageInputRef,
      messageInputSelectionRef,
      typingTimeoutRef,
      setMessageInput,
      setMentionQuery,
      setMentionStartIndex,
      setMentionActiveIndex,
      setSlashCommandQuery,
      setEmojiPickerOpen,
      canChatWithUser: () => true,
      publishTyping: vi.fn(),
      publishRoomTyping: vi.fn(),
      stopTyping: vi.fn(),
      stopRoomTyping: vi.fn(),
    });

    return {
      messageInput,
      slashCommandQuery,
      onEditMessage,
      ...composer,
    };
  });
}

describe('useMessageComposer', () => {
  it('triggers onEditMessage for the latest non-recalled own TEXT message when pressing ArrowUp in an empty composer', () => {
    const messages: ChatMessage[] = [
      {
        id: 10,
        senderId: 1,
        receiverId: 2,
        content: 'First own message',
        timestamp: '2026-01-01T10:00:00Z',
        type: 'TEXT',
        read: true,
      },
      {
        id: 11,
        senderId: 2,
        receiverId: 1,
        content: 'Peer reply',
        timestamp: '2026-01-01T10:01:00Z',
        type: 'TEXT',
        read: true,
      },
      {
        id: 12,
        senderId: 1,
        receiverId: 2,
        content: 'Latest own text message',
        timestamp: '2026-01-01T10:02:00Z',
        type: 'TEXT',
        read: true,
      },
      {
        id: 13,
        senderId: 1,
        receiverId: 2,
        content: 'Recalled message',
        timestamp: '2026-01-01T10:03:00Z',
        type: 'TEXT',
        recalled: true,
        read: true,
      },
    ];
    const onEditMessage = vi.fn();
    const { result } = setupComposer('', messages, onEditMessage);

    const preventDefault = vi.fn();
    act(() => {
      result.current.handleMessageInputKeyDown(
        {
          key: 'ArrowUp',
          shiftKey: false,
          ctrlKey: false,
          metaKey: false,
          altKey: false,
          preventDefault,
          currentTarget: { selectionStart: 0, selectionEnd: 0 } as HTMLTextAreaElement,
          nativeEvent: { isComposing: false } as KeyboardEvent,
        } as unknown as React.KeyboardEvent<HTMLTextAreaElement>,
        null,
      );
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onEditMessage).toHaveBeenCalledTimes(1);
    expect(onEditMessage).toHaveBeenCalledWith(messages[2]);
  });

  it('does not trigger onEditMessage on ArrowUp when composer has text', () => {
    const messages: ChatMessage[] = [
      {
        id: 10,
        senderId: 1,
        receiverId: 2,
        content: 'Own message',
        timestamp: '2026-01-01T10:00:00Z',
        type: 'TEXT',
        read: true,
      },
    ];
    const onEditMessage = vi.fn();
    const { result } = setupComposer('Typing something', messages, onEditMessage);

    act(() => {
      result.current.handleMessageInputKeyDown(
        {
          key: 'ArrowUp',
          shiftKey: false,
          ctrlKey: false,
          metaKey: false,
          altKey: false,
          preventDefault: vi.fn(),
          currentTarget: { selectionStart: 5, selectionEnd: 5 } as HTMLTextAreaElement,
          nativeEvent: { isComposing: false } as KeyboardEvent,
        } as unknown as React.KeyboardEvent<HTMLTextAreaElement>,
        null,
      );
    });

    expect(onEditMessage).not.toHaveBeenCalled();
  });

  it('wraps selected text with Markdown syntax on Ctrl+B, Ctrl+I, and Ctrl+E', () => {
    const { result } = setupComposer('Hello world');

    const triggerShortcut = (key: string, selectionStart: number, selectionEnd: number) => {
      const preventDefault = vi.fn();
      act(() => {
        result.current.handleMessageInputKeyDown(
          {
            key,
            ctrlKey: true,
            metaKey: false,
            altKey: false,
            shiftKey: false,
            preventDefault,
            currentTarget: { selectionStart, selectionEnd } as HTMLTextAreaElement,
            nativeEvent: { isComposing: false } as KeyboardEvent,
          } as unknown as React.KeyboardEvent<HTMLTextAreaElement>,
          null,
        );
      });
      expect(preventDefault).toHaveBeenCalledTimes(1);
    };

    // Bold "world" (indices 6..11)
    triggerShortcut('b', 6, 11);
    expect(result.current.messageInput).toBe('Hello **world**');

    // Italic "Hello" (indices 0..5)
    triggerShortcut('i', 0, 5);
    expect(result.current.messageInput).toBe('*Hello* **world**');

    // Code at end with empty selection
    const len = result.current.messageInput.length;
    triggerShortcut('e', len, len);
    expect(result.current.messageInput).toBe('*Hello* **world**``');
  });

  it('cancels active reply when Escape is pressed in composer', () => {
    const onCancelReply = vi.fn();
    const { result } = renderHook(() => {
      const [messageInput, setMessageInput] = useState('Drafting reply');
      const [mentionQuery, setMentionQuery] = useState<string | null>(null);
      const [mentionStartIndex, setMentionStartIndex] = useState(-1);
      const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
      const [, setSlashCommandQuery] = useState<string | null>(null);
      const [, setEmojiPickerOpen] = useState(false);
      const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
      const messageInputSelectionRef = useRef({ start: 0, end: 0 });
      const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

      return useMessageComposer({
        selectedUser: peerUser,
        selectedRoom: null,
        currentUser,
        hasActiveReply: true,
        onCancelReply,
        messageInput,
        mentionQuery,
        mentionStartIndex,
        mentionActiveIndex,
        messageInputRef,
        messageInputSelectionRef,
        typingTimeoutRef,
        setMessageInput,
        setMentionQuery,
        setMentionStartIndex,
        setMentionActiveIndex,
        setSlashCommandQuery,
        setEmojiPickerOpen,
        canChatWithUser: () => true,
        publishTyping: vi.fn(),
        publishRoomTyping: vi.fn(),
        stopTyping: vi.fn(),
        stopRoomTyping: vi.fn(),
      });
    });

    const preventDefault = vi.fn();
    act(() => {
      result.current.handleMessageInputKeyDown(
        {
          key: 'Escape',
          ctrlKey: false,
          metaKey: false,
          altKey: false,
          shiftKey: false,
          preventDefault,
          currentTarget: { selectionStart: 0, selectionEnd: 0 } as HTMLTextAreaElement,
          nativeEvent: { isComposing: false } as KeyboardEvent,
        } as unknown as React.KeyboardEvent<HTMLTextAreaElement>,
        null,
      );
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onCancelReply).toHaveBeenCalledTimes(1);
  });
});
