import { useCallback } from 'react';
import type { Dispatch, FormEvent, KeyboardEvent, MutableRefObject, SetStateAction } from 'react';
import { apiClient } from '../services/api';
import { MESSAGE_AROUND_PAGE_SIZE } from '../constants/chatConstants';
import type { MessagePage } from '../types';
import type { ChatMessage } from '../types/chat.types';
import { mergeServerMessagesWithPending } from '../utils/messageUtils';

interface Options {
  selectedUserIdRef: MutableRefObject<number | null>;
  selectedRoomIdRef: MutableRefObject<number | null>;
  skipNextAutoScrollRef: MutableRefObject<boolean>;
  pendingInitialMessageScrollRef: MutableRefObject<boolean>;
  blockOlderMessagesAutoLoadRef: MutableRefObject<boolean>;
  messageSearchItems: ChatMessage[];
  activeMessageSearchIndex: number;
  handleMessageSearchSubmit: (event?: FormEvent) => void;
  applyMessagePagination: (page: MessagePage) => void;
  highlightMessageById: (messageId: number) => void;
  releaseInitialScrollBlock: () => void;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setMessagesError: Dispatch<SetStateAction<string>>;
  setMessageSearchError: Dispatch<SetStateAction<string>>;
  setActiveMessageSearchId: Dispatch<SetStateAction<number | null>>;
}

export function useMessageNavigation(options: Options) {
  const {
    selectedUserIdRef, selectedRoomIdRef, skipNextAutoScrollRef,
    pendingInitialMessageScrollRef, blockOlderMessagesAutoLoadRef, messageSearchItems,
    activeMessageSearchIndex, handleMessageSearchSubmit, applyMessagePagination,
    highlightMessageById, releaseInitialScrollBlock, setMessages, setMessagesError,
    setMessageSearchError, setActiveMessageSearchId,
  } = options;

  const handleJumpToMessage = useCallback(async (messageId: number) => {
    const selectedUserId = selectedUserIdRef.current;
    const selectedRoomId = selectedRoomIdRef.current;
    if (messageId <= 0 || (selectedUserId === null && selectedRoomId === null)) return;
    setMessageSearchError('');
    setMessagesError('');
    try {
      const endpoint = selectedUserId !== null
        ? `/messages/${selectedUserId}/around/${messageId}`
        : `/rooms/${selectedRoomId}/around/${messageId}`;
      const response = await apiClient.get<MessagePage>(endpoint, {
        params: { size: MESSAGE_AROUND_PAGE_SIZE },
      });
      if (selectedUserIdRef.current !== selectedUserId || selectedRoomIdRef.current !== selectedRoomId) return;
      skipNextAutoScrollRef.current = true;
      pendingInitialMessageScrollRef.current = false;
      blockOlderMessagesAutoLoadRef.current = true;
      setMessages(mergeServerMessagesWithPending([], response.data.items));
      applyMessagePagination(response.data);
      highlightMessageById(messageId);
      releaseInitialScrollBlock();
    } catch (error) {
      console.error('Failed to jump to message:', error);
      setMessageSearchError('Unable to open message.');
    }
  }, [
    applyMessagePagination, blockOlderMessagesAutoLoadRef, highlightMessageById,
    pendingInitialMessageScrollRef, releaseInitialScrollBlock, selectedRoomIdRef,
    selectedUserIdRef, setMessageSearchError, setMessages, setMessagesError, skipNextAutoScrollRef,
  ]);

  const handleJumpToSearchResult = useCallback(async (messageId: number) => {
    setActiveMessageSearchId(messageId);
    await handleJumpToMessage(messageId);
  }, [handleJumpToMessage, setActiveMessageSearchId]);

  const handleStepMessageSearchResult = useCallback((direction: -1 | 1) => {
    const message = messageSearchItems[activeMessageSearchIndex + direction];
    if (message) void handleJumpToSearchResult(message.id);
  }, [activeMessageSearchIndex, handleJumpToSearchResult, messageSearchItems]);

  const handleMessageSearchInputKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') { event.preventDefault(); handleMessageSearchSubmit(); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); handleStepMessageSearchResult(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); handleStepMessageSearchResult(-1); }
  }, [handleMessageSearchSubmit, handleStepMessageSearchResult]);

  return {
    handleJumpToMessage,
    handleJumpToSearchResult,
    handleStepMessageSearchResult,
    handleMessageSearchInputKeyDown,
  };
}
