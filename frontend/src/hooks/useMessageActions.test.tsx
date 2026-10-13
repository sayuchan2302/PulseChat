import { act, cleanup, renderHook } from '@testing-library/react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User, Message } from '../types';
import type { ChatMessage } from '../types/chat.types';
import { apiClient } from '../services/api';
import { useMessageActions } from './useMessageActions';

vi.mock('../services/api', () => ({ apiClient: { patch: vi.fn(), delete: vi.fn() } }));

const setMessage = vi.fn() as unknown as Dispatch<SetStateAction<ChatMessage | null>>;
const message: ChatMessage = {
  id: 42,
  content: 'Original text',
  type: 'TEXT',
  senderId: 1,
  timestamp: '2026-10-13T10:00:00',
  read: true,
};

function createOptions(editingMessage: ChatMessage | null = null, messageToDeleteForMe: ChatMessage | null = null) {
  return {
    currentUser: { id: 1 } as User,
    selectedUser: null,
    selectedRoom: null,
    replyingToMessage: null,
    forwardingMessage: null,
    editingMessage,
    messageToDeleteForMe,
    messageInputRef: { current: null } as MutableRefObject<HTMLTextAreaElement | null>,
    setReplyingToMessage: vi.fn() as unknown as Dispatch<SetStateAction<ChatMessage | null>>,
    setForwardingMessage: vi.fn() as unknown as Dispatch<SetStateAction<ChatMessage | null>>,
    setEditingMessage: setMessage,
    setMessageToDeleteForMe: setMessage,
    setPinnedMessage: vi.fn() as unknown as Dispatch<SetStateAction<Message | null>>,
    setEmojiPickerOpen: vi.fn() as unknown as Dispatch<SetStateAction<boolean>>,
    setMessagesError: vi.fn() as unknown as Dispatch<SetStateAction<string>>,
    applyMessageUpdate: vi.fn(),
    applyMessageHidden: vi.fn(),
  };
}

describe('useMessageActions message editing', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('opens editing for the current user’s text message', () => {
    const { result } = renderHook(() => useMessageActions(createOptions()));

    act(() => result.current.handleEditMessage(message));

    expect(setMessage).toHaveBeenCalledWith(message);
  });

  it('saves edited content and applies the returned message', async () => {
    const updatedMessage = { ...message, content: 'Updated text', editedAt: '2026-10-13T10:01:00' };
    vi.mocked(apiClient.patch).mockResolvedValue({ data: updatedMessage } as never);
    const options = createOptions(message);
    const { result } = renderHook(() => useMessageActions(options));

    await act(async () => result.current.saveEditedMessage('Updated text'));

    expect(apiClient.patch).toHaveBeenCalledWith('/messages/42', { content: 'Updated text' });
    expect(options.applyMessageUpdate).toHaveBeenCalledWith(updatedMessage);
    expect(setMessage).toHaveBeenCalledWith(null);
  });

  it('requests confirmation before deleting a message for this user', () => {
    const { result } = renderHook(() => useMessageActions(createOptions()));

    act(() => result.current.handleRequestDeleteMessageForMe(message));

    expect(setMessage).toHaveBeenCalledWith(message);
  });

  it('deletes for the current user and applies the hidden event', async () => {
    const event = { messageId: message.id };
    vi.mocked(apiClient.delete).mockResolvedValue({ data: event } as never);
    const options = createOptions(null, message);
    const { result } = renderHook(() => useMessageActions(options));

    await act(async () => result.current.deleteMessageForMe());

    expect(apiClient.delete).toHaveBeenCalledWith('/messages/42/me');
    expect(options.applyMessageHidden).toHaveBeenCalledWith(event);
    expect(setMessage).toHaveBeenCalledWith(null);
  });
});
