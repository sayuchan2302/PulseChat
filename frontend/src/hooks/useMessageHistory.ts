import { useCallback, useEffect, useMemo } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { apiClient } from '../services/api';
import { MESSAGE_PAGE_SIZE } from '../constants/chatConstants';
import type { ChatRoom, MessagePage, MessageSeenByResponse, User } from '../types';
import type { ChatMessage } from '../types/chat.types';
import { appendSeenByUser, mergeServerMessagesWithPending } from '../utils/messageUtils';

interface Options {
  currentUser: User | null;
  selectedRoom: ChatRoom | null;
  messages: ChatMessage[];
  currentUserIdRef: MutableRefObject<number | null>;
  selectedUserIdRef: MutableRefObject<number | null>;
  selectedRoomIdRef: MutableRefObject<number | null>;
  roomSeenByLoadedMessageIdsRef: MutableRefObject<Set<number>>;
  olderMessagesLoadingRef: MutableRefObject<boolean>;
  hasMoreMessagesRef: MutableRefObject<boolean>;
  nextMessageBeforeRef: MutableRefObject<number | null>;
  skipNextAutoScrollRef: MutableRefObject<boolean>;
  messagesContainerRef: MutableRefObject<HTMLDivElement | null>;
  applyMessagePagination: (page: MessagePage) => void;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setMessagesError: Dispatch<SetStateAction<string>>;
  setOlderMessagesLoading: Dispatch<SetStateAction<boolean>>;
  setRoomSeenByByMessageId: Dispatch<SetStateAction<Record<number, User[]>>>;
  setSeenByLoadingMessageIds: Dispatch<SetStateAction<number[]>>;
}

export function useMessageHistory(options: Options) {
  const {
    currentUser, selectedRoom, messages, currentUserIdRef, selectedUserIdRef, selectedRoomIdRef,
    roomSeenByLoadedMessageIdsRef, olderMessagesLoadingRef, hasMoreMessagesRef,
    nextMessageBeforeRef, skipNextAutoScrollRef, messagesContainerRef, applyMessagePagination,
    setMessages, setMessagesError, setOlderMessagesLoading, setRoomSeenByByMessageId,
    setSeenByLoadingMessageIds,
  } = options;

  const loadRoomMessageSeenBy = useCallback(async (roomId: number, messageId: number) => {
    if (messageId <= 0 || roomSeenByLoadedMessageIdsRef.current.has(messageId)) return;

    roomSeenByLoadedMessageIdsRef.current.add(messageId);
    setSeenByLoadingMessageIds((ids) => ids.includes(messageId) ? ids : [...ids, messageId]);
    try {
      const response = await apiClient.get<MessageSeenByResponse>(
        `/rooms/${roomId}/messages/${messageId}/seen-by`
      );
      if (selectedRoomIdRef.current !== roomId) return;

      const currentUserId = currentUserIdRef.current;
      const seenBy = response.data.seenBy.filter((reader) => reader.id !== currentUserId);
      setRoomSeenByByMessageId((byMessageId) => ({
        ...byMessageId,
        [messageId]: seenBy.reduce(
          (readers, reader) => appendSeenByUser(readers, reader),
          byMessageId[messageId] ?? [],
        ),
      }));
    } catch (error) {
      console.error('Failed to load group message seen-by:', error);
      roomSeenByLoadedMessageIdsRef.current.delete(messageId);
    } finally {
      setSeenByLoadingMessageIds((ids) => ids.filter((id) => id !== messageId));
    }
  }, [
    currentUserIdRef, roomSeenByLoadedMessageIdsRef, selectedRoomIdRef,
    setRoomSeenByByMessageId, setSeenByLoadingMessageIds,
  ]);

  const visibleSentRoomMessageIds = useMemo(() => {
    if (!selectedRoom || !currentUser) return [];
    return messages
      .filter((message) =>
        message.id > 0 &&
        message.chatRoomId === selectedRoom.id &&
        message.senderId === currentUser.id &&
        !message.recalled &&
        message.deliveryStatus !== 'failed'
      )
      .slice(-12)
      .map((message) => message.id);
  }, [currentUser, messages, selectedRoom]);

  useEffect(() => {
    if (!selectedRoom) return;
    visibleSentRoomMessageIds.forEach((messageId) => {
      void loadRoomMessageSeenBy(selectedRoom.id, messageId);
    });
  }, [loadRoomMessageSeenBy, selectedRoom, visibleSentRoomMessageIds]);

  const loadOlderMessages = useCallback(async () => {
    if (
      olderMessagesLoadingRef.current ||
      !hasMoreMessagesRef.current ||
      nextMessageBeforeRef.current === null
    ) return;

    const selectedUserIdForLoad = selectedUserIdRef.current;
    const selectedRoomIdForLoad = selectedRoomIdRef.current;
    if (selectedUserIdForLoad === null && selectedRoomIdForLoad === null) return;

    const container = messagesContainerRef.current;
    const previousScrollHeight = container?.scrollHeight ?? 0;
    const previousScrollTop = container?.scrollTop ?? 0;
    const before = nextMessageBeforeRef.current;

    olderMessagesLoadingRef.current = true;
    setOlderMessagesLoading(true);
    setMessagesError('');
    try {
      const response = selectedUserIdForLoad !== null
        ? await apiClient.get<MessagePage>(`/messages/${selectedUserIdForLoad}`, {
          params: { before, size: MESSAGE_PAGE_SIZE },
        })
        : await apiClient.get<MessagePage>(`/rooms/${selectedRoomIdForLoad}/messages`, {
          params: { before, size: MESSAGE_PAGE_SIZE },
        });

      if (
        selectedUserIdRef.current !== selectedUserIdForLoad ||
        selectedRoomIdRef.current !== selectedRoomIdForLoad
      ) return;

      skipNextAutoScrollRef.current = true;
      setMessages((items) => mergeServerMessagesWithPending(items, response.data.items));
      applyMessagePagination(response.data);
      window.requestAnimationFrame(() => {
        const currentContainer = messagesContainerRef.current;
        if (!currentContainer) return;
        currentContainer.scrollTop = currentContainer.scrollHeight - previousScrollHeight + previousScrollTop;
      });
    } catch (error) {
      console.error('Failed to load older messages:', error);
      if (
        selectedUserIdRef.current === selectedUserIdForLoad &&
        selectedRoomIdRef.current === selectedRoomIdForLoad
      ) setMessagesError('Unable to load older messages.');
    } finally {
      olderMessagesLoadingRef.current = false;
      setOlderMessagesLoading(false);
    }
  }, [
    applyMessagePagination, hasMoreMessagesRef, messagesContainerRef, nextMessageBeforeRef,
    olderMessagesLoadingRef, selectedRoomIdRef, selectedUserIdRef, setMessages,
    setMessagesError, setOlderMessagesLoading, skipNextAutoScrollRef,
  ]);

  return { loadOlderMessages };
}
