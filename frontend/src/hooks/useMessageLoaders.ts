import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { MessagePage } from '../types';
import type { ChatMessage, LoadOptions } from '../types/chat.types';
import { apiClient } from '../services/api';
import { MESSAGE_PAGE_SIZE } from '../constants/chatConstants';
import { mergeServerMessagesWithPending } from '../utils/messageUtils';

interface UseMessageLoadersOptions {
  selectedUserIdRef: MutableRefObject<number | null>;
  selectedRoomIdRef: MutableRefObject<number | null>;
  resetMessagePagination: () => void;
  applyMessagePagination: (page: MessagePage) => void;
  applyPendingUnreadDivider: (items: ChatMessage[], type: 'user' | 'room', id: number) => void;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setMessagesLoading: Dispatch<SetStateAction<boolean>>;
  setMessagesError: Dispatch<SetStateAction<string>>;
}

export function useMessageLoaders({
  selectedUserIdRef,
  selectedRoomIdRef,
  resetMessagePagination,
  applyMessagePagination,
  applyPendingUnreadDivider,
  setMessages,
  setMessagesLoading,
  setMessagesError,
}: UseMessageLoadersOptions) {
  const loadMessages = useCallback(async (userId: number, options: LoadOptions = {}) => {
    if (!options.silent) {
      resetMessagePagination();
      setMessages([]);
      setMessagesLoading(true);
    }
    setMessagesError('');

    try {
      const response = await apiClient.get<MessagePage>(`/messages/${userId}`, {
        params: { size: MESSAGE_PAGE_SIZE },
      });
      if (selectedUserIdRef.current === userId) {
        setMessages((current) => mergeServerMessagesWithPending(options.silent ? current : [], response.data.items));
        if (!options.silent) {
          applyMessagePagination(response.data);
          applyPendingUnreadDivider(response.data.items, 'user', userId);
        }
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
      if (!options.silent && selectedUserIdRef.current === userId) setMessagesError('Unable to load messages.');
    } finally {
      if (!options.silent && selectedUserIdRef.current === userId) setMessagesLoading(false);
    }
  }, [applyMessagePagination, applyPendingUnreadDivider, resetMessagePagination, selectedUserIdRef, setMessages, setMessagesError, setMessagesLoading]);

  const loadRoomMessages = useCallback(async (roomId: number, options: LoadOptions = {}) => {
    if (!options.silent) {
      resetMessagePagination();
      setMessages([]);
      setMessagesLoading(true);
    }
    setMessagesError('');

    try {
      const response = await apiClient.get<MessagePage>(`/rooms/${roomId}/messages`, {
        params: { size: MESSAGE_PAGE_SIZE },
      });
      if (selectedRoomIdRef.current === roomId) {
        setMessages((current) => mergeServerMessagesWithPending(options.silent ? current : [], response.data.items));
        if (!options.silent) {
          applyMessagePagination(response.data);
          applyPendingUnreadDivider(response.data.items, 'room', roomId);
        }
      }
    } catch (error) {
      console.error('Failed to load room messages:', error);
      if (!options.silent && selectedRoomIdRef.current === roomId) setMessagesError('Unable to load group messages.');
    } finally {
      if (!options.silent && selectedRoomIdRef.current === roomId) setMessagesLoading(false);
    }
  }, [applyMessagePagination, applyPendingUnreadDivider, resetMessagePagination, selectedRoomIdRef, setMessages, setMessagesError, setMessagesLoading]);

  return { loadMessages, loadRoomMessages };
}
