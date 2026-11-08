import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import {
  AUTO_SCROLL_BOTTOM_THRESHOLD,
  LOAD_OLDER_SCROLL_THRESHOLD,
} from '../constants/chatConstants';
import { isMessagesContainerNearBottom } from '../utils/messageUtils';

interface Options {
  selectedUserId: number | null;
  selectedRoomId: number | null;
  selectedUserIdRef: MutableRefObject<number | null>;
  selectedRoomIdRef: MutableRefObject<number | null>;
  messagesLength: number;
  messagesLoading: boolean;
  olderMessagesLoading: boolean;
  remoteTypingCount: number;
  unreadDividerMessageId: number | null;
  unreadDividerMessageIdRef: MutableRefObject<number | null>;
  pendingReadConversationRef: MutableRefObject<{ type: 'user' | 'room'; id: number } | null>;
  skipNextAutoScrollRef: MutableRefObject<boolean>;
  pendingInitialMessageScrollRef: MutableRefObject<boolean>;
  blockOlderMessagesAutoLoadRef: MutableRefObject<boolean>;
  hasUserInteractedWithMessagesRef: MutableRefObject<boolean>;
  messagesContainerRef: RefObject<HTMLDivElement | null>;
  forceScrollToLatestMessage: () => void;
  scrollToLatestMessage: (behavior?: ScrollBehavior) => void;
  releaseInitialScrollBlock: () => void;
  scrollToUnreadDivider: () => boolean;
  completePendingReadIfAtBottom: () => void;
  loadOlderMessages: () => Promise<void>;
}

export function useMessageScrollLifecycle({
  selectedUserId,
  selectedRoomId,
  selectedUserIdRef,
  selectedRoomIdRef,
  messagesLength,
  messagesLoading,
  olderMessagesLoading,
  remoteTypingCount,
  unreadDividerMessageId,
  unreadDividerMessageIdRef,
  pendingReadConversationRef,
  skipNextAutoScrollRef,
  pendingInitialMessageScrollRef,
  blockOlderMessagesAutoLoadRef,
  hasUserInteractedWithMessagesRef,
  messagesContainerRef,
  forceScrollToLatestMessage,
  scrollToLatestMessage,
  releaseInitialScrollBlock,
  scrollToUnreadDivider,
  completePendingReadIfAtBottom,
  loadOlderMessages,
}: Options) {
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  useEffect(() => {
    setShowScrollToBottom(false);
  }, [selectedRoomId, selectedUserId]);

  const markMessagesScrollIntent = useCallback(() => {
    hasUserInteractedWithMessagesRef.current = true;
  }, [hasUserInteractedWithMessagesRef]);

  const handleScrollToBottom = useCallback(() => {
    scrollToLatestMessage('smooth');
    setShowScrollToBottom(false);
    completePendingReadIfAtBottom();
  }, [completePendingReadIfAtBottom, scrollToLatestMessage]);

  const handleMessageAssetLoaded = useCallback(() => {
    if (
      hasUserInteractedWithMessagesRef.current ||
      pendingReadConversationRef.current ||
      (selectedUserIdRef.current === null && selectedRoomIdRef.current === null)
    ) {
      return;
    }

    forceScrollToLatestMessage();
    if (blockOlderMessagesAutoLoadRef.current) {
      releaseInitialScrollBlock();
    }
  }, [
    blockOlderMessagesAutoLoadRef,
    forceScrollToLatestMessage,
    hasUserInteractedWithMessagesRef,
    pendingReadConversationRef,
    releaseInitialScrollBlock,
    selectedRoomIdRef,
    selectedUserIdRef,
  ]);

  const handleMessagesScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (container) {
      completePendingReadIfAtBottom();
      const nearBottom = isMessagesContainerNearBottom(container, AUTO_SCROLL_BOTTOM_THRESHOLD);
      setShowScrollToBottom(!nearBottom);
    }

    if (
      !container ||
      !hasUserInteractedWithMessagesRef.current ||
      blockOlderMessagesAutoLoadRef.current ||
      messagesLoading ||
      olderMessagesLoading ||
      container.scrollTop > LOAD_OLDER_SCROLL_THRESHOLD
    ) {
      return;
    }

    void loadOlderMessages();
  }, [
    blockOlderMessagesAutoLoadRef,
    completePendingReadIfAtBottom,
    hasUserInteractedWithMessagesRef,
    loadOlderMessages,
    messagesContainerRef,
    messagesLoading,
    olderMessagesLoading,
  ]);

  useEffect(() => {
    if (!('scrollRestoration' in window.history)) {
      return undefined;
    }

    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';

    return () => {
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);

  useLayoutEffect(() => {
    if (
      (selectedUserId === null && selectedRoomId === null) ||
      messagesLoading ||
      olderMessagesLoading
    ) {
      return;
    }

    if (skipNextAutoScrollRef.current) {
      skipNextAutoScrollRef.current = false;
      return;
    }

    const isInitialScroll = pendingInitialMessageScrollRef.current;
    if (isInitialScroll) {
      const scrolledToUnread =
        unreadDividerMessageIdRef.current !== null && scrollToUnreadDivider();
      if (!scrolledToUnread) {
        forceScrollToLatestMessage();
      }

      pendingInitialMessageScrollRef.current = false;
      releaseInitialScrollBlock();
      window.requestAnimationFrame(() => {
        completePendingReadIfAtBottom();
      });
      return;
    }

    const container = messagesContainerRef.current;
    const shouldAutoScroll =
      (!hasUserInteractedWithMessagesRef.current && !pendingReadConversationRef.current) ||
      isMessagesContainerNearBottom(container, AUTO_SCROLL_BOTTOM_THRESHOLD);

    if (!shouldAutoScroll) {
      completePendingReadIfAtBottom();
      return;
    }

    scrollToLatestMessage('smooth');
    window.requestAnimationFrame(() => {
      completePendingReadIfAtBottom();
    });
  }, [
    completePendingReadIfAtBottom,
    forceScrollToLatestMessage,
    hasUserInteractedWithMessagesRef,
    messagesContainerRef,
    messagesLength,
    messagesLoading,
    olderMessagesLoading,
    pendingInitialMessageScrollRef,
    pendingReadConversationRef,
    releaseInitialScrollBlock,
    remoteTypingCount,
    scrollToLatestMessage,
    scrollToUnreadDivider,
    selectedRoomId,
    selectedUserId,
    skipNextAutoScrollRef,
    unreadDividerMessageId,
    unreadDividerMessageIdRef,
  ]);

  return {
    showScrollToBottom,
    markMessagesScrollIntent,
    handleMessageAssetLoaded,
    handleMessagesScroll,
    handleScrollToBottom,
  };
}

