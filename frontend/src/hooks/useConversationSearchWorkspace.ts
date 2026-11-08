import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { ChatRoom, GlobalMessageSearchItem, MessagePage, User } from '../types';
import type { ChatMessage } from '../types/chat.types';
import { apiClient } from '../services/api';
import { useMessageNavigation } from './useMessageNavigation';
import { useMessageSearch } from './useMessageSearch';
import { useMessageSearchControls } from './useMessageSearchControls';
import { useMessageSearchLoader } from './useMessageSearchLoader';

interface UseConversationSearchWorkspaceOptions {
  selectedUserId: number | null;
  selectedRoomId: number | null;
  selectedUserIdRef: MutableRefObject<number | null>;
  selectedRoomIdRef: MutableRefObject<number | null>;
  skipNextAutoScrollRef: MutableRefObject<boolean>;
  pendingInitialMessageScrollRef: MutableRefObject<boolean>;
  blockOlderMessagesAutoLoadRef: MutableRefObject<boolean>;
  applyMessagePagination: (page: MessagePage) => void;
  clearMessageJumpEffects: () => void;
  highlightMessageById: (messageId: number) => void;
  releaseInitialScrollBlock: () => void;
  setHighlightedMessageId: Dispatch<SetStateAction<number | null>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setMessagesError: Dispatch<SetStateAction<string>>;
}

interface GlobalSearchJumpDependencies {
  rooms: ChatRoom[];
  setRooms: Dispatch<SetStateAction<ChatRoom[]>>;
  setUsers: Dispatch<SetStateAction<User[]>>;
  findKnownUserById: (userId: number) => User | null;
  handleRoomSelect: (room: ChatRoom) => Promise<void>;
  handleUserSelect: (user: User) => Promise<void>;
}

export function useConversationSearchWorkspace({
  selectedUserId,
  selectedRoomId,
  selectedUserIdRef,
  selectedRoomIdRef,
  skipNextAutoScrollRef,
  pendingInitialMessageScrollRef,
  blockOlderMessagesAutoLoadRef,
  applyMessagePagination,
  clearMessageJumpEffects,
  highlightMessageById,
  releaseInitialScrollBlock,
  setHighlightedMessageId,
  setMessages,
  setMessagesError,
}: UseConversationSearchWorkspaceOptions) {
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const messageSearchQueryRef = useRef('');
  const messageSearchRequestedQueryRef = useRef('');

  const {
    messageSearchQuery,
    setMessageSearchQuery,
    messageSearchSubmitted,
    setMessageSearchSubmitted,
    messageSearchInputRef,
    messageSearchItems,
    setMessageSearchItems,
    messageSearchLoading,
    setMessageSearchLoading,
    messageSearchError,
    setMessageSearchError,
    messageSearchHasMore,
    setMessageSearchHasMore,
    messageSearchNextBefore,
    setMessageSearchNextBefore,
    activeMessageSearchId,
    setActiveMessageSearchId,
    clearMessageSearch,
  } = useMessageSearch();

  const activeMessageSearchIndex = useMemo(() => {
    if (messageSearchItems.length === 0) {
      return -1;
    }

    const exactIndex =
      activeMessageSearchId === null
        ? -1
        : messageSearchItems.findIndex((message) => message.id === activeMessageSearchId);

    return exactIndex >= 0 ? exactIndex : 0;
  }, [activeMessageSearchId, messageSearchItems]);

  const messageSearchResultIds = useMemo(
    () => new Set(messageSearchItems.map((message) => message.id)),
    [messageSearchItems],
  );

  const resetMessageSearchState = useCallback(() => {
    messageSearchQueryRef.current = '';
    messageSearchRequestedQueryRef.current = '';
    clearMessageSearch();
    setActiveMessageSearchId(null);
    setHighlightedMessageId(null);
  }, [clearMessageSearch, setActiveMessageSearchId, setHighlightedMessageId]);

  const loadMessageSearch = useMessageSearchLoader({
    selectedUserIdRef,
    selectedRoomIdRef,
    queryRef: messageSearchQueryRef,
    requestedQueryRef: messageSearchRequestedQueryRef,
    loading: messageSearchLoading,
    hasMore: messageSearchHasMore,
    nextBefore: messageSearchNextBefore,
    setItems: setMessageSearchItems,
    setLoading: setMessageSearchLoading,
    setError: setMessageSearchError,
    setHasMore: setMessageSearchHasMore,
    setNextBefore: setMessageSearchNextBefore,
    setActiveId: setActiveMessageSearchId,
  });

  useEffect(() => {
    clearMessageJumpEffects();
    resetMessageSearchState();
  }, [clearMessageJumpEffects, resetMessageSearchState, selectedRoomId, selectedUserId]);

  useEffect(() => {
    if (messageSearchItems.length === 0) {
      if (activeMessageSearchId !== null) {
        setActiveMessageSearchId(null);
      }
      return;
    }

    if (
      activeMessageSearchId === null ||
      !messageSearchItems.some((message) => message.id === activeMessageSearchId)
    ) {
      setActiveMessageSearchId(messageSearchItems[0].id);
    }
  }, [activeMessageSearchId, messageSearchItems, setActiveMessageSearchId]);

  const {
    handleMessageSearchChange,
    handleClearMessageSearch,
    handleMessageSearchSubmit,
  } = useMessageSearchControls({
    query: messageSearchQuery,
    queryRef: messageSearchQueryRef,
    requestedQueryRef: messageSearchRequestedQueryRef,
    inputRef: messageSearchInputRef,
    loadMessageSearch,
    setQuery: setMessageSearchQuery,
    setSubmitted: setMessageSearchSubmitted,
    setItems: setMessageSearchItems,
    setError: setMessageSearchError,
    setHasMore: setMessageSearchHasMore,
    setNextBefore: setMessageSearchNextBefore,
    setActiveId: setActiveMessageSearchId,
  });

  const {
    handleJumpToMessage,
    handleJumpToSearchResult,
    handleMessageSearchInputKeyDown,
  } = useMessageNavigation({
    selectedUserIdRef,
    selectedRoomIdRef,
    skipNextAutoScrollRef,
    pendingInitialMessageScrollRef,
    blockOlderMessagesAutoLoadRef,
    messageSearchItems,
    activeMessageSearchIndex,
    handleMessageSearchSubmit,
    applyMessagePagination,
    highlightMessageById,
    releaseInitialScrollBlock,
    setMessages,
    setMessagesError,
    setMessageSearchError,
    setActiveMessageSearchId,
  });

  const createGlobalSearchResultHandler = useCallback(
    ({
      rooms,
      setRooms,
      setUsers,
      findKnownUserById,
      handleRoomSelect,
      handleUserSelect,
    }: GlobalSearchJumpDependencies) =>
      async (item: GlobalMessageSearchItem) => {
        if (item.roomId !== null && item.roomId !== undefined) {
          const knownRoom = rooms.find((candidate) => candidate.id === item.roomId);
          let room = knownRoom;
          if (!room) {
            const roomResponse = await apiClient.get<ChatRoom[]>('/rooms');
            setRooms(roomResponse.data);
            room = roomResponse.data.find((candidate) => candidate.id === item.roomId);
          }
          if (!room) throw new Error('The group conversation is no longer available.');
          await handleRoomSelect(room);
        } else if (item.otherUserId !== null && item.otherUserId !== undefined && item.otherUsername) {
          const knownUser = findKnownUserById(item.otherUserId);
          const user =
            knownUser ??
            (await apiClient.get<User>(`/users/${encodeURIComponent(item.otherUsername)}`)).data;
          if (!knownUser) {
            setUsers((currentUsers) =>
              currentUsers.some((currentUser) => currentUser.id === user.id)
                ? currentUsers
                : [...currentUsers, user],
            );
          }
          await handleUserSelect(user);
        } else {
          throw new Error('The conversation could not be resolved.');
        }

        if (!(await handleJumpToMessage(item.message.id))) {
          throw new Error('The message is no longer available.');
        }
        setGlobalSearchOpen(false);
      },
    [handleJumpToMessage],
  );

  return {
    globalSearchOpen,
    setGlobalSearchOpen,
    messageSearchQueryRef,
    messageSearchQuery,
    messageSearchSubmitted,
    messageSearchInputRef,
    messageSearchItems,
    setMessageSearchItems,
    messageSearchLoading,
    messageSearchError,
    messageSearchHasMore,
    activeMessageSearchId,
    messageSearchResultIds,
    loadMessageSearch,
    handleMessageSearchChange,
    handleClearMessageSearch,
    handleMessageSearchSubmit,
    handleJumpToMessage,
    handleJumpToSearchResult,
    handleMessageSearchInputKeyDown,
    createGlobalSearchResultHandler,
  };
}

