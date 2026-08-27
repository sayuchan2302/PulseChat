import { useCallback, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Message } from '../types';
import type { SharedContentKind, SharedContentLoadOptions } from '../types/chat.types';
import { apiClient } from '../services/api';
import { SHARED_CONTENT_PAGE_SIZE } from '../constants/chatConstants';
import { useSharedContent } from './useSharedContent';
import {
  isActiveConversationMessage,
  isSharedMediaMessage,
  mergeSharedContentPage,
  messageMatchesSearchQuery,
  prependSharedContentItem,
  updateKnownSharedContentItem,
} from '../utils/messageUtils';
import { isSharedLinkMessage } from '../utils/mediaUtils';

type MutableRef<T> = { current: T };

interface UseSharedContentManagerOptions {
  currentUserIdRef: MutableRef<number | null>;
  selectedUserIdRef: MutableRef<number | null>;
  selectedRoomIdRef: MutableRef<number | null>;
  messageSearchQueryRef: MutableRef<string>;
  selectedUserId: number | null;
  selectedRoomId: number | null;
  setMessageSearchItems: Dispatch<SetStateAction<Message[]>>;
}

export function useSharedContentManager({
  currentUserIdRef,
  selectedUserIdRef,
  selectedRoomIdRef,
  messageSearchQueryRef,
  selectedUserId,
  selectedRoomId,
  setMessageSearchItems,
}: UseSharedContentManagerOptions) {
  const {
    sharedMediaExpanded, setSharedMediaExpanded,
    sharedFilesExpanded, setSharedFilesExpanded,
    sharedLinksExpanded, setSharedLinksExpanded,
    sharedMediaLoaded, setSharedMediaLoaded,
    sharedLinksLoaded, setSharedLinksLoaded,
    sharedMediaItems, setSharedMediaItems,
    sharedLinkItems, setSharedLinkItems,
    sharedMediaLoading, setSharedMediaLoading,
    sharedLinksLoading, setSharedLinksLoading,
    sharedMediaError, setSharedMediaError,
    sharedLinksError, setSharedLinksError,
    sharedMediaHasMore, setSharedMediaHasMore,
    sharedLinksHasMore, setSharedLinksHasMore,
    sharedMediaNextBefore, setSharedMediaNextBefore,
    sharedLinksNextBefore, setSharedLinksNextBefore,
  } = useSharedContent();

  const resetSharedContentState = useCallback(() => {
    setSharedMediaExpanded(false);
    setSharedLinksExpanded(false);
    setSharedMediaLoaded(false);
    setSharedLinksLoaded(false);
    setSharedMediaItems([]);
    setSharedLinkItems([]);
    setSharedMediaLoading(false);
    setSharedLinksLoading(false);
    setSharedMediaError('');
    setSharedLinksError('');
    setSharedMediaHasMore(false);
    setSharedLinksHasMore(false);
    setSharedMediaNextBefore(null);
    setSharedLinksNextBefore(null);
  }, [
    setSharedLinkItems,
    setSharedLinksError,
    setSharedLinksHasMore,
    setSharedLinksLoaded,
    setSharedLinksLoading,
    setSharedLinksNextBefore,
    setSharedLinksExpanded,
    setSharedMediaError,
    setSharedMediaHasMore,
    setSharedMediaItems,
    setSharedMediaLoaded,
    setSharedMediaLoading,
    setSharedMediaNextBefore,
    setSharedMediaExpanded,
  ]);

  const addIncomingSharedContent = useCallback((incomingMessage: Message) => {
    if (!isActiveConversationMessage(
      incomingMessage,
      currentUserIdRef.current,
      selectedUserIdRef.current,
      selectedRoomIdRef.current,
    )) {
      return;
    }

    setSharedMediaItems((currentMessages) =>
      prependSharedContentItem(currentMessages, incomingMessage, isSharedMediaMessage)
    );
    setSharedLinkItems((currentMessages) =>
      prependSharedContentItem(currentMessages, incomingMessage, isSharedLinkMessage)
    );

    const currentSearchQuery = messageSearchQueryRef.current.trim();
    if (currentSearchQuery) {
      setMessageSearchItems((currentMessages) =>
        prependSharedContentItem(
          currentMessages,
          incomingMessage,
          (message) => messageMatchesSearchQuery(message, currentSearchQuery),
        )
      );
    }
  }, [
    currentUserIdRef,
    messageSearchQueryRef,
    selectedRoomIdRef,
    selectedUserIdRef,
    setMessageSearchItems,
    setSharedLinkItems,
    setSharedMediaItems,
  ]);

  const updateSharedContentFromMessage = useCallback((updatedMessage: Message) => {
    if (!isActiveConversationMessage(
      updatedMessage,
      currentUserIdRef.current,
      selectedUserIdRef.current,
      selectedRoomIdRef.current,
    )) {
      return;
    }

    setSharedMediaItems((currentMessages) =>
      updateKnownSharedContentItem(currentMessages, updatedMessage, isSharedMediaMessage)
    );
    setSharedLinkItems((currentMessages) =>
      updateKnownSharedContentItem(currentMessages, updatedMessage, isSharedLinkMessage)
    );

    const currentSearchQuery = messageSearchQueryRef.current.trim();
    if (currentSearchQuery) {
      setMessageSearchItems((currentMessages) =>
        updateKnownSharedContentItem(
          currentMessages,
          updatedMessage,
          (message) => messageMatchesSearchQuery(message, currentSearchQuery),
        )
      );
    }
  }, [
    currentUserIdRef,
    messageSearchQueryRef,
    selectedRoomIdRef,
    selectedUserIdRef,
    setMessageSearchItems,
    setSharedLinkItems,
    setSharedMediaItems,
  ]);

  const loadSharedContent = useCallback(async (
    kind: SharedContentKind,
    options: SharedContentLoadOptions = {},
  ) => {
    const selectedUserIdForLoad = selectedUserIdRef.current;
    const selectedRoomIdForLoad = selectedRoomIdRef.current;
    if (selectedUserIdForLoad === null && selectedRoomIdForLoad === null) {
      return;
    }

    const isMediaContent = kind === 'media';
    const loading = isMediaContent ? sharedMediaLoading : sharedLinksLoading;
    const hasMore = isMediaContent ? sharedMediaHasMore : sharedLinksHasMore;
    const nextBefore = isMediaContent ? sharedMediaNextBefore : sharedLinksNextBefore;
    const before = options.reset ? null : nextBefore;
    if (loading || (!options.reset && (!hasMore || before === null))) {
      return;
    }

    if (isMediaContent) {
      setSharedMediaLoading(true);
      setSharedMediaError('');
    } else {
      setSharedLinksLoading(true);
      setSharedLinksError('');
    }

    try {
      const endpoint = selectedUserIdForLoad !== null
        ? `/messages/${selectedUserIdForLoad}/${kind}`
        : `/rooms/${selectedRoomIdForLoad}/${kind}`;
      const response = await apiClient.get<{ items: Message[]; hasMore: boolean; nextBefore?: number | null }>(endpoint, {
        params: {
          size: SHARED_CONTENT_PAGE_SIZE,
          ...(before === null ? {} : { before }),
        },
      });

      if (
        selectedUserIdRef.current !== selectedUserIdForLoad ||
        selectedRoomIdRef.current !== selectedRoomIdForLoad
      ) {
        return;
      }

      const predicate = isMediaContent ? isSharedMediaMessage : isSharedLinkMessage;
      const pageItems = response.data.items.filter(predicate);
      if (isMediaContent) {
        setSharedMediaItems((currentMessages) =>
          mergeSharedContentPage(currentMessages, pageItems, Boolean(options.reset))
        );
        setSharedMediaHasMore(response.data.hasMore);
        setSharedMediaNextBefore(response.data.nextBefore ?? null);
        setSharedMediaLoaded(true);
      } else {
        setSharedLinkItems((currentMessages) =>
          mergeSharedContentPage(currentMessages, pageItems, Boolean(options.reset))
        );
        setSharedLinksHasMore(response.data.hasMore);
        setSharedLinksNextBefore(response.data.nextBefore ?? null);
        setSharedLinksLoaded(true);
      }
    } catch (error) {
      console.error(`Failed to load shared ${kind}:`, error);
      if (
        selectedUserIdRef.current === selectedUserIdForLoad &&
        selectedRoomIdRef.current === selectedRoomIdForLoad
      ) {
        if (isMediaContent) {
          setSharedMediaError('Unable to load shared media.');
          setSharedMediaLoaded(true);
        } else {
          setSharedLinksError('Unable to load shared links.');
          setSharedLinksLoaded(true);
        }
      }
    } finally {
      if (
        selectedUserIdRef.current === selectedUserIdForLoad &&
        selectedRoomIdRef.current === selectedRoomIdForLoad
      ) {
        if (isMediaContent) {
          setSharedMediaLoading(false);
        } else {
          setSharedLinksLoading(false);
        }
      }
    }
  }, [
    selectedRoomIdRef,
    selectedUserIdRef,
    setSharedLinkItems,
    setSharedLinksError,
    setSharedLinksHasMore,
    setSharedLinksLoaded,
    setSharedLinksLoading,
    setSharedLinksNextBefore,
    setSharedMediaError,
    setSharedMediaHasMore,
    setSharedMediaItems,
    setSharedMediaLoaded,
    setSharedMediaLoading,
    setSharedMediaNextBefore,
    sharedLinksHasMore,
    sharedLinksLoading,
    sharedLinksNextBefore,
    sharedMediaHasMore,
    sharedMediaLoading,
    sharedMediaNextBefore,
  ]);

  useEffect(() => {
    resetSharedContentState();
  }, [resetSharedContentState, selectedRoomId, selectedUserId]);

  useEffect(() => {
    if (
      (selectedUserId === null && selectedRoomId === null) ||
      !sharedMediaExpanded ||
      sharedMediaLoaded ||
      sharedMediaLoading
    ) {
      return;
    }
    void loadSharedContent('media', { reset: true });
  }, [
    loadSharedContent,
    selectedRoomId,
    selectedUserId,
    sharedMediaExpanded,
    sharedMediaLoaded,
    sharedMediaLoading,
  ]);

  useEffect(() => {
    if (
      (selectedUserId === null && selectedRoomId === null) ||
      !sharedLinksExpanded ||
      sharedLinksLoaded ||
      sharedLinksLoading
    ) {
      return;
    }
    void loadSharedContent('links', { reset: true });
  }, [
    loadSharedContent,
    selectedRoomId,
    selectedUserId,
    sharedLinksExpanded,
    sharedLinksLoaded,
    sharedLinksLoading,
  ]);

  return {
    sharedMediaExpanded,
    setSharedMediaExpanded,
    sharedFilesExpanded,
    setSharedFilesExpanded,
    sharedLinksExpanded,
    setSharedLinksExpanded,
    sharedMediaItems,
    sharedLinkItems,
    sharedMediaLoading,
    sharedLinksLoading,
    sharedMediaError,
    sharedLinksError,
    sharedMediaHasMore,
    sharedLinksHasMore,
    loadSharedContent,
    addIncomingSharedContent,
    updateSharedContentFromMessage,
  };
}

export default useSharedContentManager;
